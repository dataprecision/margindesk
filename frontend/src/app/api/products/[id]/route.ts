import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/products/[id]
 * Get a single product by ID
 */
export const GET = withAuth(async (req, { user, params }) => {
  try {
    const { id } = params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            reselling_invoices: true,
            bill_allocations: true,
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/products/[id]
 * Update a product
 * Body: { name?, type?, description? }
 * Note: Can only update custom products (not predefined ones)
 */
export const PUT = withAuth(async (req, { user, params }) => {
  try {
    // Only owner and finance can update products
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { id } = params;
    const body = await req.json();
    const { name, type, description } = body;

    // Check if product exists
    const existing = await prisma.product.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Cannot update predefined products
    if (existing.is_predefined) {
      return NextResponse.json(
        { error: "Cannot update predefined products" },
        { status: 400 }
      );
    }

    // Validate type if provided
    if (type && !["reselling", "outsourcing", "custom"].includes(type)) {
      return NextResponse.json(
        { error: "type must be one of: reselling, outsourcing, custom" },
        { status: 400 }
      );
    }

    // Check name uniqueness if name is being changed
    if (name && name !== existing.name) {
      const nameExists = await prisma.product.findUnique({
        where: { name },
      });

      if (nameExists) {
        return NextResponse.json(
          { error: "Product with this name already exists" },
          { status: 400 }
        );
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(description !== undefined && { description }),
      },
    });

    return NextResponse.json(product);
  } catch (error: any) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      { error: "Failed to update product", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/products/[id]
 * Delete a custom product
 * Note: Can only delete custom products (not predefined ones)
 */
export const DELETE = withAuth(async (req, { user, params }) => {
  try {
    // Only owner and finance can delete products
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { id } = params;

    // Check if product exists
    const existing = await prisma.product.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            reselling_invoices: true,
            bill_allocations: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Cannot delete predefined products
    if (existing.is_predefined) {
      return NextResponse.json(
        { error: "Cannot delete predefined products" },
        { status: 400 }
      );
    }

    // Check if product is in use
    const inUse =
      existing._count.reselling_invoices > 0 ||
      existing._count.bill_allocations > 0;

    if (inUse) {
      return NextResponse.json(
        {
          error: "Cannot delete product that is in use",
          details: {
            reselling_invoices: existing._count.reselling_invoices,
            bill_allocations: existing._count.bill_allocations,
          },
        },
        { status: 400 }
      );
    }

    await prisma.product.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Product deleted" });
  } catch (error: any) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: "Failed to delete product", details: error.message },
      { status: 500 }
    );
  }
});
