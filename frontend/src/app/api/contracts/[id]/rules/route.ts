import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { BILLING_API_ROLES, audit, parseDate } from "@/lib/contracts/api";
import { PERIODS, SHAPE_BY_KEY } from "@/lib/billing/shapes";

/**
 * POST /api/contracts/[id]/rules
 * Add a billing rule by hand. It starts as proposed.
 */
export const POST = withRole(BILLING_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    if (!body.service?.trim()) return NextResponse.json({ error: "Service is required" }, { status: 400 });
    if (!SHAPE_BY_KEY[body.shape]) return NextResponse.json({ error: "Choose a billing shape" }, { status: 400 });
    if (body.period && !PERIODS.includes(body.period)) return NextResponse.json({ error: "Unknown billing period" }, { status: 400 });
    const contract = await prisma.contract.findUnique({ where: { id }, select: { id: true } });
    if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

    const rule = await prisma.billingRule.create({
      data: {
        contract_id: id,
        service: body.service.trim(),
        label: body.label || null,
        shape: body.shape,
        params: body.params ?? {},
        period: body.period || "monthly",
        currency: body.currency || "INR",
        start_date: parseDate(body.start_date),
        end_date: parseDate(body.end_date),
        notes: body.notes || null,
        source: "manual",
      },
    });
    await audit(user, "BillingRule", rule.id, "create", undefined, rule);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating billing rule:", error);
    return NextResponse.json({ error: error?.message || "Failed to create rule" }, { status: 400 });
  }
});
