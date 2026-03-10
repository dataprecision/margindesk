import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { parse } from "csv-parse/sync";

const prisma = new PrismaClient();

/**
 * POST /api/reselling-invoices/import
 * Import reselling invoices from CSV
 * Expects multipart form data with:
 *   - file: CSV file
 *   - month: YYYY-MM format
 */
export const POST = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can import reselling invoices" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const month = formData.get("month") as string;

    if (!file || !month) {
      return NextResponse.json(
        { error: "file and month are required" },
        { status: 400 }
      );
    }

    const periodMonth = new Date(month + "-01T00:00:00.000Z");

    const text = await file.text();
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });

    if (records.length === 0) {
      return NextResponse.json(
        { error: "CSV file is empty" },
        { status: 400 }
      );
    }

    // Find revenue, OEM cost, and other expenses columns
    const columns = Object.keys(records[0]);
    const revenueCol = columns.find((c) => c.toLowerCase().startsWith("revenue"));
    const oemCol = columns.find((c) => c.toLowerCase().startsWith("oem cost"));
    const otherCol = columns.find((c) => c.toLowerCase().startsWith("other exp"));

    if (!revenueCol) {
      return NextResponse.json(
        { error: 'CSV must have a column starting with "Revenue". Found: ' + columns.join(", ") },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const projectId = record["Project ID"]?.trim();
      const productId = record["Product ID"]?.trim();
      const revenueStr = record[revenueCol]?.trim();

      if (!projectId) {
        skipped++;
        continue;
      }

      if (!revenueStr || revenueStr === "") {
        skipped++;
        continue;
      }

      const revenue = parseFloat(revenueStr.replace(/,/g, ""));
      if (isNaN(revenue)) {
        errors.push(`Row ${i + 2}: Invalid revenue "${revenueStr}"`);
        continue;
      }

      const oemCost = oemCol ? parseFloat((record[oemCol] || "0").replace(/,/g, "")) || 0 : 0;
      const otherExpenses = otherCol ? parseFloat((record[otherCol] || "0").replace(/,/g, "")) || 0 : 0;

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true },
      });

      if (!project) {
        errors.push(`Row ${i + 2}: Project ID "${projectId}" not found`);
        continue;
      }

      // Resolve product_id: use from CSV or fall back to project config
      let resolvedProductId = productId;
      if (!resolvedProductId) {
        const config = await prisma.projectConfig.findUnique({
          where: { project_id: projectId },
          select: { product_id: true },
        });
        resolvedProductId = config?.product_id || null;
      }

      if (!resolvedProductId) {
        errors.push(`Row ${i + 2}: No Product ID for project "${project.name}". Set it in CSV or project config.`);
        continue;
      }

      // Calculate resource cost from allocations
      const allocations = await prisma.allocation.findMany({
        where: { project_id: projectId, period_month: periodMonth },
        include: {
          person: {
            include: {
              salary_records: { where: { month: periodMonth } },
            },
          },
        },
      });

      let resourceCost = 0;
      for (const alloc of allocations) {
        if (alloc.person.salary_records.length > 0) {
          const salary = alloc.person.salary_records[0];
          resourceCost += (Number(salary.total) * Number(alloc.pct_effort)) / 100;
        }
      }

      const totalCost = oemCost + otherExpenses + resourceCost;
      const grossProfit = revenue - totalCost;
      const profitMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      // Check if record exists
      const existing = await prisma.resellingInvoice.findFirst({
        where: { project_id: projectId, period_month: periodMonth },
      });

      if (existing) {
        await prisma.resellingInvoice.update({
          where: { id: existing.id },
          data: {
            product_id: resolvedProductId,
            invoice_amount: revenue,
            invoice_date: periodMonth,
            total_oem_cost: oemCost,
            resource_cost: resourceCost,
            other_expenses: otherExpenses,
            total_cost: totalCost,
            gross_profit: grossProfit,
            profit_margin_pct: profitMarginPct,
          },
        });
        updated++;
      } else {
        await prisma.resellingInvoice.create({
          data: {
            project_id: projectId,
            product_id: resolvedProductId,
            period_month: periodMonth,
            invoice_date: periodMonth,
            invoice_amount: revenue,
            total_oem_cost: oemCost,
            resource_cost: resourceCost,
            other_expenses: otherExpenses,
            total_cost: totalCost,
            gross_profit: grossProfit,
            profit_margin_pct: profitMarginPct,
          },
        });
        created++;
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "ResellingInvoice",
        entity_id: "csv_import",
        action: "bulk_import",
        after_json: { month, created, updated, skipped, errors: errors.length },
      },
    });

    return NextResponse.json({
      success: true,
      created,
      updated,
      skipped,
      errors,
      message: `Imported ${created + updated} reselling invoices for ${month}`,
    });
  } catch (error) {
    console.error("Error importing reselling invoices:", error);
    return NextResponse.json(
      {
        error: "Failed to import reselling invoices",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
