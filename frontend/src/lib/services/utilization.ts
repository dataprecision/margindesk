import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface UtilizationData {
  personId: string;
  month: Date;
  workingHours: number;
  workedHours: number;
  billableHours: number;
  utilizationPct: number;
  billableUtilization: number;
  leaveDays: number;
  holidayDays: number;
}

/**
 * Calculate utilization for a specific person and month
 *
 * Formula:
 * - Standard working hours = 160 hours/month
 * - Working hours = 160 - (holidays * 8) - (leaves * 8)
 * - Worked hours = sum of all allocation hours for the month
 * - Billable hours = sum of billable allocation hours for the month
 * - Utilization % = (worked / working) * 100
 * - Billable utilization % = (billable / working) * 100
 */
export async function calculateUtilization(
  personId: string,
  month: Date
): Promise<UtilizationData> {
  // Get first day of month
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  // Get person
  const person = await prisma.person.findUnique({
    where: { id: personId },
  });

  if (!person) {
    throw new Error(`Person ${personId} not found`);
  }

  // Get holidays for the month (public holidays only for now)
  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: firstDay,
        lte: lastDay,
      },
      type: "public", // Only count public holidays
    },
  });

  const holidayDays = holidays.length;

  // Get approved leaves for the person in this month
  const leaves = await prisma.leave.findMany({
    where: {
      person_id: personId,
      status: "approved", // Only count approved leaves
      OR: [
        // Leave starts in this month
        {
          start_date: {
            gte: firstDay,
            lte: lastDay,
          },
        },
        // Leave ends in this month
        {
          end_date: {
            gte: firstDay,
            lte: lastDay,
          },
        },
        // Leave spans across this month
        {
          start_date: { lte: firstDay },
          end_date: { gte: lastDay },
        },
      ],
    },
  });

  // Calculate total leave days for this month
  let leaveDays = 0;
  for (const leave of leaves) {
    const leaveStart = new Date(leave.start_date);
    const leaveEnd = new Date(leave.end_date);

    // Calculate overlap with current month
    const overlapStart = leaveStart > firstDay ? leaveStart : firstDay;
    const overlapEnd = leaveEnd < lastDay ? leaveEnd : lastDay;

    // Calculate days in overlap
    const daysDiff = Math.ceil(
      (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1; // +1 to include both start and end dates

    leaveDays += Math.min(daysDiff, Number(leave.days));
  }

  // Calculate working hours
  const standardHours = 160;
  const hoursPerDay = 8;
  const workingHours = Math.max(
    0,
    standardHours - (holidayDays * hoursPerDay) - (leaveDays * hoursPerDay)
  );

  // Get allocations for this person and month
  const allocations = await prisma.allocation.findMany({
    where: {
      person_id: personId,
      period_month: firstDay,
    },
  });

  // Calculate worked and billable hours
  let workedHours = 0;
  let billableHours = 0;

  for (const allocation of allocations) {
    const totalHours = Number(allocation.hours_billable || 0) + Number(allocation.hours_nonbillable || 0);
    workedHours += totalHours;
    billableHours += Number(allocation.hours_billable || 0);
  }

  // Calculate utilization percentages
  const utilizationPct = workingHours > 0
    ? (workedHours / workingHours) * 100
    : 0;

  const billableUtilization = workingHours > 0
    ? (billableHours / workingHours) * 100
    : 0;

  return {
    personId,
    month: firstDay,
    workingHours,
    workedHours,
    billableHours,
    utilizationPct,
    billableUtilization,
    leaveDays,
    holidayDays,
  };
}

/**
 * Calculate and store utilization for a specific person and month
 */
export async function calculateAndStoreUtilization(
  personId: string,
  month: Date
): Promise<void> {
  const data = await calculateUtilization(personId, month);

  // Upsert into MonthlyUtilization table
  await prisma.monthlyUtilization.upsert({
    where: {
      person_id_month: {
        person_id: personId,
        month: data.month,
      },
    },
    update: {
      working_hours: data.workingHours,
      worked_hours: data.workedHours,
      billable_hours: data.billableHours,
      utilization_pct: data.utilizationPct,
      billable_utilization: data.billableUtilization,
      leave_days: data.leaveDays,
      holiday_days: data.holidayDays,
    },
    create: {
      person_id: personId,
      month: data.month,
      working_hours: data.workingHours,
      worked_hours: data.workedHours,
      billable_hours: data.billableHours,
      utilization_pct: data.utilizationPct,
      billable_utilization: data.billableUtilization,
      leave_days: data.leaveDays,
      holiday_days: data.holidayDays,
    },
  });
}

/**
 * Calculate utilization for all active employees for a given month
 */
export async function calculateUtilizationForAllEmployees(
  month: Date
): Promise<void> {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);

  // Get all active employees (no end_date or end_date after this month)
  const activeEmployees = await prisma.person.findMany({
    where: {
      OR: [
        { end_date: null },
        { end_date: { gte: firstDay } },
      ],
    },
  });

  console.log(`🔄 Calculating utilization for ${activeEmployees.length} employees for ${firstDay.toLocaleDateString()}...`);

  let successCount = 0;
  let errorCount = 0;

  for (const employee of activeEmployees) {
    try {
      await calculateAndStoreUtilization(employee.id, month);
      successCount++;
    } catch (error) {
      console.error(`❌ Error calculating utilization for ${employee.name} (${employee.id}):`, error);
      errorCount++;
    }
  }

  console.log(`✅ Utilization calculation complete - Success: ${successCount}, Errors: ${errorCount}`);
}

