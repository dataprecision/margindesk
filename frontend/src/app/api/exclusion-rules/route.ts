import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/exclusion-rules
 * Fetch all exclusion rules
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const rules = await prisma.expenseExclusionRule.findMany({
      orderBy: [
        { is_default: "desc" }, // Default rules first
        { created_at: "asc" },
      ],
    });

    return NextResponse.json({ rules });
  } catch (error: any) {
    console.error("Error fetching exclusion rules:", error);
    return NextResponse.json(
      { error: "Failed to fetch exclusion rules", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * POST /api/exclusion-rules
 * Create a new exclusion rule
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

    const rule = await prisma.expenseExclusionRule.create({
      data: {
        name,
        description: description || null,
        enabled: true,
        field,
        operator,
        value: String(value), // Store as string
        reason,
        is_default: false, // Custom rules are not default
      },
    });

    return NextResponse.json({ success: true, rule });
  } catch (error: any) {
    console.error("Error creating exclusion rule:", error);
    return NextResponse.json(
      { error: "Failed to create exclusion rule", details: error.message },
      { status: 500 }
    );
  }
});
