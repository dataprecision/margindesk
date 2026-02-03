import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/projects/[id]
 * Get a single project by ID
 */
export const GET = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        config: true,
        allocations: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
        project_costs: {
          orderBy: {
            created_at: "desc",
          },
        },
        invoices: {
          orderBy: {
            issued_on: "desc",
          },
        },
        _count: {
          select: {
            allocations: true,
            project_costs: true,
            invoices: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/projects/[id]
 * Update a project (authenticated users only)
 */
export const PATCH = withAuth(async (req, { user, params }) => {
  try {
    const { id} = await params;
    const body = await req.json();

    // Validate required fields
    if (!body.client_id || !body.name || !body.start_date) {
      return NextResponse.json(
        { error: "Client, name, and start date are required" },
        { status: 400 }
      );
    }

    // Validate pricing model if provided
    if (body.pricing_model && !["TnM", "Retainer", "Milestone"].includes(body.pricing_model)) {
      return NextResponse.json(
        { error: "Invalid pricing model" },
        { status: 400 }
      );
    }

    // Validate status
    if (
      body.status &&
      !["draft", "active", "on_hold", "completed", "cancelled"].includes(body.status)
    ) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // Fetch current state for audit log
    const currentProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!currentProject) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Handle project_type update (upsert project_config)
    if (body.project_type !== undefined) {
      if (body.project_type === "" || body.project_type === null) {
        // Delete config if project_type is empty
        await prisma.projectConfig.deleteMany({
          where: { project_id: id },
        });
      } else {
        // Upsert config with new project_type and product_id
        await prisma.projectConfig.upsert({
          where: { project_id: id },
          create: {
            project_id: id,
            project_type: body.project_type,
            billing_model: "time_and_material",
            rate_type: "blended",
            product_id: body.product_id || null,
          },
          update: {
            project_type: body.project_type,
            product_id: body.product_id || null,
          },
        });
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        client_id: body.client_id,
        name: body.name,
        pricing_model: body.pricing_model,
        start_date: new Date(body.start_date),
        end_date: body.end_date ? new Date(body.end_date) : null,
        status: body.status,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        config: true,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "Project",
        entity_id: project.id,
        action: "update",
        before_json: currentProject,
        after_json: project,
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("Error updating project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/projects/[id]
 * Delete a project (owner/finance only)
 */
export const DELETE = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;

    // Check if user has permission
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can delete projects" },
        { status: 403 }
      );
    }

    // Fetch current state for audit log
    const currentProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!currentProject) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Check for dependencies
    const [allocations, invoices] = await Promise.all([
      prisma.allocation.count({ where: { project_id: id } }),
      prisma.invoice.count({ where: { project_id: id } }),
    ]);

    if (allocations > 0) {
      return NextResponse.json(
        { error: `Cannot delete project with ${allocations} allocation(s)` },
        { status: 400 }
      );
    }

    if (invoices > 0) {
      return NextResponse.json(
        { error: `Cannot delete project with ${invoices} invoice(s)` },
        { status: 400 }
      );
    }

    await prisma.project.delete({
      where: { id },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "Project",
        entity_id: id,
        action: "delete",
        before_json: currentProject,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
});
