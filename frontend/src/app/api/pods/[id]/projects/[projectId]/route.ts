import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * DELETE /api/pods/[id]/projects/[projectId]
 * Unassign project from pod (sets end_date = now)
 */
export const DELETE = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id, projectId } = await params;

    console.log("Unassigning project from pod:", { pod_id: id, project_id: projectId });

    // Check if user has permission (owner/finance only)
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can manage pod projects" },
        { status: 403 }
      );
    }

    // Find active mapping
    const activeMapping = await prisma.podProjectMapping.findFirst({
      where: {
        pod_id: id,
        project_id: projectId,
        end_date: null,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        pod: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!activeMapping) {
      return NextResponse.json(
        { error: "Active project mapping not found" },
        { status: 404 }
      );
    }

    // Update mapping to set end_date
    const updatedMapping = await prisma.podProjectMapping.update({
      where: { id: activeMapping.id },
      data: {
        end_date: new Date(),
        updated_at: new Date(),
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "PodProjectMapping",
        entity_id: updatedMapping.id,
        action: "update",
        before_json: activeMapping,
        after_json: updatedMapping,
      },
    });

    console.log(`✅ Project unassigned from pod: ${activeMapping.project.name} ← ${activeMapping.pod.name}`);

    return NextResponse.json({
      success: true,
      mapping: updatedMapping,
      message: "Project unassigned from pod successfully",
    });
  } catch (error) {
    console.error("Error unassigning project from pod:", error);
    return NextResponse.json(
      {
        error: "Failed to unassign project from pod",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
