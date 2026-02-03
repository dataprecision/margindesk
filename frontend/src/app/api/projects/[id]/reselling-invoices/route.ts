import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/projects/[id]/reselling-invoices
 * Get all reselling invoices for a project
 * Query params:
 *  - month: YYYY-MM (filter by period month)
 *  - product_id: Filter by product
 */
export const GET = withAuth(async (req, { user, params }) => {
  try {
    const { id: projectId } = params;
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const productId = searchParams.get("product_id");

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { client: true },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Build where clause
    const where: any = { project_id: projectId };

    if (month) {
      const [year, monthNum] = month.split("-").map(Number);
      const periodMonth = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0));
      where.period_month = periodMonth;
    }

    if (productId) {
      where.product_id = productId;
    }

    const invoices = await prisma.resellingInvoice.findMany({
      where,
      include: {
        product: true,
        invoice: true,
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

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        client_name: project.client.name,
      },
      invoices,
      count: invoices.length,
    });
  } catch (error) {
    console.error("Error fetching reselling invoices:", error);
    return NextResponse.json(
      { error: "Failed to fetch reselling invoices" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/projects/[id]/reselling-invoices
 * Create a new reselling invoice
 * Body: {
 *   product_id: string,
 *   invoice_id?: string,
 *   period_month: string (YYYY-MM),
 *   invoice_number?: string,
 *   invoice_date: string (ISO date),
 *   invoice_amount: number,
 *   resource_cost?: number,
 *   other_expenses?: number,
 *   notes?: string
 * }
 */
export const POST = withAuth(async (req, { user, params }) => {
  try {
    // Only owner and finance can create reselling invoices
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { id: projectId } = params;
    const body = await req.json();
    const {
      product_id,
      invoice_id,
      period_month,
      invoice_number,
      invoice_date,
      invoice_amount,
      resource_cost = 0,
      other_expenses = 0,
      notes,
    } = body;

    // Validation
    if (!product_id || !period_month || !invoice_date || !invoice_amount) {
      return NextResponse.json(
        { error: "product_id, period_month, invoice_date, and invoice_amount are required" },
        { status: 400 }
      );
    }

    if (invoice_amount <= 0) {
      return NextResponse.json(
        { error: "invoice_amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: product_id },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Parse period_month
    const [year, monthNum] = period_month.split("-").map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return NextResponse.json(
        { error: "Invalid period_month format (use YYYY-MM)" },
        { status: 400 }
      );
    }
    const periodMonthDate = new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0));

    // If invoice_id provided, check it exists
    if (invoice_id) {
      const invoiceExists = await prisma.invoice.findUnique({
        where: { id: invoice_id },
      });

      if (!invoiceExists) {
        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 }
        );
      }
    }

    // Initial calculations (OEM cost will be 0 until bill allocations are added)
    const totalOemCost = 0;
    const totalCost = totalOemCost + Number(resource_cost) + Number(other_expenses);
    const grossProfit = Number(invoice_amount) - totalCost;
    const profitMarginPct = Number(invoice_amount) > 0
      ? (grossProfit / Number(invoice_amount)) * 100
      : 0;

    const resellingInvoice = await prisma.resellingInvoice.create({
      data: {
        project_id: projectId,
        product_id,
        invoice_id: invoice_id || null,
        period_month: periodMonthDate,
        invoice_number: invoice_number || null,
        invoice_date: new Date(invoice_date),
        invoice_amount: Number(invoice_amount),
        total_oem_cost: totalOemCost,
        resource_cost: Number(resource_cost),
        other_expenses: Number(other_expenses),
        total_cost: totalCost,
        gross_profit: grossProfit,
        profit_margin_pct: profitMarginPct,
        notes: notes || null,
      },
      include: {
        product: true,
        project: {
          include: { client: true },
        },
        invoice: true,
      },
    });

    return NextResponse.json(resellingInvoice, { status: 201 });
  } catch (error: any) {
    console.error("Error creating reselling invoice:", error);
    return NextResponse.json(
      { error: "Failed to create reselling invoice", details: error.message },
      { status: 500 }
    );
  }
});
