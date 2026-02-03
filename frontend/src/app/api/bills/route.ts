import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/bills
 * Get bills with pagination and filtering
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - sortBy: Field to sort by (default: bill_date)
 * - sortOrder: asc or desc (default: desc)
 * - include: Filter by include_in_calculation (all, included, excluded)
 * - status: Filter by status (paid, open, overdue, etc.)
 * - category: Filter by cf_expense_category
 * - search: Search in vendor_name, bill_number
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);

    // Pagination — limit=0 means return all records (no pagination)
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const paginationOpts = limit > 0 ? { skip: (page - 1) * limit, take: limit } : {};

    // Sorting
    const sortBy = searchParams.get("sortBy") || "bill_date";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Filters
    const includeFilter = searchParams.get("include") || "all";
    const statusFilter = searchParams.get("status");
    const categoryFilter = searchParams.get("category");
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

    if (categoryFilter) {
      where.cf_expense_category = categoryFilter;
    }

    if (searchTerm) {
      where.OR = [
        { vendor_name: { contains: searchTerm, mode: "insensitive" } },
        { bill_number: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    // Fetch bills with pagination and include line items
    const [bills, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        ...paginationOpts,
        include: {
          line_items: {
            orderBy: { item_total: 'desc' },
          },
        },
      }),
      prisma.bill.count({ where }),
    ]);

    // Calculate pagination metadata
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return NextResponse.json({
      bills,
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
    console.error("Error fetching bills:", error);
    return NextResponse.json(
      { error: "Failed to fetch bills" },
      { status: 500 }
    );
  }
});
