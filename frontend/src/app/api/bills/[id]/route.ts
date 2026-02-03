import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * PATCH /api/bills/:id
 * Update a bill (toggle include_in_calculation or update fields)
 */
export const PATCH = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;
    const body = await req.json();

    const bill = await prisma.bill.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ success: true, bill });
  } catch (error: any) {
    console.error("Error updating bill:", error);
    return NextResponse.json(
      { error: "Failed to update bill", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/bills/:id
 * Delete a bill
 */
export const DELETE = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;

    await prisma.bill.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting bill:", error);
    return NextResponse.json(
      { error: "Failed to delete bill", details: error.message },
      { status: 500 }
    );
  }
});
