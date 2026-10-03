#!/usr/bin/env node
// Loads the second contract reading (~/billing-assessment/contracts_v2, one JSON per
// customer, each checked by a second reader) into the register as "proposed from
// the contract". The owner's rule: contracts first, then estimates.
//
// What it does, per customer file (driven by _load_manifest.json):
//   - finds the register row by Zoho customer id or source key, or creates one;
//   - fills the contract's basis, dates, bill-to and documents (existing values
//     are only overwritten when they came from invoices; a real difference
//     becomes an open pointer instead);
//   - sets the review bucket: clean | open | document_awaited, with its pointers;
//   - creates one billing rule per billed service (source "contract", status
//     proposed), keyed by auto_key so a re-run refreshes rather than duplicates;
//     rules a person has confirmed or retired are never touched;
//   - records the contract's verdict on the invoice-derived rules it matched;
//   - loads purchase orders (matched by number, so nothing is duplicated);
//   - creates terms (ContractLine) only for contracts that have none;
//   - raises one task per contract: "document awaited" or "open pointers".
// Nothing else is written: pods, projects, clients, timesheets and reselling rows
// are not touched.
//
// Run from frontend/:
//   DATABASE_URL=... node scripts/contracts/import-contract-reads.mjs ~/billing-assessment/contracts_v2 [--apply] [--allow-prod]

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const allowProd = args.includes("--allow-prod");
if (!dir) { console.error("usage: import-contract-reads.mjs <contracts_v2 dir> [--apply] [--allow-prod]"); process.exit(1); }
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (apply && dbName === "margindesk_prod" && !allowProd) {
  console.error("Refusing to --apply against margindesk_prod without --allow-prod."); process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(dir, "_load_manifest.json"), "utf8"));
