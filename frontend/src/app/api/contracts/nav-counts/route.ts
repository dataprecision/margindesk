import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES } from "@/lib/contracts/api";

/**
 * GET /api/contracts/nav-counts
 * The two numbers the sidebar shows: customers with open pointers to close,
 * and overdue follow-ups.
 */
export const GET = withRole(CONTRACT_API_ROLES, async () => {
  try {
    const [withPointers, overdue, poAlerts] = await Promise.all([
      prisma.contract.count({ where: { review_bucket: "open" } }),
      prisma.contractTask.count({ where: { status: "open", due_date: { lt: new Date() } } }),
      prisma.contractPurchaseOrder.count({ where: { alert_state: { in: ["low", "exhausting_before_term", "over_consumed", "expiring_with_balance"] } } }),
    ]);
    return NextResponse.json({ contracts_with_open_pointers: withPointers, overdue_tasks: overdue, po_alerts: poAlerts });
  } catch (error) {
    console.error("Error counting for the sidebar:", error);
    return NextResponse.json({ error: "Failed to count" }, { status: 500 });
  }
});
