import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { getProjectIdsForUser } from "@/lib/auth/pod-scope";

const prisma = new PrismaClient();

/**
 * GET /api/project-costs/export
 * Export a CSV template with project names and existing costs for a given month
 * Query params: month (YYYY-MM format, e.g. "2026-01")
 */
export const GET = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json(
        { error: "month is required (format: YYYY-MM)" },
        { status: 400 }
      );
    }

    // Parse month to first day
    const periodMonth = new Date(month + "-01T00:00:00.000Z");
    const monthLabel = periodMonth.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

    // PM role: scope to projects in their pods
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
        client: { select: { name: true } },
        config: true,
        project_costs: {
          where: {
            period_month: periodMonth,
          },
        },
      },
      orderBy: [
        { client: { name: "asc" } },
        { name: "asc" },
      ],
    });

    // Build CSV
    const headers = ["Client", "Project Name", "Project ID", `Revenue (${monthLabel})`];
    const rows = projects.map((p) => {
      const existingCost = p.project_costs.find(
        (c) => c.type === "other"
      );
      const amount = existingCost ? existingCost.amount.toString() : "";

      return [
        escapeCsvField(p.client.name),
        escapeCsvField(p.name),
        p.id,
        amount,
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    const filename = `project-costs-template-${month}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting project costs:", error);
    return NextResponse.json(
      { error: "Failed to export project costs" },
      { status: 500 }
    );
  }
});

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
