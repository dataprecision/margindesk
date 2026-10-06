import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseDate } from "@/lib/contracts/api";
import { contractStatus, daysLeft } from "@/lib/contracts/status";
import { validationChecks } from "@/lib/contracts/validation";
import { agreementLapse, approvalView, contractLapse } from "@/lib/contracts/approval";

/**
 * GET /api/contracts
 * The register: every contract with its status, counts and next line end date.
 */
export const GET = withRole(CONTRACT_API_ROLES, async () => {
  try {
    const contracts = await prisma.contract.findMany({
      include: {
        client: { select: { id: true, name: true, placeholder: true, zoho_contact_id: true, gstin: true, billing_currency: true, payment_terms: true } },
        spoc_person: { select: { id: true, name: true } },
        lines: { select: { end_date: true, start_date: true, shape: true, rule_status: true, approval_status: true, last_edited_by: true, last_edited_at: true, submitted_by: true, submitted_at: true, approved_by: true, approved_at: true, approval_note: true } },
        agreement: true,
        purchase_orders: { select: { valid_to: true, status: true, value: true } },
        tasks: { where: { status: "open" }, select: { id: true, due_date: true } },
        billing_rules: { where: { status: { not: "retired" } }, select: { status: true } },
      },
      orderBy: { counterparty: "asc" },
    });

    const today = new Date();
    return NextResponse.json({
      contracts: contracts.map(({ lines, purchase_orders, tasks, billing_rules, open_questions, review_pointers, ...c }) => {
        const pointers = Array.isArray(review_pointers) ? (review_pointers as any[]) : [];
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
          approval: approvalView(c, c.approval_status === "approved" ? contractLapse(c, c.agreement, lines, today) : []),
          agreement_approval: c.agreement ? approvalView(c.agreement, agreementLapse(c.agreement, today)).status : null,
          line_approval: { live: lines.filter((l) => l.rule_status !== "retired").length, approved: lines.filter((l) => l.rule_status !== "retired" && l.approval_status === "approved").length, awaiting: lines.filter((l) => l.rule_status !== "retired" && l.approval_status === "submitted").length, sent_back: lines.filter((l) => l.rule_status !== "retired" && l.approval_status === "sent_back").length },
          rule_count: lines.filter((l) => l.shape && l.rule_status !== "retired").length,
          confirmed_rule_count: lines.filter((l) => l.shape && l.rule_status === "confirmed").length,
          beyond_agreement: !!(c.agreement?.end_date && c.end_date && c.end_date > c.agreement.end_date) || !!(c.agreement?.end_date && c.agreement.end_date < today && (!c.end_date || c.end_date >= today)),
          open_task_count: tasks.length,
          overdue_task_count: tasks.filter((t) => t.due_date < today).length,
          open_question_count: questions.filter((q) => !q?.resolved).length,
          open_pointer_count: pointers.filter((p) => !p?.resolved && p?.kind !== "uninvoiced").length,
          validation: validationChecks({ ...c, documents: c.documents, client: c.client, lines_with_shape: lines, purchase_orders, review_pointers: undefined } as any).map((t) => ({ team: t.team, done: t.done, missing: t.missing })),
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
    const spocPerson = body.spoc_person_id ? await prisma.person.findUnique({ where: { id: body.spoc_person_id }, select: { id: true, name: true } }) : null;
    if (body.spoc_person_id && !spocPerson) return NextResponse.json({ error: "SPOC must be a person from the People list" }, { status: 400 });
    const contract = await prisma.contract.create({
      data: {
        counterparty: body.counterparty.trim(),
        basis: body.basis.trim(),
        direction: body.direction ?? "customer",
        bill_to: body.bill_to || null,
        start_date: parseDate(body.start_date),
        end_date: parseDate(body.end_date),
        spoc: spocPerson?.name ?? (body.spoc || null),
        spoc_person_id: spocPerson?.id ?? null,
        notes: body.notes || null,
        client_id: body.client_id || null,
        stage: typeof body.stage === "string" && body.stage ? body.stage : "active",
        po_status: body.po_status || null,
        documents: Array.isArray(body.documents) ? body.documents : undefined,
        source_key: `manual:${Date.now().toString(36)}`,
      },
    });
    await audit(user, "Contract", contract.id, "create", undefined, contract);
    return NextResponse.json({ contract }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating contract:", error);
    return NextResponse.json({ error: error?.message || "Failed to create contract" }, { status: 400 });
  }
});
