import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseDate } from "@/lib/contracts/api";

/**
 * PATCH /api/contracts/tasks/[id]
 * Complete, dismiss, reopen, reassign or reschedule a task.
 */
export const PATCH = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    const before = await prisma.contractTask.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if ("status" in body) {
      if (!["open", "done", "dismissed"].includes(body.status)) {
        return NextResponse.json({ error: "Status must be open, done or dismissed" }, { status: 400 });
      }
      data.status = body.status;
      data.completed_by = body.status === "open" ? null : user.name || user.email;
      data.completed_at = body.status === "open" ? null : new Date();
    }
    if ("owner" in body) data.owner = body.owner || null;
    if ("title" in body && body.title?.trim()) data.title = body.title.trim();
    if ("detail" in body) data.detail = body.detail || null;
    if ("due_date" in body) {
      const due = parseDate(body.due_date);
      if (!due) return NextResponse.json({ error: "Due date is required" }, { status: 400 });
      data.due_date = due;
    }

    const task = await prisma.contractTask.update({ where: { id }, data });
    await audit(user, "ContractTask", id, "update", before, task);
    return NextResponse.json({ task });
  } catch (error: any) {
    console.error("Error updating contract task:", error);
    return NextResponse.json({ error: error?.message || "Failed to update task" }, { status: 400 });
  }
});
