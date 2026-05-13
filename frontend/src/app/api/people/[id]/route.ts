import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { getPersonIdsForUser } from "@/lib/auth/pod-scope";

const prisma = new PrismaClient();

/**
 * GET /api/people/[id]
 * Get a specific person with their details. PMs are scoped to people in their pods.
 */
export const GET = withAuth(async (req, { params, user }) => {
  try {
    const { id } = await params;

    const allowedPersonIds = await getPersonIdsForUser(user.email, user.role);
    if (allowedPersonIds !== null && !allowedPersonIds.includes(id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            allocations: true,
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json(
        { error: "Person not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(person);
  } catch (error) {
    console.error("Error fetching person:", error);
    return NextResponse.json(
      { error: "Failed to fetch person" },
      { status: 500 }
    );
  }
});
