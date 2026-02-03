import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/bills/[id]/allocation-status
 * Get allocation status for a bill
 * Shows how much of the bill is allocated to reselling invoices
 */
export const GET = withAuth(async (req, { user, params }) => {
  try {
    const { id: billId } = params;

    // Check if bill exists
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
    });

    if (!bill) {
      return NextResponse.json(
        { error: "Bill not found" },
        { status: 404 }
      );
    }

    // Get all allocations for this bill
    const allocations = await prisma.resellingBillAllocation.findMany({
      where: { bill_id: billId },
      include: {
        reselling_invoice: {
          include: {
            project: {
              include: { client: true },
            },
            product: true,
          },
        },
        product: true,
      },
      orderBy: { created_at: "asc" },
    });

    // Calculate total allocated percentage
    const totalAllocatedPercentage = allocations.reduce(
      (sum, a) => sum + Number(a.allocation_percentage),
      0
    );

    const totalAllocatedAmount = allocations.reduce(
      (sum, a) => sum + Number(a.allocated_amount),
      0
    );

    const billSubTotal = bill.sub_total ? Number(bill.sub_total) : Number(bill.total);
    const remainingPercentage = 100 - totalAllocatedPercentage;
    const remainingAmount = billSubTotal - totalAllocatedAmount;

    return NextResponse.json({
      bill: {
        id: bill.id,
        bill_number: bill.bill_number,
        vendor_name: bill.vendor_name,
        bill_date: bill.bill_date,
        sub_total: billSubTotal,
        total: Number(bill.total),
      },
      allocation_status: {
        total_allocated_percentage: totalAllocatedPercentage,
        remaining_percentage: remainingPercentage,
        total_allocated_amount: totalAllocatedAmount,
        remaining_amount: remainingAmount,
        is_fully_allocated: totalAllocatedPercentage >= 100,
        is_partially_allocated: totalAllocatedPercentage > 0 && totalAllocatedPercentage < 100,
        is_unallocated: totalAllocatedPercentage === 0,
      },
      allocations: allocations.map((a) => ({
        id: a.id,
        allocation_percentage: Number(a.allocation_percentage),
        allocated_amount: Number(a.allocated_amount),
        product_name: a.product.name,
        project_name: a.reselling_invoice.project.name,
        client_name: a.reselling_invoice.project.client.name,
        invoice_number: a.reselling_invoice.invoice_number,
        invoice_date: a.reselling_invoice.invoice_date,
        notes: a.notes,
      })),
      count: allocations.length,
    });
  } catch (error) {
    console.error("Error fetching bill allocation status:", error);
    return NextResponse.json(
      { error: "Failed to fetch bill allocation status" },
      { status: 500 }
    );
  }
});
