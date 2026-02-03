import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAdminRole } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * PATCH /api/clients/[id]
 * Update a client
 */
export const PATCH = withAdminRole(
  async (req: NextRequest, { params, user }: any) => {
    try {
      const { id } = await params;
      const body = await req.json();

      // Validate required fields
      if (!body.name || !body.billing_currency) {
        return NextResponse.json(
          { error: "Name and billing currency are required" },
          { status: 400 }
        );
      }

      // Check if client exists
      const existingClient = await prisma.client.findUnique({
        where: { id },
      });

      if (!existingClient) {
        return NextResponse.json(
          { error: "Client not found" },
          { status: 404 }
        );
      }

      // Update client
      const updatedClient = await prisma.client.update({
        where: { id },
        data: {
          name: body.name,
          billing_currency: body.billing_currency,
          gstin: body.gstin || null,
          pan: body.pan || null,
          tags: body.tags || [],
        },
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          actor_id: user.id,
          entity: "Client",
          entity_id: updatedClient.id,
          action: "update",
          before_json: existingClient,
          after_json: updatedClient,
        },
      });

      return NextResponse.json(updatedClient);
    } catch (error: any) {
      console.error("Error updating client:", error);
      return NextResponse.json(
        { error: "Failed to update client", details: error.message },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/clients/[id]
 * Delete a client
 */
export const DELETE = withAdminRole(
  async (req: NextRequest, { params, user }: any) => {
    try {
      const { id } = await params;

      // Check if client exists
      const existingClient = await prisma.client.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              projects: true,
            },
          },
        },
      });

      if (!existingClient) {
        return NextResponse.json(
          { error: "Client not found" },
          { status: 404 }
        );
      }

      // Check if client has projects
      if (existingClient._count.projects > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete client with ${existingClient._count.projects} active project(s)`,
          },
          { status: 400 }
        );
      }

      // Delete client
      await prisma.client.delete({
        where: { id },
      });

      // Log the action
      await prisma.auditLog.create({
        data: {
          actor_id: user.id,
          entity: "Client",
          entity_id: id,
          action: "delete",
          before_json: existingClient,
        },
      });

      return NextResponse.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting client:", error);
      return NextResponse.json(
        { error: "Failed to delete client", details: error.message },
        { status: 500 }
      );
    }
  }
);
