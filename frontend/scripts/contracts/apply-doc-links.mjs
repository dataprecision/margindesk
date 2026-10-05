#!/usr/bin/env node
// Replaces the internal SharePoint ids the reading recorded on contracts and
// purchase orders with the files' web links, resolved read-only by search
// (~/billing-assessment/contracts_v2/_doc_weburls_part*.json). The original
// id is kept beside the link. Entries with no resolved link are left as they
// are. Links a person attached by hand are never touched.
//
// Run from frontend/:
//   DATABASE_URL=... node scripts/contracts/apply-doc-links.mjs [--apply] [--allow-prod]

import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "/home/ubuntu/billing-assessment/contracts_v2";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allowProd = args.includes("--allow-prod");
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (apply && dbName === "margindesk_prod" && !allowProd) {
  console.error("Refusing to --apply against margindesk_prod without --allow-prod."); process.exit(1);
}

const links = {};
for (const f of readdirSync(DIR).filter((f) => /^_doc_weburls_part\d+\.json$/.test(f))) {
  for (const [id, v] of Object.entries(JSON.parse(readFileSync(join(DIR, f), "utf8")))) if (v?.webUrl) links[id] = v.webUrl;
}
const itemId = (uri) => (typeof uri === "string" && uri.match(/^file:\/\/\/[^/]+\/(01[A-Z0-9]{30,})$/)?.[1]) || null;

const prisma = new PrismaClient();
const stats = { resolved_links: Object.keys(links).length, contracts_changed: 0, documents_linked: 0, documents_unresolved: 0, pos_linked: 0, pos_unresolved: 0 };

for (const c of await prisma.contract.findMany({ where: { documents: { not: null } }, select: { id: true, documents: true } })) {
  const docs = Array.isArray(c.documents) ? c.documents : [];
  let changed = false;
  const next = docs.map((d) => {
    const id = itemId(d?.uri);
    if (!id) return d;
    if (!links[id]) { stats.documents_unresolved++; return d; }
    stats.documents_linked++; changed = true;
    return { ...d, uri: links[id], sharepoint_item: d.uri };
  });
  if (changed) { stats.contracts_changed++; if (apply) await prisma.contract.update({ where: { id: c.id }, data: { documents: next } }); }
}
for (const p of await prisma.contractPurchaseOrder.findMany({ where: { document: { startsWith: "file:///" } }, select: { id: true, document: true } })) {
  const id = itemId(p.document);
  if (!id || !links[id]) { stats.pos_unresolved++; continue; }
  stats.pos_linked++;
  if (apply) await prisma.contractPurchaseOrder.update({ where: { id: p.id }, data: { document: links[id], notes: undefined } });
}
console.log(`Database: ${dbName}   Mode: ${apply ? "APPLY" : "dry run"}`);
console.log(stats);
await prisma.$disconnect();
