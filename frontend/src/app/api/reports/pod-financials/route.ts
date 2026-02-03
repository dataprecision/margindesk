import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

/**
 * Calculate number of business days (excluding weekends) between two dates
 */
function calculateBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * GET /api/reports/pod-financials
 * Get pod financial and utilization report for a period
 * Query params: pod_id, start_month, end_month
 */
export const GET = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    const { searchParams } = new URL(req.url);
    const podId = searchParams.get("pod_id");
    const startMonth = searchParams.get("start_month");
    const endMonth = searchParams.get("end_month");

    if (!podId || !startMonth || !endMonth) {
      return NextResponse.json(
        { error: "pod_id, start_month, and end_month are required" },
        { status: 400 }
      );
    }

    // Parse dates as UTC midnight to match how dates are stored in the database
    const startDate = new Date(startMonth + 'T00:00:00.000Z');
    const endDateOriginal = new Date(endMonth + 'T00:00:00.000Z'); // Keep original for business day calculation
    const endDate = new Date(endMonth + 'T00:00:00.000Z');
    // Add 1 day to endDate to make it inclusive for queries (e.g., Sep 1 to Sep 30 means Sep 1 00:00 to Oct 1 00:00)
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    // Get pod with projects and members
    const pod = await prisma.financialPod.findUnique({
      where: { id: podId },
      include: {
        leader: {
          select: { id: true, name: true, employee_code: true },
        },
        projects: {
          where: {
            OR: [
              { end_date: null }, // Currently active
              { end_date: { gte: startDate } }, // Active during period
            ],
            start_date: { lte: endDate },
          },
          include: {
            project: {
              include: {
                client: { select: { id: true, name: true } },
                project_costs: {
                  where: {
                    period_month: { gte: startDate, lte: endDate },
                  },
                },
                allocations: {
                  where: {
                    period_month: { gte: startDate, lte: endDate },
                  },
                  include: {
                    person: {
                      select: {
                        id: true,
                        name: true,
                        employee_code: true,
                        ctc_monthly: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        members: {
          where: {
            OR: [
              { end_date: null }, // Currently active
              { end_date: { gte: startDate } }, // Active during period
            ],
            start_date: { lte: endDate },
          },
          include: {
            person: {
              select: {
                id: true,
                name: true,
                employee_code: true,
                ctc_monthly: true,
              },
            },
          },
        },
      },
    });

    if (!pod) {
      return NextResponse.json({ error: "Pod not found" }, { status: 404 });
    }

    // Calculate months in range
    const months: string[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      months.push(current.toISOString().substring(0, 10));
      current.setMonth(current.getMonth() + 1);
    }

    // Calculate revenue by month and project
    const revenueByMonth: Record<string, number> = {};
    const revenueByProject: Record<string, { name: string; client: string; total: number }> = {};

    pod.projects.forEach((mapping) => {
      const project = mapping.project;
      let projectTotal = 0;

      project.project_costs.forEach((cost) => {
        const monthKey = cost.period_month.toISOString().substring(0, 10);
        const amount = parseFloat(cost.amount.toString());

        revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + amount;
        projectTotal += amount;
      });

      if (projectTotal > 0) {
        revenueByProject[project.id] = {
          name: project.name,
          client: project.client.name,
          total: projectTotal,
        };
      }
    });

    // Calculate utilization by member and month
    const utilizationByMember: Record<string, any> = {};
    const utilizationByMonth: Record<string, any> = {};

    // Get all pod members' allocations
    const memberIds = pod.members.map((m) => m.person_id);
    const allAllocations = await prisma.allocation.findMany({
      where: {
        person_id: { in: memberIds },
        period_month: { gte: startDate, lte: endDate },
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            employee_code: true,
            ctc_monthly: true,
          },
        },
        project: {
          select: { id: true, name: true },
        },
      },
    });

    // Get timesheet entries for utilization calculation
    const timesheetEntries = await prisma.timesheetEntry.findMany({
      where: {
        person_id: { in: memberIds },
        work_date: { gte: startDate, lte: endDate },
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            employee_code: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Process utilization by member
    pod.members.forEach((membership) => {
      const person = membership.person;
      const memberAllocations = allAllocations.filter((a) => a.person_id === person.id);
      const memberTimesheets = timesheetEntries.filter((t) => t.person_id === person.id);

      let totalBillable = 0;
      let totalNonBillable = 0;
      let totalWorking = 0;
      let totalWorked = 0;

      const projectBreakdown: Record<string, { name: string; hours: number }> = {};

      // Calculate working hours based on partial month allocation
      // Find the intersection of report period and membership period
      const effectiveStart = new Date(Math.max(
        membership.start_date.getTime(),
        startDate.getTime()
      ));
      const effectiveEnd = new Date(Math.min(
        (membership.end_date || endDateOriginal).getTime(),
        endDateOriginal.getTime()
      ));

      // Calculate actual billable and non-billable hours from timesheet entries
      // ONLY count entries that fall within the member's effective period in the pod
      memberTimesheets.forEach((entry) => {
        const entryDate = entry.work_date;

        // Skip entries outside the member's effective period
        if (entryDate < effectiveStart || entryDate > effectiveEnd) {
          return;
        }

        const hoursLogged = parseFloat(entry.hours_logged.toString());
        totalWorked += hoursLogged;

        if (entry.is_billable) {
          totalBillable += hoursLogged;

          // Build project breakdown from actual timesheet entries (billable hours only)
          const projectId = entry.project_id;
          const projectName = entry.project?.name || 'Unknown Project';

          if (!projectBreakdown[projectId]) {
            projectBreakdown[projectId] = {
              name: projectName,
              hours: 0,
            };
          }
          projectBreakdown[projectId].hours += hoursLogged;
        } else {
          totalNonBillable += hoursLogged;
        }
      });

      // Calculate business days for the effective period only
      const businessDays = calculateBusinessDays(effectiveStart, effectiveEnd);
      totalWorking = businessDays * 8; // 8 hours per business day

      const unutilized = totalWorking - totalWorked;
      const utilizationPct = totalWorking > 0 ? (totalWorked / totalWorking) * 100 : 0;
      const billablePct = totalWorking > 0 ? (totalBillable / totalWorking) * 100 : 0;

      utilizationByMember[person.id] = {
        person: {
          id: person.id,
          name: person.name,
          employee_code: person.employee_code,
        },
        allocation_pct: membership.allocation_pct,
        billable_hours: totalBillable,
        non_billable_hours: totalNonBillable,
        working_hours: totalWorking,
        worked_hours: totalWorked,
        unutilized_hours: unutilized,
        utilization_pct: utilizationPct,
        billable_pct: billablePct,
        projects: projectBreakdown,
      };
    });

    // Get actual salary data from PersonSalary table
    console.log('🔍 Salary Query Debug:', {
      memberIds,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });
    const salaryData = await prisma.personSalary.findMany({
      where: {
        person_id: { in: memberIds },
        month: { gte: startDate, lte: endDate },
      },
    });
    console.log('💰 Salary Data Found:', salaryData.length, 'records');

    // Calculate costs by month (based on member allocations and actual salaries)
    // With partial month allocation support - prorate based on calendar days
    const costsByMonth: Record<string, number> = {};
    let totalSalaryCosts = 0;

    months.forEach((month) => {
      const monthDate = new Date(month);
      let monthCost = 0;

      // Calculate total calendar days in this month
      const year = monthDate.getUTCFullYear();
      const monthIndex = monthDate.getUTCMonth();
      const totalDaysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

      pod.members.forEach((membership) => {
        const person = membership.person;
        const allocationPct = membership.allocation_pct / 100;

        // Find actual salary for this person in this month
        // Compare by year-month only (YYYY-MM), not exact date
        const targetYearMonth = month.substring(0, 7); // "2025-09"
        const salary = salaryData.find(
          (s) => s.person_id === person.id && s.month.toISOString().substring(0, 7) === targetYearMonth
        );

        if (salary) {
          const monthlySalary = parseFloat(salary.total.toString());

          // Calculate effective period for this member in this specific month
          // This is the intersection of: membership period, report period, and current month
          const monthStart = new Date(Date.UTC(year, monthIndex, 1));
          const monthEnd = new Date(Date.UTC(year, monthIndex, totalDaysInMonth, 23, 59, 59, 999));

          const effectiveStart = new Date(Math.max(
            membership.start_date.getTime(),
            startDate.getTime(),
            monthStart.getTime()
          ));
          const effectiveEnd = new Date(Math.min(
            (membership.end_date || endDateOriginal).getTime(),
            endDateOriginal.getTime(),
            monthEnd.getTime()
          ));

          // Calculate calendar days in the effective period
          // Add 1 because both start and end dates are inclusive
          const msPerDay = 24 * 60 * 60 * 1000;
          const calendarDaysInPod = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / msPerDay) + 1;

          // Prorate salary: (days in pod / total days in month) × monthly salary × allocation %
          const prorationFactor = calendarDaysInPod / totalDaysInMonth;
          const memberCost = monthlySalary * allocationPct * prorationFactor;

          monthCost += memberCost;
        }
      });

      costsByMonth[month] = monthCost;
      totalSalaryCosts += monthCost;
    });

    // Calculate totals
    const totalRevenue = Object.values(revenueByMonth).reduce((sum, val) => sum + val, 0);
    const grossProfit = totalRevenue - totalSalaryCosts;
    const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Get overhead allocation if available
    const overheadByMonth: Record<string, number> = {};
    const overheadPolicies = await prisma.overheadPolicy.findMany({
      where: {
        period_month: { gte: startDate, lte: endDate },
      },
    });

    // For now, overhead allocation would be calculated based on policy
    // This is a placeholder - actual implementation depends on overhead allocation method
    let totalOverheads = 0;

    const netProfit = grossProfit - totalOverheads;
    const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Calculate summary utilization
    const allBillableHours = Object.values(utilizationByMember).reduce(
      (sum, m) => sum + m.billable_hours,
      0
    );
    const allWorkingHours = Object.values(utilizationByMember).reduce(
      (sum, m) => sum + m.working_hours,
      0
    );
    const allWorkedHours = Object.values(utilizationByMember).reduce(
      (sum, m) => sum + m.worked_hours,
      0
    );

    const overallUtilization = allWorkingHours > 0 ? (allWorkedHours / allWorkingHours) * 100 : 0;
    const overallBillability = allWorkingHours > 0 ? (allBillableHours / allWorkingHours) * 100 : 0;

    return NextResponse.json({
      pod: {
        id: pod.id,
        name: pod.name,
        leader: pod.leader,
        status: pod.status,
      },
      period: {
        start: startMonth,
        end: endMonth,
        months,
      },
      financials: {
        revenue: {
          total: totalRevenue,
          by_month: revenueByMonth,
          by_project: revenueByProject,
        },
        costs: {
          salaries: totalSalaryCosts,
          by_month: costsByMonth,
          overheads: totalOverheads,
          overhead_by_month: overheadByMonth,
        },
        gross_profit: {
          amount: grossProfit,
          margin_pct: grossMarginPct,
        },
        net_profit: {
          amount: netProfit,
          margin_pct: netMarginPct,
        },
      },
      utilization: {
        summary: {
          total_billable_hours: allBillableHours,
          total_working_hours: allWorkingHours,
          total_worked_hours: allWorkedHours,
          total_unutilized_hours: allWorkingHours - allWorkedHours,
          overall_utilization_pct: overallUtilization,
          overall_billability_pct: overallBillability,
        },
        by_member: Object.values(utilizationByMember),
      },
    });
  } catch (error) {
    console.error("Error generating pod financial report:", error);
    return NextResponse.json(
      {
        error: "Failed to generate report",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