/**
 * Calculate utilization for the last N months for all employees
 */
export async function calculateUtilizationForLastNMonths(
  monthsCount: number = 6
): Promise<void> {
  const today = new Date();

  for (let i = 0; i < monthsCount; i++) {
    const month = new Date(today.getFullYear(), today.getMonth() - i, 1);
    console.log(`\n📅 Processing month: ${month.toLocaleDateString()}`);
    await calculateUtilizationForAllEmployees(month);
  }
}

/**
 * Get utilization data for a person across multiple months
 */
export async function getUtilizationHistory(
  personId: string,
  monthsCount: number = 6
): Promise<UtilizationData[]> {
  const today = new Date();
  const results: UtilizationData[] = [];

  for (let i = 0; i < monthsCount; i++) {
    const month = new Date(today.getFullYear(), today.getMonth() - i, 1);

    // Try to get from database first
    const stored = await prisma.monthlyUtilization.findUnique({
      where: {
        person_id_month: {
          person_id: personId,
          month,
        },
      },
    });

    if (stored) {
      results.push({
        personId: stored.person_id,
        month: stored.month,
        workingHours: Number(stored.working_hours),
        workedHours: Number(stored.worked_hours),
        billableHours: Number(stored.billable_hours),
        utilizationPct: Number(stored.utilization_pct),
        billableUtilization: Number(stored.billable_utilization),
        leaveDays: Number(stored.leave_days),
        holidayDays: Number(stored.holiday_days),
      });
    } else {
      // Calculate on the fly if not stored
      const data = await calculateUtilization(personId, month);
      results.push(data);
    }
  }

  return results;
}

/**
 * Get average utilization for a person
 */
export async function getAverageUtilization(
  personId: string,
  monthsCount: number = 6
): Promise<{ avgUtilization: number; avgBillable: number }> {
  const history = await getUtilizationHistory(personId, monthsCount);

  if (history.length === 0) {
    return { avgUtilization: 0, avgBillable: 0 };
  }

  const totalUtilization = history.reduce((sum, item) => sum + item.utilizationPct, 0);
  const totalBillable = history.reduce((sum, item) => sum + item.billableUtilization, 0);

  return {
    avgUtilization: totalUtilization / history.length,
    avgBillable: totalBillable / history.length,
  };
}
