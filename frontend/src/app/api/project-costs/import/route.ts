import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { parse } from "csv-parse/sync";

const prisma = new PrismaClient();

/**
 * POST /api/project-costs/import
 * Import project costs from CSV
 * Expects multipart form data with:
 *   - file: CSV file
 *   - month: YYYY-MM format
 */
export const POST = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can import project costs" },
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

    // Find the revenue column (matches "Revenue (*)")
    const columns = Object.keys(records[0]);
    const revenueCol = columns.find(
      (c) => c.toLowerCase().startsWith("revenue")
    );

    if (!revenueCol) {
      return NextResponse.json(
        { error: 'CSV must have a column starting with "Revenue". Found: ' + columns.join(", ") },
        { status: 400 }
      );
    }

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process in transaction
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const projectId = record["Project ID"]?.trim();
        const amountStr = record[revenueCol]?.trim();

        if (!projectId) {
          skipped++;
          continue;
        }

        if (!amountStr || amountStr === "") {
          skipped++;
          continue;
        }

        const amount = parseFloat(amountStr.replace(/,/g, ""));
        if (isNaN(amount)) {
          errors.push(`Row ${i + 2}: Invalid amount "${amountStr}" for project ${record["Project Name"] || projectId}`);
          continue;
        }

        // Verify project exists
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true, name: true },
        });

        if (!project) {
          errors.push(`Row ${i + 2}: Project ID "${projectId}" not found`);
          continue;
        }

        // Upsert the cost
        const existing = await tx.projectCost.findFirst({
          where: {
            project_id: projectId,
            period_month: periodMonth,
            type: "other",
          },
        });

        if (existing) {
          await tx.projectCost.update({
            where: { id: existing.id },
            data: { amount, updated_at: new Date() },
          });
        } else {
          await tx.projectCost.create({
            data: {
              project_id: projectId,
              period_month: periodMonth,
              type: "other",
              amount,
            },
          });
        }

        updated++;
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "ProjectCost",
        entity_id: "csv_import",
        action: "bulk_import",
        after_json: { month, updated, skipped, errors: errors.length },
      },
    });

    return NextResponse.json({
      success: true,
      updated,
      skipped,
      errors,
      message: `Imported ${updated} project costs for ${month}`,
    });
  } catch (error) {
    console.error("Error importing project costs:", error);
    return NextResponse.json(
      {
        error: "Failed to import project costs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
