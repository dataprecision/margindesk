import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPMRole } from "@/lib/auth/protect-route";


/**
 * PATCH /api/bills/line-items/[id]
 *
 * Updates the project tag on a BillLineItem. Pass `project_id: string | null`
 * in the body — `null` clears the tag. Tagging puts that line-item's
 * `item_total` into the project's direct-expense sum for the bill's
 * `cf_billed_for_month_unformatted`.
 *
 * Permission: owner / finance / pm.
 */
export const PATCH = withPMRole(
  async (req: NextRequest, { user, params }: { user: any; params: any }) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const project_id: string | null =
        body.project_id === undefined ? null : body.project_id; // explicit clear via null

      // Verify line item exists
      const existing = await prisma.billLineItem.findUnique({
        where: { id },
        select: { id: true, project_id: true, bill_id: true },
      });
      if (!existing) {
        return NextResponse.json({ error: "Line item not found" }, { status: 404 });
      }

      // If tagging (not clearing), verify the project exists
      if (project_id) {
        const project = await prisma.project.findUnique({
          where: { id: project_id },
          select: { id: true, name: true, status: true },
        });
        if (!project) {
          return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }
      }

      const updated = await prisma.billLineItem.update({
        where: { id },
        data: { project_id },
        include: {
          project: { select: { id: true, name: true } },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          actor_id: user.id,
          entity: "BillLineItem",
          entity_id: id,
          action: "update",
          before_json: { project_id: existing.project_id },
          after_json: { project_id: updated.project_id },
        },
      });

      return NextResponse.json({ success: true, line_item: updated });
    } catch (error: any) {
      console.error("Error tagging line item to project:", error);
      return NextResponse.json(
        { error: "Failed to tag line item", details: error.message },
        { status: 500 }
      );
    }
  }
);
