import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/projects
 * List all projects (authenticated users only)
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("client_id");
    const status = searchParams.get("status");
    const type = searchParams.get("type"); // Can be comma-separated: "reselling,outsourcing"

    const where: any = {};
    if (clientId) where.client_id = clientId;
    if (status) where.status = status;

    // Filter by project type (requires joining with config)
    if (type) {
      const types = type.split(",");
      where.config = {
        project_type: {
          in: types,
        },
      };
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: {
        created_at: "desc",
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        config: true,
        _count: {
          select: {
            allocations: true,
            project_costs: true,
            invoices: true,
          },
        },
      },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/projects
 * Create a new project (authenticated users only)
 */
export const POST = withAuth(async (req, { user }) => {
  try {
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

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: body.client_id },
    });

    if (!client) {
      return NextResponse.json(
        { error: "Client not found" },
        { status: 404 }
      );
    }

    const project = await prisma.project.create({
      data: {
        client_id: body.client_id,
        name: body.name,
        pricing_model: body.pricing_model,
        start_date: new Date(body.start_date),
        end_date: body.end_date ? new Date(body.end_date) : null,
        status: body.status || "draft",
        // Create project config if project_type is provided
        ...(body.project_type && {
          config: {
            create: {
              project_type: body.project_type,
              billing_model: "time_and_material",
              rate_type: "blended",
              product_id: body.product_id || null,
            },
          },
        }),
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
        action: "create",
        after_json: project,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
});
