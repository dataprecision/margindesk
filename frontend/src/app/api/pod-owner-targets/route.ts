import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAdminRole } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/pod-owner-targets?fiscal_year=2026
 *
 * Lists every active PodOwner alongside their target row for the requested FY
 * (or all FYs if no fiscal_year is given). Owners without a target for that
 * FY come back with target=null so the settings UI can render an empty row.
 */
export const GET = withAdminRole(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const fyRaw = searchParams.get("fiscal_year");
    const fiscalYear = fyRaw ? parseInt(fyRaw, 10) : null;
    if (fyRaw && (!Number.isFinite(fiscalYear) || fiscalYear! < 1900 || fiscalYear! > 2200)) {
      return NextResponse.json({ error: "Invalid fiscal_year" }, { status: 400 });
    }

    const owners = await prisma.podOwner.findMany({
      where: { end_date: null },
      include: { person: { select: { id: true, name: true, email: true } } },
      orderBy: { name: "asc" },
    });

    const targets = await prisma.podOwnerTarget.findMany({
      where: fiscalYear ? { fiscal_year: fiscalYear } : {},
      include: { set_by: { select: { name: true, email: true } } },
    });

    const targetByOwner = new Map<string, typeof targets>();
    for (const t of targets) {
      if (!targetByOwner.has(t.pod_owner_id)) targetByOwner.set(t.pod_owner_id, []);
      targetByOwner.get(t.pod_owner_id)!.push(t);
    }

    const result = owners.map((o) => {
      const ownerTargets = targetByOwner.get(o.id) ?? [];
      const target = fiscalYear ? ownerTargets[0] ?? null : null;
      return {
        owner: { id: o.id, name: o.name, person: o.person },
        target,
        all_targets: fiscalYear ? undefined : ownerTargets,
      };
    });

    return NextResponse.json({ fiscal_year: fiscalYear, owners: result });
  } catch (error: any) {
    console.error("Error fetching pod owner targets:", error);
    return NextResponse.json(
      { error: "Failed to fetch targets", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * POST /api/pod-owner-targets
 *
 * Body: { pod_owner_id, fiscal_year, profitability_target, revenue_growth_target,
 *         baseline_revenue, notes? }
 *
 * Creates a target for (owner, FY). Errors with 409 if one already exists for
 * that pair — use PUT to update an existing row.
 */
export const POST = withAdminRole(async (req: NextRequest, { user }: { user: any }) => {
  try {
    const body = await req.json();
    const {
      pod_owner_id,
      fiscal_year,
      profitability_target,
      revenue_growth_target,
      baseline_revenue,
      notes,
    } = body;

    if (!pod_owner_id || !fiscal_year) {
      return NextResponse.json(
        { error: "pod_owner_id and fiscal_year are required" },
        { status: 400 }
      );
    }
    if (
      profitability_target == null ||
      revenue_growth_target == null ||
      baseline_revenue == null
    ) {
      return NextResponse.json(
        { error: "profitability_target, revenue_growth_target, baseline_revenue are required" },
        { status: 400 }
      );
    }

    const owner = await prisma.podOwner.findUnique({ where: { id: pod_owner_id } });
    if (!owner) {
      return NextResponse.json({ error: "Pod owner not found" }, { status: 404 });
    }

    const existing = await prisma.podOwnerTarget.findUnique({
      where: { pod_owner_id_fiscal_year: { pod_owner_id, fiscal_year } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Target already exists for ${owner.name} FY${fiscal_year}. Use PUT to update.`, target_id: existing.id },
        { status: 409 }
      );
    }

    const target = await prisma.podOwnerTarget.create({
      data: {
        pod_owner_id,
        fiscal_year,
        profitability_target,
        revenue_growth_target,
        baseline_revenue,
        notes: notes || null,
        set_by_user_id: user.id !== "system-cron" ? user.id : null,
      },
    });

    return NextResponse.json({ success: true, target });
  } catch (error: any) {
    console.error("Error creating pod owner target:", error);
    return NextResponse.json(
      { error: "Failed to create target", details: error.message },
      { status: 500 }
    );
  }
});
