import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/pods/[id]/projects
 * List projects assigned to pod
 */
export const GET = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const active = searchParams.get("active") !== "false"; // Default true
    const date = searchParams.get("date"); // Optional: get projects active on specific date

    const where: any = { pod_id: id };

    if (active && !date) {
      // Active projects only (no end_date)
      where.end_date = null;
    } else if (date) {
      // Projects active on specific date
      const targetDate = new Date(date);
      where.start_date = { lte: targetDate };
      where.OR = [
        { end_date: null },
        { end_date: { gte: targetDate } },
      ];
    }

    const projects = await prisma.podProjectMapping.findMany({
      where,
      include: {
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
      orderBy: { start_date: "desc" },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching pod projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch pod projects" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/pods/[id]/projects
 * Assign project to pod
 */
export const POST = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;
    const body = await req.json();

    console.log("Assigning project to pod:", { pod_id: id, body });

    // Check if user has permission (owner/finance only)
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can manage pod projects" },
        { status: 403 }
      );
    }

    // Validate required fields
    if (!body.project_id || !body.start_date) {
      return NextResponse.json(
        { error: "project_id and start_date are required" },
        { status: 400 }
      );
    }

    // Validate dates if both provided
    if (body.end_date && body.start_date) {
      const startDate = new Date(body.start_date);
      const endDate = new Date(body.end_date);
      if (endDate < startDate) {
        return NextResponse.json(
          { error: "end_date must be after start_date" },
          { status: 400 }
        );
      }
    }

    // Verify pod exists
    const pod = await prisma.financialPod.findUnique({
      where: { id },
    });

    if (!pod) {
      return NextResponse.json(
        { error: "Pod not found" },
        { status: 404 }
      );
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: body.project_id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
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

    // Check if project already has active mapping to this pod
    const existingActiveMapping = await prisma.podProjectMapping.findFirst({
      where: {
        pod_id: id,
        project_id: body.project_id,
        end_date: null,
      },
    });

    if (existingActiveMapping) {
      return NextResponse.json(
        { error: "Project is already assigned to this pod" },
        { status: 400 }
      );
    }

    // Create mapping
    const mapping = await prisma.podProjectMapping.create({
      data: {
        pod_id: id,
        project_id: body.project_id,
        start_date: new Date(body.start_date),
        end_date: body.end_date ? new Date(body.end_date) : null,
      },
      include: {
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
        entity: "PodProjectMapping",
        entity_id: mapping.id,
        action: "create",
        after_json: mapping,
      },
    });

    console.log(`✅ Project assigned to pod: ${project.name} → ${pod.name}`);

    return NextResponse.json({
      success: true,
      mapping,
      message: "Project assigned to pod successfully",
    });
  } catch (error) {
    console.error("Error assigning project to pod:", error);
    return NextResponse.json(
      {
        error: "Failed to assign project to pod",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
