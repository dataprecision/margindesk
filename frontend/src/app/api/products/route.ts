import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/products
 * List all products (predefined + custom)
 * Query params:
 *  - type: Filter by product type (reselling, outsourcing, custom)
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    const where = type ? { type } : {};

    const products = await prisma.product.findMany({
      where,
      orderBy: [
        { is_predefined: "desc" }, // Predefined first
        { name: "asc" },
      ],
    });

    return NextResponse.json({
      products,
      count: products.length,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/products
 * Create a custom product
 * Body: { name, type, description? }
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    // Only owner and finance can create products
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, type, description } = body;

    // Validation
    if (!name || !type) {
      return NextResponse.json(
        { error: "name and type are required" },
        { status: 400 }
      );
    }

    if (!["reselling", "outsourcing", "custom"].includes(type)) {
      return NextResponse.json(
        { error: "type must be one of: reselling, outsourcing, custom" },
        { status: 400 }
      );
    }

    // Check if product name already exists
    const existing = await prisma.product.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Product with this name already exists" },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        name,
        type,
        description: description || null,
        is_predefined: false, // Custom products are never predefined
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error: any) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Failed to create product", details: error.message },
      { status: 500 }
    );
  }
});
