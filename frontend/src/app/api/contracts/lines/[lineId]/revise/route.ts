import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseAmount, parseDate } from "@/lib/contracts/api";
import { editResets } from "@/lib/contracts/approval";

/**
 * POST /api/contracts/lines/[lineId]/revise  { effective_from, ...changed fields }
 * A price or wording change from a date. The current line is not edited: it is
 * closed on the day before, and a new line starts on the effective date,
 * linked back to it. Estimates for any month then pick the version in force.
 */
export const POST = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { lineId } = await params;
    const body = await (req as NextRequest).json();
    const from = parseDate(body.effective_from);
    if (!from) return NextResponse.json({ error: "Say the date the change takes effect" }, { status: 400 });
    const old = await prisma.contractLine.findUnique({ where: { id: lineId }, include: { replaced_by: { select: { id: true } } } });
    if (!old) return NextResponse.json({ error: "Billing line not found" }, { status: 404 });
    if (old.replaced_by.length) return NextResponse.json({ error: "This line already has a later version; change that one" }, { status: 400 });
    if (old.start_date && from <= old.start_date) return NextResponse.json({ error: "The change must take effect after this line's start date; edit the line instead" }, { status: 400 });
    if (old.end_date && from > old.end_date) return NextResponse.json({ error: "The change is after this line's end date; add a new line instead" }, { status: 400 });

    const legal = user.role === "legal";
    const pick = <T,>(key: string, fallback: T): T => (key in body && body[key] !== undefined ? body[key] : fallback);
    const dayBefore = new Date(from.getTime() - 86_400_000);
    const [, created] = await prisma.$transaction([
      prisma.contractLine.update({ where: { id: old.id }, data: { end_date: dayBefore } }),
      prisma.contractLine.create({
        data: {
          contract_id: old.contract_id, project_id: old.project_id, replaces_line_id: old.id, sort_order: old.sort_order,
          service: String(pick("service", old.service)).trim() || old.service,
          billing_type: pick("billing_type", old.billing_type),
          amount_text: String(pick("amount_text", old.amount_text)).trim() || old.amount_text,
          amount: "amount_text" in body ? parseAmount(body.amount_text) : old.amount,
          unit: pick("unit", old.unit) || null, currency: pick("currency", old.currency) || "INR",
          start_date: from, end_date: "end_date" in body ? parseDate(body.end_date) ?? old.end_date : old.end_date,
          read_from: pick("read_from", old.read_from), source_document: pick("source_document", old.source_document) || null,
          quote: pick("quote", old.quote) || null, extra_rule: old.extra_rule,
          shape: legal ? old.shape : pick("shape", old.shape) || null,
          params: (legal ? old.params : pick("params", old.params)) ?? {},
          period: legal ? old.period : pick("period", old.period) || null,
          fx_rate: legal ? old.fx_rate : "fx_rate" in body ? (body.fx_rate === "" || body.fx_rate == null ? null : Number(body.fx_rate)) : old.fx_rate,
          input_needed: legal ? old.input_needed : pick("input_needed", old.input_needed) || null,
          advance_or_arrears: legal ? old.advance_or_arrears : pick("advance_or_arrears", old.advance_or_arrears) || null,
          rule_status: "proposed", rule_evidence: old.rule_evidence ?? undefined,
          approval_note: old.approval_note, last_edited_by: editResets(user).last_edited_by, last_edited_at: new Date(),
        },
      }),
      prisma.contract.update({ where: { id: old.contract_id }, data: { commercial_checked_by: null, commercial_checked_at: null } }),
      prisma.contract.updateMany({ where: { id: old.contract_id, approval_status: { in: ["approved", "submitted"] } }, data: editResets(user) }),
    ]);
    await audit(user, "ContractLine", created.id, "revise", old, created);
    return NextResponse.json({ line: created }, { status: 201 });
  } catch (error: any) {
    console.error("Error revising billing line:", error);
    return NextResponse.json({ error: error?.message || "Failed to record the change" }, { status: 400 });
  }
});
