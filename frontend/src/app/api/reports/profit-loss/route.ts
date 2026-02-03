import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/reports/profit-loss
 * Generate Profit & Loss report for a specific month
 * Query params:
 *  - month: YYYY-MM format (required)
 *
 * Calculations:
 * - Revenue: Project costs + Reselling revenue for the month
 * - Costs: Overheads + Operational staff salaries + Reselling costs
 * - Overheads: Support staff salaries + Expenses + Bills
 * - Reselling Costs: OEM costs + Resource costs + Other expenses
 * - Profit/Loss: Revenue - Total Costs
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");

    // Validate month parameter
    if (!month) {
      return NextResponse.json(
        { error: "month parameter is required (format: YYYY-MM)" },
        { status: 400 }
      );
    }

    // Parse month parameter
    const [year, monthNum] = month.split("-").map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return NextResponse.json(
        { error: "Invalid month format (use YYYY-MM)" },
        { status: 400 }
      );
    }
    // For salaries: use last day of month at noon UTC (matches salary import format)
    const salaryMonthDate = new Date(Date.UTC(year, monthNum, 0, 12, 0, 0));
    // For bills: use first day of month (matches cf_billed_for_month_unformatted format)
    const billMonthDate = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0));
    // For reselling invoices: use first day of month (matches period_month)
    const periodMonth = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0));

    // Get start and end of month for date range queries
    const startOfMonth = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, monthNum, 0, 23, 59, 59));

    // 1. Calculate Support Staff Salaries
    const supportStaffSalaries = await prisma.personSalary.findMany({
      where: {
        month: salaryMonthDate,
        is_support_staff: true,
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            department: true,
          },
        },
      },
    });

    const totalSupportSalaries = supportStaffSalaries.reduce(
      (sum, s) => sum + Number(s.total),
      0
    );

    // 2. Calculate Operational Staff Salaries
    const operationalStaffSalaries = await prisma.personSalary.findMany({
      where: {
        month: salaryMonthDate,
        is_support_staff: false,
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            department: true,
          },
        },
      },
    });

    const totalOperationalSalaries = operationalStaffSalaries.reduce(
      (sum, s) => sum + Number(s.total),
      0
    );

    // 3. Calculate Expenses for the month (only included ones)
    const expenses = await prisma.expense.findMany({
      where: {
        expense_date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
        include_in_calculation: true,
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // 4. Calculate Bills for the month (only included ones)
    // Using cf_billed_for_month_unformatted for accurate accounting period attribution
    const bills = await prisma.bill.findMany({
      where: {
        cf_billed_for_month_unformatted: billMonthDate,
        include_in_calculation: true,
      },
    });

    const totalBills = bills.reduce((sum, b) => sum + Number(b.sub_total || b.total), 0);

    // 5. Calculate Revenue from Project Costs
    // Using project_costs table which has monthly cost allocations
    const projectCosts = await prisma.projectCost.findMany({
      where: {
        period_month: salaryMonthDate,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const totalRevenue = projectCosts.reduce(
      (sum, pc) => sum + Number(pc.amount),
      0
    );

    // 6. Fetch Reselling Invoices for the month
    const resellingInvoices = await prisma.resellingInvoice.findMany({
      where: {
        period_month: periodMonth,
      },
      include: {
        project: {
          include: {
            client: true,
          },
        },
        product: true,
        bill_allocations: {
          include: {
            bill: true,
          },
        },
      },
      orderBy: [
        { invoice_date: "desc" },
      ],
    });

    // Calculate reselling totals
    const totalResellingRevenue = resellingInvoices.reduce(
      (sum, inv) => sum + Number(inv.invoice_amount),
      0
    );
    const totalResellingOemCosts = resellingInvoices.reduce(
      (sum, inv) => sum + Number(inv.total_oem_cost),
      0
    );
    const totalResellingResourceCosts = resellingInvoices.reduce(
      (sum, inv) => sum + Number(inv.resource_cost),
      0
    );
    const totalResellingOtherExpenses = resellingInvoices.reduce(
      (sum, inv) => sum + Number(inv.other_expenses),
      0
    );
    const totalResellingCosts = resellingInvoices.reduce(
      (sum, inv) => sum + Number(inv.total_cost),
      0
    );
    const totalResellingProfit = resellingInvoices.reduce(
      (sum, inv) => sum + Number(inv.gross_profit),
      0
    );

    // Aggregate reselling data by product
    const resellingByProduct = new Map();
    resellingInvoices.forEach((inv) => {
      const productId = inv.product.id;
      if (!resellingByProduct.has(productId)) {
        resellingByProduct.set(productId, {
          product_id: productId,
          product_name: inv.product.name,
          product_type: inv.product.type,
          invoice_count: 0,
          revenue: 0,
          oem_costs: 0,
          resource_costs: 0,
          other_expenses: 0,
          total_costs: 0,
          gross_profit: 0,
        });
      }
      const productData = resellingByProduct.get(productId);
      productData.invoice_count += 1;
      productData.revenue += Number(inv.invoice_amount);
      productData.oem_costs += Number(inv.total_oem_cost);
      productData.resource_costs += Number(inv.resource_cost);
      productData.other_expenses += Number(inv.other_expenses);
      productData.total_costs += Number(inv.total_cost);
      productData.gross_profit += Number(inv.gross_profit);
    });

    const resellingProductBreakdown = Array.from(resellingByProduct.values()).sort(
      (a, b) => b.revenue - a.revenue
    );

    // 7. Calculate Overheads (Support Staff + Expenses + Bills)
    const totalOverheads = totalSupportSalaries + totalExpenses + totalBills;

    // 8. Calculate Total Costs (Overheads + Operational Staff Salaries + Reselling Costs)
    const totalCosts = totalOverheads + totalOperationalSalaries + totalResellingCosts;

    // 9. Calculate Total Revenue (Project Costs + Reselling Revenue)
    const combinedRevenue = totalRevenue + totalResellingRevenue;

    // 10. Calculate Profit/Loss
    const profitLoss = combinedRevenue - totalCosts;
    const profitMargin = combinedRevenue > 0 ? (profitLoss / combinedRevenue) * 100 : 0;

    // Return comprehensive report
    return NextResponse.json({
      month: month,
      summary: {
        revenue: combinedRevenue,
        total_costs: totalCosts,
        profit_loss: profitLoss,
        profit_margin_percentage: profitMargin,
        project_revenue: totalRevenue,
        reselling_revenue: totalResellingRevenue,
      },
      overheads: {
        total: totalOverheads,
        breakdown: {
          support_staff_salaries: totalSupportSalaries,
          expenses: totalExpenses,
          bills: totalBills,
        },
        details: {
          support_staff_count: supportStaffSalaries.length,
          expense_count: expenses.length,
          bill_count: bills.length,
        },
      },
      operational_costs: {
        total: totalOperationalSalaries,
        staff_count: operationalStaffSalaries.length,
      },
      reselling_revenue: {
        total: totalResellingRevenue,
        total_costs: totalResellingCosts,
        gross_profit: totalResellingProfit,
        invoice_count: resellingInvoices.length,
        breakdown: {
          oem_costs: totalResellingOemCosts,
          resource_costs: totalResellingResourceCosts,
          other_expenses: totalResellingOtherExpenses,
        },
        by_product: resellingProductBreakdown,
        invoices: resellingInvoices.map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          project_name: inv.project.name,
          client_name: inv.project.client.name,
          product_name: inv.product.name,
          revenue: Number(inv.invoice_amount),
          oem_costs: Number(inv.total_oem_cost),
          resource_costs: Number(inv.resource_cost),
          other_expenses: Number(inv.other_expenses),
          total_costs: Number(inv.total_cost),
          gross_profit: Number(inv.gross_profit),
          profit_margin_pct: Number(inv.profit_margin_pct),
        })),
      },
      revenue_details: {
        total: totalRevenue,
        project_count: projectCosts.length,
        projects: projectCosts.map((pc) => ({
          project_id: pc.project.id,
          project_name: pc.project.name,
          client_name: pc.project.client.name,
          cost: Number(pc.amount),
        })),
      },
      detailed_breakdown: {
        support_staff: supportStaffSalaries.map((s) => ({
          person_id: s.person.id,
          person_name: s.person.name,
          department: s.person.department,
          amount: Number(s.total),
        })),
        operational_staff: operationalStaffSalaries.map((s) => ({
          person_id: s.person.id,
          person_name: s.person.name,
          department: s.person.department,
          amount: Number(s.total),
        })),
        expenses: expenses.map((e) => ({
          id: e.id,
          expense_date: e.expense_date,
          person_name: e.person?.name || "Unknown",
          description: e.description,
          amount: Number(e.amount),
        })),
        bills: bills.map((b) => ({
          id: b.id,
          bill_date: b.bill_date,
          vendor_name: b.vendor_name,
          notes: b.notes,
          sub_total: Number(b.sub_total || b.total),
          tax_total: Number(b.tax_total || 0),
          total: Number(b.total),
        })),
      },
    });
  } catch (error) {
    console.error("Error generating profit-loss report:", error);
    return NextResponse.json(
      { error: "Failed to generate profit-loss report" },
      { status: 500 }
    );
  }
});
