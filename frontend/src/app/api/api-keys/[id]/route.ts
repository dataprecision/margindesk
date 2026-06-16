import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminRole } from "@/lib/auth/protect-route";

/**
 * PATCH /api/api-keys/[id]
 * Revoke or re-activate a key (owner/finance only). Body: { active: boolean }.
 */
export const PATCH = withAdminRole(
  async (req: Request, { user, params }: { user: any; params?: any }) => {
    try {
      const { id } = await params;
      const body = await req.json();
      if (typeof body.active !== "boolean") {
        return NextResponse.json({ error: "active (boolean) is required" }, { status: 400 });
      }

      const existing = await prisma.apiKey.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "API key not found" }, { status: 404 });
      }

      const key = await prisma.apiKey.update({
        where: { id },
        data: { active: body.active },
        select: {
          id: true,
          name: true,
          prefix: true,
          scopes: true,
          active: true,
          last_used_at: true,
          expires_at: true,
          created_by: true,
          created_at: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          actor_id: user.id,
          entity: "ApiKey",
          entity_id: id,
          action: body.active ? "activate" : "revoke",
          before_json: { active: existing.active },
          after_json: { active: key.active },
        },
      });

      return NextResponse.json({ success: true, apiKey: key });
    } catch (error) {
      console.error("Error updating API key:", error);
      return NextResponse.json({ error: "Failed to update API key" }, { status: 500 });
    }
  }
);

/**
 * DELETE /api/api-keys/[id]
 * Permanently delete a key (owner/finance only).
 */
export const DELETE = withAdminRole(
  async (_req: Request, { user, params }: { user: any; params?: any }) => {
    try {
      const { id } = await params;

      const existing = await prisma.apiKey.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "API key not found" }, { status: 404 });
      }

      await prisma.apiKey.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          actor_id: user.id,
          entity: "ApiKey",
          entity_id: id,
          action: "delete",
          before_json: { name: existing.name, prefix: existing.prefix },
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error("Error deleting API key:", error);
      return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
    }
  }
);
