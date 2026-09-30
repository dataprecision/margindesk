#!/usr/bin/env node
// Pulls a read-only identity snapshot (Microsoft 365 users incl. recently
// deleted, Zoho People employees) into ~/identity-snapshots/<YYYY-MM-DD>/.
// Only identity fields are kept (no bank, phone or personal details).
// Microsoft purges deleted mailboxes after 30 days, so this runs every
// 15 days (see scripts/identity/refresh-identity.sh) to capture leavers'
// addresses before they disappear.
//
// Run from frontend/:  node scripts/identity/refresh-identity-snapshot.mjs [outRoot]

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const outRoot = process.argv[2] ?? path.join(os.homedir(), "identity-snapshots");
const out = path.join(outRoot, new Date().toISOString().slice(0, 10));
mkdirSync(out, { recursive: true, mode: 0o700 });

const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter((l) => /^(ZOHO_|AZURE_AD_)/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));

// ---------- Microsoft 365 ----------
const mt = await (await fetch(`https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`, {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: env.AZURE_AD_CLIENT_ID, client_secret: env.AZURE_AD_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }) })).json();
if (!mt.access_token) throw new Error(`Graph token failed: ${JSON.stringify(mt).slice(0, 200)}`);
const SEL = "id,displayName,givenName,surname,mail,userPrincipalName,mailNickname,proxyAddresses,otherMails,employeeId,employeeHireDate,employeeLeaveDateTime,accountEnabled,userType,createdDateTime,jobTitle,department,assignedLicenses";
async function graphAll(url) {
  const rows = [];
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${mt.access_token}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(`Graph ${r.status} ${JSON.stringify(j.error)}`);
    rows.push(...j.value); url = j["@odata.nextLink"];
  }
  return rows;
}
const active = await graphAll(`https://graph.microsoft.com/v1.0/users?$top=999&$select=${SEL}`);
const deleted = await graphAll(`https://graph.microsoft.com/v1.0/directory/deletedItems/microsoft.graph.user?$top=999&$select=${SEL},deletedDateTime`);
const m365 = [...active.map((u) => ({ ...u, _state: "active" })), ...deleted.map((u) => ({ ...u, _state: "deleted" }))]
  .map(({ assignedLicenses, ...u }) => ({ ...u, licensed: (assignedLicenses ?? []).length > 0 }));

// ---------- Zoho People (token refreshed in memory, never written back) ----------
const prisma = new PrismaClient();
const settings = await prisma.integrationSettings.findUnique({ where: { key: "zoho_people" } });
await prisma.$disconnect();
const region = (env.ZOHO_REGION || "IN").toUpperCase();
const tld = region === "IN" ? "in" : region === "EU" ? "eu" : "com";
const zt = await (await fetch(`https://accounts.zoho.${tld}/oauth/v2/token`, {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ refresh_token: settings.config.refresh_token, client_id: env.ZOHO_CLIENT_ID,
    client_secret: env.ZOHO_CLIENT_SECRET, grant_type: "refresh_token" }) })).json();
if (!zt.access_token) throw new Error(`Zoho token failed: ${JSON.stringify(zt).slice(0, 200)}`);
const KEEP = ["EmployeeID", "EmailID", "FirstName", "LastName", "Employeestatus", "Employee_type", "Dateofjoining", "Dateofexit",
  "Reporting_To.MailID", "Reporting_To", "Reporting_To.ID", "Department", "Designation", "ZUID", "Zoho_ID", "LocationName", "AddedTime", "ModifiedTime"];
const zoho = [];
for (let sIndex = 1; ; sIndex += 200) {
  const r = await fetch(`https://people.zoho.${tld}/people/api/forms/employee/getRecords?sIndex=${sIndex}&limit=200`,
    { headers: { Authorization: `Zoho-oauthtoken ${zt.access_token}` } });
  const res = (await r.json())?.response?.result;
  if (!Array.isArray(res) || res.length === 0) break;
  for (const rec of res) {
    const [recordId, rows] = Object.entries(rec)[0];
    const kept = { record_id: recordId };
    for (const f of KEEP) if (f in rows[0]) kept[f] = rows[0][f];
    zoho.push(kept);
  }
  if (res.length < 200) break;
}
if (zoho.length < 100) throw new Error(`Zoho returned only ${zoho.length} employees — refusing to write a partial snapshot`);

for (const [name, data] of [["m365_users.json", m365], ["zoho_employees.json", zoho]]) {
  const f = path.join(out, name);
  writeFileSync(f, JSON.stringify(data, null, 1));
  chmodSync(f, 0o600);
}
console.log(`Snapshot ${out}: M365 ${active.length} active + ${deleted.length} deleted, Zoho ${zoho.length} employees`);
console.log(`SNAPSHOT_DIR=${out}`);
