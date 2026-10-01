import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES } from "@/lib/contracts/api";
import { generateContractTasks } from "@/lib/contracts/tasks";

/**
 * POST /api/contracts/tasks/generate
 * Create follow-up tasks from contract, billing-line and PO end dates.
 * Safe to call repeatedly (also from the nightly cron): existing tasks are kept.
 */
export const POST = withRole(CONTRACT_API_ROLES, async () => {
  try {
    const result = await generateContractTasks();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error generating contract tasks:", error);
    return NextResponse.json({ error: "Failed to generate tasks" }, { status: 500 });
  }
});
