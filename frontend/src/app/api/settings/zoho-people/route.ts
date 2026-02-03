import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";

const prisma = new PrismaClient();

/**
 * GET /api/settings/zoho-people
 * Check Zoho People connection status
 */
export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const settings = await prisma.integrationSettings.findUnique({
      where: { key: "zoho_people" },
    });

    if (!settings) {
      return NextResponse.json({
        connected: false,
      });
    }

    const config = settings.config as any;

    return NextResponse.json({
      connected: true,
      organization_name: config.organization_name || "Zoho People",
      connected_at: settings.created_at,
    });
  } catch (error: any) {
    console.error("Error fetching Zoho People status:", error);
    return NextResponse.json(
      { error: "Failed to fetch Zoho People status" },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/settings/zoho-people
 * Disconnect Zoho People integration
 */
export const DELETE = withAuth(async (req: NextRequest, { user }) => {
  try {
    // Only owner and finance can disconnect
    if (user.role !== "owner" && user.role !== "finance") {
      return NextResponse.json(
        { error: "Unauthorized. Only owner or finance can disconnect integrations." },
        { status: 403 }
      );
    }

    await prisma.integrationSettings.delete({
      where: { key: "zoho_people" },
    });

    return NextResponse.json({
      success: true,
      message: "Zoho People disconnected successfully",
    });
  } catch (error: any) {
    console.error("Error disconnecting Zoho People:", error);
    return NextResponse.json(
      { error: "Failed to disconnect Zoho People" },
      { status: 500 }
    );
  }
});
