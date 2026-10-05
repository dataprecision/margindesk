import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { isSharePointAdmin } from "@/lib/sharepoint-admin";
import { DEFAULT_FOLDERS, canRead } from "@/lib/sharepoint";

/** GET /api/sharepoint/grants: what the app can read today, and the grants recorded so far. */
export const GET = withRole(["owner"], async (_req: Request, { user }) => {
  if (!isSharePointAdmin(user.email)) return NextResponse.json({ error: "Only the SharePoint admin can see this" }, { status: 403 });
  const settings = await prisma.integrationSettings.findUnique({ where: { key: "sharepoint" } });
  const cfg = (settings?.config as any) ?? {};
  const grants: any[] = Array.isArray(cfg.grants) ? cfg.grants : [];
  const known = [...DEFAULT_FOLDERS, ...grants.filter((g) => !DEFAULT_FOLDERS.some((d) => d.item_id === g.item_id)).map((g) => ({ label: g.label ?? g.path, web_url: g.web_url, drive_id: g.drive_id, item_id: g.item_id }))];
  const folders = [];
  for (const f of known) folders.push({ ...f, readable: await canRead(f.drive_id, f.item_id), granted: grants.find((g) => g.item_id === f.item_id) ?? null });
  return NextResponse.json({ folders, last_result: cfg.last_result ?? null, last_run: cfg.last_run ?? null, app_id: process.env.AZURE_AD_CLIENT_ID, callback_url: `${process.env.NEXTAUTH_URL}/api/sharepoint/grant/callback` });
});
