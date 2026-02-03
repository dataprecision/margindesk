import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/allocations/[id]
 * Get a single allocation by ID
 */
export const GET = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;

    const allocation = await prisma.allocation.findUnique({
      where: { id },
      include: {
        person: true,
        project: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!allocation) {
      return NextResponse.json(
        { error: "Allocation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(allocation);
  } catch (error) {
    console.error("Error fetching allocation:", error);
    return NextResponse.json(
      { error: "Failed to fetch allocation" },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/allocations/[id]
 * Update an allocation (owner/finance/pm can update)
 */
export const PUT = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;
    const body = await req.json();

    // Check permissions
    if (!["owner", "finance", "pm"].includes(user.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions to update allocations" },
        { status: 403 }
      );
    }

    // Fetch current state for audit log
    const currentAllocation = await prisma.allocation.findUnique({
      where: { id },
    });

    if (!currentAllocation) {
      return NextResponse.json(
        { error: "Allocation not found" },
        { status: 404 }
      );
    }

    // Validate allocation percentage if provided
    if (body.allocation_pct !== undefined && (body.allocation_pct < 0 || body.allocation_pct > 1)) {
      return NextResponse.json(
        { error: "allocation_pct must be between 0 and 1" },
        { status: 400 }
      );
    }

    const allocation = await prisma.allocation.update({
      where: { id },
      data: {
        start_date: body.start_date ? new Date(body.start_date) : undefined,
        end_date: body.end_date ? new Date(body.end_date) : undefined,
        allocation_pct: body.allocation_pct,
        notes: body.notes,
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "Allocation",
        entity_id: allocation.id,
        action: "update",
        before_json: currentAllocation,
        after_json: allocation,
      },
    });

    return NextResponse.json(allocation);
  } catch (error) {
    console.error("Error updating allocation:", error);
    return NextResponse.json(
      { error: "Failed to update allocation" },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/allocations/[id]
 * Delete an allocation (owner/finance/pm can delete)
 */
export const DELETE = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;

    // Check permissions
    if (!["owner", "finance", "pm"].includes(user.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions to delete allocations" },
        { status: 403 }
      );
    }

    // Fetch current state for audit log
    const currentAllocation = await prisma.allocation.findUnique({
      where: { id },
    });

    if (!currentAllocation) {
      return NextResponse.json(
        { error: "Allocation not found" },
        { status: 404 }
      );
    }

    await prisma.allocation.delete({
      where: { id },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "Allocation",
        entity_id: id,
        action: "delete",
        before_json: currentAllocation,
      },
    });

    return NextResponse.json({ message: "Allocation deleted successfully" });
  } catch (error) {
    console.error("Error deleting allocation:", error);
    return NextResponse.json(
      { error: "Failed to delete allocation" },
      { status: 500 }
    );
  }
});
