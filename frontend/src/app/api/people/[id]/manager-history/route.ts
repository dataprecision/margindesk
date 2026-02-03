import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/people/[id]/manager-history
 * Get manager history for a specific person
 */
export const GET = withAuth(
  async (req, { user, params }: { user: any; params: { id: string } }) => {
    try {
      const { id } = params;

      // Fetch person with manager history
      const person = await prisma.person.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      if (!person) {
        return NextResponse.json(
          { error: "Person not found" },
          { status: 404 }
        );
      }

      // Fetch manager history ordered by most recent first
      const managerHistory = await prisma.managerHistory.findMany({
        where: { person_id: id },
        orderBy: { start_date: "desc" },
        include: {
          manager: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return NextResponse.json({
        person,
        managerHistory,
        total: managerHistory.length,
      });
    } catch (error) {
      console.error("Error fetching manager history:", error);
      return NextResponse.json(
        { error: "Failed to fetch manager history" },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/people/[id]/manager-history
 * Create a new manager history record
 * Only owner/finance can create
 */
export const POST = withAuth(
  async (req, { user, params }: { user: any; params: { id: string } }) => {
    try {
      // Check permissions
      if (user.role !== "owner" && user.role !== "finance") {
        return NextResponse.json(
          { error: "Only owners and finance can create manager history" },
          { status: 403 }
        );
      }

      const { id } = params;
      const body = await req.json();

      // Validate required fields
      if (!body.manager_id || !body.start_date) {
        return NextResponse.json(
          { error: "manager_id and start_date are required" },
          { status: 400 }
        );
      }

      // Verify person exists
      const person = await prisma.person.findUnique({
        where: { id },
      });

      if (!person) {
        return NextResponse.json(
          { error: "Person not found" },
          { status: 404 }
        );
      }

      // Verify manager exists
      const manager = await prisma.person.findUnique({
        where: { id: body.manager_id },
      });

      if (!manager) {
        return NextResponse.json(
          { error: "Manager not found" },
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

      // Check for overlapping records
      const existingRecords = await prisma.managerHistory.findMany({
        where: { person_id: id },
      });

      for (const existing of existingRecords) {
        const existingStart = new Date(existing.start_date);
        const existingEnd = existing.end_date ? new Date(existing.end_date) : null;

        // Check for overlap
        // New record overlaps if:
        // 1. New start is before existing end (or existing has no end) AND
        // 2. New end (or no end) is after existing start
        const newStartBeforeExistingEnd = existingEnd === null || startDate < existingEnd;
        const newEndAfterExistingStart = endDate === null || endDate > existingStart;

        if (newStartBeforeExistingEnd && newEndAfterExistingStart) {
          return NextResponse.json(
            {
              error: `Date range overlaps with existing manager record (${existingStart.toLocaleDateString()} - ${existingEnd ? existingEnd.toLocaleDateString() : 'Present'})`,
            },
            { status: 400 }
          );
        }
      }

      // Create new record
      const newRecord = await prisma.managerHistory.create({
        data: {
          person_id: id,
          manager_id: body.manager_id,
          start_date: startDate,
          end_date: endDate,
        },
        include: {
          employee: { select: { id: true, name: true, email: true } },
          manager: { select: { id: true, name: true, email: true } },
        },
      });

      // Update current manager if this is the most recent record
      if (!endDate || endDate > new Date()) {
        await prisma.person.update({
          where: { id },
          data: { manager_id: body.manager_id },
        });
      }

      // Log the action
      await prisma.auditLog.create({
        data: {
          actor_id: user.id,
          entity: "ManagerHistory",
          entity_id: newRecord.id,
          action: "create",
          after_json: newRecord,
        },
      });

      return NextResponse.json(newRecord, { status: 201 });
    } catch (error) {
      console.error("Error creating manager history:", error);
      return NextResponse.json(
        { error: "Failed to create manager history" },
        { status: 500 }
      );
    }
  }
);
