import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/people/[id]/salaries
 * List all salary records for a person
 */
export const GET = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    const where: any = { person_id: id };

    // Filter by year if provided
    if (year) {
      const yearNum = parseInt(year);
      where.month = {
        gte: new Date(`${yearNum}-01-01`),
        lt: new Date(`${yearNum + 1}-01-01`),
      };
    }

    // Filter by specific month if provided
    if (month && year) {
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      where.month = new Date(`${yearNum}-${monthNum.toString().padStart(2, "0")}-01`);
    }

    const salaries = await prisma.personSalary.findMany({
      where,
      orderBy: {
        month: "desc",
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      salaries,
      total: salaries.length,
    });
  } catch (error) {
    console.error("Error fetching salaries:", error);
    return NextResponse.json(
      { error: "Failed to fetch salaries" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/people/[id]/salaries
 * Create or update a salary record for a person for a specific month
 * Owner/Finance only
 */
export const POST = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;

    // Check permissions
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can manage salaries" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Validate required fields
    if (!body.month || body.base_salary === undefined) {
      return NextResponse.json(
        { error: "month and base_salary are required" },
        { status: 400 }
      );
    }

    // Parse month to ensure it's the first day of the month
    const monthDate = new Date(body.month);
    monthDate.setDate(1);
    monthDate.setHours(0, 0, 0, 0);

    // Calculate total
    const baseSalary = parseFloat(body.base_salary);
    const bonus = parseFloat(body.bonus || 0);
    const overtime = parseFloat(body.overtime || 0);
    const deductions = parseFloat(body.deductions || 0);
    const total = baseSalary + bonus + overtime - deductions;

    // Get person details to determine if support staff
    const person = await prisma.person.findUnique({
      where: { id },
      select: { department: true },
    });

    if (!person) {
      return NextResponse.json(
        { error: "Person not found" },
        { status: 404 }
      );
    }

    // Determine if this person is support staff based on department
    // Support staff: IT, HR, Accounts, Admin, Sales, Finance, Technology, People and Culture, Management
    // Also support staff if no department is defined
    const isSupportStaff = !person.department ||
      ['IT', 'HR', 'Accounts', 'Admin', 'Sales', 'Finance', 'Technology', 'People and Culture', 'Management'].includes(person.department);

    // Check if salary record already exists for this month
    const existing = await prisma.personSalary.findUnique({
      where: {
        person_id_month: {
          person_id: id,
          month: monthDate,
        },
      },
    });

    let salary;
    if (existing) {
      // Update existing record
      salary = await prisma.personSalary.update({
        where: {
          person_id_month: {
            person_id: id,
            month: monthDate,
          },
        },
        data: {
          base_salary: baseSalary,
          bonus: bonus,
          deductions: deductions,
          overtime: overtime,
          total: total,
          is_support_staff: isSupportStaff,
          notes: body.notes,
        },
        include: {
          person: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          actor_id: user.id,
          entity: "PersonSalary",
          entity_id: salary.id,
          action: "update",
          before_json: existing,
          after_json: salary,
        },
      });
    } else {
      // Create new record
      salary = await prisma.personSalary.create({
        data: {
          person_id: id,
          month: monthDate,
          base_salary: baseSalary,
          bonus: bonus,
          deductions: deductions,
          overtime: overtime,
          total: total,
          is_support_staff: isSupportStaff,
          notes: body.notes,
        },
        include: {
          person: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          actor_id: user.id,
          entity: "PersonSalary",
          entity_id: salary.id,
          action: "create",
          after_json: salary,
        },
      });
    }

    return NextResponse.json(salary, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error("Error creating/updating salary:", error);
    return NextResponse.json(
      { error: "Failed to save salary record" },
      { status: 500 }
    );
  }
});
