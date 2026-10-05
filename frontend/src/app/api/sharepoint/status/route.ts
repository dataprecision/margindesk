import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES } from "@/lib/contracts/api";
import { sharePointStatus } from "@/lib/sharepoint";

/** GET /api/sharepoint/status: has the admin granted MarginDesk read access yet? */
export const GET = withRole(CONTRACT_API_ROLES, async () => {
  try {
    return NextResponse.json(await sharePointStatus());
  } catch (error: any) {
    return NextResponse.json({ connected: false, drives: {}, message: error?.message || "Could not reach Microsoft Graph" });
  }
});
