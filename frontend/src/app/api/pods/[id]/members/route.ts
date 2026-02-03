import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/pods/[id]/members
 * List pod members
 */
export const GET = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const active = searchParams.get("active") !== "false"; // Default true
    const date = searchParams.get("date"); // Optional: get members active on specific date

    const where: any = { pod_id: id };

    if (active && !date) {
      // Active members only (no end_date)
      where.end_date = null;
    } else if (date) {
      // Members active on specific date
      const targetDate = new Date(date);
      where.start_date = { lte: targetDate };
      where.OR = [
        { end_date: null },
        { end_date: { gte: targetDate } },
      ];
    }

    const members = await prisma.podMembership.findMany({
      where,
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
    });

    return NextResponse.json({ members });
  } catch (error) {
    console.error("Error fetching pod members:", error);
    return NextResponse.json(
      { error: "Failed to fetch pod members" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/pods/[id]/members
 * Add member to pod
 */
export const POST = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;
    const body = await req.json();

    console.log("Adding member to pod:", { pod_id: id, body });

    // Check if user has permission (owner/finance only)
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can manage pod members" },
        { status: 403 }
      );
    }

    // Validate required fields
    if (!body.person_id || !body.start_date) {
      return NextResponse.json(
        { error: "person_id and start_date are required" },
        { status: 400 }
      );
    }

    // Validate allocation_pct (0-100)
    const allocation_pct = body.allocation_pct || 100;
    if (allocation_pct < 0 || allocation_pct > 100) {
      return NextResponse.json(
        { error: "allocation_pct must be between 0 and 100" },
        { status: 400 }
      );
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

    // Check if person already has active membership in this pod
    const existingActiveMembership = await prisma.podMembership.findFirst({
      where: {
        pod_id: id,
        person_id: body.person_id,
        end_date: null,
      },
    });

    if (existingActiveMembership) {
      return NextResponse.json(
        { error: "Person is already an active member of this pod" },
        { status: 400 }
      );
    }

    // Calculate total allocation for this person across all active pods
    const activeAllocations = await prisma.podMembership.findMany({
      where: {
        person_id: body.person_id,
        end_date: null,
      },
      select: {
        allocation_pct: true,
        pod: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const totalAllocation = activeAllocations.reduce((sum, m) => sum + m.allocation_pct, 0);
    const newTotalAllocation = totalAllocation + allocation_pct;

    // Warning if total allocation exceeds 100% (but don't block)
    let warning = null;
    if (newTotalAllocation > 100) {
      warning = `Total allocation for ${person.name} will be ${newTotalAllocation}% across ${activeAllocations.length + 1} pods`;
    }

    // Create membership
    const membership = await prisma.podMembership.create({
      data: {
        pod_id: id,
        person_id: body.person_id,
        start_date: new Date(body.start_date),
        end_date: body.end_date ? new Date(body.end_date) : null,
        allocation_pct: allocation_pct,
      },
      include: {
        person: {
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
        entity: "PodMembership",
        entity_id: membership.id,
        action: "create",
        after_json: membership,
      },
    });

    console.log(`✅ Member added to pod: ${person.name} → ${pod.name} (${allocation_pct}%)`);

    return NextResponse.json({
      success: true,
      membership,
      warning,
      message: "Member added to pod successfully",
    });
  } catch (error) {
    console.error("Error adding member to pod:", error);
    return NextResponse.json(
      {
        error: "Failed to add member to pod",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
