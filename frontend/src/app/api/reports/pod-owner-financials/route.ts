import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { getDescendantOwnerIds } from "@/lib/pod-owner-tree";
import { getPodIdsForUser } from "@/lib/auth/pod-scope";

const prisma = new PrismaClient();

/**
 * Calculate business days between two dates excluding weekends and holidays
 */
function calculateBusinessDays(startDate: Date, endDate: Date, holidayDates: Set<string> = new Set()): number {
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().split("T")[0];
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * GET /api/reports/pod-owner-financials
 * Aggregated financials across all pods under a pod owner subtree
 * Query params: owner_id, start_month, end_month
 */
export const GET = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get("owner_id");
    const startMonth = searchParams.get("start_month");
    const endMonth = searchParams.get("end_month");

    if (!ownerId || !startMonth || !endMonth) {
      return NextResponse.json(
        { error: "owner_id, start_month, and end_month are required" },
        { status: 400 }
      );
    }

    // Get the owner and verify access
    const ownerNode = await prisma.podOwner.findUnique({
      where: { id: ownerId },
      include: { person: { select: { id: true, name: true } } },
    });
    if (!ownerNode) {
      return NextResponse.json({ error: "Pod owner not found" }, { status: 404 });
    }

    // Check access: owner/finance see all, PM must be the owner person or have access
    const allowedPodIds = await getPodIdsForUser(user.email, user.role);

    // Resolve all pod IDs under this owner subtree
    const allOwners = await prisma.podOwner.findMany({
      select: { id: true, person_id: true, parent_id: true, end_date: true },
    });
    const descendantIds = getDescendantOwnerIds([ownerId], allOwners, true);

    const pods = await prisma.financialPod.findMany({
      where: {
        owner_id: { in: descendantIds },
        ...(allowedPodIds !== null ? { id: { in: allowedPodIds } } : {}),
      },
      include: {
        leader: { select: { id: true, name: true, employee_code: true } },
      },
    });

    if (pods.length === 0) {
      return NextResponse.json({
        owner: { id: ownerNode.id, name: ownerNode.name, person: ownerNode.person },
        period: { start: startMonth, end: endMonth, months: [] },
        pods: [],
        aggregate: {
          revenue: 0, salary_costs: 0, gross_profit: 0, gross_margin_pct: 0,
          total_billable_hours: 0, total_working_hours: 0, overall_utilization_pct: 0,
        },
      });
    }

    const podIds = pods.map((p) => p.id);

    // Parse dates
    const startDate = new Date(startMonth + "T00:00:00.000Z");
    const endDateOriginal = new Date(endMonth + "T00:00:00.000Z");
    const endDate = new Date(endMonth + "T00:00:00.000Z");
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    // Build months array
    const months: string[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      months.push(cur.toISOString().substring(0, 10));
      cur.setMonth(cur.getMonth() + 1);
    }

    // Fetch holidays
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { date: true },
    });
    const holidayDates = new Set(holidays.map((h) => h.date.toISOString().split("T")[0]));

    // Get all members for these pods
    const allMemberships = await prisma.podMembership.findMany({
      where: {
        pod_id: { in: podIds },
        OR: [{ end_date: null }, { end_date: { gte: startDate } }],
        start_date: { lte: endDate },
      },
      include: {
        person: { select: { id: true, name: true, employee_code: true, ctc_monthly: true } },
      },
    });

    // Get project costs for revenue
    const podProjectMappings = await prisma.podProjectMapping.findMany({
      where: {
        pod_id: { in: podIds },
        OR: [{ end_date: null }, { end_date: { gte: startDate } }],
        start_date: { lte: endDate },
      },
      include: {
        project: {
          include: {
            client: { select: { name: true } },
            project_costs: {
              where: { period_month: { gte: startDate, lte: endDate } },
            },
          },
        },
      },
    });

    // Get salary data
    const memberIds = [...new Set(allMemberships.map((m) => m.person_id))];
    const salaryData = await prisma.personSalary.findMany({
      where: {
        person_id: { in: memberIds },
        month: { gte: startDate, lte: endDate },
      },
    });

    // Get timesheet entries
    const timesheetEntries = await prisma.timesheetEntry.findMany({
      where: {
        person_id: { in: memberIds },
        work_date: { gte: startDate, lte: endDate },
      },
      include: {
        project: { select: { id: true, name: true } },
      },
    });

    // Calculate per-pod financials
    const podResults = pods.map((pod) => {
      const podMemberships = allMemberships
        .filter((m) => m.pod_id === pod.id)
        .filter((m) => {
          if (m.end_date && m.start_date.toISOString().split("T")[0] === m.end_date.toISOString().split("T")[0]) return false;
          return true;
        });

      const podMappings = podProjectMappings.filter((pm) => pm.pod_id === pod.id);

      // Revenue
      let podRevenue = 0;
      podMappings.forEach((mapping) => {
        if (mapping.end_date && mapping.start_date.toISOString().split("T")[0] === mapping.end_date.toISOString().split("T")[0]) return;
        mapping.project.project_costs.forEach((cost) => {
          podRevenue += parseFloat(cost.amount.toString());
        });
      });

      // Salary costs
      let podSalaryCosts = 0;
      const podMemberIds = podMemberships.map((m) => m.person_id);

      months.forEach((month) => {
        const monthDate = new Date(month);
        const year = monthDate.getUTCFullYear();
        const monthIndex = monthDate.getUTCMonth();
        const totalDaysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

        podMemberships.forEach((membership) => {
          const targetYearMonth = month.substring(0, 7);
          const salary = salaryData.find(
            (s) => s.person_id === membership.person_id && s.month.toISOString().substring(0, 7) === targetYearMonth
          );
          if (salary) {
            const monthlySalary = parseFloat(salary.total.toString());
            const allocationPct = membership.allocation_pct / 100;
            const monthStart = new Date(Date.UTC(year, monthIndex, 1));
            const monthEnd = new Date(Date.UTC(year, monthIndex, totalDaysInMonth, 23, 59, 59, 999));
            const effectiveStart = new Date(Math.max(membership.start_date.getTime(), startDate.getTime(), monthStart.getTime()));
            const effectiveEnd = new Date(Math.min((membership.end_date || endDateOriginal).getTime(), endDateOriginal.getTime(), monthEnd.getTime()));
            const msPerDay = 24 * 60 * 60 * 1000;
            const calendarDaysInPod = Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / msPerDay) + 1;
            const prorationFactor = calendarDaysInPod / totalDaysInMonth;
            podSalaryCosts += monthlySalary * allocationPct * prorationFactor;
          }
        });
      });

      // Utilization
      let totalBillable = 0;
      let totalWorked = 0;
      let totalWorking = 0;

      podMemberships.forEach((membership) => {
        const effectiveStart = new Date(Math.max(membership.start_date.getTime(), startDate.getTime()));
        const effectiveEnd = new Date(Math.min((membership.end_date || endDateOriginal).getTime(), endDateOriginal.getTime()));

        const memberTimesheets = timesheetEntries.filter(
          (t) => t.person_id === membership.person_id && t.work_date >= effectiveStart && t.work_date <= effectiveEnd
        );

        memberTimesheets.forEach((entry) => {
          const hours = parseFloat(entry.hours_logged.toString());
          totalWorked += hours;
          if (entry.is_billable) totalBillable += hours;
        });

        const businessDays = calculateBusinessDays(effectiveStart, effectiveEnd, holidayDates);
        totalWorking += businessDays * 8;
      });

      const grossProfit = podRevenue - podSalaryCosts;

      return {
        pod: { id: pod.id, name: pod.name, leader: pod.leader },
        revenue: podRevenue,
        salary_costs: podSalaryCosts,
        gross_profit: grossProfit,
        gross_margin_pct: podRevenue > 0 ? (grossProfit / podRevenue) * 100 : 0,
        total_billable_hours: totalBillable,
        total_working_hours: totalWorking,
        total_worked_hours: totalWorked,
        utilization_pct: totalWorking > 0 ? (totalWorked / totalWorking) * 100 : 0,
        billability_pct: totalWorking > 0 ? (totalBillable / totalWorking) * 100 : 0,
        member_count: podMemberships.length,
      };
    });

    // Aggregate
    const aggregate = {
      revenue: podResults.reduce((s, p) => s + p.revenue, 0),
      salary_costs: podResults.reduce((s, p) => s + p.salary_costs, 0),
      gross_profit: podResults.reduce((s, p) => s + p.gross_profit, 0),
      gross_margin_pct: 0,
      total_billable_hours: podResults.reduce((s, p) => s + p.total_billable_hours, 0),
      total_working_hours: podResults.reduce((s, p) => s + p.total_working_hours, 0),
      total_worked_hours: podResults.reduce((s, p) => s + p.total_worked_hours, 0),
      overall_utilization_pct: 0,
      overall_billability_pct: 0,
    };
    aggregate.gross_margin_pct = aggregate.revenue > 0 ? (aggregate.gross_profit / aggregate.revenue) * 100 : 0;
    aggregate.overall_utilization_pct = aggregate.total_working_hours > 0 ? (aggregate.total_worked_hours / aggregate.total_working_hours) * 100 : 0;
    aggregate.overall_billability_pct = aggregate.total_working_hours > 0 ? (aggregate.total_billable_hours / aggregate.total_working_hours) * 100 : 0;

    return NextResponse.json({
      owner: { id: ownerNode.id, name: ownerNode.name, person: ownerNode.person },
      period: { start: startMonth, end: endMonth, months },
      pods: podResults,
      aggregate,
    });
  } catch (error) {
    console.error("Error generating pod owner financial report:", error);
    return NextResponse.json(
      { error: "Failed to generate report", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
});
