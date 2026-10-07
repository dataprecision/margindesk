import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES } from "@/lib/contracts/api";
import { APPROVER_ROLES, actor } from "@/lib/contracts/approval";

/**
 * GET /api/contracts/nav-counts
 * The two numbers the sidebar shows: customers with open pointers to close,
 * and overdue follow-ups.
 */
export const GET = withRole(CONTRACT_API_ROLES, async (_req: Request, { user }) => {
  try {
    const me = actor(user);
    const notMine = { NOT: [{ last_edited_by: me }, { submitted_by: me }] };
    const [withPointers, overdue, poAlerts, agAwaiting, lineAwaiting, contractAwaiting] = await Promise.all([
      prisma.contract.count({ where: { review_bucket: "open" } }),
      prisma.contractTask.count({ where: { status: "open", due_date: { lt: new Date() } } }),
      prisma.contractPurchaseOrder.count({ where: { alert_state: { in: ["low", "exhausting_before_term", "over_consumed", "expiring_with_balance"] } } }),
      APPROVER_ROLES.agreement.includes(user.role) ? prisma.agreement.count({ where: { approval_status: "submitted", ...notMine } }) : 0,
      APPROVER_ROLES.line.includes(user.role) ? prisma.contractLine.count({ where: { approval_status: "submitted", ...notMine } }) : 0,
      APPROVER_ROLES.contract.includes(user.role) ? prisma.contract.count({ where: { approval_status: "submitted", ...notMine } }) : 0,
    ]);
    return NextResponse.json({ contracts_with_open_pointers: withPointers, overdue_tasks: overdue, po_alerts: poAlerts, approvals_for_me: agAwaiting + lineAwaiting + contractAwaiting });
  } catch (error) {
    console.error("Error counting for the sidebar:", error);
    return NextResponse.json({ error: "Failed to count" }, { status: 500 });
  }
});
