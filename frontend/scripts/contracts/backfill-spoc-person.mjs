#!/usr/bin/env node
// Links each contract's typed SPOC name to a Person. Exact names match on
// their own; known short forms are listed below. Anything ambiguous ("Piyush &
// Vikas", "TCZ") is left unlinked and reported, so a person can pick.
//
// Run from frontend/:
//   DATABASE_URL=... node scripts/contracts/backfill-spoc-person.mjs [--apply] [--allow-prod]

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allowProd = args.includes("--allow-prod");
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (apply && dbName === "margindesk_prod" && !allowProd) {
  console.error("Refusing to --apply against margindesk_prod without --allow-prod."); process.exit(1);
}

// Short forms seen in the register -> the employee's full name.
const ALIASES = {
  "vikas": "Vikas Chander",
  "piyush": "Piyush Agrawal",
  "prabhat sir": "Prabhat Kumar",
  "ketav sir": "Ketav Sharma",
  "shaurabh": "Shaurabh Singh",
  "sowmya": "Sowmya Gnanasekaran",
};
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const prisma = new PrismaClient();
const people = await prisma.person.findMany({ where: { end_date: null }, select: { id: true, name: true } });
const byName = new Map(people.map((p) => [norm(p.name), p]));

const contracts = await prisma.contract.findMany({ where: { spoc_person_id: null, spoc: { not: null } }, select: { id: true, counterparty: true, spoc: true } });
const stats = { linked: 0, unmatched: {} };
for (const c of contracts) {
  const key = norm(c.spoc);
  const person = byName.get(key) ?? byName.get(norm(ALIASES[key] ?? ""));
  if (!person) { stats.unmatched[c.spoc] = (stats.unmatched[c.spoc] ?? 0) + 1; continue; }
  stats.linked++;
  if (apply) await prisma.contract.update({ where: { id: c.id }, data: { spoc_person_id: person.id, spoc: person.name } });
}
console.log(`Database: ${dbName}   Mode: ${apply ? "APPLY" : "dry run"}`);
console.log(`Contracts with a typed SPOC and no person: ${contracts.length}; linked: ${stats.linked}`);
console.log("Left for a person to pick:", stats.unmatched);
await prisma.$disconnect();
