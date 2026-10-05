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

async function graph(path: string) {
  const token = await appToken();
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
export async function resolveLink(webUrl: string): Promise<{ drive_id: string; path: string; name: string; is_folder: boolean; web_url: string }> {
  const encoded = "u!" + Buffer.from(webUrl).toString("base64").replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
  const it = await graph(`shares/${encoded}/driveItem?$select=id,name,webUrl,folder,parentReference`);
  const parentPath = String(it.parentReference?.path ?? "").replace(/^\/drives\/[^/]+\/root:?/, "");
  return { drive_id: it.parentReference?.driveId, path: `${parentPath}/${it.name}`.replace(/^\/+/, ""), name: it.name, is_folder: !!it.folder, web_url: it.webUrl };
}
