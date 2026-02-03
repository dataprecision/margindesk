import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/protect-route";
import {
  getUtilizationHistory,
  getAverageUtilization,
} from "@/lib/services/utilization";

/**
 * GET /api/utilization/[personId]?months=6
 * Get utilization history for a person
 */
export const GET = withAuth(
  async (req: NextRequest, { user, params }: { user: any; params: { personId: string } }) => {
    try {
      const { searchParams } = new URL(req.url);
      const monthsCount = parseInt(searchParams.get("months") || "6", 10);

      const personId = params.personId;

      // Get utilization history
      const history = await getUtilizationHistory(personId, monthsCount);

      // Get averages
      const averages = await getAverageUtilization(personId, monthsCount);

      return NextResponse.json({
        success: true,
        data: {
          history,
          averages,
        },
      });
    } catch (error: any) {
      console.error("Error fetching utilization:", error);
      return NextResponse.json(
        {
          error: "Failed to fetch utilization",
          details: error.message,
        },
        { status: 500 }
      );
    }
  }
);
