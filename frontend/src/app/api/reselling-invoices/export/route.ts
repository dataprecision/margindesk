import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/reselling-invoices/export
 * Export a CSV template for reselling invoices for a given month
 * Query params: month (YYYY-MM format)
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

    const periodMonth = new Date(month + "-01T00:00:00.000Z");
    const monthLabel = periodMonth.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

    // Fetch reselling/outsourcing projects
    const projects = await prisma.project.findMany({
      where: {
        status: { in: ["active", "on_hold"] },
        config: {
          project_type: { in: ["reselling", "outsourcing"] },
        },
      },
      include: {
        client: { select: { name: true } },
        config: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
        reselling_invoices: {
          where: { period_month: periodMonth },
          take: 1,
        },
      },
      orderBy: [
        { client: { name: "asc" } },
        { name: "asc" },
      ],
    });

    // Build CSV
    const headers = [
      "Client",
      "Project Name",
      "Project ID",
      "Product Name",
      "Product ID",
      `Revenue (${monthLabel})`,
      `OEM Cost (${monthLabel})`,
      `Other Expenses (${monthLabel})`,
    ];

    const rows = projects.map((p) => {
      const existing = p.reselling_invoices[0];
      const productName = p.config?.product?.name || "";
      const productId = p.config?.product?.id || "";

      return [
        escapeCsvField(p.client.name),
        escapeCsvField(p.name),
        p.id,
        escapeCsvField(productName),
        productId,
        existing ? existing.invoice_amount.toString() : "",
        existing ? existing.total_oem_cost.toString() : "",
        existing ? existing.other_expenses.toString() : "",
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const filename = `reselling-invoices-template-${month}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting reselling invoices:", error);
    return NextResponse.json(
      { error: "Failed to export reselling invoices" },
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
