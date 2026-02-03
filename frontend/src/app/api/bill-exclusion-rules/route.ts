import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/bill-exclusion-rules
 * Fetch all bill exclusion rules
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const rules = await prisma.billExclusionRule.findMany({
      orderBy: [
        { is_default: "desc" }, // Default rules first
        { created_at: "asc" },
      ],
    });

    return NextResponse.json({ rules });
  } catch (error: any) {
    console.error("Error fetching bill exclusion rules:", error);
    return NextResponse.json(
      { error: "Failed to fetch bill exclusion rules", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * POST /api/bill-exclusion-rules
 * Create a new bill exclusion rule
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    const body = await req.json();
    const { name, description, field, operator, value, reason } = body;

    // Validation
    if (!name || !field || !operator || !value || !reason) {
      return NextResponse.json(
        { error: "Missing required fields: name, field, operator, value, reason" },
        { status: 400 }
      );
    }

    // If operator is contains_any_of, ensure value is a valid JSON array string
    let processedValue = value;
    if (operator === "contains_any_of") {
      try {
        // If value is already an array, stringify it
        if (Array.isArray(value)) {
          processedValue = JSON.stringify(value);
        } else if (typeof value === "string") {
          // Try to parse it to ensure it's valid JSON
          JSON.parse(value);
          processedValue = value;
        } else {
          // Convert single value to array
          processedValue = JSON.stringify([value]);
        }
      } catch (e) {
        return NextResponse.json(
          { error: "For 'contains_any_of' operator, value must be a valid JSON array" },
          { status: 400 }
        );
      }
    } else {
      processedValue = String(value);
    }

    const rule = await prisma.billExclusionRule.create({
      data: {
        name,
        description: description || null,
        enabled: true,
        field,
        operator,
        value: processedValue,
        reason,
        is_default: false, // Custom rules are not default
      },
    });

    return NextResponse.json({ success: true, rule });
  } catch (error: any) {
    console.error("Error creating bill exclusion rule:", error);
    return NextResponse.json(
      { error: "Failed to create bill exclusion rule", details: error.message },
      { status: 500 }
    );
  }
});
