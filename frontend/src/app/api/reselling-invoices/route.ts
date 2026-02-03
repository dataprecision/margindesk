import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/reselling-invoices
 * List all reselling invoices (authenticated users only)
 */
export const GET = withAuth(async (req) => {
  try {
    const { searchParams } = new URL(req.url);
    const period_month = searchParams.get("period_month");

    const where: any = {};
    if (period_month) {
      where.period_month = new Date(period_month);
    }

    const invoices = await prisma.resellingInvoice.findMany({
      where,
      orderBy: {
        period_month: "desc",
      },
      include: {
        project: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        product: true,
        bill_allocations: true,
      },
    });

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("Error fetching reselling invoices:", error);
    return NextResponse.json(
      { error: "Failed to fetch reselling invoices" },
      { status: 500 }
    );
  }
});
