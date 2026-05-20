import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


/**
 * GET /api/holidays
 * Fetch all holidays from the database
 */
export async function GET(req: NextRequest) {
  try {
    const holidays = await prisma.holiday.findMany({
      orderBy: {
        date: 'asc'
      }
    });

    return NextResponse.json({ holidays });
  } catch (error: any) {
    console.error("Error fetching holidays:", error);
    return NextResponse.json(
      { error: "Failed to fetch holidays", details: error.message },
      { status: 500 }
    );
  }
}
