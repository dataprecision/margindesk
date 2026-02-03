import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/reports/reselling-profitability
 * Generate Reselling Profitability Report
 * Query params:
 *  - month: YYYY-MM format (optional - if not provided, gets all time)
 *  - product_id: Filter by product (optional)
 *  - project_id: Filter by project (optional)
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const productId = searchParams.get("product_id");
    const projectId = searchParams.get("project_id");

    // Build where clause
    const where: any = {};

    if (month) {
      const [year, monthNum] = month.split("-").map(Number);
      if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
        return NextResponse.json(
          { error: "Invalid month format (use YYYY-MM)" },
          { status: 400 }
        );
      }
      const periodMonth = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0));
      where.period_month = periodMonth;
    }

    if (productId) {
      where.product_id = productId;
    }

    if (projectId) {
      where.project_id = projectId;
    }

    // Fetch all reselling invoices with filters
    const invoices = await prisma.resellingInvoice.findMany({
      where,
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
        { period_month: "desc" },
        { invoice_date: "desc" },
      ],
    });

    // Calculate summary totals
    const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.invoice_amount), 0);
    const totalOemCosts = invoices.reduce((sum, inv) => sum + Number(inv.total_oem_cost), 0);
    const totalResourceCosts = invoices.reduce((sum, inv) => sum + Number(inv.resource_cost), 0);
    const totalOtherExpenses = invoices.reduce((sum, inv) => sum + Number(inv.other_expenses), 0);
    const totalCosts = invoices.reduce((sum, inv) => sum + Number(inv.total_cost), 0);
    const grossProfit = invoices.reduce((sum, inv) => sum + Number(inv.gross_profit), 0);
    const averageProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Breakdown by product
    const productMap = new Map();
    invoices.forEach((inv) => {
      const productId = inv.product.id;
      if (!productMap.has(productId)) {
        productMap.set(productId, {
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
          profit_margin_pct: 0,
        });
      }

      const productData = productMap.get(productId);
      productData.invoice_count += 1;
      productData.revenue += Number(inv.invoice_amount);
      productData.oem_costs += Number(inv.total_oem_cost);
      productData.resource_costs += Number(inv.resource_cost);
      productData.other_expenses += Number(inv.other_expenses);
      productData.total_costs += Number(inv.total_cost);
      productData.gross_profit += Number(inv.gross_profit);
    });

    // Calculate profit margin for each product
    const byProduct = Array.from(productMap.values()).map((p) => ({
      ...p,
      profit_margin_pct: p.revenue > 0 ? (p.gross_profit / p.revenue) * 100 : 0,
    }));

    // Breakdown by project
    const projectMap = new Map();
    invoices.forEach((inv) => {
      const projectId = inv.project.id;
      if (!projectMap.has(projectId)) {
        projectMap.set(projectId, {
          project_id: projectId,
          project_name: inv.project.name,
          client_id: inv.project.client.id,
          client_name: inv.project.client.name,
          invoice_count: 0,
          revenue: 0,
          oem_costs: 0,
          resource_costs: 0,
          other_expenses: 0,
          total_costs: 0,
          gross_profit: 0,
          profit_margin_pct: 0,
          products: new Set(),
        });
      }

      const projectData = projectMap.get(projectId);
      projectData.invoice_count += 1;
      projectData.revenue += Number(inv.invoice_amount);
      projectData.oem_costs += Number(inv.total_oem_cost);
      projectData.resource_costs += Number(inv.resource_cost);
      projectData.other_expenses += Number(inv.other_expenses);
      projectData.total_costs += Number(inv.total_cost);
      projectData.gross_profit += Number(inv.gross_profit);
      projectData.products.add(inv.product.name);
    });

    // Calculate profit margin for each project
    const byProject = Array.from(projectMap.values()).map((p) => ({
      ...p,
      products: Array.from(p.products),
      profit_margin_pct: p.revenue > 0 ? (p.gross_profit / p.revenue) * 100 : 0,
    }));

    // Detailed invoice list
    const detailedInvoices = invoices.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      invoice_date: inv.invoice_date,
      period_month: inv.period_month,
      project_id: inv.project.id,
      project_name: inv.project.name,
      client_name: inv.project.client.name,
      product_id: inv.product.id,
      product_name: inv.product.name,
      invoice_amount: Number(inv.invoice_amount),
      total_oem_cost: Number(inv.total_oem_cost),
      resource_cost: Number(inv.resource_cost),
      other_expenses: Number(inv.other_expenses),
      total_cost: Number(inv.total_cost),
      gross_profit: Number(inv.gross_profit),
      profit_margin_pct: Number(inv.profit_margin_pct),
      bill_count: inv.bill_allocations.length,
    }));

    return NextResponse.json({
      filters: {
        month: month || "all",
        product_id: productId || "all",
        project_id: projectId || "all",
      },
      summary: {
        total_revenue: totalRevenue,
        total_oem_costs: totalOemCosts,
        total_resource_costs: totalResourceCosts,
        total_other_expenses: totalOtherExpenses,
        total_costs: totalCosts,
        gross_profit: grossProfit,
        average_profit_margin_pct: averageProfitMargin,
        invoice_count: invoices.length,
      },
      breakdown: {
        by_product: byProduct.sort((a, b) => b.revenue - a.revenue),
        by_project: byProject.sort((a, b) => b.revenue - a.revenue),
      },
      detailed_invoices: detailedInvoices,
    });
  } catch (error) {
    console.error("Error generating reselling profitability report:", error);
    return NextResponse.json(
      { error: "Failed to generate reselling profitability report" },
      { status: 500 }
    );
  }
});
