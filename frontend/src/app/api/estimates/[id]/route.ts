import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit } from "@/lib/contracts/api";
import { recomputeDraft } from "@/lib/billing/drafts";

/** GET /api/estimates/[id]: the draft with its lines, contract, company and PO choices. */
export const GET = withRole(CONTRACT_API_ROLES, async (_req: Request, { params }) => {
  try {
    const { id } = await params;
    const draft = await prisma.draftEstimate.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { sort_order: "asc" }, include: { rule: { select: { id: true, status: true, source: true, confidence: true, evidence: true } } } },
        contract: { select: { id: true, counterparty: true, bill_to: true, spoc: true, basis: true, review_bucket: true, start_date: true, end_date: true, po_status: true, purchase_orders: { select: { id: true, po_number: true, value: true, consumed: true, currency: true, valid_to: true, alert_state: true } } } },
        client: { select: { id: true, name: true, gstin: true, placeholder: true, zoho_contact_id: true, billing_currency: true, payment_terms: true } },
        purchase_order: { select: { id: true, po_number: true, value: true, consumed: true, currency: true, valid_to: true } },
      },
    });
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    return NextResponse.json(draft);
  } catch (error) {
    console.error("Error fetching draft:", error);
    return NextResponse.json({ error: "Failed to fetch draft" }, { status: 500 });
  }
});

/**
 * PATCH /api/estimates/[id]
 * Inputs per line ({ lines: [{ id, inputs }] }), the PO, the exchange rate,
 * notes, and the sign-off steps: lead_signed, finance_checked, cancelled,
 * reopen. Each change recomputes amounts and gaps.
 */
export const PATCH = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    const before = await prisma.draftEstimate.findUnique({ where: { id }, select: { id: true, status: true, contract_id: true } });
    if (!before) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    const locked = ["lead_signed", "finance_checked"].includes(before.status);

    if (Array.isArray(body.lines)) {
      if (locked) return NextResponse.json({ error: "Reopen the draft before changing its numbers" }, { status: 400 });
      for (const l of body.lines) {
        if (!l?.id || typeof l.inputs !== "object") continue;
        await prisma.draftEstimateLine.updateMany({ where: { id: l.id, draft_id: id }, data: { inputs: l.inputs } });
      }
    }
    const data: Record<string, unknown> = {};
    if ("purchase_order_id" in body) {
      if (body.purchase_order_id) {
        const po = await prisma.contractPurchaseOrder.findFirst({ where: { id: body.purchase_order_id, contract_id: before.contract_id }, select: { id: true } });
        if (!po) return NextResponse.json({ error: "That PO does not belong to this contract" }, { status: 400 });
      }
      data.purchase_order_id = body.purchase_order_id || null;
    }
    if ("fx_rate" in body) data.fx_rate = body.fx_rate === "" || body.fx_rate == null ? null : Number(body.fx_rate);
    if ("notes" in body) data.notes = body.notes || null;
    if ("zoho_estimate_id" in body) data.zoho_estimate_id = body.zoho_estimate_id || null;
    const who = user.name || user.email;
    const now = new Date();
    if (body.action === "lead_signed") {
      const cur = await prisma.draftEstimate.findUnique({ where: { id }, select: { status: true } });
      if (cur?.status !== "ready") return NextResponse.json({ error: "A draft can be signed only when every blocking gap is closed" }, { status: 400 });
      Object.assign(data, { status: "lead_signed", lead_signed_by: who, lead_signed_at: now });
    } else if (body.action === "finance_checked") {
      if (before.status !== "lead_signed") return NextResponse.json({ error: "Finance checks a draft after the lead has signed it" }, { status: 400 });
      Object.assign(data, { status: "finance_checked", finance_checked_by: who, finance_checked_at: now });
    } else if (body.action === "cancelled") {
      data.status = "cancelled";
    } else if (body.action === "reopen") {
      Object.assign(data, { status: "draft", lead_signed_by: null, lead_signed_at: null, finance_checked_by: null, finance_checked_at: null });
    }
    if (Object.keys(data).length) await prisma.draftEstimate.update({ where: { id }, data });
    const after = await recomputeDraft(id);
    await audit(user, "DraftEstimate", id, body.action || "update", before, after);
    return NextResponse.json({ draft: after });
  } catch (error: any) {
    console.error("Error updating draft:", error);
    return NextResponse.json({ error: error?.message || "Failed to update draft" }, { status: 400 });
  }
});
