import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth/protect-route";
import { getProjectIdsForUser } from "@/lib/auth/pod-scope";


/**
 * GET /api/project-hours?start_month=YYYY-MM-DD&end_month=YYYY-MM-DD
 *
 * Returns active hourly projects with their ProjectHours rows in range.
 * PM users are scoped to projects in pods they lead.
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

    const allowedProjectIds = await getProjectIdsForUser(user.email, user.role);

    const projectWhere: any = {
      status: { in: ["active", "on_hold"] },
      config: {
        project_type: { in: ["hourly_blended", "hourly_resource_based"] },
      },
    };
    if (allowedProjectIds !== null) {
      projectWhere.id = { in: allowedProjectIds };
    }

    const projects = await prisma.project.findMany({
      where: projectWhere,
      include: {
        client: { select: { id: true, name: true } },
        config: true,
        project_hours: {
          where: { period_month: { gte: startDate, lte: endDate } },
        },
      },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching project hours:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch project hours",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/project-hours
 * Bulk upsert. body: { updates: Array<{ project_id, period_month, hours, notes? }> }
 *
 * Permission: owner / finance / pm. PMs can only edit projects in pods they lead.
 */
export const POST = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    if (!["owner", "finance", "pm"].includes(user.role)) {
      return NextResponse.json(
        { error: "Forbidden — owner / finance / pm only" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { updates } = body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "updates array is required" },
        { status: 400 }
      );
    }

    // PM scope: limit to projects in their pods
    if (user.role === "pm") {
      const allowed = await getProjectIdsForUser(user.email, user.role);
      if (allowed !== null) {
        const allowedSet = new Set(allowed);
        const outOfScope = updates.find(
          (u: any) => !allowedSet.has(u.project_id)
        );
        if (outOfScope) {
          return NextResponse.json(
            { error: "One or more projects are outside your pod scope" },
            { status: 403 }
          );
        }
      }
    }

    const results = await prisma.$transaction(async (tx) => {
      const ops = updates.map(async (u: any) => {
        const periodMonth = new Date(u.period_month);
        const existing = await tx.projectHours.findFirst({
          where: { project_id: u.project_id, period_month: periodMonth },
        });

        // Treat empty / null / 0 hours as a delete
        const numericHours = Number(u.hours);
        if (
          u.hours === "" ||
          u.hours === null ||
          u.hours === undefined ||
          isNaN(numericHours)
        ) {
          if (existing) {
            await tx.projectHours.delete({ where: { id: existing.id } });
          }
          return null;
        }

        if (existing) {
          return tx.projectHours.update({
            where: { id: existing.id },
            data: { hours: numericHours, notes: u.notes ?? existing.notes, updated_at: new Date() },
          });
        }
        return tx.projectHours.create({
          data: {
            project_id: u.project_id,
            period_month: periodMonth,
            hours: numericHours,
            notes: u.notes ?? null,
          },
        });
      });
      return Promise.all(ops);
    });

    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "ProjectHours",
        entity_id: "bulk",
        action: "bulk_update",
        after_json: { count: results.filter((r) => r !== null).length, updates },
      },
    });

    return NextResponse.json({
      success: true,
      updated: results.filter((r) => r !== null).length,
      message: "Project hours updated successfully",
    });
  } catch (error) {
    console.error("Error updating project hours:", error);
    return NextResponse.json(
      {
        error: "Failed to update project hours",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
