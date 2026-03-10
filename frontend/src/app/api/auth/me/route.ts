import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/auth/me
 * Returns current user info including linked person_id
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const person = await prisma.person.findUnique({
      where: { email: user.email },
      select: { id: true, name: true, manager_id: true },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      person_id: person?.id || null,
    });
  } catch (error) {
    console.error("Error fetching user info:", error);
    return NextResponse.json({ error: "Failed to fetch user info" }, { status: 500 });
  }
});
