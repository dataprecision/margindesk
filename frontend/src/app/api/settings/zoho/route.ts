import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAdminRole } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/settings/zoho
 * Get Zoho Books connection status
 */
export const GET = withAdminRole(async (req) => {
  try {
    const settings = await prisma.integrationSettings.findUnique({
      where: { key: "zoho_books" },
    });

    if (!settings) {
      return NextResponse.json({ connected: false });
    }

    const config = settings.config as any;

    return NextResponse.json({
      connected: true,
      organization_name: config.organization_name,
      organization_id: config.organization_id,
      connected_at: settings.created_at,
    });
  } catch (error: any) {
    console.error("Error fetching Zoho status:", error);
    return NextResponse.json(
      { error: "Failed to fetch Zoho status", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/settings/zoho
 * Disconnect Zoho Books integration
 */
export const DELETE = withAdminRole(async (req) => {
  try {
    await prisma.integrationSettings.delete({
      where: { key: "zoho_books" },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error disconnecting Zoho:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Zoho", details: error.message },
      { status: 500 }
    );
  }
});
