import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { BILLING_API_ROLES, audit, parseDate } from "@/lib/contracts/api";
import { PERIODS, SHAPE_BY_KEY, missingParams } from "@/lib/billing/shapes";

/**
 * PATCH /api/contracts/rules/[ruleId]
 * Edit a rule, confirm it, or retire it. A rule can only be confirmed when
 * its shape is set and every required parameter is filled in.
 */
export const PATCH = withRole(BILLING_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { ruleId } = await params;
    const body = await (req as NextRequest).json();
    const before = await prisma.billingRule.findUnique({ where: { id: ruleId } });
    if (!before) return NextResponse.json({ error: "Billing rule not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if ("service" in body && body.service?.trim()) data.service = body.service.trim();
    if ("label" in body) data.label = body.label || null;
    if ("notes" in body) data.notes = body.notes || null;
    if ("currency" in body && body.currency) data.currency = body.currency;
    if ("shape" in body) {
      if (!SHAPE_BY_KEY[body.shape]) return NextResponse.json({ error: "Unknown billing shape" }, { status: 400 });
      data.shape = body.shape;
    }
    if ("params" in body && body.params && typeof body.params === "object") data.params = body.params;
    if ("period" in body) {
      if (!PERIODS.includes(body.period)) return NextResponse.json({ error: "Unknown billing period" }, { status: 400 });
      data.period = body.period;
    }
    if ("fx_rate" in body) data.fx_rate = body.fx_rate === "" || body.fx_rate === null ? null : Number(body.fx_rate);
    if ("start_date" in body) data.start_date = parseDate(body.start_date);
    if ("end_date" in body) data.end_date = parseDate(body.end_date);
    if ("project_id" in body) data.project_id = body.project_id || null;

    if ("status" in body) {
      if (!["proposed", "confirmed", "retired"].includes(body.status)) {
        return NextResponse.json({ error: "Status must be proposed, confirmed or retired" }, { status: 400 });
      }
      if (body.status === "confirmed") {
        const shape = (data.shape as string) ?? before.shape;
        const gaps = missingParams(shape, ((data.params as any) ?? before.params ?? {}) as Record<string, any>);
        if (gaps.length) {
          return NextResponse.json({ error: `Fill in before confirming: ${gaps.join(", ")}` }, { status: 400 });
        }
      }
      data.status = body.status;
      data.confirmed_by = body.status === "confirmed" ? user.name || user.email : null;
      data.confirmed_at = body.status === "confirmed" ? new Date() : null;
    } else if (before.status === "confirmed" && ("params" in data || "shape" in data || "period" in data)) {
      // Changing what a confirmed rule computes sends it back for another check.
      data.status = "proposed";
      data.confirmed_by = null;
      data.confirmed_at = null;
    }

    const rule = await prisma.billingRule.update({ where: { id: ruleId }, data });
    await audit(user, "BillingRule", ruleId, "update", before, rule);
    return NextResponse.json({ rule });
  } catch (error: any) {
    console.error("Error updating billing rule:", error);
    return NextResponse.json({ error: error?.message || "Failed to update rule" }, { status: 400 });
  }
});

/**
 * DELETE /api/contracts/rules/[ruleId]
 */
export const DELETE = withRole(BILLING_API_ROLES, async (_req: Request, { user, params }) => {
  try {
    const { ruleId } = await params;
    const before = await prisma.billingRule.findUnique({ where: { id: ruleId } });
    if (!before) return NextResponse.json({ error: "Billing rule not found" }, { status: 404 });
    await prisma.billingRule.delete({ where: { id: ruleId } });
    await audit(user, "BillingRule", ruleId, "delete", before, undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting billing rule:", error);
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
});
