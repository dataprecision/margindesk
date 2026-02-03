import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * PATCH /api/exclusion-rules/:id
 * Update an exclusion rule (toggle enabled status or update fields)
 */
export const PATCH = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;
    const body = await req.json();

    const rule = await prisma.expenseExclusionRule.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ success: true, rule });
  } catch (error: any) {
    console.error("Error updating exclusion rule:", error);
    return NextResponse.json(
      { error: "Failed to update exclusion rule", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/exclusion-rules/:id
 * Delete an exclusion rule
 */
export const DELETE = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;

    await prisma.expenseExclusionRule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting exclusion rule:", error);
    return NextResponse.json(
      { error: "Failed to delete exclusion rule", details: error.message },
      { status: 500 }
    );
  }
});
