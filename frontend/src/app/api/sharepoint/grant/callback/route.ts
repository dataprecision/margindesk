import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canRead, grantAppRead, resolveLink } from "@/lib/sharepoint";

/**
 * GET /api/sharepoint/grant/callback
 * Microsoft sends the admin back here. Exchange the code for a delegated
 * token, grant the app read on each folder, record what happened, and
 * forget the token. Protected by the state cookie set at /start.
 */
export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  const back = (msg: string) => NextResponse.redirect(`${base}/settings/sharepoint?msg=${encodeURIComponent(msg)}`);
  try {
    const url = new URL(req.url);
    const cookie = req.cookies.get("sp_grant")?.value;
    if (!cookie) return back("The grant session expired; start again.");
    const { state, folders, by } = JSON.parse(cookie) as { state: string; folders: string[]; by: string };
    if (url.searchParams.get("state") !== state) return back("State mismatch; start again.");
    if (url.searchParams.get("error")) return back(`Microsoft refused: ${url.searchParams.get("error_description") || url.searchParams.get("error")}`);
    const code = url.searchParams.get("code");
    if (!code) return back("No code returned by Microsoft.");

    const tokenRes = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.AZURE_AD_CLIENT_ID!, client_secret: process.env.AZURE_AD_CLIENT_SECRET!, grant_type: "authorization_code", code, redirect_uri: `${base}/api/sharepoint/grant/callback`, scope: "https://graph.microsoft.com/Files.ReadWrite.All openid profile" }),
    });
    const tok = await tokenRes.json();
    if (!tok.access_token) return back(`Could not sign in: ${tok.error_description || tok.error || tokenRes.status}`);

    const results: any[] = [];
    for (const link of folders) {
      try {
        const f = await resolveLink(link, tok.access_token);
        if (!f.is_folder) { results.push({ link, ok: false, error: "That link is a file, not a folder" }); continue; }
        const g = await grantAppRead(tok.access_token, f.drive_id, f.item_id);
        // Give SharePoint a moment, then check with the app's own identity.
        let readable = false;
        for (let i = 0; i < 4 && !readable; i++) { await new Promise((r) => setTimeout(r, 2000)); readable = await canRead(f.drive_id, f.item_id); }
        results.push({ link, label: f.name, path: f.path, drive_id: f.drive_id, item_id: f.item_id, web_url: f.web_url, ok: g.ok, readable, error: g.error });
      } catch (e: any) { results.push({ link, ok: false, error: e?.message }); }
    }
    const prev = await prisma.integrationSettings.findUnique({ where: { key: "sharepoint" } });
    const prevGrants = Array.isArray((prev?.config as any)?.grants) ? (prev!.config as any).grants : [];
    const grants = [...prevGrants.filter((p: any) => !results.some((r) => r.ok && r.item_id === p.item_id)), ...results.filter((r) => r.ok).map((r) => ({ ...r, granted_at: new Date().toISOString(), granted_by: by }))];
    await prisma.integrationSettings.upsert({ where: { key: "sharepoint" }, create: { key: "sharepoint", config: { grants, last_result: results, last_run: new Date().toISOString() } }, update: { config: { grants, last_result: results, last_run: new Date().toISOString() } } });
    const okCount = results.filter((r) => r.ok).length;
    const res = back(`${okCount} of ${results.length} folder${results.length === 1 ? "" : "s"} granted.`);
    res.cookies.set("sp_grant", "", { path: "/api/sharepoint/grant", maxAge: 0 });
    return res;
  } catch (e: any) {
    console.error("SharePoint grant failed:", e);
    return back(`Grant failed: ${e?.message || "unknown error"}`);
  }
}
