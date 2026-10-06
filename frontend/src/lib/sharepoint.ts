// Read-only SharePoint access for MarginDesk through Microsoft Graph, using
// the app registration's client credentials. Needs the admin to grant the app
// read access to the Accounts and Legal sites (Sites.Selected, or Sites.Read.All).
// Nothing here writes to SharePoint.

export interface SpFolder { label: string; drive_id: string; path: string; web_url?: string | null }
export interface SpFile { id: string; name: string; web_url: string; size: number | null; modified: string | null; folder: string; is_folder: boolean }

// The two document libraries the contract reading used.
export const KNOWN_DRIVES: Record<string, { label: string; site: string }> = {
  "b!EiqS9u0PnkGt_QlRxWSYXbG0_hFTBItFluAwK9BpmaUwj8ni4Wh-QZ3weybkVnPJ": { label: "Accounts", site: "Accounts" },
  "b!rPOXTQN12kCZx0PoXqP4apimujSWaB1CiGjScYGFY5JsWyzCUKKQRpMvr8R-6Uy_": { label: "Legal", site: "Legal and Agreements" },
};

let cached: { token: string; expires: number } | null = null;

async function appToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const tenant = process.env.AZURE_AD_TENANT_ID, id = process.env.AZURE_AD_CLIENT_ID, secret = process.env.AZURE_AD_CLIENT_SECRET;
  if (!tenant || !id || !secret) throw new Error("Azure AD app registration is not configured");
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Could not get a Graph token: ${data.error_description ?? res.status}`);
  cached = { token: data.access_token, expires: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cached.token;
}

async function graph(path: string, token?: string) {
  token = token ?? (await appToken());
  const res = await fetch(`https://graph.microsoft.com/v1.0/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 403 || res.status === 401) throw new SharePointAccessError();
  if (!res.ok) throw new Error(`Graph ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export class SharePointAccessError extends Error {
  constructor() { super("MarginDesk has no read access to SharePoint yet. The Microsoft 365 admin must grant the app read access to the Accounts and Legal sites."); }
}

/** Whether the admin has granted read access: tries to read the root of each known drive. */
export async function sharePointStatus(): Promise<{ connected: boolean; drives: Record<string, boolean>; message?: string }> {
  const drives: Record<string, boolean> = {};
  let anyOk = false, message: string | undefined;
  for (const driveId of Object.keys(KNOWN_DRIVES)) {
    try { await graph(`drives/${driveId}/root?$select=id`); drives[driveId] = true; anyOk = true; }
    catch (e: any) { drives[driveId] = false; message = e?.message; }
  }
  return { connected: anyOk, drives, message: anyOk ? undefined : message };
}

const enc = (p: string) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

/** Files directly in a folder and one level of subfolders (year folders are common). */
export async function listFolder(folder: SpFolder, depth = 1): Promise<SpFile[]> {
  const out: SpFile[] = [];
  const walk = async (path: string, label: string, level: number) => {
    const data = await graph(`drives/${folder.drive_id}/root:/${enc(path)}:/children?$top=200&$select=id,name,webUrl,size,lastModifiedDateTime,folder,file`);
    for (const it of data.value ?? []) {
      const isFolder = !!it.folder;
      out.push({ id: it.id, name: it.name, web_url: it.webUrl, size: it.size ?? null, modified: it.lastModifiedDateTime ?? null, folder: label, is_folder: isFolder });
      if (isFolder && level < depth) await walk(`${path}/${it.name}`, `${label}/${it.name}`, level + 1);
    }
  };
  await walk(folder.path, folder.label, 0);
  return out;
}

/** Turn a pasted SharePoint folder or file link into the drive id and path MarginDesk stores. */
export async function resolveLink(webUrl: string, token?: string): Promise<{ drive_id: string; item_id: string; path: string; name: string; is_folder: boolean; web_url: string }> {
  const encoded = "u!" + Buffer.from(webUrl).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  const it = await graph(`shares/${encoded}/driveItem?$select=id,name,webUrl,folder,parentReference`, token);
  const parentPath = String(it.parentReference?.path ?? "").replace(/^\/drives\/[^/]+\/root:?/, "");
  return { drive_id: it.parentReference?.driveId, item_id: it.id, path: `${parentPath}/${it.name}`.replace(/^\/+/, ""), name: it.name, is_folder: !!it.folder, web_url: it.webUrl };
}

/** Can the app (its own identity) read this folder? */
export async function canRead(driveId: string, itemId: string): Promise<boolean> {
  try { await graph(`drives/${driveId}/items/${itemId}?$select=id`); return true; } catch { return false; }
}

// The folders the contract register relies on, offered by default on the Settings page.
export const DEFAULT_FOLDERS = [
  { label: "Accounts · Agreements", web_url: "https://dwao.sharepoint.com/sites/Accounts/Shared Documents/Agreements", drive_id: "b!EiqS9u0PnkGt_QlRxWSYXbG0_hFTBItFluAwK9BpmaUwj8ni4Wh-QZ3weybkVnPJ", item_id: "01TBPA225MOGTYMJ3J5NELKNSW6OPPSIJI" },
  { label: "Accounts · Workflow / PO Received", web_url: "https://dwao.sharepoint.com/sites/Accounts/Shared Documents/Workflow/PO Received", drive_id: "b!EiqS9u0PnkGt_QlRxWSYXbG0_hFTBItFluAwK9BpmaUwj8ni4Wh-QZ3weybkVnPJ", item_id: "01TBPA22YN7PL5UUS6VBFY7Y3LSTTMOXXE" },
];

/**
 * Grant the app read on one folder, acting as the signed-in admin (delegated
 * token used once, never stored). This is the Graph call an admin would
 * otherwise run by hand in Graph Explorer.
 */
export async function grantAppRead(userToken: string, driveId: string, itemId: string): Promise<{ ok: boolean; error?: string }> {
  const appId = process.env.AZURE_AD_CLIENT_ID!;
  const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ roles: ["read"], grantedTo: { application: { id: appId, displayName: "MarginDesk" } } }),
  });
  if (res.ok) return { ok: true };
  const text = (await res.text()).slice(0, 300);
  return { ok: false, error: `HTTP ${res.status}: ${text}` };
}

/**
 * The current version of each linked document, for freezing at approval:
 * SharePoint's last-modified time and eTag. Best effort: a link MarginDesk
 * cannot read, or any Graph error, leaves that document without a version.
 */
export async function documentVersions(webUrls: string[]): Promise<Record<string, { modified?: string | null; etag?: string | null; version_checked_at: string }>> {
  const out: Record<string, { modified?: string | null; etag?: string | null; version_checked_at: string }> = {};
  const now = new Date().toISOString();
  await Promise.all(Array.from(new Set(webUrls)).map(async (u) => {
    try {
      const encoded = "u!" + Buffer.from(u).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
      const it = await Promise.race([graph(`shares/${encoded}/driveItem?$select=id,lastModifiedDateTime,eTag`), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000))]);
      out[u] = { modified: it.lastModifiedDateTime ?? null, etag: it.eTag ?? null, version_checked_at: now };
    } catch { out[u] = { version_checked_at: now }; }
  }));
  return out;
}
