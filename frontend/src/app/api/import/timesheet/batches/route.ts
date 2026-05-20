import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth/protect-route";


/**
 * GET /api/import/timesheet/batches
 * List all timesheet import batches with summary stats
 */
export const GET = withAuth(async (req: NextRequest, { user }: { user: any }) => {
  try {
    console.log("📋 [List Batches] Fetching import batches");

    const batches = await prisma.timesheetImportBatch.findMany({
      orderBy: {
        created_at: "desc",
      },
      include: {
        _count: {
          select: { entries: true },
        },
      },
    });

    console.log(`✅ [List Batches] Found ${batches.length} import batches`);

    return NextResponse.json({
      batches: batches.map((batch) => ({
        id: batch.id,
        file_name: batch.file_name,
        imported_by: batch.imported_by,
        period_start: batch.period_start,
        period_end: batch.period_end,
        total_rows: batch.total_rows,
        processed_rows: batch.processed_rows,
        skipped_rows: batch.skipped_rows,
        deleted_entries: batch.deleted_entries,
        entry_count: batch._count.entries,
        error_messages: batch.error_messages,
        created_at: batch.created_at,
      })),
      count: batches.length,
    });
  } catch (error: any) {
    console.error("❌ [List Batches] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch import batches", details: error.message },
      { status: 500 }
    );
  }
});
