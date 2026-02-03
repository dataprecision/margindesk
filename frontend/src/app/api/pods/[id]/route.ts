import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/pods/[id]
 * Get single pod with full details
 */
export const GET = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;

    const pod = await prisma.financialPod.findUnique({
      where: { id },
      include: {
        leader: {
          select: {
            id: true,
            name: true,
            employee_code: true,
          },
        },
        members: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
                employee_code: true,
              },
            },
          },
          orderBy: { start_date: "desc" },
        },
        projects: {
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
        },
      },
    });

    if (!pod) {
      return NextResponse.json(
        { error: "Pod not found" },
        { status: 404 }
      );
    }

    // Separate active and historical members/projects
    const activeMemberships = pod.members.filter((m) => !m.end_date);
    const historicalMemberships = pod.members.filter((m) => m.end_date);
    const activeProjects = pod.projects.filter((p) => !p.end_date);
    const historicalProjects = pod.projects.filter((p) => p.end_date);

    return NextResponse.json({
      ...pod,
      active_members: activeMemberships,
      historical_members: historicalMemberships,
      active_projects: activeProjects,
      historical_projects: historicalProjects,
    });
  } catch (error) {
    console.error("Error fetching pod:", error);
    return NextResponse.json(
      { error: "Failed to fetch pod" },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/pods/[id]
 * Update pod details
 */
export const PATCH = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;
    const body = await req.json();

    console.log("Updating pod:", { id, body });

    // Check if user has permission (owner/finance only)
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can update pods" },
        { status: 403 }
      );
    }

    // Fetch current pod for audit
    const currentPod = await prisma.financialPod.findUnique({
      where: { id },
    });

    if (!currentPod) {
      return NextResponse.json(
        { error: "Pod not found" },
        { status: 404 }
      );
    }

    // Verify new leader exists if leader is being changed
    if (body.leader_id && body.leader_id !== currentPod.leader_id) {
      const leader = await prisma.person.findUnique({
        where: { id: body.leader_id },
      });

      if (!leader) {
        return NextResponse.json(
          { error: "New leader not found" },
          { status: 404 }
        );
      }
    }

    // Update pod
    const updatedPod = await prisma.financialPod.update({
      where: { id },
      data: {
        name: body.name !== undefined ? body.name : currentPod.name,
        description: body.description !== undefined ? body.description : currentPod.description,
        leader_id: body.leader_id !== undefined ? body.leader_id : currentPod.leader_id,
        status: body.status !== undefined ? body.status : currentPod.status,
        updated_at: new Date(),
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
        entity_id: updatedPod.id,
        action: "update",
        before_json: currentPod,
        after_json: updatedPod,
      },
    });

    console.log(`✅ Pod updated: ${updatedPod.name} (${updatedPod.id})`);

    return NextResponse.json({
      success: true,
      pod: updatedPod,
      message: "Pod updated successfully",
    });
  } catch (error) {
    console.error("Error updating pod:", error);
    return NextResponse.json(
      {
        error: "Failed to update pod",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/pods/[id]
 * Delete pod (only if no active members)
 */
export const DELETE = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;

    console.log("Deleting pod:", id);

    // Check if user has permission (owner/finance only)
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can delete pods" },
        { status: 403 }
      );
    }

    // Fetch current pod for audit
    const currentPod = await prisma.financialPod.findUnique({
      where: { id },
    });

    if (!currentPod) {
      return NextResponse.json(
        { error: "Pod not found" },
        { status: 404 }
      );
    }

    // Check if pod has active members
    const activeMembersCount = await prisma.podMembership.count({
      where: { pod_id: id, end_date: null },
    });

    if (activeMembersCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete pod with ${activeMembersCount} active members. Remove members first.` },
        { status: 400 }
      );
    }

    // Delete pod (cascade will handle memberships and projects)
    await prisma.financialPod.delete({
      where: { id },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "FinancialPod",
        entity_id: currentPod.id,
        action: "delete",
        before_json: currentPod,
      },
    });

    console.log(`✅ Pod deleted: ${currentPod.name} (${currentPod.id})`);

    return NextResponse.json({
      success: true,
      message: "Pod deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting pod:", error);
    return NextResponse.json(
      {
        error: "Failed to delete pod",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
