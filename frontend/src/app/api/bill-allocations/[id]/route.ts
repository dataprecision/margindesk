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
 * PUT /api/bill-allocations/[id]
 * Update a bill allocation
 * Body: {
 *   allocation_percentage?: number (0-100),
 *   notes?: string
 * }
 */
export const PUT = withAuth(async (req, { user, params }) => {
  try {
    // Only owner and finance can update bill allocations
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { id } = params;
    const body = await req.json();
    const { allocation_percentage, notes } = body;

    // Check if allocation exists
    const existing = await prisma.resellingBillAllocation.findUnique({
      where: { id },
      include: {
        bill: true,
        reselling_invoice: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Bill allocation not found" },
        { status: 404 }
      );
    }

    // Validate allocation_percentage if provided
    if (allocation_percentage !== undefined) {
      if (allocation_percentage < 0 || allocation_percentage > 100) {
        return NextResponse.json(
          { error: "allocation_percentage must be between 0 and 100" },
          { status: 400 }
        );
      }

      // Validate won't exceed 100% (excluding current allocation)
      const validation = await validateBillAllocation(
        existing.bill_id,
        allocation_percentage,
        id
      );

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
    }

    // Calculate new allocated amount if percentage changed
    const billSubTotal = existing.bill.sub_total
      ? Number(existing.bill.sub_total)
      : Number(existing.bill.total);

    const updatedData: any = {};
    if (allocation_percentage !== undefined) {
      updatedData.allocation_percentage = Number(allocation_percentage);
      updatedData.allocated_amount = (billSubTotal * allocation_percentage) / 100;
    }
    if (notes !== undefined) {
      updatedData.notes = notes;
    }

    const updated = await prisma.resellingBillAllocation.update({
      where: { id },
      data: updatedData,
      include: {
        bill: true,
        product: true,
        reselling_invoice: true,
      },
    });

    // Recalculate invoice totals
    await recalculateInvoiceTotals(existing.reselling_invoice_id);

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Error updating bill allocation:", error);
    return NextResponse.json(
      { error: "Failed to update bill allocation", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/bill-allocations/[id]
 * Delete a bill allocation
 */
export const DELETE = withAuth(async (req, { user, params }) => {
  try {
    // Only owner and finance can delete bill allocations
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { id } = params;

    // Check if allocation exists
    const existing = await prisma.resellingBillAllocation.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Bill allocation not found" },
        { status: 404 }
      );
    }

    const invoiceId = existing.reselling_invoice_id;

    // Delete allocation
    await prisma.resellingBillAllocation.delete({
      where: { id },
    });

    // Recalculate invoice totals
    await recalculateInvoiceTotals(invoiceId);

    return NextResponse.json({
      success: true,
      message: "Bill allocation deleted",
    });
  } catch (error: any) {
    console.error("Error deleting bill allocation:", error);
    return NextResponse.json(
      { error: "Failed to delete bill allocation", details: error.message },
      { status: 500 }
    );
  }
});
