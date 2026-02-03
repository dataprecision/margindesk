import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/expenses
 * Get expenses with pagination and filtering
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - sortBy: Field to sort by (default: expense_date)
 * - sortOrder: asc or desc (default: desc)
 * - include: Filter by include_in_calculation (all, included, excluded)
 * - status: Filter by status
 * - search: Search in description, account_name, customer_name
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);

    // Pagination
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // Sorting
    const sortBy = searchParams.get("sortBy") || "expense_date";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Filters
    const includeFilter = searchParams.get("include") || "all";
    const statusFilter = searchParams.get("status");
    const searchTerm = searchParams.get("search");

    // Build where clause
    const where: any = {};

    if (includeFilter === "included") {
      where.include_in_calculation = true;
    } else if (includeFilter === "excluded") {
      where.include_in_calculation = false;
    }

    if (statusFilter) {
      where.status = statusFilter;
    }

    if (searchTerm) {
      where.OR = [
        { description: { contains: searchTerm, mode: "insensitive" } },
        { account_name: { contains: searchTerm, mode: "insensitive" } },
        { customer_name: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    // Fetch expenses with pagination
    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      }),
      prisma.expense.count({ where }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      expenses,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    return NextResponse.json(
      { error: "Failed to fetch expenses" },
      { status: 500 }
    );
  }
});
