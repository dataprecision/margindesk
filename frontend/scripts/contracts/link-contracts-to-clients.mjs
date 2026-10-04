#!/usr/bin/env node
// Links every contract to its company (Client): by Zoho customer id first,
// then by name; a counterparty with no company at all gets a placeholder row
// (placeholder = true, no Zoho id) that the nightly sync will try to match.
// Also sets the company's business owner to the contract SPOC where none is set.
//
// Run from frontend/:
//   DATABASE_URL=... node scripts/contracts/link-contracts-to-clients.mjs [--apply] [--allow-prod]

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allowProd = args.includes("--allow-prod");
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (apply && dbName === "margindesk_prod" && !allowProd) {
  console.error("Refusing to --apply against margindesk_prod without --allow-prod."); process.exit(1);
}
const norm = (s) => String(s ?? "").toLowerCase().replace(/\b(private|pvt|limited|ltd|llp|inc|pte|co|company|the)\b\.?/g, "").replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");

const prisma = new PrismaClient();
const clients = await prisma.client.findMany({ select: { id: true, name: true, zoho_contact_id: true, owner_person_id: true, placeholder: true } });
const byZoho = new Map(clients.filter((c) => c.zoho_contact_id).map((c) => [c.zoho_contact_id, c]));
const byName = new Map();
for (const c of clients) { const k = norm(c.name); if (k) byName.set(k, [...(byName.get(k) ?? []), c]); }

const contracts = await prisma.contract.findMany({ where: { client_id: null }, select: { id: true, counterparty: true, direction: true, zoho_customer_id: true, spoc_person_id: true, bill_to: true } });
const stats = { byZoho: 0, byName: 0, placeholders: 0, ownersSet: 0, ambiguous: [] };
for (const c of contracts) {
  let client = c.zoho_customer_id ? byZoho.get(c.zoho_customer_id) : null;
  if (client) stats.byZoho++;
  else {
    const hits = byName.get(norm(c.counterparty)) ?? byName.get(norm(c.bill_to)) ?? [];
    if (hits.length === 1) { client = hits[0]; stats.byName++; }
    else if (hits.length > 1) { stats.ambiguous.push([c.counterparty, hits.map((h) => h.name)]); continue; }
  }
  if (!client) {
    stats.placeholders++;
    const data = { name: c.counterparty, placeholder: true, contact_type: c.direction === "vendor" ? "vendor" : c.direction === "nda" ? null : "customer", tags: ["placeholder"] };
    client = apply ? await prisma.client.create({ data, select: { id: true, name: true, zoho_contact_id: true, owner_person_id: true, placeholder: true } }) : { id: `new:${c.id}`, ...data };
    byName.set(norm(client.name), [client]);
  }
  const ownerPatch = !client.owner_person_id && c.spoc_person_id ? { owner_person_id: c.spoc_person_id } : null;
  if (ownerPatch) { stats.ownersSet++; client.owner_person_id = c.spoc_person_id; }
  if (apply) {
    await prisma.contract.update({ where: { id: c.id }, data: { client_id: client.id } });
    if (ownerPatch) await prisma.client.update({ where: { id: client.id }, data: ownerPatch });
  }
}
console.log(`Database: ${dbName}   Mode: ${apply ? "APPLY" : "dry run"}`);
console.log(`Contracts without a company: ${contracts.length}`);
console.log(stats);
await prisma.$disconnect();
