import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/projects/[id]/config
 * Get project configuration
 */
export const GET = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;

    const config = await prisma.projectConfig.findUnique({
      where: { project_id: id },
    });

    if (!config) {
      return NextResponse.json(
        { error: "Project configuration not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(config);
  } catch (error) {
    console.error("Error fetching project config:", error);
    return NextResponse.json(
      { error: "Failed to fetch project configuration" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/projects/[id]/config
 * Create or update project configuration (upsert)
 */
export const POST = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;
    const body = await req.json();

    console.log("Creating/updating project config:", { project_id: id, body });

    // Check if user has permission (owner/finance only)
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can configure projects" },
        { status: 403 }
      );
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Validate required fields
    if (!body.project_type || !body.billing_model || !body.rate_type) {
      return NextResponse.json(
        { error: "project_type, billing_model, and rate_type are required" },
        { status: 400 }
      );
    }

    // Validate project_type enum
    if (!["hourly_blended", "hourly_resource_based"].includes(body.project_type)) {
      return NextResponse.json(
        { error: "Invalid project_type. Must be 'hourly_blended' or 'hourly_resource_based'" },
        { status: 400 }
      );
    }

    // Validate billing_model enum
    if (body.billing_model !== "time_and_material") {
      return NextResponse.json(
        { error: "Invalid billing_model. Must be 'time_and_material'" },
        { status: 400 }
      );
    }

    // Validate rate_type enum
    if (!["blended", "role_based"].includes(body.rate_type)) {
      return NextResponse.json(
        { error: "Invalid rate_type. Must be 'blended' or 'role_based'" },
        { status: 400 }
      );
    }

    // Validate overage_policy if provided
    if (body.overage_policy && !["billable", "absorbed"].includes(body.overage_policy)) {
      return NextResponse.json(
        { error: "Invalid overage_policy. Must be 'billable' or 'absorbed'" },
        { status: 400 }
      );
    }

    // Validate based on project type
    if (body.project_type === "hourly_blended") {
      // For blended rate projects, blended_rate is required
      if (!body.blended_rate) {
        return NextResponse.json(
          { error: "blended_rate is required for hourly_blended projects" },
          { status: 400 }
        );
      }

      // Ensure rate_type matches
      if (body.rate_type !== "blended") {
        return NextResponse.json(
          { error: "rate_type must be 'blended' for hourly_blended projects" },
          { status: 400 }
        );
      }
    } else if (body.project_type === "hourly_resource_based") {
      // For resource-based projects, rate_card is required
      if (!body.rate_card) {
        return NextResponse.json(
          { error: "rate_card is required for hourly_resource_based projects" },
          { status: 400 }
        );
      }

      // Validate rate_card is an object
      if (typeof body.rate_card !== "object" || Array.isArray(body.rate_card)) {
        return NextResponse.json(
          { error: "rate_card must be an object with role names as keys" },
          { status: 400 }
        );
      }

      // Ensure rate_type matches
      if (body.rate_type !== "role_based") {
        return NextResponse.json(
          { error: "rate_type must be 'role_based' for hourly_resource_based projects" },
          { status: 400 }
        );
      }
    }

    // Validate hours_cap_per_role if provided (must be object)
    if (body.hours_cap_per_role) {
      if (typeof body.hours_cap_per_role !== "object" || Array.isArray(body.hours_cap_per_role)) {
        return NextResponse.json(
          { error: "hours_cap_per_role must be an object with role names as keys" },
          { status: 400 }
        );
      }
    }

    // Validate PO dates if both are provided
    if (body.po_valid_from && body.po_valid_to) {
      const fromDate = new Date(body.po_valid_from);
      const toDate = new Date(body.po_valid_to);
      if (toDate < fromDate) {
        return NextResponse.json(
          { error: "po_valid_to must be after po_valid_from" },
          { status: 400 }
        );
      }
    }

    // Fetch current config for audit log (if exists)
    const currentConfig = await prisma.projectConfig.findUnique({
      where: { project_id: id },
    });

    // Upsert configuration
    const config = await prisma.projectConfig.upsert({
      where: { project_id: id },
      update: {
        project_type: body.project_type,
        billing_model: body.billing_model,
        rate_type: body.rate_type,
        blended_rate: body.blended_rate || null,
        rate_card: body.rate_card || null,
        currency: body.currency || "INR",
        billing_frequency: body.billing_frequency || "monthly",
        hours_cap: body.hours_cap || null,
        hours_cap_per_role: body.hours_cap_per_role || null,
        overage_policy: body.overage_policy || "billable",
        po_amount: body.po_amount || null,
        po_valid_from: body.po_valid_from ? new Date(body.po_valid_from) : null,
        po_valid_to: body.po_valid_to ? new Date(body.po_valid_to) : null,
        updated_at: new Date(),
      },
      create: {
        project_id: id,
        project_type: body.project_type,
        billing_model: body.billing_model,
        rate_type: body.rate_type,
        blended_rate: body.blended_rate || null,
        rate_card: body.rate_card || null,
        currency: body.currency || "INR",
        billing_frequency: body.billing_frequency || "monthly",
        hours_cap: body.hours_cap || null,
        hours_cap_per_role: body.hours_cap_per_role || null,
        overage_policy: body.overage_policy || "billable",
        po_amount: body.po_amount || null,
        po_valid_from: body.po_valid_from ? new Date(body.po_valid_from) : null,
        po_valid_to: body.po_valid_to ? new Date(body.po_valid_to) : null,
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "ProjectConfig",
        entity_id: config.id,
        action: currentConfig ? "update" : "create",
        before_json: currentConfig || undefined,
        after_json: config,
      },
    });

    console.log(`✅ Project configuration ${currentConfig ? "updated" : "created"} for project ${id}`);

    return NextResponse.json({
      success: true,
      config,
      message: `Configuration ${currentConfig ? "updated" : "created"} successfully`,
    });
  } catch (error) {
    console.error("Error creating/updating project config:", error);
    return NextResponse.json(
      {
        error: "Failed to save project configuration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/projects/[id]/config
 * Delete project configuration
 */
export const DELETE = withAuth(async (req: NextRequest, { user, params }: { user: any; params: any }) => {
  try {
    const { id } = await params;

    console.log("Deleting project config for project:", id);

    // Check if user has permission (owner/finance only)
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Only owners and finance can delete project configurations" },
        { status: 403 }
      );
    }

    // Fetch current config for audit log
    const currentConfig = await prisma.projectConfig.findUnique({
      where: { project_id: id },
    });

    if (!currentConfig) {
      return NextResponse.json(
        { error: "Project configuration not found" },
        { status: 404 }
      );
    }

    await prisma.projectConfig.delete({
      where: { project_id: id },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "ProjectConfig",
        entity_id: currentConfig.id,
        action: "delete",
        before_json: currentConfig,
      },
    });

    console.log(`✅ Project configuration deleted for project ${id}`);

    return NextResponse.json({
      success: true,
      message: "Configuration deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting project config:", error);
    return NextResponse.json(
      {
        error: "Failed to delete project configuration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
