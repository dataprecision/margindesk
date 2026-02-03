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
 * Check if bill allocation would exceed 100%
 */
async function validateBillAllocation(
  billId: string,
  newPercentage: number,
  excludeAllocationId?: string
): Promise<{ valid: boolean; currentTotal: number; message?: string }> {
  const existingAllocations = await prisma.resellingBillAllocation.findMany({
    where: {
      bill_id: billId,
      ...(excludeAllocationId && { id: { not: excludeAllocationId } }),
    },
  });

  const currentTotal = existingAllocations.reduce(
    (sum, a) => sum + Number(a.allocation_percentage),
    0
  );

  const newTotal = currentTotal + newPercentage;

  if (newTotal > 100) {
    return {
      valid: false,
      currentTotal,
      message: `Over-allocation: Total ${newTotal.toFixed(2)}% exceeds 100%. Currently allocated: ${currentTotal.toFixed(2)}%, attempting to add: ${newPercentage.toFixed(2)}%`,
    };
  }

  return { valid: true, currentTotal };
}

/**
 * GET /api/reselling-invoices/[id]/allocations
 * Get all bill allocations for a reselling invoice
 */
export const GET = withAuth(async (req, { user, params }) => {
  try {
    const { id: invoiceId } = params;

    // Check if invoice exists
    const invoice = await prisma.resellingInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Reselling invoice not found" },
        { status: 404 }
      );
    }

    const allocations = await prisma.resellingBillAllocation.findMany({
      where: { reselling_invoice_id: invoiceId },
      include: {
        bill: true,
        product: true,
      },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({
      invoice_id: invoiceId,
      allocations,
      count: allocations.length,
      total_allocated_amount: allocations.reduce(
        (sum, a) => sum + Number(a.allocated_amount),
        0
      ),
    });
  } catch (error) {
    console.error("Error fetching bill allocations:", error);
    return NextResponse.json(
      { error: "Failed to fetch bill allocations" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/reselling-invoices/[id]/allocations
 * Add a bill allocation to a reselling invoice
 * Body: {
 *   bill_id: string,
 *   product_id: string,
 *   allocation_percentage: number (0-100),
 *   notes?: string
 * }
 */
export const POST = withAuth(async (req, { user, params }) => {
  try {
    // Only owner and finance can create bill allocations
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { id: invoiceId } = params;
    const body = await req.json();
    const { bill_id, product_id, allocation_percentage, notes } = body;

    // Validation
    if (!bill_id || !product_id || allocation_percentage === undefined) {
      return NextResponse.json(
        { error: "bill_id, product_id, and allocation_percentage are required" },
        { status: 400 }
      );
    }

    if (allocation_percentage < 0 || allocation_percentage > 100) {
      return NextResponse.json(
        { error: "allocation_percentage must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Check if invoice exists
    const invoice = await prisma.resellingInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return NextResponse.json(
        { error: "Reselling invoice not found" },
        { status: 404 }
      );
    }

    // Check if bill exists
    const bill = await prisma.bill.findUnique({
      where: { id: bill_id },
    });

    if (!bill) {
      return NextResponse.json(
        { error: "Bill not found" },
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

    // Check if allocation already exists for this invoice-bill combination
    const existingAllocation = await prisma.resellingBillAllocation.findUnique({
      where: {
        reselling_invoice_id_bill_id: {
          reselling_invoice_id: invoiceId,
          bill_id: bill_id,
        },
      },
    });

    if (existingAllocation) {
      return NextResponse.json(
        { error: "Bill already allocated to this invoice. Use PUT to update." },
        { status: 400 }
      );
    }

    // Validate bill allocation won't exceed 100%
    const validation = await validateBillAllocation(bill_id, allocation_percentage);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "Over-allocation",
          message: validation.message,
          current_total: validation.currentTotal,
          attempted_percentage: allocation_percentage,
        },
        { status: 400 }
      );
    }

    // Calculate allocated amount
    const billSubTotal = bill.sub_total ? Number(bill.sub_total) : Number(bill.total);
    const allocatedAmount = (billSubTotal * allocation_percentage) / 100;

    // Create allocation
    const allocation = await prisma.resellingBillAllocation.create({
      data: {
        reselling_invoice_id: invoiceId,
        bill_id,
        product_id,
        allocation_percentage: Number(allocation_percentage),
        allocated_amount: allocatedAmount,
        notes: notes || null,
      },
      include: {
        bill: true,
        product: true,
        reselling_invoice: true,
      },
    });

    // Recalculate invoice totals
    await recalculateInvoiceTotals(invoiceId);

    return NextResponse.json(allocation, { status: 201 });
  } catch (error: any) {
    console.error("Error creating bill allocation:", error);
    return NextResponse.json(
      { error: "Failed to create bill allocation", details: error.message },
      { status: 500 }
    );
  }
});
