import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/sync/bill-details/[jobId]
 * Get status of a bill details sync job
 *
 * Response:
 * {
 *   "job": {
 *     "id": "cuid",
 *     "filter_type": "bill_date" | "billed_for_month",
 *     "filter_value": "2024-01",
 *     "status": "running" | "completed" | "failed" | "cancelled",
 *     "total_bills": 100,
 *     "processed_bills": 45,
 *     "success_count": 40,
 *     "error_count": 5,
 *     "force_refetch": false,
 *     "error_messages": ["error1", "error2"],
 *     "started_at": "2024-01-01T00:00:00Z",
 *     "completed_at": "2024-01-01T00:10:00Z" | null,
 *     "progress_percentage": 45
 *   }
 * }
 */
export const GET = withAuth(async (req, { user, params }) => {
  try {
    const { jobId } = await params;

    console.log(`🔍 [Job Status] Fetching status for job: ${jobId}`);

    const job = await prisma.detailSyncJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Calculate progress percentage
    const progress_percentage = job.total_bills > 0
      ? Math.round((job.processed_bills / job.total_bills) * 100)
      : 0;

    return NextResponse.json({
      job: {
        ...job,
        progress_percentage,
      },
    });
  } catch (error: any) {
    console.error("❌ [Job Status] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch job status", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/sync/bill-details/[jobId]
 * Cancel a running bill details sync job
 */
export const DELETE = withAuth(async (req, { user, params }) => {
  try {
    const { jobId } = await params;

    console.log(`🛑 [Job Cancel] Cancelling job: ${jobId}`);

    const job = await prisma.detailSyncJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    if (job.status !== "running") {
      return NextResponse.json(
        { error: "Job is not running" },
        { status: 400 }
      );
    }

    // Mark job as cancelled
    await prisma.detailSyncJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        completed_at: new Date(),
      },
    });

    console.log(`✅ [Job Cancel] Job cancelled: ${jobId}`);

    return NextResponse.json({
      message: "Job cancelled successfully",
    });
  } catch (error: any) {
    console.error("❌ [Job Cancel] Error:", error);
    return NextResponse.json(
      { error: "Failed to cancel job", details: error.message },
      { status: 500 }
    );
  }
});
