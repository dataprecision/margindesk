import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/clients
 * List all clients (authenticated users only)
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    const clients = await prisma.client.findMany({
      orderBy: {
        created_at: "desc",
      },
      include: {
        _count: {
          select: {
            projects: true,
          },
        },
      },
    });

    return NextResponse.json({
      clients,
      total: clients.length,
      user: {
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error fetching clients:", error);
    return NextResponse.json(
      { error: "Failed to fetch clients" },
      { status: 500 }
    );
  }
});

/**
 * POST /api/clients
 * Create a new client (authenticated users only)
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    const body = await req.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: "Client name is required" },
        { status: 400 }
      );
    }

    const client = await prisma.client.create({
      data: {
        name: body.name,
        billing_currency: body.billing_currency || "INR",
        gstin: body.gstin,
        pan: body.pan,
        tags: body.tags || [],
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        actor_id: user.id,
        entity: "Client",
        entity_id: client.id,
        action: "create",
        after_json: client,
      },
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("Error creating client:", error);
    return NextResponse.json(
      { error: "Failed to create client" },
      { status: 500 }
    );
  }
});
