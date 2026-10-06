import { NextRequest, NextResponse } from "next/server";
import { PERIODS } from "@/lib/billing/shapes";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseAmount, parseDate } from "@/lib/contracts/api";
import { editResets } from "@/lib/contracts/approval";

const TEXT_FIELDS = ["service", "billing_type", "unit", "currency", "read_from", "source_document", "extra_rule", "date_note", "quote"] as const;

/**
 * PATCH /api/contracts/lines/[lineId]
 */
export const PATCH = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { lineId } = await params;
    const body = await (req as NextRequest).json();
    const before = await prisma.contractLine.findUnique({ where: { id: lineId } });
    if (!before) return NextResponse.json({ error: "Billing line not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    for (const f of TEXT_FIELDS) if (f in body) data[f] = body[f] === "" && f !== "service" && f !== "billing_type" ? null : body[f];
    if ("amount_text" in body) {
      data.amount_text = String(body.amount_text).trim();
      data.amount = parseAmount(body.amount_text);
    }
    if ("start_date" in body) data.start_date = parseDate(body.start_date);
    if ("end_date" in body) data.end_date = parseDate(body.end_date);
    if ("project_id" in body) data.project_id = body.project_id || null;
    if ("verified" in body) data.verified = !!body.verified;
    // The billing half belongs to invoicing: contracting can change the wording, not how it is billed.
    if (user.role === "legal") for (const k of ["shape", "params", "period", "fx_rate", "input_needed", "advance_or_arrears", "rule_status"]) delete body[k];
    // Billing shape (invoicing): shape, its numbers, period; confirm only when every required number is present.
    if ("shape" in body) data.shape = body.shape || null;
    if ("params" in body && typeof body.params === "object") data.params = body.params;
    if ("period" in body) { if (body.period && !PERIODS.includes(body.period)) return NextResponse.json({ error: "Unknown billing period" }, { status: 400 }); data.period = body.period || null; }
    if ("fx_rate" in body) data.fx_rate = body.fx_rate === "" || body.fx_rate == null ? null : Number(body.fx_rate);
    if ("input_needed" in body) data.input_needed = body.input_needed || null;
    if ("advance_or_arrears" in body) data.advance_or_arrears = body.advance_or_arrears || null;
    // "Confirmed" is now the result of maker-checker approval (POST …/approval); only retire / restore is set here.
    if ("rule_status" in body) {
      if (!["proposed", "retired"].includes(body.rule_status)) return NextResponse.json({ error: "Use Submit / Approve for confirmation" }, { status: 400 });
      data.rule_status = body.rule_status;
      data.confirmed_by = null; data.confirmed_at = null;
    }
    if ("approval_note" in body) data.approval_note = body.approval_note || null;
    if (Object.keys(data).length === 0) return NextResponse.json({ line: before });

    // Any change makes it a new draft by this person, and the contract above it is no longer approved as a whole.
    Object.assign(data, editResets(user), "approval_note" in body ? { approval_note: body.approval_note || null } : {});
    // An approved line was "confirmed" for billing; once edited it is a proposal again until re-approved.
    if (before.rule_status === "confirmed" && !("rule_status" in data)) Object.assign(data, { rule_status: "proposed", confirmed_by: null, confirmed_at: null });
    const line = await prisma.contractLine.update({ where: { id: lineId }, data });
    // The "billing lines checked" sign-off and the contract approval both referred to the line as it was.
    await prisma.contract.update({ where: { id: before.contract_id }, data: { commercial_checked_by: null, commercial_checked_at: null } });
    await prisma.contract.updateMany({ where: { id: before.contract_id, approval_status: { in: ["approved", "submitted"] } }, data: editResets(user) });
    await audit(user, "ContractLine", lineId, "update", before, line);
    return NextResponse.json({ line });
  } catch (error: any) {
    console.error("Error updating contract line:", error);
    return NextResponse.json({ error: error?.message || "Failed to update line" }, { status: 400 });
  }
});

/**
 * DELETE /api/contracts/lines/[lineId]
 */
export const DELETE = withRole(CONTRACT_API_ROLES, async (_req: Request, { user, params }) => {
  try {
    const { lineId } = await params;
    const before = await prisma.contractLine.findUnique({ where: { id: lineId } });
    if (!before) return NextResponse.json({ error: "Billing line not found" }, { status: 404 });
    await prisma.contractLine.delete({ where: { id: lineId } });
    await prisma.contract.update({ where: { id: before.contract_id }, data: { commercial_checked_by: null, commercial_checked_at: null } });
    await prisma.contract.updateMany({ where: { id: before.contract_id, approval_status: { in: ["approved", "submitted"] } }, data: editResets(user) });
    await audit(user, "ContractLine", lineId, "delete", before, undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting contract line:", error);
    return NextResponse.json({ error: "Failed to delete line" }, { status: 500 });
  }
});
