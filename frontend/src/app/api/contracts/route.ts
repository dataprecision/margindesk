import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseDate } from "@/lib/contracts/api";
import { contractStatus, daysLeft } from "@/lib/contracts/status";

/**
 * GET /api/contracts
 * The register: every contract with its status, counts and next line end date.
 */
export const GET = withRole(CONTRACT_API_ROLES, async () => {
  try {
    const contracts = await prisma.contract.findMany({
      include: {
        client: { select: { id: true, name: true } },
        lines: { select: { end_date: true, start_date: true } },
        purchase_orders: { select: { valid_to: true } },
        tasks: { where: { status: "open" }, select: { id: true, due_date: true } },
        billing_rules: { where: { status: { not: "retired" } }, select: { status: true } },
      },
      orderBy: { counterparty: "asc" },
    });

    const today = new Date();
    return NextResponse.json({
      contracts: contracts.map(({ lines, purchase_orders, tasks, billing_rules, open_questions, ...c }) => {
        const upcoming = lines
          .map((l) => l.end_date)
          .filter((d): d is Date => !!d && d >= today)
          .sort((a, b) => a.getTime() - b.getTime());
        const questions = Array.isArray(open_questions) ? (open_questions as any[]) : [];
        return {
          ...c,
          status: contractStatus(c.start_date, c.end_date, today),
          days_left: daysLeft(c.end_date, today),
          line_count: lines.length,
          next_line_end: upcoming[0] ?? null,
          po_count: purchase_orders.length,
          rule_count: billing_rules.length,
          confirmed_rule_count: billing_rules.filter((r) => r.status === "confirmed").length,
          open_task_count: tasks.length,
          overdue_task_count: tasks.filter((t) => t.due_date < today).length,
          open_question_count: questions.filter((q) => !q?.resolved).length,
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 });
  }
});

/**
 * POST /api/contracts
 * Add a contract by hand.
 */
export const POST = withRole(CONTRACT_API_ROLES, async (req: Request, { user }) => {
  try {
    const body = await (req as NextRequest).json();
    if (!body.counterparty?.trim() || !body.basis?.trim()) {
      return NextResponse.json({ error: "Counterparty and basis are required" }, { status: 400 });
    }
    const contract = await prisma.contract.create({
      data: {
        counterparty: body.counterparty.trim(),
        basis: body.basis.trim(),
        direction: body.direction ?? "customer",
        bill_to: body.bill_to || null,
        start_date: parseDate(body.start_date),
        end_date: parseDate(body.end_date),
        spoc: body.spoc || null,
        notes: body.notes || null,
        client_id: body.client_id || null,
      },
    });
    await audit(user, "Contract", contract.id, "create", undefined, contract);
    return NextResponse.json({ contract }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating contract:", error);
    return NextResponse.json({ error: error?.message || "Failed to create contract" }, { status: 400 });
  }
});
