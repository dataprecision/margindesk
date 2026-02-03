import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/allocations
 * List all allocations (manager resource planning)
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const allocations = await prisma.allocation.findMany({
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
      orderBy: [
        { start_date: "desc" },
        { person: { name: "asc" } },
      ],
    });

    return NextResponse.json({
      allocations,
      count: allocations.length,
    });
  } catch (error: any) {
    console.error("Error fetching allocations:", error);
    return NextResponse.json(
      { error: "Failed to fetch allocations", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * POST /api/allocations
 * Create a new allocation (owner/finance/pm can create)
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    // Check permissions
    if (!["owner", "finance", "pm"].includes(user.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions to create allocations" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Validate required fields
    if (!body.person_id || !body.project_id || !body.start_date || body.allocation_pct === undefined) {
      return NextResponse.json(
        { error: "person_id, project_id, start_date, and allocation_pct are required" },
        { status: 400 }
      );
    }

    // Verify person exists
    const person = await prisma.person.findUnique({
      where: { id: body.person_id },
    });

    if (!person) {
      return NextResponse.json(
        { error: "Person not found" },
        { status: 404 }
      );
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: body.project_id },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Validate allocation percentage
    if (body.allocation_pct < 0 || body.allocation_pct > 1) {
      return NextResponse.json(
        { error: "allocation_pct must be between 0 and 1" },
        { status: 400 }
      );
    }

    const allocation = await prisma.allocation.create({
      data: {
        person_id: body.person_id,
        project_id: body.project_id,
        start_date: new Date(body.start_date),
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
        action: "create",
        after_json: allocation,
      },
    });

    return NextResponse.json(allocation, { status: 201 });
  } catch (error) {
    console.error("Error creating allocation:", error);
    return NextResponse.json(
      { error: "Failed to create allocation" },
      { status: 500 }
    );
  }
});
