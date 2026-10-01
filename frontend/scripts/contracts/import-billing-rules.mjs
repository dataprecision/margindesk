#!/usr/bin/env node
// Loads billing rules derived from Zoho Books invoices (_rules_to_load.json,
// produced by ~/billing-assessment/derive_rules.py) as *proposed* rules.
//
// - A customer already in the register gets its rules attached to that contract.
// - A customer not yet in the register gets a contract marked
//   "Not yet read: derived from invoices", so the gap stays visible.
// - Re-runnable: rules are keyed by auto_key. A rule a person has confirmed or
//   retired is never touched; proposed ones are refreshed.
//
// Run from frontend/:
//   DATABASE_URL=... node scripts/contracts/import-billing-rules.mjs <file> [--apply] [--allow-prod]

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const allowProd = args.includes("--allow-prod");
if (!file) { console.error("usage: import-billing-rules.mjs <rules.json> [--apply]"); process.exit(1); }
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (apply && dbName === "margindesk_prod" && !allowProd) {
  console.error("Refusing to --apply against margindesk_prod without --allow-prod."); process.exit(1);
}

const rules = JSON.parse(readFileSync(file, "utf8"));
const prisma = new PrismaClient();
const NEW_BASIS = "Not yet read: derived from invoices";
const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(Ltd|Pvt|Llp|Inc)\b\.?/g, (m) => m).trim();

const contractIdFor = new Map(); // zoho customer id -> contract id
const stats = { attached: 0, newContracts: 0, created: 0, refreshed: 0, keptConfirmed: 0 };

for (const r of rules) {
  let contractId = contractIdFor.get(r.customer_id);
  if (!contractId) {
    let contract =
      (await prisma.contract.findFirst({ where: { zoho_customer_id: r.customer_id }, select: { id: true } })) ??
      (r.register_key ? await prisma.contract.findUnique({ where: { source_key: r.register_key }, select: { id: true } }) : null);
    if (contract) {
      stats.attached++;
      if (apply) await prisma.contract.update({ where: { id: contract.id }, data: { zoho_customer_id: r.customer_id } }).catch(() => {});
    } else {
      stats.newContracts++;
      if (apply) {
        contract = await prisma.contract.create({
          data: { counterparty: titleCase(r.customer), basis: NEW_BASIS, direction: "customer", bill_to: r.customer, zoho_customer_id: r.customer_id,
                  source_key: `zoho:${r.customer_id}`, spoc: r.team || null, loaded_at: new Date(),
                  open_questions: [{ text: "The agreement and purchase orders for this customer have not been read yet. Rules below come from invoices only.", resolved: false }] },
          select: { id: true },
        });
      }
    }
    contractId = contract?.id ?? `new:${r.customer_id}`;
    contractIdFor.set(r.customer_id, contractId);
  }

  const existing = await prisma.billingRule.findUnique({ where: { auto_key: r.auto_key }, select: { id: true, status: true } });
  if (existing && existing.status !== "proposed") { stats.keptConfirmed++; continue; }
  const data = { service: r.service, label: r.label, family: r.family, shape: r.shape, params: r.params, period: r.period, currency: r.currency,
                 fx_rate: r.fx_rate ?? null, source: "invoices", confidence: r.confidence, evidence: r.evidence };
  if (existing) { stats.refreshed++; if (apply) await prisma.billingRule.update({ where: { id: existing.id }, data }); }
  else { stats.created++; if (apply) await prisma.billingRule.create({ data: { ...data, contract_id: contractId, auto_key: r.auto_key } }); }
}

console.log(`Database: ${dbName}   Mode: ${apply ? "APPLY" : "dry run"}`);
console.log(`Customers: ${stats.attached} attached to existing contracts, ${stats.newContracts} new contracts`);
console.log(`Rules: ${stats.created} new, ${stats.refreshed} refreshed, ${stats.keptConfirmed} left alone (already confirmed or retired)`);
if (!apply) console.log("Dry run only. Re-run with --apply.");
await prisma.$disconnect();
