import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/timesheets
 * Query timesheet entries with filtering and aggregation
 *
 * Query params:
 * - period: "this_month" | "last_month" | "this_quarter" | "last_quarter" | "this_fiscal_year" | "last_fiscal_year" | "last_year" | "all"
 * - from_date: ISO date string (YYYY-MM-DD)
 * - to_date: ISO date string (YYYY-MM-DD)
 * - person_id: string | "all"
 * - project_id: string | "all"
 * - aggregate: "daily" | "monthly" | "none" (default: "monthly")
 */
export const GET = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const personId = searchParams.get("person_id");
    const projectId = searchParams.get("project_id");
    const aggregate = searchParams.get("aggregate") || "monthly";

    console.log("🔍 [Timesheets] Fetching with filters:", {
      period,
      fromDate,
      toDate,
      personId,
      projectId,
      aggregate,
    });

    // Build where clause
    const where: any = {};

    // Date filters
    if (period && period !== "all") {
      const { from, to } = calculateDateRange(period);
      where.work_date = {
        gte: from,
        lte: to,
      };
    } else if (fromDate && toDate) {
      where.work_date = {
        gte: new Date(fromDate),
        lte: new Date(toDate),
      };
    }

    // Person filter
    if (personId && personId !== "all") {
      where.person_id = personId;
    }

    // Project filter
    if (projectId && projectId !== "all") {
      where.project_id = projectId;
    }

    // Fetch raw timesheet entries
    const entries = await prisma.timesheetEntry.findMany({
      where,
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        import_batch: {
          select: {
            id: true,
            file_name: true,
            created_at: true,
          },
        },
      },
      orderBy: [
        { work_date: "desc" },
        { person: { name: "asc" } },
      ],
    });

    console.log(`✅ [Timesheets] Found ${entries.length} raw entries`);

    // Perform aggregation based on parameter
    if (aggregate === "none") {
      // Return raw entries without aggregation
      const totals = calculateTotals(entries);
      return NextResponse.json({
        entries,
        totals,
        count: entries.length,
        aggregation: "none",
      });
    } else if (aggregate === "daily") {
      // Aggregate by person, project, and day
      const aggregated = aggregateByDaily(entries);
      const totals = calculateTotals(entries);
      return NextResponse.json({
        entries: aggregated,
        totals,
        count: aggregated.length,
        aggregation: "daily",
      });
    } else {
      // Default: aggregate by person, project, and month
      const aggregated = aggregateByMonthly(entries);
      const totals = calculateTotals(entries);
      return NextResponse.json({
        entries: aggregated,
        totals,
        count: aggregated.length,
        aggregation: "monthly",
      });
    }
  } catch (error: any) {
    console.error("❌ [Timesheets] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch timesheets", details: error.message },
      { status: 500 }
    );
  }
});

// Helper function to calculate date range
function calculateDateRange(range: string): { from: Date; to: Date } {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  // India's fiscal year: April 1 to March 31
  const fiscalYearStart = currentMonth >= 3 ? currentYear : currentYear - 1;

  switch (range) {
    case "last_month": {
      const from = new Date(currentYear, currentMonth - 1, 1);
      const to = new Date(currentYear, currentMonth, 0);
      return { from, to };
    }

    case "this_month": {
      const from = new Date(currentYear, currentMonth, 1);
      const to = today;
      return { from, to };
    }

    case "last_quarter": {
      const lastQuarterStartMonth = Math.floor((currentMonth - 3) / 3) * 3;
      const from = new Date(currentYear, lastQuarterStartMonth, 1);
      const to = new Date(currentYear, lastQuarterStartMonth + 3, 0);
      return { from, to };
    }

    case "this_quarter": {
      const thisQuarterStartMonth = Math.floor(currentMonth / 3) * 3;
      const from = new Date(currentYear, thisQuarterStartMonth, 1);
      const to = today;
      return { from, to };
    }

    case "this_fiscal_year": {
      const from = new Date(fiscalYearStart, 3, 1);
      const to = today;
      return { from, to };
    }

    case "last_fiscal_year": {
      const from = new Date(fiscalYearStart - 1, 3, 1);
      const to = new Date(fiscalYearStart, 2, 31);
      return { from, to };
    }

    case "last_year": {
      const from = new Date(today);
      from.setFullYear(currentYear - 1);
      const to = today;
      return { from, to };
    }

    case "all": {
      const from = new Date(2020, 0, 1);
      const to = today;
      return { from, to };
    }

    default: {
      // Default to last month
      const from = new Date(currentYear, currentMonth - 1, 1);
      const to = new Date(currentYear, currentMonth, 0);
      return { from, to };
    }
  }
}

// Calculate overall totals
function calculateTotals(entries: any[]) {
  return entries.reduce(
    (acc, entry) => {
      const hoursLogged = parseFloat(entry.hours_logged.toString());
      const hoursBillable = parseFloat(entry.hours_billable.toString());
      acc.hours_logged += hoursLogged;
      acc.hours_billable += hoursBillable;
      acc.hours_nonbillable += hoursLogged - hoursBillable;
      return acc;
    },
    { hours_logged: 0, hours_billable: 0, hours_nonbillable: 0 }
  );
}

// Aggregate entries by person, project, and day
function aggregateByDaily(entries: any[]) {
  const grouped = new Map<string, any>();

  entries.forEach((entry) => {
    const dateKey = entry.work_date.toISOString().split("T")[0];
    const key = `${entry.person_id}|${entry.project_id}|${dateKey}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        person: entry.person,
        project: entry.project,
        work_date: entry.work_date,
        hours_logged: 0,
        hours_billable: 0,
        hours_nonbillable: 0,
        task_count: 0,
        tasks: [],
      });
    }

    const group = grouped.get(key)!;
    const hoursLogged = parseFloat(entry.hours_logged.toString());
    const hoursBillable = parseFloat(entry.hours_billable.toString());

    group.hours_logged += hoursLogged;
    group.hours_billable += hoursBillable;
    group.hours_nonbillable += hoursLogged - hoursBillable;
    group.task_count++;
    group.tasks.push({
      task_name: entry.task_name,
      task_type: entry.task_type,
      hours_logged: hoursLogged,
      hours_billable: hoursBillable,
      notes: entry.notes,
    });
  });

  return Array.from(grouped.values());
}

// Aggregate entries by person, project, and month
function aggregateByMonthly(entries: any[]) {
  const grouped = new Map<string, any>();

  entries.forEach((entry) => {
    const date = new Date(entry.work_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const key = `${entry.person_id}|${entry.project_id}|${monthKey}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        person: entry.person,
        project: entry.project,
        period_month: new Date(date.getFullYear(), date.getMonth(), 1),
        month_label: monthKey,
        hours_logged: 0,
        hours_billable: 0,
        hours_nonbillable: 0,
        days_worked: new Set(),
        task_count: 0,
      });
    }

    const group = grouped.get(key)!;
    const hoursLogged = parseFloat(entry.hours_logged.toString());
    const hoursBillable = parseFloat(entry.hours_billable.toString());

    group.hours_logged += hoursLogged;
    group.hours_billable += hoursBillable;
    group.hours_nonbillable += hoursLogged - hoursBillable;
    group.days_worked.add(entry.work_date.toISOString().split("T")[0]);
    group.task_count++;
  });

  // Convert Set to count for days_worked
  return Array.from(grouped.values()).map((group) => ({
    ...group,
    days_worked: group.days_worked.size,
  }));
}
