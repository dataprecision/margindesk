import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/pods
 * List all pods with optional filters
 */
export const GET = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const leader_id = searchParams.get("leader_id");
    const include_members = searchParams.get("include_members") === "true";
    const include_projects = searchParams.get("include_projects") === "true";

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (leader_id) {
      where.leader_id = leader_id;
    }

    const pods = await prisma.financialPod.findMany({
      where,
      include: {
        leader: {
          select: {
            id: true,
            name: true,
            employee_code: true,
          },
        },
        members: include_members
          ? {
              where: { end_date: null }, // Active members only
              include: {
                person: {
                  select: {
                    id: true,
                    name: true,
                    employee_code: true,
                  },
                },
              },
            }
          : false,
        projects: include_projects
          ? {
              where: { end_date: null }, // Active projects only
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
            }
          : false,
      },
      orderBy: { created_at: "desc" },
    });

    // Calculate counts if not including full data
    const podsWithCounts = await Promise.all(
      pods.map(async (pod) => {
        const member_count = include_members
          ? pod.members.length
          : await prisma.podMembership.count({
              where: { pod_id: pod.id, end_date: null },
            });

        const active_project_count = include_projects
          ? pod.projects.length
          : await prisma.podProjectMapping.count({
              where: { pod_id: pod.id, end_date: null },
            });

        return {
          ...pod,
          member_count,
          active_project_count,
        };
      })
    );

    return NextResponse.json({ pods: podsWithCounts });
  } catch (error) {
    console.error("Error fetching pods:", error);
    return NextResponse.json(
      { error: "Failed to fetch pods" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/pods
 * Create a new pod
 */
export const POST = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    const body = await req.json();

    console.log("Creating pod:", body);

    // Check if user has permission (owner/finance only)
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can create pods" },
        { status: 403 }
      );
    }

    // Validate required fields
    if (!body.name || !body.leader_id) {
      return NextResponse.json(
        { error: "name and leader_id are required" },
        { status: 400 }
      );
    }

    // Verify leader exists
    const leader = await prisma.person.findUnique({
      where: { id: body.leader_id },
    });

    if (!leader) {
      return NextResponse.json(
        { error: "Leader not found" },
        { status: 404 }
      );
    }

    // Create pod
    const pod = await prisma.financialPod.create({
      data: {
        name: body.name,
        description: body.description || null,
        leader_id: body.leader_id,
        status: body.status || "active",
      },
      include: {
        leader: {
          select: {
            id: true,
            name: true,
            employee_code: true,
          },
        },
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "FinancialPod",
        entity_id: pod.id,
        action: "create",
        after_json: pod,
      },
    });

    console.log(`✅ Pod created: ${pod.name} (${pod.id})`);

    return NextResponse.json({
      success: true,
      pod,
      message: "Pod created successfully",
    });
  } catch (error) {
    console.error("Error creating pod:", error);
    return NextResponse.json(
      {
        error: "Failed to create pod",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
