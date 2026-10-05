import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { withRole } from "@/lib/auth/protect-route";
import { isSharePointAdmin } from "@/lib/sharepoint-admin";

/**
 * GET /api/sharepoint/grant/start?folders=<url-encoded JSON array of folder links>
 * Sends the admin to Microsoft to sign in. The delegated token that comes
 * back is used once, in the callback, to grant MarginDesk's own app read
 * access on the chosen folders. Only the named SharePoint admin may start it.
 */
export const GET = withRole(["owner"], async (req: Request, { user }) => {
  if (!isSharePointAdmin(user.email)) return NextResponse.json({ error: "Only the SharePoint admin can grant access" }, { status: 403 });
  const url = new URL(req.url);
  let folders: string[] = [];
  try { folders = JSON.parse(url.searchParams.get("folders") || "[]"); } catch {}
  folders = folders.filter((f) => typeof f === "string" && /^https:\/\//i.test(f)).slice(0, 20);
  if (!folders.length) return NextResponse.json({ error: "No folder links given" }, { status: 400 });

  const state = randomBytes(16).toString("hex");
  const base = process.env.NEXTAUTH_URL || url.origin;
  const redirect = `${base}/api/sharepoint/grant/callback`;
  const authorize = new URL(`https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/authorize`);
  authorize.search = new URLSearchParams({
    client_id: process.env.AZURE_AD_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirect,
    response_mode: "query",
    scope: "https://graph.microsoft.com/Files.ReadWrite.All https://graph.microsoft.com/Sites.Read.All openid profile",
    state,
    prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set("sp_grant", JSON.stringify({ state, folders, by: user.email }), { httpOnly: true, secure: true, sameSite: "lax", path: "/api/sharepoint/grant", maxAge: 600 });
  return res;
});
