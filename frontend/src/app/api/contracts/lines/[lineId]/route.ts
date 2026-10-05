import { NextRequest, NextResponse } from "next/server";
import { PERIODS, missingParams } from "@/lib/billing/shapes";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseAmount, parseDate } from "@/lib/contracts/api";

const TEXT_FIELDS = ["service", "billing_type", "unit", "currency", "read_from", "source_document", "extra_rule", "date_note"] as const;

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
    // Billing shape (invoicing): shape, its numbers, period; confirm only when every required number is present.
    if ("shape" in body) data.shape = body.shape || null;
    if ("params" in body && typeof body.params === "object") data.params = body.params;
    if ("period" in body) { if (body.period && !PERIODS.includes(body.period)) return NextResponse.json({ error: "Unknown billing period" }, { status: 400 }); data.period = body.period || null; }
    if ("fx_rate" in body) data.fx_rate = body.fx_rate === "" || body.fx_rate == null ? null : Number(body.fx_rate);
    if ("input_needed" in body) data.input_needed = body.input_needed || null;
    if ("advance_or_arrears" in body) data.advance_or_arrears = body.advance_or_arrears || null;
    if ("rule_status" in body) {
      if (!["proposed", "confirmed", "retired"].includes(body.rule_status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
      if (body.rule_status === "confirmed") {
        const shape = (data.shape ?? before.shape) as string | null;
        const params = (data.params ?? before.params ?? {}) as Record<string, any>;
        if (!shape) return NextResponse.json({ error: "Set how the term is billed before confirming it" }, { status: 400 });
        const gaps = missingParams(shape, params);
        if (gaps.length) return NextResponse.json({ error: `Still needed: ${gaps.join(", ")}` }, { status: 400 });
      }
      data.rule_status = body.rule_status;
      data.confirmed_by = body.rule_status === "confirmed" ? user.name || user.email : null;
      data.confirmed_at = body.rule_status === "confirmed" ? new Date() : null;
    }

    const line = await prisma.contractLine.update({ where: { id: lineId }, data });
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
    await audit(user, "ContractLine", lineId, "delete", before, undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting contract line:", error);
    return NextResponse.json({ error: "Failed to delete line" }, { status: 500 });
  }
});
