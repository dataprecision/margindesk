#!/usr/bin/env node
// Loads the reselling plan built by build_reselling_plan.py (revenue from
// Zoho Books invoice lines, OEM cost from Google bills) into ResellingInvoice
// and ResellingBillAllocation.
//
// - Only reselling data is written. Existing projects, their configs, pod
//   mappings, bills and bill line items are never modified.
// - A customer's existing reselling project is reused for GA4 360; otherwise a
//   new "<Customer> - <Product> (Reselling)" project is created with no pod
//   mapping.
// - Re-runnable: rows are keyed by project + product + month. A row a person
//   created or edited (notes not starting with the auto tag) is never touched.
//
// Run from frontend/:
//   DATABASE_URL=... node scripts/reselling/import-reselling-plan.mjs <plan.json> [--apply] [--allow-prod]

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const allowProd = args.includes("--allow-prod");
if (!file) { console.error("usage: import-reselling-plan.mjs <plan.json> [--apply]"); process.exit(1); }
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (apply && dbName === "margindesk_prod" && !allowProd) {
  console.error("Refusing to --apply against margindesk_prod without --allow-prod."); process.exit(1);
}

const plan = JSON.parse(readFileSync(file, "utf8"));
const prisma = new PrismaClient();
const AUTO = "Auto-loaded from Zoho Books";
// GA4 360 licences go under the product that already exists for them.
const PRODUCT_NAME = { "GA4 360": "GA4", DV360: "DV360", CM360: "CM360" };
const shortName = (s) =>
  s.replace(/\b(private|pvt|limited|ltd|llp|inc|pte|p\.c|co)\b\.?/gi, "").replace(/\s+/g, " ").replace(/[\s.,]+$/g, "").replace(/\s+,/g, ",").trim()
    .replace(/[A-Za-z]{5,}/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()); // short words keep their case (PB, HDFC, IIFL)
const clamp = (n) => Math.max(-999.99, Math.min(999.99, n));

const stats = { productsCreated: 0, projectsReused: 0, projectsCreated: 0, created: 0, refreshed: 0, keptManual: 0, allocations: 0, noClient: [] };

const productId = {};
for (const [label, name] of Object.entries(PRODUCT_NAME)) {
  let p = await prisma.product.findUnique({ where: { name }, select: { id: true } });
  if (!p) {
    stats.productsCreated++;
    p = apply
      ? await prisma.product.create({ data: { name, type: "reselling", is_predefined: true, description: `Google ${label} reselling` }, select: { id: true } })
      : { id: `new:${name}` };
  }
  productId[label] = p.id;
}

const projectIdFor = new Map(); // customer|product -> project id
async function projectFor(inv) {
  const key = `${inv.zoho_customer_id}|${inv.product}`;
  if (projectIdFor.has(key)) return projectIdFor.get(key);
  let id = null;
  const client = await prisma.client.findUnique({ where: { zoho_contact_id: inv.zoho_customer_id }, select: { id: true } });
  if (!client) {
    if (!stats.noClient.includes(inv.customer)) stats.noClient.push(inv.customer);
  } else {
    const name = `${shortName(inv.customer)} - ${inv.product} (Reselling)`;
    const reselling = inv.product === "GA4 360"
      ? await prisma.project.findMany({ where: { client_id: client.id, config: { project_type: "reselling" }, NOT: { name: { endsWith: "(Reselling)" } } }, select: { id: true } })
      : [];
    const existing = reselling.length === 1 ? reselling[0] : await prisma.project.findFirst({ where: { client_id: client.id, name }, select: { id: true } });
    if (existing) {
      id = existing.id;
      if (reselling.length === 1) stats.projectsReused++;
    } else {
      stats.projectsCreated++;
      id = apply
        ? (await prisma.project.create({
            data: {
              client_id: client.id, name, status: "active", start_date: new Date("2026-04-01T00:00:00.000Z"),
              config: { create: { project_type: "reselling", billing_model: "time_and_material", rate_type: "blended", product_id: productId[inv.product] } },
            },
            select: { id: true },
          })).id
        : `new:${name}`;
    }
  }
  projectIdFor.set(key, id);
  return id;
}

for (const inv of plan.invoices) {
  const project_id = await projectFor(inv);
  if (!project_id) continue;
  const product_id = productId[inv.product];
  const period_month = new Date(`${inv.period_month}-01T00:00:00.000Z`);
  const oem = inv.allocations.reduce((s, a) => s + a.amount, 0);
  const profit = inv.amount - oem;
  const data = {
    project_id, product_id, period_month,
    invoice_number: inv.invoice_numbers.join(", "),
    invoice_date: new Date(`${inv.invoice_date}T00:00:00.000Z`),
    invoice_amount: inv.amount, total_oem_cost: oem, total_cost: oem, gross_profit: profit,
    profit_margin_pct: inv.amount > 0 ? clamp((profit / inv.amount) * 100) : 0,
    notes: `${AUTO} (FY 2026-27, pre-tax INR).` + (inv.month_corrected ? " Service month on the invoice had the wrong year; taken from the line description." : ""),
  };
  const existing = project_id.startsWith("new:") ? null
    : await prisma.resellingInvoice.findFirst({ where: { project_id, product_id, period_month }, select: { id: true, notes: true } });
  if (existing && !(existing.notes ?? "").startsWith(AUTO)) { stats.keptManual++; continue; }
  existing ? stats.refreshed++ : stats.created++;
  stats.allocations += inv.allocations.length;
  if (!apply) continue;
  await prisma.$transaction(async (tx) => {
    const row = existing
      ? await tx.resellingInvoice.update({ where: { id: existing.id }, data, select: { id: true } })
      : await tx.resellingInvoice.create({ data, select: { id: true } });
    await tx.resellingBillAllocation.deleteMany({ where: { reselling_invoice_id: row.id, notes: { startsWith: AUTO } } });
    for (const a of inv.allocations) {
      await tx.resellingBillAllocation.create({
        data: {
          reselling_invoice_id: row.id, bill_id: a.md_bill_id, product_id,
          allocation_percentage: a.pct, allocated_amount: a.amount,
          notes: `${AUTO}: Google bill ${a.bill_number}` + (a.note ? `, ${a.note}` : ""),
        },
      });
    }
  });
}

console.log(`${apply ? "APPLIED to" : "DRY RUN against"} ${dbName}`);
console.log(stats);
await prisma.$disconnect();
