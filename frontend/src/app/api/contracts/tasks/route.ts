import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseDate } from "@/lib/contracts/api";

/**
 * GET /api/contracts/tasks?status=open|done|dismissed|all&owner=...
 * The follow-up list for the legal view, earliest due first.
 */
export const GET = withRole(CONTRACT_API_ROLES, async (req: Request) => {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "open";
    const owner = searchParams.get("owner");
    const tasks = await prisma.contractTask.findMany({
      where: {
        ...(status === "all" ? {} : { status: status as any }),
        ...(owner ? { owner } : {}),
      },
      include: { contract: { select: { id: true, counterparty: true, spoc: true, end_date: true } } },
      orderBy: [{ due_date: "asc" }, { created_at: "asc" }],
    });
    const owners = await prisma.contractTask.findMany({ where: { owner: { not: null } }, distinct: ["owner"], select: { owner: true }, orderBy: { owner: "asc" } });
    return NextResponse.json({ tasks, owners: owners.map((o) => o.owner) });
  } catch (error) {
    console.error("Error fetching contract tasks:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
});

/**
 * POST /api/contracts/tasks
 * Add a follow-up by hand.
 */
export const POST = withRole(CONTRACT_API_ROLES, async (req: Request, { user }) => {
  try {
    const body = await (req as NextRequest).json();
    const due = parseDate(body.due_date);
    if (!body.title?.trim() || !due) {
      return NextResponse.json({ error: "Title and due date are required" }, { status: 400 });
    }
    const task = await prisma.contractTask.create({
      data: {
        contract_id: body.contract_id || null,
        kind: body.kind || "follow_up",
        title: body.title.trim(),
        detail: body.detail || null,
        due_date: due,
        owner: body.owner || null,
        created_by: user.name || user.email,
      },
    });
    await audit(user, "ContractTask", task.id, "create", undefined, task);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating contract task:", error);
    return NextResponse.json({ error: error?.message || "Failed to create task" }, { status: 400 });
  }
});
