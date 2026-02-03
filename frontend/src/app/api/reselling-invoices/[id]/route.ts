import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * Recalculate reselling invoice totals based on bill allocations
 */
async function recalculateInvoiceTotals(invoiceId: string) {
  const allocations = await prisma.resellingBillAllocation.findMany({
    where: { reselling_invoice_id: invoiceId },
  });

  const totalOemCost = allocations.reduce(
    (sum, a) => sum + Number(a.allocated_amount),
    0
  );

  const invoice = await prisma.resellingInvoice.findUnique({
    where: { id: invoiceId },
  });

  if (!invoice) return;

  const totalCost = totalOemCost + Number(invoice.resource_cost) + Number(invoice.other_expenses);
  const grossProfit = Number(invoice.invoice_amount) - totalCost;
  const profitMarginPct = Number(invoice.invoice_amount) > 0
    ? (grossProfit / Number(invoice.invoice_amount)) * 100
    : 0;

  await prisma.resellingInvoice.update({
    where: { id: invoiceId },
    data: {
      total_oem_cost: totalOemCost,
      total_cost: totalCost,
      gross_profit: grossProfit,
      profit_margin_pct: profitMarginPct,
    },
  });
}

/**
 * GET /api/reselling-invoices/[id]
 * Get a single reselling invoice with all details
 */
export const GET = withAuth(async (req, { user, params }) => {
  try {
    const { id } = params;

    const invoice = await prisma.resellingInvoice.findUnique({
      where: { id },
      include: {
        project: {
          include: { client: true },
        },
        product: true,
        invoice: true,
        bill_allocations: {
          include: {
            bill: true,
            product: true,
          },
          orderBy: { created_at: "asc" },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Reselling invoice not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Error fetching reselling invoice:", error);
    return NextResponse.json(
      { error: "Failed to fetch reselling invoice" },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/reselling-invoices/[id]
 * Update a reselling invoice
 * Body: {
 *   invoice_number?: string,
 *   invoice_date?: string,
 *   invoice_amount?: number,
 *   resource_cost?: number,
 *   other_expenses?: number,
 *   notes?: string
 * }
 */
export const PUT = withAuth(async (req, { user, params }) => {
  try {
    // Only owner and finance can update reselling invoices
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { id } = params;
    const body = await req.json();
    const {
      invoice_number,
      invoice_date,
      invoice_amount,
      resource_cost,
      other_expenses,
      notes,
    } = body;

    // Check if invoice exists
    const existing = await prisma.resellingInvoice.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Reselling invoice not found" },
        { status: 404 }
      );
    }

    // Validate invoice_amount if provided
    if (invoice_amount !== undefined && invoice_amount <= 0) {
      return NextResponse.json(
        { error: "invoice_amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Update invoice
    const updatedData: any = {};
    if (invoice_number !== undefined) updatedData.invoice_number = invoice_number;
    if (invoice_date !== undefined) updatedData.invoice_date = new Date(invoice_date);
    if (invoice_amount !== undefined) updatedData.invoice_amount = Number(invoice_amount);
    if (resource_cost !== undefined) updatedData.resource_cost = Number(resource_cost);
    if (other_expenses !== undefined) updatedData.other_expenses = Number(other_expenses);
    if (notes !== undefined) updatedData.notes = notes;

    await prisma.resellingInvoice.update({
      where: { id },
      data: updatedData,
    });

    // Recalculate totals
    await recalculateInvoiceTotals(id);

    // Fetch updated invoice
    const updated = await prisma.resellingInvoice.findUnique({
      where: { id },
      include: {
        project: {
          include: { client: true },
        },
        product: true,
        invoice: true,
        bill_allocations: {
          include: {
            bill: true,
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Error updating reselling invoice:", error);
    return NextResponse.json(
      { error: "Failed to update reselling invoice", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/reselling-invoices/[id]
 * Delete a reselling invoice
 * Note: This will cascade delete all bill allocations
 */
export const DELETE = withAuth(async (req, { user, params }) => {
  try {
    // Only owner and finance can delete reselling invoices
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { id } = params;

    // Check if invoice exists
    const existing = await prisma.resellingInvoice.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bill_allocations: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Reselling invoice not found" },
        { status: 404 }
      );
    }

    // Delete invoice (will cascade delete bill allocations)
    await prisma.resellingInvoice.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Reselling invoice deleted",
      bill_allocations_deleted: existing._count.bill_allocations,
    });
  } catch (error: any) {
    console.error("Error deleting reselling invoice:", error);
    return NextResponse.json(
      { error: "Failed to delete reselling invoice", details: error.message },
      { status: 500 }
    );
  }
});
