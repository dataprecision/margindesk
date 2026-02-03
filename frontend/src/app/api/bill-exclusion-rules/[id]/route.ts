import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * PATCH /api/bill-exclusion-rules/[id]
 * Update a bill exclusion rule
 */
export const PATCH = withAuth(async (req, { user, params }) => {
  try {
    const { id } = params;
    const body = await req.json();

    // Don't allow updating default rules
    const existingRule = await prisma.billExclusionRule.findUnique({
      where: { id },
    });

    if (!existingRule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    if (existingRule.is_default && body.is_default === false) {
      return NextResponse.json(
        { error: "Cannot modify default rules" },
        { status: 403 }
      );
    }

    // If operator is being changed to contains_any_of, process value
    let processedValue = body.value;
    if (body.operator === "contains_any_of" && body.value) {
      try {
        if (Array.isArray(body.value)) {
          processedValue = JSON.stringify(body.value);
        } else if (typeof body.value === "string") {
          JSON.parse(body.value);
          processedValue = body.value;
        } else {
          processedValue = JSON.stringify([body.value]);
        }
      } catch (e) {
        return NextResponse.json(
          { error: "For 'contains_any_of' operator, value must be a valid JSON array" },
          { status: 400 }
        );
      }
    } else if (body.value !== undefined) {
      processedValue = String(body.value);
    }

    const rule = await prisma.billExclusionRule.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.field && { field: body.field }),
        ...(body.operator && { operator: body.operator }),
        ...(processedValue !== undefined && { value: processedValue }),
        ...(body.reason && { reason: body.reason }),
      },
    });

    return NextResponse.json({ success: true, rule });
  } catch (error: any) {
    console.error("Error updating bill exclusion rule:", error);
    return NextResponse.json(
      { error: "Failed to update bill exclusion rule", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/bill-exclusion-rules/[id]
 * Delete a bill exclusion rule
 */
export const DELETE = withAuth(async (req, { user, params }) => {
  try {
    const { id } = params;

    // Don't allow deleting default rules
    const existingRule = await prisma.billExclusionRule.findUnique({
      where: { id },
    });

    if (!existingRule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    if (existingRule.is_default) {
      return NextResponse.json(
        { error: "Cannot delete default rules. Disable them instead." },
        { status: 403 }
      );
    }

    await prisma.billExclusionRule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting bill exclusion rule:", error);
    return NextResponse.json(
      { error: "Failed to delete bill exclusion rule", details: error.message },
      { status: 500 }
    );
  }
});
