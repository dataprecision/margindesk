import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * DELETE /api/pods/[id]/projects/[projectId]
 * Unassign project from pod (sets end_date = now)
 */
/**
 * PATCH /api/pods/[id]/projects/[projectId]
 * Update dates on a project mapping (works for both active and historical)
 */
export const PATCH = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id, projectId } = await params;

    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can manage pod projects" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { start_date, end_date, mapping_id } = body;

    // Find the mapping - use mapping_id if provided (for historical), otherwise find by pod+project
    const mapping = mapping_id
      ? await prisma.podProjectMapping.findUnique({ where: { id: mapping_id } })
      : await prisma.podProjectMapping.findFirst({
          where: { pod_id: id, project_id: projectId },
          orderBy: { start_date: "desc" },
        });

    if (!mapping) {
      return NextResponse.json(
        { error: "Project mapping not found" },
        { status: 404 }
      );
    }

    const newStartDate = start_date ? new Date(start_date + "T00:00:00.000Z") : mapping.start_date;
    const newEndDate = end_date ? new Date(end_date + "T00:00:00.000Z") : end_date === null ? null : mapping.end_date;

    // Validate end date is not before start date
    if (newEndDate && newEndDate < newStartDate) {
      return NextResponse.json(
        { error: "End date cannot be before start date" },
        { status: 400 }
      );
    }

    const updatedMapping = await prisma.podProjectMapping.update({
      where: { id: mapping.id },
      data: {
        start_date: newStartDate,
        end_date: newEndDate,
        updated_at: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "PodProjectMapping",
        entity_id: mapping.id,
        action: "update",
        before_json: mapping,
        after_json: updatedMapping,
      },
    });

    return NextResponse.json({
      success: true,
      mapping: updatedMapping,
    });
  } catch (error) {
    console.error("Error updating project mapping:", error);
    return NextResponse.json(
      {
        error: "Failed to update project mapping",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id, projectId } = await params;
    const { searchParams } = new URL(req.url);
    const endDateParam = searchParams.get("end_date");

    console.log("Unassigning project from pod:", { pod_id: id, project_id: projectId, end_date: endDateParam });

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

    // Determine end date: use provided date or current date
    const endDate = endDateParam ? new Date(endDateParam) : new Date();

    // Validate end date is not before start date
    if (endDate < new Date(activeMapping.start_date)) {
      return NextResponse.json(
        { error: "End date cannot be before start date" },
        { status: 400 }
      );
    }

    // Update mapping to set end_date
    const updatedMapping = await prisma.podProjectMapping.update({
      where: { id: activeMapping.id },
      data: {
        end_date: endDate,
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
