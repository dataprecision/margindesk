import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * PATCH /api/salaries/[id]
 * Toggle support staff designation for a salary record
 * Owner/Finance only
 */
export const PATCH = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;

    // Check permissions
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can update support staff designation" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Validate request body
    if (typeof body.is_support_staff !== "boolean") {
      return NextResponse.json(
        { error: "is_support_staff must be a boolean" },
        { status: 400 }
      );
    }

    // Get existing salary record for audit log
    const existing = await prisma.personSalary.findUnique({
      where: { id },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Salary record not found" },
        { status: 404 }
      );
    }

    // Update support staff designation
    const updated = await prisma.personSalary.update({
      where: { id },
      data: {
        is_support_staff: body.is_support_staff,
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            employee_code: true,
            department: true,
            role: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "PersonSalary",
        entity_id: updated.id,
        action: "update",
        before_json: {
          is_support_staff: existing.is_support_staff,
          person_name: existing.person.name,
        },
        after_json: {
          is_support_staff: updated.is_support_staff,
          person_name: updated.person.name,
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating salary:", error);
    return NextResponse.json(
      { error: "Failed to update salary" },
      { status: 500 }
    );
  }
});
