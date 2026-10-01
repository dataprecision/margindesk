#!/usr/bin/env node
// Loads the contract register that was read from SharePoint documents
// (register.json plus one JSON sheet per counterparty) into the Contract tables.
//
// Re-runnable: each contract is keyed by source_key. A contract that a person
// has marked as checked is never overwritten; unchecked ones are refreshed
// (their billing lines and purchase orders are replaced, tasks are kept).
//
// Run from frontend/:
//   DATABASE_URL=... node scripts/contracts/import-register.mjs <registerDir> [--apply] [--allow-prod]

import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const allowProd = args.includes("--allow-prod");
if (!dir) { console.error("usage: import-register.mjs <registerDir> [--apply]"); process.exit(1); }
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (apply && dbName === "margindesk_prod" && !allowProd) {
  console.error("Refusing to --apply against margindesk_prod without --allow-prod."); process.exit(1);
}

const date = (s) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return isNaN(d.getTime()) ? null : d;
};
const text = (v, max = 2000) => (v === null || v === undefined || v === "" ? null : String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, max));
const amount = (s) => (/^[\d,]+(\.\d+)?$/.test(String(s ?? "").trim()) ? Number(String(s).replace(/,/g, "")) : null);
const DIRECTION = { "Customer (DWAO bills)": "customer", "Vendor (DWAO pays)": "vendor", "Customer and vendor": "both", "NDA only": "nda" };

const register = JSON.parse(readFileSync(path.join(dir, "register.json"), "utf8"));

// SPOC per counterparty, from the legal tracker rows the entries were found through
const spocFile = path.join(dir, "_tracker_services_live.json");
const tracker = existsSync(spocFile) ? JSON.parse(readFileSync(spocFile, "utf8")) : {};
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const spocFor = (key, name) => {
  const k = norm(key), n = norm(name);
  for (const [client, rows] of Object.entries(tracker)) {
    const c = norm(client);
    if (c.startsWith(n.slice(0, 8)) || k.startsWith(c.slice(0, 10)) || c.startsWith(k.slice(0, 10))) return rows[0]?.spoc?.trim() || null;
  }
  return null;
};

const prisma = new PrismaClient();
let created = 0, refreshed = 0, skipped = 0, lines = 0, pos = 0;

for (const c of register) {
  const sheetPath = path.join(dir, `${c.key}.json`);
  const sheet = existsSync(sheetPath) ? JSON.parse(readFileSync(sheetPath, "utf8")) : {};
  const poRows = (sheet.purchase_orders ?? []).filter((p) => p && typeof p === "object" && p.po_number);
  const header = {
    counterparty: c.name,
    direction: DIRECTION[c.direction] ?? "customer",
    basis: c.basis,
    bill_to: text(c.bill_to, 500),
    start_date: date(c.start),
    end_date: date(c.end),
    spoc: spocFor(c.key, c.name),
    po_status: text(c.po_status, 200),
    open_questions: (c.open_questions ?? []).map((t) => ({ text: t, resolved: false })),
    documents: sheet.documents ?? null,
    loaded_at: new Date(),
  };
  const lineRows = c.lines.map((l, i) => ({
    service: l.service, billing_type: l.type, amount_text: l.amount || "not stated", amount: amount(l.amount),
    unit: text(l.unit, 200), currency: l.currency || "INR", start_date: date(l.start), end_date: date(l.end),
    date_note: text([l.start_note, l.end_note].filter(Boolean).join(" / "), 300),
    read_from: l.basis, source_document: text(l.source, 600), quote: text(l.quote, 800), extra_rule: text(l.extra, 600), sort_order: i,
  }));
  const poData = poRows.map((p) => ({
    po_number: String(p.po_number).slice(0, 120), po_date: date(p.date), valid_from: date(p.valid_from), valid_to: date(p.valid_to),
    value_text: text(p.value, 300), hours_text: text(p.hours_or_quantity, 300), rate_text: text(p.rate, 300), covers: text(p.covers, 600), document: text(p.uri, 600),
  }));

  const existing = await prisma.contract.findUnique({ where: { source_key: c.key }, select: { id: true, verified: true } });
  if (existing?.verified) { skipped++; console.log(`  kept (already checked): ${c.name}`); continue; }
  lines += lineRows.length; pos += poData.length;
  if (!apply) { existing ? refreshed++ : created++; continue; }

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.contractLine.deleteMany({ where: { contract_id: existing.id } });
      await tx.contractPurchaseOrder.deleteMany({ where: { contract_id: existing.id } });
      await tx.contract.update({ where: { id: existing.id }, data: { ...header, lines: { create: lineRows }, purchase_orders: { create: poData } } });
      refreshed++;
    } else {
      await tx.contract.create({ data: { ...header, source_key: c.key, lines: { create: lineRows }, purchase_orders: { create: poData } } });
      created++;
    }
  });
}

console.log(`Database: ${dbName}   Mode: ${apply ? "APPLY" : "dry run"}`);
console.log(`Contracts: ${created} new, ${refreshed} refreshed, ${skipped} kept as checked | billing lines: ${lines} | purchase orders: ${pos}`);
if (!apply) console.log("Dry run only. Re-run with --apply.");
await prisma.$disconnect();
