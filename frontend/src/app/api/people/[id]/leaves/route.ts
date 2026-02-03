import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/people/[id]/leaves
 * Get all leaves for a specific person (approved leaves only)
 */
export const GET = withAuth(async (req, { params, user }) => {
  try {
    const { id } = await params;

    // First verify the person exists
    const person = await prisma.person.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!person) {
      return NextResponse.json(
        { error: "Person not found" },
        { status: 404 }
      );
    }

    // Get all approved leaves for this person
    const leaves = await prisma.leave.findMany({
      where: {
        person_id: id,
        status: "approved", // Only show approved leaves
      },
      orderBy: {
        start_date: "desc", // Most recent first
      },
    });

    return NextResponse.json({
      person: {
        id: person.id,
        name: person.name,
      },
      leaves: leaves.map(leave => ({
        id: leave.id,
        zoho_leave_id: leave.zoho_leave_id,
        leave_type: leave.leave_type,
        start_date: leave.start_date,
        end_date: leave.end_date,
        days: Number(leave.days),
        status: leave.status,
        reason: leave.reason,
        created_at: leave.created_at,
      })),
      total: leaves.length,
    });
  } catch (error) {
    console.error("Error fetching person leaves:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaves" },
      { status: 500 }
    );
  }
});
