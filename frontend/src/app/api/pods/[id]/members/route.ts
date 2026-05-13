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

    // Check if user has permission (owner/finance/pm)
    if (user.role !== "owner" && user.role !== "finance" && user.role !== "pm") {
      return NextResponse.json(
        { error: "Insufficient permissions to manage pod members" },
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

    // PM role: can only add people in their reporting chain
    if (user.role === "pm") {
      const pmPerson = await prisma.person.findUnique({
        where: { email: user.email },
        select: { id: true },
      });

      if (!pmPerson) {
        return NextResponse.json(
          { error: "Your person record was not found" },
          { status: 403 }
        );
      }

      // Walk up the target person's manager chain to see if PM is an ancestor
      let currentId: string | null = body.person_id;
      let isInChain = false;
      const visited = new Set<string>();

      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const p = await prisma.person.findUnique({
          where: { id: currentId },
          select: { manager_id: true },
        });
        if (!p) break;
        if (p.manager_id === pmPerson.id) {
          isInChain = true;
          break;
        }
        currentId = p.manager_id;
      }

      if (!isInChain) {
        return NextResponse.json(
          { error: "You can only add people in your reporting chain" },
          { status: 403 }
        );
      }
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

    // Guard: cannot add a member whose membership starts after their exit date,
    // and any explicit end_date can't be after their exit either.
    const personEndDate = person.end_date;
    if (personEndDate) {
      const newStart = new Date(body.start_date);
      const newEnd = body.end_date ? new Date(body.end_date) : null;
      if (newStart > personEndDate) {
        return NextResponse.json(
          {
            error: `${person.name} exited on ${personEndDate.toISOString().substring(0, 10)} — cannot add a membership starting after that date.`,
          },
          { status: 400 }
        );
      }
      if (newEnd && newEnd > personEndDate) {
        return NextResponse.json(
          {
            error: `${person.name} exited on ${personEndDate.toISOString().substring(0, 10)} — membership end_date cannot be after that.`,
          },
          { status: 400 }
        );
      }
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

    // Hard reject if total active allocation would exceed 100%. Anything above
    // means the same person-month would land on two pod cost lines, which is
    // double counting.
    if (newTotalAllocation > 100) {
      const breakdown = activeAllocations
        .map((m) => `${m.pod.name} (${m.allocation_pct}%)`)
        .join(", ");
      return NextResponse.json(
        {
          error: `Total allocation for ${person.name} would be ${newTotalAllocation}% across ${activeAllocations.length + 1} pods (limit 100%). Existing active: ${breakdown || "none"}. Lower an existing allocation, end one, or reduce this new one.`,
          current_total: totalAllocation,
          attempted_total: newTotalAllocation,
        },
        { status: 400 }
      );
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