const prisma = new PrismaClient();
const INVOICE_BASIS = "Not yet read: derived from invoices";
const PERIODS = ["weekly", "monthly", "quarterly", "yearly", "one-time"];
const TODAY = new Date();
const DUE = new Date(TODAY.getTime() + 14 * 86_400_000);
const iso = (s) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);
const num = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const sameDay = (a, b) => (a ? a.toISOString().slice(0, 10) : null) === (b ? b.toISOString().slice(0, 10) : null);
const money = (n, cur) => `${cur ?? "INR"} ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** The term as a person would write it, from the shape and its numbers. */
function amountText(l) {
  const p = l.params ?? {}, cur = l.currency ?? "INR", per = l.period ?? "monthly";
  switch (l.shape) {
    case "fixed": return p.amount != null ? `${money(p.amount, cur)} per ${per === "one-time" ? "engagement" : per.replace("ly", "")}${p.person ? ` (${p.person})` : ""}` : "amount not stated";
    case "quantity_rate": return p.rate != null ? `${money(p.rate, cur)} per ${p.unit ?? "unit"}${p.cap ? `, up to ${p.cap}` : ""}` : "rate not stated";
    case "bundle": return `${p.fee != null ? money(p.fee, cur) : "fee not stated"} for ${p.included ?? "?"} ${p.unit ?? "units"}${p.overage_rate != null ? `, then ${money(p.overage_rate, cur)} each` : ""}`;
    case "bands": return `${(p.bands ?? []).map((b) => `${b.rate}${p.band_type === "percent of amount" ? "%" : ""} up to ${b.up_to ?? "no limit"}`).join("; ")}`;
    case "percent_of_base": return `${p.percent ?? "?"}% of ${p.base ?? "base"}${p.minimum != null ? `, minimum ${money(p.minimum, cur)}` : ""}${p.cap != null ? `, maximum ${money(p.cap, cur)}` : ""}`;
    case "pass_through": return `${p.base ?? "cost"} at actuals${p.markup_pct ? ` plus ${p.markup_pct}%` : ""}`;
    case "milestone": return `${p.amount != null ? money(p.amount, cur) : "amount not stated"} when ${p.milestone ?? "the stage is reached"}`;
    default: return String(p.reason ?? "see the document").slice(0, 300);
  }
}
const BILLING_TYPE = { fixed: (l) => (l.period === "one-time" ? "One-time fee" : "Fixed monthly fee"), quantity_rate: (l) => (l.params?.unit === "hour" ? "Hourly rate" : /person|week/.test(l.params?.unit ?? "") ? "Per person / FTE" : "Rate card"), bundle: () => "Hours bundle", bands: () => "Usage tiers", percent_of_base: () => "Percent of spend", pass_through: () => "Other", milestone: () => "Milestone", manual: () => "Other" };

const stats = { contractsUpdated: 0, contractsCreated: 0, rulesCreated: 0, rulesRefreshed: 0, rulesKept: 0, invoiceRulesMarked: 0, posCreated: 0, posUpdated: 0, linesCreated: 0, tasks: 0, pointersFromRegister: 0, byBucket: {} };
const log = (...a) => { if (!apply) console.log("  ", ...a); };

for (const m of manifest) {
  const file = JSON.parse(readFileSync(join(dir, `${m.key}.json`), "utf8"));
  const lines = file.billing_lines ?? [];
  const pointers = m.pointers.map((p) => ({ ...p, resolved: false }));

  // 1. The register row. The primary is the first key; the others are noted.
  let contract = null;
  for (const key of [...m.register_keys, `v2:${m.key}`]) {
    contract = await prisma.contract.findUnique({ where: { source_key: key }, include: { lines: { select: { id: true } }, purchase_orders: true } });
    if (contract) break;
  }
  if (!contract && m.zoho_ids[0]) contract = await prisma.contract.findFirst({ where: { zoho_customer_id: m.zoho_ids[0] }, include: { lines: { select: { id: true } }, purchase_orders: true } });
  const fromInvoicesOnly = contract?.basis?.startsWith(INVOICE_BASIS) ?? true;
  const start = iso(m.start), end = iso(m.end);
  const data = {
    review_bucket: m.bucket, read_file: m.key, read_at: iso(m.read_at?.slice(0, 10)) ?? TODAY,
    documents: m.documents, zoho_customer_id: contract?.zoho_customer_id ?? m.zoho_ids[0] ?? null,
  };
  if (contract) {
    if (fromInvoicesOnly) Object.assign(data, { basis: m.basis ?? contract.basis, start_date: start, end_date: end, bill_to: m.bill_to ?? contract.bill_to });
    else {
      if (contract.basis !== m.basis && m.basis) { pointers.push({ kind: "register", text: `The first reading recorded the basis as "${contract.basis}"; the second reading says "${m.basis}".`, big: false, resolved: false }); stats.pointersFromRegister++; }
      if (!contract.start_date && start) data.start_date = start; else if (start && !sameDay(contract.start_date, start)) { pointers.push({ kind: "register", text: `Start date: register ${contract.start_date?.toISOString().slice(0, 10)}, second reading ${m.start}.`, big: false, resolved: false }); stats.pointersFromRegister++; }
      if (!contract.end_date && end) data.end_date = end; else if (end && !sameDay(contract.end_date, end)) { pointers.push({ kind: "register", text: `End date: register ${contract.end_date?.toISOString().slice(0, 10)}, second reading ${m.end}.`, big: false, resolved: false }); stats.pointersFromRegister++; }
      if (!contract.bill_to && m.bill_to) data.bill_to = m.bill_to;
    }
    if (!contract.spoc && m.team) data.spoc = m.team;
    if (m.stage && contract.stage === "active") data.stage = m.stage;
    const existingQ = Array.isArray(contract.open_questions) ? contract.open_questions : [];
    const known = new Set(existingQ.map((q) => q?.text));
    data.open_questions = [...existingQ, ...m.open_questions.filter((t) => !known.has(t)).map((text) => ({ text, resolved: false }))];
    const existingP = Array.isArray(contract.review_pointers) ? contract.review_pointers : [];
    const resolvedTexts = new Set(existingP.filter((p) => p?.resolved).map((p) => p.text));
    data.review_pointers = pointers.map((p) => (resolvedTexts.has(p.text) ? { ...p, resolved: true } : p));
    if (m.date_note) data.notes = [contract.notes, `Dates as read: ${m.date_note}`].filter(Boolean).join("\n");
    stats.contractsUpdated++;
    if (apply) contract = { ...contract, ...(await prisma.contract.update({ where: { id: contract.id }, data })) };
  } else {
    stats.contractsCreated++;
    const create = {
      counterparty: m.customer, basis: m.basis ?? "Read from documents", direction: "customer", bill_to: m.bill_to ?? m.customer, start_date: start, end_date: end,
      spoc: m.team, stage: m.stage ?? "active", source_key: `v2:${m.key}`, loaded_at: TODAY, notes: m.date_note ? `Dates as read: ${m.date_note}` : null,
      open_questions: m.open_questions.map((text) => ({ text, resolved: false })), review_pointers: pointers, ...data,
    };
    contract = apply ? { ...(await prisma.contract.create({ data: create })), lines: [], purchase_orders: [] } : { id: `new:${m.key}`, lines: [], purchase_orders: [], ...create };
  }
  // A file that covers two bill-to entities: the second register row points at the first.
  for (const key of m.register_keys.slice(1)) {
    const other = await prisma.contract.findUnique({ where: { source_key: key }, select: { id: true, notes: true, counterparty: true } });
    if (!other) continue;
    const note = `Terms for this entity are recorded under "${contract.counterparty ?? m.customer}" (file ${m.key}).`;
    stats.secondaryRows = (stats.secondaryRows ?? 0) + 1;
    if (apply) await prisma.contract.update({ where: { id: other.id }, data: {
      review_bucket: m.bucket, read_file: m.key, read_at: data.read_at, basis: fromInvoicesOnly ? (m.basis ?? undefined) : undefined,
      review_pointers: [{ kind: "register", text: note, big: false, resolved: false }],
      notes: (other.notes ?? "").includes(note) ? other.notes : [other.notes, note].filter(Boolean).join("\n"),
    } });
  }
  stats.byBucket[m.bucket] = (stats.byBucket[m.bucket] ?? 0) + 1;

  // 2. Billing rules from the contract, one per billed service.
  for (const [i, l] of lines.entries()) {
    const auto_key = `contract:${m.key}:${i}:${slug(l.service)}`;
    const period = PERIODS.includes(l.period) ? l.period : l.shape === "milestone" ? "one-time" : "monthly";
    const unclear = Array.isArray(l.unclear) ? l.unclear : [];
    const rule = {
      service: String(l.service ?? "Service").slice(0, 200), label: null, family: null, shape: l.shape, params: l.params ?? {}, period,
      currency: l.currency || "INR", fx_rate: num(l.fx_rate), start_date: iso(l.start), end_date: iso(l.end), source: "contract",
      confidence: l.complete === true ? "high" : "low",
      evidence: { quote: l.quote, document: l.document, page: l.page, read_from: l.read_from, input_needed: l.input_needed, advance_or_arrears: l.advance_or_arrears, rate_steps: l.rate_steps ?? [], unclear, complete: l.complete === true, start_text: iso(l.start) ? null : l.start, end_text: iso(l.end) ? null : l.end },
      notes: unclear.length ? unclear.join("\n").slice(0, 2000) : null,
    };
    const existing = await prisma.billingRule.findUnique({ where: { auto_key }, select: { id: true, status: true } });
    if (existing && existing.status !== "proposed") { stats.rulesKept++; continue; }
    if (existing) { stats.rulesRefreshed++; if (apply) await prisma.billingRule.update({ where: { id: existing.id }, data: rule }); }
    else { stats.rulesCreated++; if (apply) await prisma.billingRule.create({ data: { ...rule, contract_id: contract.id, auto_key } }); }
  }

  // 3. The contract's verdict on the invoice-derived rules it matched (notes only; status untouched).
  for (const x of file.compare_with_invoices ?? []) {
    const key = x.invoice_rule_auto_key;
    const v = String(x.verdict ?? "").toLowerCase();
    if (!key || typeof key !== "string" || !(v.startsWith("agree") || v.includes("differ") || v.includes("silent"))) continue;
    const r = await prisma.billingRule.findUnique({ where: { auto_key: key }, select: { id: true, status: true, evidence: true } });
    if (!r || r.status !== "proposed") continue;
    const verdict = v.startsWith("agree") ? "agrees with the contract" : v.includes("differ") ? "differs from the contract" : "not in the contract";
    stats.invoiceRulesMarked++;
    if (apply) await prisma.billingRule.update({ where: { id: r.id }, data: { notes: `Contract read (${m.key}): ${verdict}. ${x.detail ?? ""}`.slice(0, 2000), evidence: { ...(r.evidence ?? {}), contract_verdict: verdict, contract_file: m.key } } });
  }

  // 4. Purchase orders, matched by number.
  const normPo = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const p of file.purchase_orders ?? []) {
    if (!p.po_number) continue;
    const auto_key = `v2:${m.key}:${normPo(p.po_number)}`;
    const fields = { po_date: iso(p.date), valid_from: iso(p.valid_from), valid_to: iso(p.valid_to), value_text: p.value_text ?? null, hours_text: p.quantity ?? null, rate_text: p.rate ?? null, covers: p.covers ?? null, document: p.uri ?? null, value: num(p.value_number), currency: p.currency ?? null, status: p.status_today ?? null };
    const match = contract.purchase_orders.find((e) => e.auto_key === auto_key) ?? contract.purchase_orders.find((e) => normPo(e.po_number) === normPo(p.po_number));
    if (match) {
      if (String(match.id).startsWith("new:")) continue; // the same PO listed twice in one file
      stats.posUpdated++;
      const upd = { auto_key, value: fields.value, currency: fields.currency, status: fields.status };
      for (const k of ["po_date", "valid_from", "valid_to", "value_text", "hours_text", "rate_text", "covers", "document"]) if (match[k] == null && fields[k] != null) upd[k] = fields[k];
      if (apply) await prisma.contractPurchaseOrder.update({ where: { id: match.id }, data: upd });
    } else {
      stats.posCreated++;
      const created = apply
        ? await prisma.contractPurchaseOrder.create({ data: { contract_id: contract.id, po_number: String(p.po_number).slice(0, 100), auto_key, ...fields } })
        : { id: `new:${auto_key}`, po_number: p.po_number, auto_key };
      contract.purchase_orders.push(created);
    }
  }

  // 5. Terms as written, only where the register has none for this contract.
  if (contract.lines.length === 0) {
    for (const [i, l] of lines.entries()) {
      stats.linesCreated++;
      if (apply) await prisma.contractLine.create({ data: {
        contract_id: contract.id, service: String(l.service ?? "Service").slice(0, 200), billing_type: (BILLING_TYPE[l.shape] ?? (() => "Other"))(l),
        amount_text: amountText(l).slice(0, 500), amount: num(l.params?.amount ?? l.params?.fee ?? null), unit: l.params?.unit ?? null, currency: l.currency || "INR",
        start_date: iso(l.start), end_date: iso(l.end), date_note: iso(l.start) || iso(l.end) || (!l.start && !l.end) ? null : `start ${l.start}, end ${l.end}`,
        read_from: String(l.read_from ?? "Contract").slice(0, 60), source_document: l.document ? String(l.document).slice(0, 300) : null, quote: l.quote ?? null,
        extra_rule: l.input_needed ? `Needs each period: ${l.input_needed}` : null, sort_order: i,
      } });
    }
    contract.lines = lines.map(() => ({}));
  }

  // 6. One task per contract so the work lands on someone's list.
  const blocking = pointers.filter((p) => ["difference", "contract_silent", "incomplete", "unreadable", "register"].includes(p.kind) && !p.resolved);
  const task = m.bucket === "document_awaited"
    ? { auto_key: `document:${contract.id}`, kind: "document", title: `Contract document awaited: ${contract.counterparty ?? m.customer}`, detail: `${m.status_today ?? "no contract in effect"}. Upload the signed agreement, renewal or current PO to the contract folder, then re-check the entry.` }
    : m.bucket === "open"
    ? { auto_key: `review:${contract.id}`, kind: "review", title: `Open pointers to close: ${contract.counterparty ?? m.customer} (${blocking.length})`, detail: blocking.slice(0, 5).map((p) => `- ${p.text}`).join("\n").slice(0, 2000) }
    : null;
  if (task) {
    stats.tasks++;
    if (apply) {
      const t = await prisma.contractTask.findUnique({ where: { auto_key: task.auto_key } });
      if (!t) await prisma.contractTask.create({ data: { ...task, contract_id: contract.id, due_date: DUE, owner: m.team ?? contract.spoc ?? null, created_by: "import-contract-reads" } });
      else if (t.status === "open") await prisma.contractTask.update({ where: { id: t.id }, data: { title: task.title, detail: task.detail } });
    }
  }
}

console.log(`Database: ${dbName}   Mode: ${apply ? "APPLY" : "dry run"}`);
console.log(stats);
if (!apply) console.log("Dry run only. Re-run with --apply.");
await prisma.$disconnect();
