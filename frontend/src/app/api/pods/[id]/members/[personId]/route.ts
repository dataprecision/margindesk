import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * DELETE /api/pods/[id]/members/[personId]
 * Remove person from pod (sets end_date)
 * Query param: end_date (optional, defaults to now)
 */
/**
 * PATCH /api/pods/[id]/members/[personId]
 * Update dates on a membership (works for both active and historical)
 */
export const PATCH = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id, personId } = await params;

    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can manage pod members" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { start_date, end_date, membership_id } = body;

    const membership = membership_id
      ? await prisma.podMembership.findUnique({ where: { id: membership_id } })
      : await prisma.podMembership.findFirst({
          where: { pod_id: id, person_id: personId },
          orderBy: { start_date: "desc" },
        });

    if (!membership) {
      return NextResponse.json(
        { error: "Membership not found" },
        { status: 404 }
      );
    }

    const newStartDate = start_date ? new Date(start_date + "T00:00:00.000Z") : membership.start_date;
    const newEndDate = end_date ? new Date(end_date + "T00:00:00.000Z") : end_date === null ? null : membership.end_date;

    if (newEndDate && newEndDate < newStartDate) {
      return NextResponse.json(
        { error: "End date cannot be before start date" },
        { status: 400 }
      );
    }

    const updatedMembership = await prisma.podMembership.update({
      where: { id: membership.id },
      data: {
        start_date: newStartDate,
        end_date: newEndDate,
        updated_at: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "PodMembership",
        entity_id: membership.id,
        action: "update",
        before_json: membership,
        after_json: updatedMembership,
      },
    });

    return NextResponse.json({
      success: true,
      membership: updatedMembership,
    });
  } catch (error) {
    console.error("Error updating membership:", error);
    return NextResponse.json(
      {
        error: "Failed to update membership",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id, personId } = await params;
    const { searchParams } = new URL(req.url);
    const endDateParam = searchParams.get("end_date");

    console.log("Removing member from pod:", { pod_id: id, person_id: personId, end_date: endDateParam });

    // Check if user has permission (owner/finance only)
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can manage pod members" },
        { status: 403 }
      );
    }

    // Find active membership
    const activeMembership = await prisma.podMembership.findFirst({
      where: {
        pod_id: id,
        person_id: personId,
        end_date: null,
      },
      include: {
        person: {
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

    if (!activeMembership) {
      return NextResponse.json(
        { error: "Active membership not found" },
        { status: 404 }
      );
    }

    // Determine end date: use provided date or current date
    const endDate = endDateParam ? new Date(endDateParam) : new Date();

    // Validate end date is not before start date
    if (endDate < new Date(activeMembership.start_date)) {
      return NextResponse.json(
        { error: "End date cannot be before start date" },
        { status: 400 }
      );
    }

    // Update membership to set end_date
    const updatedMembership = await prisma.podMembership.update({
      where: { id: activeMembership.id },
      data: {
        end_date: endDate,
        updated_at: new Date(),
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "PodMembership",
        entity_id: updatedMembership.id,
        action: "update",
        before_json: activeMembership,
        after_json: updatedMembership,
      },
    });

    console.log(`✅ Member removed from pod: ${activeMembership.person.name} → ${activeMembership.pod.name}`);

    return NextResponse.json({
      success: true,
      membership: updatedMembership,
      message: "Member removed from pod successfully",
    });
  } catch (error) {
    console.error("Error removing member from pod:", error);
    return NextResponse.json(
      {
        error: "Failed to remove member from pod",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
