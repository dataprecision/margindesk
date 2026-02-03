import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * POST /api/reselling-invoices/batch
 * Batch create/update reselling invoices for monthly data entry
 * Body: { updates: Array<{ project_id, product_id, period_month, invoice_amount, total_oem_cost, other_expenses }> }
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    // Only owner and finance can create/update reselling invoices
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { updates } = body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "updates array is required and must not be empty" },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    // Process each update
    for (const update of updates) {
      const {
        project_id,
        product_id,
        period_month,
        invoice_amount,
        total_oem_cost,
        other_expenses,
      } = update;

      // Validation
      if (!project_id || !product_id || !period_month) {
        errors.push(`Missing required fields for project ${project_id}`);
        continue;
      }

      try {
        // Convert period_month to Date (expecting YYYY-MM-DD format)
        const periodDate = new Date(period_month);

        // Calculate resource_cost from allocations for this project-month
        const allocations = await prisma.allocation.findMany({
          where: {
            project_id: project_id,
            period_month: periodDate,
          },
          include: {
            person: {
              include: {
                salary_records: {
                  where: {
                    month: periodDate,
                  },
                },
              },
            },
          },
        });

        // Calculate resource cost from allocations
        let resource_cost = 0;
        for (const allocation of allocations) {
          if (allocation.person.salary_records.length > 0) {
            const salary = allocation.person.salary_records[0];
            // Calculate proportional cost based on allocation percentage
            const allocationCost = (Number(salary.total) * Number(allocation.pct_effort)) / 100;
            resource_cost += allocationCost;
          }
        }

        // Calculate totals
        const oem = Number(total_oem_cost) || 0;
        const other = Number(other_expenses) || 0;
        const total_cost = oem + other + resource_cost;
        const revenue = Number(invoice_amount) || 0;
        const gross_profit = revenue - total_cost;
        const profit_margin_pct = revenue > 0 ? (gross_profit / revenue) * 100 : 0;

        // Check if record exists
        const existing = await prisma.resellingInvoice.findFirst({
          where: {
            project_id: project_id,
            period_month: periodDate,
          },
        });

        if (existing) {
          // Update existing
          await prisma.resellingInvoice.update({
            where: { id: existing.id },
            data: {
              product_id,
              invoice_amount: revenue,
              invoice_date: periodDate,
              total_oem_cost: oem,
              resource_cost,
              other_expenses: other,
              total_cost,
              gross_profit,
              profit_margin_pct,
            },
          });
          updated++;
        } else {
          // Create new
          await prisma.resellingInvoice.create({
            data: {
              project_id,
              product_id,
              period_month: periodDate,
              invoice_date: periodDate,
              invoice_amount: revenue,
              total_oem_cost: oem,
              resource_cost,
              other_expenses: other,
              total_cost,
              gross_profit,
              profit_margin_pct,
            },
          });
          created++;
        }
      } catch (error: any) {
        console.error(`Error processing project ${project_id}:`, error);
        errors.push(`Failed to process project ${project_id}: ${error.message}`);
      }
    }

    return NextResponse.json({
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in batch save:", error);
    return NextResponse.json(
      { error: "Failed to save reselling invoices", details: error.message },
      { status: 500 }
    );
  }
});
