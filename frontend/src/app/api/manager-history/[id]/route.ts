import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * PUT /api/manager-history/[id]
 * Update manager history record (dates only)
 * Only owner/finance can update
 */
export const PUT = withAuth(
  async (req, { user, params }: { user: any; params: { id: string } }) => {
    try {
      // Check permissions
      if (user.role !== "owner" && user.role !== "finance") {
        return NextResponse.json(
          { error: "Only owners and finance can update manager history" },
          { status: 403 }
        );
      }

      const { id } = params;
      const body = await req.json();

      // Validate required fields
      if (!body.start_date) {
        return NextResponse.json(
          { error: "start_date is required" },
          { status: 400 }
        );
      }

      // Find existing record
      const existing = await prisma.managerHistory.findUnique({
        where: { id },
        include: {
          employee: { select: { id: true, name: true } },
          manager: { select: { id: true, name: true } },
        },
      });

      if (!existing) {
        return NextResponse.json(
          { error: "Manager history record not found" },
          { status: 404 }
        );
      }

      // Parse dates
      const startDate = new Date(body.start_date);
      const endDate = body.end_date ? new Date(body.end_date) : null;

      // Validate dates
      if (endDate && startDate >= endDate) {
        return NextResponse.json(
          { error: "Start date must be before end date" },
          { status: 400 }
        );
      }

      // Check for overlapping records (excluding the current record being edited)
      const existingRecords = await prisma.managerHistory.findMany({
        where: {
          person_id: existing.person_id,
          NOT: { id },
        },
      });

      for (const record of existingRecords) {
        const recordStart = new Date(record.start_date);
        const recordEnd = record.end_date ? new Date(record.end_date) : null;

        // Check for overlap
        const newStartBeforeRecordEnd = recordEnd === null || startDate < recordEnd;
        const newEndAfterRecordStart = endDate === null || endDate > recordStart;

        if (newStartBeforeRecordEnd && newEndAfterRecordStart) {
          return NextResponse.json(
            {
              error: `Date range overlaps with existing manager record (${recordStart.toLocaleDateString()} - ${recordEnd ? recordEnd.toLocaleDateString() : 'Present'})`,
            },
            { status: 400 }
          );
        }
      }

      // Update record
      const updated = await prisma.managerHistory.update({
        where: { id },
        data: {
          start_date: startDate,
          end_date: endDate,
        },
        include: {
          employee: { select: { id: true, name: true, email: true } },
          manager: { select: { id: true, name: true, email: true } },
        },
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          actor_id: user.id,
          entity: "ManagerHistory",
          entity_id: updated.id,
          action: "update",
          before_json: existing,
          after_json: updated,
        },
      });

      return NextResponse.json(updated);
    } catch (error) {
      console.error("Error updating manager history:", error);
      return NextResponse.json(
        { error: "Failed to update manager history" },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/manager-history/[id]
 * Delete manager history record
 * Only owner/finance can delete
 */
export const DELETE = withAuth(
  async (req, { user, params }: { user: any; params: { id: string } }) => {
    try {
      // Check permissions
      if (user.role !== "owner" && user.role !== "finance") {
        return NextResponse.json(
          { error: "Only owners and finance can delete manager history" },
          { status: 403 }
        );
      }

      const { id } = params;

      // Find existing record
      const existing = await prisma.managerHistory.findUnique({
        where: { id },
        include: {
          employee: { select: { id: true, name: true } },
          manager: { select: { id: true, name: true } },
        },
      });

      if (!existing) {
        return NextResponse.json(
          { error: "Manager history record not found" },
          { status: 404 }
        );
      }

      // Delete record
      await prisma.managerHistory.delete({
        where: { id },
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          actor_id: user.id,
          entity: "ManagerHistory",
          entity_id: id,
          action: "delete",
          before_json: existing,
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Error deleting manager history:", error);
      return NextResponse.json(
        { error: "Failed to delete manager history" },
        { status: 500 }
      );
    }
  }
);
