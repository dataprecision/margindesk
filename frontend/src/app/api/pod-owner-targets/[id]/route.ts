import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAdminRole } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * PUT /api/pod-owner-targets/[id]
 *
 * Updates a target. Only the value fields are mutable; pod_owner_id and
 * fiscal_year are immutable on the row.
 */
export const PUT = withAdminRole(
  async (req: NextRequest, { user, params }: { user: any; params: any }) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const { profitability_target, revenue_growth_target, baseline_revenue, notes } = body;

      const existing = await prisma.podOwnerTarget.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Target not found" }, { status: 404 });
      }

      const updated = await prisma.podOwnerTarget.update({
        where: { id },
        data: {
          ...(profitability_target != null && { profitability_target }),
          ...(revenue_growth_target != null && { revenue_growth_target }),
          ...(baseline_revenue != null && { baseline_revenue }),
          ...(notes !== undefined && { notes }),
          set_by_user_id: user.id !== "system-cron" ? user.id : existing.set_by_user_id,
        },
      });

      return NextResponse.json({ success: true, target: updated });
    } catch (error: any) {
      console.error("Error updating pod owner target:", error);
      return NextResponse.json(
        { error: "Failed to update target", details: error.message },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/pod-owner-targets/[id]
 */
export const DELETE = withAdminRole(
  async (_req: NextRequest, { params }: { user: any; params: any }) => {
    try {
      const { id } = await params;
      const existing = await prisma.podOwnerTarget.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Target not found" }, { status: 404 });
      }
      await prisma.podOwnerTarget.delete({ where: { id } });
      return NextResponse.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting pod owner target:", error);
      return NextResponse.json(
        { error: "Failed to delete target", details: error.message },
        { status: 500 }
      );
    }
  }
);
