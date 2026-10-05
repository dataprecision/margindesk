import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES } from "@/lib/contracts/api";
import { prepareDrafts, periodStart } from "@/lib/billing/drafts";

const monthOk = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);

/**
 * GET /api/estimates?period=YYYY-MM
 * The month's drafts with their gaps and status.
 */
export const GET = withRole(CONTRACT_API_ROLES, async (req: Request) => {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period");
    if (!monthOk(period)) return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
    const drafts = await prisma.draftEstimate.findMany({
      where: { period: periodStart(period!) },
      include: {
        contract: { select: { id: true, counterparty: true, spoc: true, review_bucket: true } },
        client: { select: { id: true, name: true } },
        purchase_order: { select: { id: true, po_number: true, value: true, consumed: true } },
        _count: { select: { lines: true } },
      },
      orderBy: [{ status: "asc" }, { sub_total: "desc" }],
    });
    return NextResponse.json({ drafts: drafts.map(({ _count, ...d }) => ({ ...d, line_count: _count.lines, gap_count: Array.isArray(d.gaps) ? (d.gaps as any[]).filter((g) => g?.blocking).length : 0 })) });
  } catch (error) {
    console.error("Error fetching drafts:", error);
    return NextResponse.json({ error: "Failed to fetch drafts" }, { status: 500 });
  }
});

/**
 * POST /api/estimates { period: "YYYY-MM", contract_ids?: [] }
 * Prepare or refresh the month's drafts. Signed or checked drafts are left alone.
 */
export const POST = withRole(["owner", "finance", "billing"], async (req: Request, { user }) => {
  try {
    const body = await (req as NextRequest).json();
    if (!monthOk(body.period)) return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });
    const stats = await prepareDrafts(periodStart(body.period), prisma, user.name || user.email, Array.isArray(body.contract_ids) ? body.contract_ids : undefined);
    return NextResponse.json({ success: true, ...stats });
  } catch (error: any) {
    console.error("Error preparing drafts:", error);
    return NextResponse.json({ error: error?.message || "Failed to prepare drafts" }, { status: 500 });
  }
});
