import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/salaries
 * List all salary records for a specific month with filters
 * Query params:
 *  - month: YYYY-MM format (required)
 *  - search: search by employee name or code
 *  - department: filter by department
 *  - support_staff: filter by support staff status (true/false/all)
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");
    const search = searchParams.get("search");
    const department = searchParams.get("department");
    const supportStaffFilter = searchParams.get("support_staff");

    // Validate month parameter
    if (!month) {
      return NextResponse.json(
        { error: "month parameter is required (format: YYYY-MM)" },
        { status: 400 }
      );
    }

    // Parse month to match the format used in import (last day of month at noon UTC)
    const [year, monthNum] = month.split("-").map(Number);
    if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
      return NextResponse.json(
        { error: "Invalid month format (use YYYY-MM)" },
        { status: 400 }
      );
    }
    const monthDate = new Date(Date.UTC(year, monthNum, 0, 12, 0, 0)); // Last day of the month at noon UTC

    // Build where clause
    const where: any = {
      month: monthDate,
    };

    // Apply support staff filter
    if (supportStaffFilter === "true") {
      where.is_support_staff = true;
    } else if (supportStaffFilter === "false") {
      where.is_support_staff = false;
    }

    // Apply person filters
    const personWhere: any = {};
    if (search) {
      personWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { employee_code: { contains: search, mode: "insensitive" } },
      ];
    }
    if (department) {
      personWhere.department = department;
    }

    if (Object.keys(personWhere).length > 0) {
      where.person = personWhere;
    }

    // Fetch salaries with person details
    const salaries = await prisma.personSalary.findMany({
      where,
      orderBy: [{ person: { name: "asc" } }],
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            employee_code: true,
            department: true,
            role: true,
          },
        },
      },
    });

    // Calculate totals
    const totalCount = salaries.length;
    const supportStaffCount = salaries.filter((s) => s.is_support_staff).length;
    const operationalStaffCount = totalCount - supportStaffCount;

    const totalSalary = salaries.reduce(
      (sum, s) => sum + Number(s.total),
      0
    );
    const supportSalary = salaries
      .filter((s) => s.is_support_staff)
      .reduce((sum, s) => sum + Number(s.total), 0);
    const operationalSalary = totalSalary - supportSalary;

    return NextResponse.json({
      salaries,
      stats: {
        month: monthDate.toISOString(),
        total_count: totalCount,
        support_staff_count: supportStaffCount,
        operational_staff_count: operationalStaffCount,
        total_salary: totalSalary,
        support_salary: supportSalary,
        operational_salary: operationalSalary,
      },
    });
  } catch (error) {
    console.error("Error fetching salaries:", error);
    return NextResponse.json(
      { error: "Failed to fetch salaries" },
      { status: 500 }
    );
  }
});
