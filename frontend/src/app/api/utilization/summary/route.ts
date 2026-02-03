import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/protect-route";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/utilization/summary?month=2025-01
 * Get utilization summary for all employees for a given month (or current month)
 */
export const GET = withAuth(async (req, { user }: { user: any }) => {
  try {
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");

    // Parse month or use current month
    let targetMonth: Date;
    if (monthParam) {
      const [year, month] = monthParam.split("-").map(Number);
      targetMonth = new Date(year, month - 1, 1);
    } else {
      const now = new Date();
      targetMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Get utilization data for all employees for this month
    const utilizations = await prisma.monthlyUtilization.findMany({
      where: {
        month: targetMonth,
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
            billable: true,
          },
        },
      },
      orderBy: {
        utilization_pct: "desc",
      },
    });

    // Calculate summary statistics
    const totalEmployees = utilizations.length;
    const avgUtilization = totalEmployees > 0
      ? utilizations.reduce((sum, u) => sum + Number(u.utilization_pct), 0) / totalEmployees
      : 0;
    const avgBillable = totalEmployees > 0
      ? utilizations.reduce((sum, u) => sum + Number(u.billable_utilization), 0) / totalEmployees
      : 0;

    // Count by utilization ranges
    const underutilized = utilizations.filter(u => Number(u.utilization_pct) < 70).length;
    const optimal = utilizations.filter(u => Number(u.utilization_pct) >= 70 && Number(u.utilization_pct) <= 100).length;
    const overutilized = utilizations.filter(u => Number(u.utilization_pct) > 100).length;

    return NextResponse.json({
      success: true,
      data: {
        month: targetMonth,
        summary: {
          totalEmployees,
          avgUtilization: parseFloat(avgUtilization.toFixed(2)),
          avgBillable: parseFloat(avgBillable.toFixed(2)),
          underutilized,
          optimal,
          overutilized,
        },
        employees: utilizations.map(u => ({
          id: u.person.id,
          name: u.person.name,
          email: u.person.email,
          role: u.person.role,
          department: u.person.department,
          billable: u.person.billable,
          workingHours: Number(u.working_hours),
          workedHours: Number(u.worked_hours),
          billableHours: Number(u.billable_hours),
          utilizationPct: Number(u.utilization_pct),
          billableUtilization: Number(u.billable_utilization),
          leaveDays: Number(u.leave_days),
          holidayDays: Number(u.holiday_days),
        })),
      },
    });
  } catch (error: any) {
    console.error("Error fetching utilization summary:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch utilization summary",
        details: error.message,
      },
      { status: 500 }
    );
  }
});
