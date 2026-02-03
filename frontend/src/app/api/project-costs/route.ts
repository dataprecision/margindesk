import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/project-costs
 * Get project costs for a specific period range
 * Query params: start_month, end_month (YYYY-MM-DD format)
 */
export const GET = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    const { searchParams } = new URL(req.url);
    const startMonth = searchParams.get("start_month");
    const endMonth = searchParams.get("end_month");

    if (!startMonth || !endMonth) {
      return NextResponse.json(
        { error: "start_month and end_month are required" },
        { status: 400 }
      );
    }

    const startDate = new Date(startMonth);
    const endDate = new Date(endMonth);

    // Get all active projects with their configs
    // Only include hourly projects (blended or resource-based)
    const projects = await prisma.project.findMany({
      where: {
        status: { in: ["active", "on_hold"] },
        config: {
          project_type: { in: ["hourly_blended", "hourly_resource_based"] },
        },
      },
      include: {
        client: {
          select: { id: true, name: true },
        },
        config: true,
        project_costs: {
          where: {
            period_month: {
              gte: startDate,
              lte: endDate,
            },
          },
        },
      },
      orderBy: [
        { client: { name: "asc" } },
        { name: "asc" },
      ],
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching project costs:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch project costs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/project-costs/bulk
 * Bulk update/create project costs
 */
export const POST = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can update project costs" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { updates } = body; // Array of { project_id, period_month, type, amount }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "updates array is required" },
        { status: 400 }
      );
    }

    // Process updates in transaction
    const results = await prisma.$transaction(async (tx) => {
      const upsertPromises = updates.map(async (update) => {
        // Check if exists
        const existing = await tx.projectCost.findFirst({
          where: {
            project_id: update.project_id,
            period_month: new Date(update.period_month),
            type: update.type || "other",
          },
        });

        if (existing) {
          // Update existing
          return tx.projectCost.update({
            where: { id: existing.id },
            data: {
              amount: update.amount,
              updated_at: new Date(),
            },
          });
        } else {
          // Create new
          return tx.projectCost.create({
            data: {
              project_id: update.project_id,
              period_month: new Date(update.period_month),
              type: update.type || "other",
              amount: update.amount,
              notes: update.notes,
            },
          });
        }
      });

      return Promise.all(upsertPromises);
    });

    // Log the bulk action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "ProjectCost",
        entity_id: "bulk",
        action: "bulk_update",
        after_json: { count: results.length, updates },
      },
    });

    return NextResponse.json({
      success: true,
      updated: results.length,
      message: "Project costs updated successfully",
    });
  } catch (error) {
    console.error("Error updating project costs:", error);
    return NextResponse.json(
      {
        error: "Failed to update project costs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
