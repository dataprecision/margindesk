import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * DELETE /api/pods/[id]/members/[personId]
 * Remove person from pod (sets end_date)
 * Query param: end_date (optional, defaults to now)
 */
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
