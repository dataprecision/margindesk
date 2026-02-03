import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * DELETE /api/import/timesheet/batch/[batchId]
 * Delete an import batch and all its timesheet entries (cascade)
 */
export const DELETE = withAuth(async (req: NextRequest, { user, params }: { user: any; params: Promise<{ batchId: string }> }) => {
  try {
    const { batchId } = await params;

    console.log(`🗑️ [Delete Batch] Attempting to delete batch: ${batchId}`);

    // Check permissions
    if (user.role !== "owner" && user.role !== "finance") {
      console.log("Permission denied for user:", user.role);
      return NextResponse.json(
        { error: "Only owners and finance can delete import batches" },
        { status: 403 }
      );
    }

    // Verify batch exists
    const batch = await prisma.timesheetImportBatch.findUnique({
      where: { id: batchId },
      include: {
        _count: {
          select: { entries: true },
        },
      },
    });

    if (!batch) {
      return NextResponse.json(
        { error: "Import batch not found" },
        { status: 404 }
      );
    }

    console.log(`Found batch: ${batch.file_name} with ${batch._count.entries} entries`);

    // Delete the batch (cascade will delete all related timesheet entries)
    await prisma.timesheetImportBatch.delete({
      where: { id: batchId },
    });

    // Log the deletion
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "TimesheetImportBatch",
        entity_id: batchId,
        action: "delete",
        before_json: {
          batch_id: batch.id,
          file_name: batch.file_name,
          period: `${batch.period_start.toISOString().split("T")[0]} to ${batch.period_end.toISOString().split("T")[0]}`,
          entries_deleted: batch._count.entries,
        },
      },
    });

    console.log(`✅ [Delete Batch] Successfully deleted batch ${batchId} and ${batch._count.entries} entries`);

    return NextResponse.json({
      success: true,
      message: `Deleted batch and ${batch._count.entries} timesheet entries`,
      deleted_entries: batch._count.entries,
    });
  } catch (error) {
    console.error("❌ [Delete Batch] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete import batch",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});

/**
 * GET /api/import/timesheet/batch/[batchId]
 * Get details of a specific import batch
 */
export const GET = withAuth(async (req: NextRequest, { user, params }: { user: any; params: Promise<{ batchId: string }> }) => {
  try {
    const { batchId } = await params;

    const batch = await prisma.timesheetImportBatch.findUnique({
      where: { id: batchId },
      include: {
        _count: {
          select: { entries: true },
        },
      },
    });

    if (!batch) {
      return NextResponse.json(
        { error: "Import batch not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      batch: {
        ...batch,
        entry_count: batch._count.entries,
      },
    });
  } catch (error: any) {
    console.error("Error fetching batch:", error);
    return NextResponse.json(
      { error: "Failed to fetch batch", details: error.message },
      { status: 500 }
    );
  }
});
