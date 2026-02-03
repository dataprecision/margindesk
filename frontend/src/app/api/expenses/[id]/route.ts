import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * PATCH /api/expenses/:id
 * Update expense inclusion status and exclusion reason
 */
export const PATCH = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const { include_in_calculation, exclusion_reason } = body;

    // Update the expense
    const expense = await prisma.expense.update({
      where: { id },
      data: {
        include_in_calculation,
        exclusion_reason: include_in_calculation ? null : exclusion_reason,
      },
    });

    return NextResponse.json({ success: true, expense });
  } catch (error: any) {
    console.error("Error updating expense:", error);
    return NextResponse.json(
      { error: "Failed to update expense", details: error.message },
      { status: 500 }
    );
  }
});
