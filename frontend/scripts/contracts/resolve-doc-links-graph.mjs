#!/usr/bin/env node
// Looks up recorded SharePoint item ids directly through Graph (read-only, the
// app's own access) and writes web links for the ones search could not find.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = "/home/ubuntu/billing-assessment/contracts_v2";
const docs = JSON.parse(readFileSync(join(DIR, "_docs_to_resolve.json"), "utf8"));
const known = {};
for (const f of readdirSync(DIR).filter((f) => /^_doc_weburls_part\d+\.json$/.test(f))) for (const [id, v] of Object.entries(JSON.parse(readFileSync(join(DIR, f), "utf8")))) if (v?.webUrl) known[id] = v.webUrl;
const tok = await (await fetch(`https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.AZURE_AD_CLIENT_ID, client_secret: process.env.AZURE_AD_CLIENT_SECRET, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }) })).json();
const out = {}; let ok = 0, miss = 0;
for (const d of docs) {
  if (known[d.item_id]) continue;
  const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${d.drive_id}/items/${d.item_id}?$select=id,name,webUrl,folder`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
  if (res.status === 429) { await new Promise((r) => setTimeout(r, 30000)); continue; }
  const j = await res.json();
  if (res.ok && j.webUrl) { out[d.item_id] = { webUrl: j.webUrl, name: d.name, matched_name: j.name, note: "resolved by id via Graph" + (j.folder ? " (folder)" : "") }; ok++; }
  else { out[d.item_id] = { webUrl: null, name: d.name, matched_name: null, note: `Graph: ${j.error?.code ?? res.status}` }; miss++; }
}
writeFileSync(join(DIR, "_doc_weburls_part5.json"), JSON.stringify(out, null, 1));
console.log({ tried: ok + miss, resolved: ok, unresolved: miss });
