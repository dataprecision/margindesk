import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/people
 * List all people (authenticated users only)
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");
    const billable = searchParams.get("billable");

    const where: any = {};
    if (role) where.role = role;
    if (billable !== null) where.billable = billable === "true";

    // Get current month for utilization lookup
    const currentMonth = new Date();
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

    const people = await prisma.person.findMany({
      where,
      orderBy: {
        name: "asc",
      },
      include: {
        _count: {
          select: {
            allocations: true,
          },
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        monthly_utilization: {
          where: {
            month: firstDay,
          },
          take: 1,
        },
      },
    });

    // Transform the data to include utilization
    const peopleWithUtilization = people.map(person => ({
      ...person,
      currentUtilization: person.monthly_utilization[0] ? {
        utilizationPct: Number(person.monthly_utilization[0].utilization_pct),
        billableUtilization: Number(person.monthly_utilization[0].billable_utilization),
        workedHours: Number(person.monthly_utilization[0].worked_hours),
        billableHours: Number(person.monthly_utilization[0].billable_hours),
        workingHours: Number(person.monthly_utilization[0].working_hours),
      } : null,
      monthly_utilization: undefined, // Remove the raw data
    }));

    return NextResponse.json({
      people: peopleWithUtilization,
      total: people.length,
      user: {
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error fetching people:", error);
    return NextResponse.json(
      { error: "Failed to fetch people" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/people
 * Create a new person (owner/finance only)
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    // Check permissions
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can create people" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Validate required fields
    if (!body.email || !body.name) {
      return NextResponse.json(
        { error: "Email and name are required" },
        { status: 400 }
      );
    }

    // Check if person already exists
    const existing = await prisma.person.findUnique({
      where: { email: body.email },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Person with this email already exists" },
        { status: 400 }
      );
    }

    const person = await prisma.person.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        department: body.department,
        billable: body.billable !== undefined ? body.billable : true,
        ctc_monthly: body.ctc_monthly || 0,
        utilization_target: body.utilization_target || 0.80,
        start_date: body.start_date ? new Date(body.start_date) : new Date(),
        end_date: body.end_date ? new Date(body.end_date) : undefined,
        microsoft_user_id: body.microsoft_user_id,
        manual_ctc_override: body.manual_ctc_override || false,
        manual_override_by: body.manual_ctc_override ? user.id : undefined,
        manual_override_at: body.manual_ctc_override ? new Date() : undefined,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "Person",
        entity_id: person.id,
        action: "create",
        after_json: person,
      },
    });

    return NextResponse.json(person, { status: 201 });
  } catch (error) {
    console.error("Error creating person:", error);
    return NextResponse.json(
      { error: "Failed to create person" },
      { status: 500 }
    );
  }
});
