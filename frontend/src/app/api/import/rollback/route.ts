import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * DELETE /api/import/rollback?import_id={id}
 * Rollback a specific import by deleting all allocations created in that import
 * Uses audit log to find which allocations to delete
 */
export const DELETE = withAuth(async (req, { user }: { user: any }) => {
  try {
    // Check permissions
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can rollback imports" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const importId = searchParams.get("import_id");

    if (!importId) {
      return NextResponse.json(
        { error: "import_id parameter is required" },
        { status: 400 }
      );
    }

    // Find the import audit log
    const importLog = await prisma.auditLog.findUnique({
      where: { id: importId },
    });

    if (!importLog || importLog.entity !== "Allocation" || importLog.action !== "import") {
      return NextResponse.json(
        { error: "Import log not found" },
        { status: 404 }
      );
    }

    // Get allocation IDs from the import log
    const stats = importLog.after_json as any;
    const allocationIds = stats.allocationIds || [];

    if (allocationIds.length === 0) {
      return NextResponse.json(
        { error: "No allocations found in this import" },
        { status: 400 }
      );
    }

    // Delete allocations
    const result = await prisma.allocation.deleteMany({
      where: {
        id: {
          in: allocationIds,
        },
      },
    });

    // Log the rollback
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "Allocation",
        entity_id: importId,
        action: "rollback",
        before_json: {
          deletedCount: result.count,
          allocationIds,
        },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: `Successfully deleted ${result.count} allocations`,
    });
  } catch (error) {
    console.error("Error rolling back import:", error);
    return NextResponse.json(
      {
        error: "Failed to rollback import",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/import/rollback/all
 * Delete ALL allocations (nuclear option)
 */
export const POST = withAuth(async (req, { user }: { user: any }) => {
  try {
    // Check permissions
    if (user.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can delete all allocations" },
        { status: 403 }
      );
    }

    const body = await req.json();

    if (body.confirm !== "DELETE_ALL_ALLOCATIONS") {
      return NextResponse.json(
        { error: "Confirmation string required" },
        { status: 400 }
      );
    }

    // Delete all allocations
    const result = await prisma.allocation.deleteMany({});

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "Allocation",
        entity_id: "all",
        action: "delete_all",
        before_json: {
          deletedCount: result.count,
        },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: `Successfully deleted all ${result.count} allocations`,
    });
  } catch (error) {
    console.error("Error deleting all allocations:", error);
    return NextResponse.json(
      {
        error: "Failed to delete allocations",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
