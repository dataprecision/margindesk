import { NextResponse } from "next/server";
import { withAdminRole } from "@/lib/auth/protect-route";
import {
  calculateUtilizationForAllEmployees,
  calculateUtilizationForLastNMonths,
} from "@/lib/services/utilization";

/**
 * POST /api/utilization/calculate
 * Calculate utilization for employees
 * Only owner/finance can trigger this calculation
 */
export const POST = withAdminRole(async (req, { user }) => {
  try {
    const body = await req.json();
    const { mode = "current", monthsCount = 6 } = body;

    if (mode === "current") {
      // Calculate for current month only
      const currentMonth = new Date();
      await calculateUtilizationForAllEmployees(currentMonth);

      return NextResponse.json({
        success: true,
        message: `Calculated utilization for current month`,
      });
    } else if (mode === "last_n_months") {
      // Calculate for last N months
      await calculateUtilizationForLastNMonths(monthsCount);

      return NextResponse.json({
        success: true,
        message: `Calculated utilization for last ${monthsCount} months`,
      });
    }

    return NextResponse.json(
      { error: "Invalid mode. Use 'current' or 'last_n_months'" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Error calculating utilization:", error);
    return NextResponse.json(
      {
        error: "Failed to calculate utilization",
        details: error.message,
      },
      { status: 500 }
    );
  }
});
