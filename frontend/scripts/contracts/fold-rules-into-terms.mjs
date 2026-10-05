#!/usr/bin/env node
// 1. Folds each contract-derived billing rule into the term it describes
//    (same contract, same position or same service), creating the term where
//    none exists, so every term carries its own billing shape. Invoice-derived
//    rules become evidence on the matching term. The BillingRule rows are left
//    in place (they are the audit trail) and no longer drive anything.
// 2. Creates organisation-level Agreements (MSA, NDA, framework) per company
//    from the documents the reading classified, with the contract's term dates
//    on the MSA, and links each contract to its MSA.
//
// Re-runnable. Terms a person already confirmed keep their shape.
// Run from frontend/:
//   DATABASE_URL=... node scripts/contracts/fold-rules-into-terms.mjs [--apply] [--allow-prod]

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allowProd = args.includes("--allow-prod");
const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (apply && dbName === "margindesk_prod" && !allowProd) {
  console.error("Refusing to --apply against margindesk_prod without --allow-prod."); process.exit(1);
}
const prisma = new PrismaClient();
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const idx = (auto_key) => { const m = String(auto_key ?? "").match(/^contract:[^:]+:(\d+):/); return m ? Number(m[1]) : null; };
const BILLING_TYPE = { fixed: (r) => (r.period === "one-time" ? "One-time fee" : "Fixed monthly fee"), quantity_rate: (r) => (r.params?.unit === "hour" ? "Hourly rate" : /person|week/.test(r.params?.unit ?? "") ? "Per person / FTE" : "Rate card"), bundle: () => "Hours bundle", bands: () => "Usage tiers", percent_of_base: () => "Percent of spend", pass_through: () => "Other", milestone: () => "Milestone", manual: () => "Other" };
const money = (n, cur) => `${cur ?? "INR"} ${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
function amountText(r) {
  const p = r.params ?? {}, cur = r.currency ?? "INR";
  switch (r.shape) {
    case "fixed": return p.amount != null ? `${money(p.amount, cur)} per ${r.period === "one-time" ? "engagement" : (r.period ?? "month").replace("ly", "")}` : "amount not stated";
    case "quantity_rate": return p.rate != null ? `${money(p.rate, cur)} per ${p.unit ?? "unit"}` : "rate not stated";
    case "bundle": return `${p.fee != null ? money(p.fee, cur) : "fee not stated"} for ${p.included ?? "?"} ${p.unit ?? "units"}${p.overage_rate != null ? `, then ${money(p.overage_rate, cur)} each` : ""}`;
    case "bands": return (p.bands ?? []).map((b) => `${b.rate}${p.band_type === "percent of amount" ? "%" : ""} up to ${b.up_to ?? "no limit"}`).join("; ");
    case "percent_of_base": return `${p.percent ?? "?"}% of ${p.base ?? "base"}${p.minimum != null ? `, minimum ${money(p.minimum, cur)}` : ""}`;
    case "pass_through": return `${p.base ?? "cost"} at actuals${p.markup_pct ? ` plus ${p.markup_pct}%` : ""}`;
    case "milestone": return `${p.amount != null ? money(p.amount, cur) : "amount not stated"} when ${p.milestone ?? "reached"}`;
    default: return String(p.reason ?? "see the document").slice(0, 300);
  }
}

const stats = { contracts: 0, folded_by_position: 0, folded_by_service: 0, terms_created: 0, kept_confirmed: 0, invoice_evidence: 0, terms_without_shape: 0, agreements_created: 0, agreements_reused: 0, contracts_linked: 0, no_client: 0 };
const contracts = await prisma.contract.findMany({ include: { lines: { orderBy: { sort_order: "asc" } }, billing_rules: { where: { status: { not: "retired" } } }, client: { select: { id: true } } } });

for (const c of contracts) {
  stats.contracts++;
  const fromContract = c.billing_rules.filter((r) => r.source === "contract");
  const fromInvoices = c.billing_rules.filter((r) => r.source === "invoices");
  const taken = new Set();
  const lineFor = (r) => {
    const i = idx(r.auto_key);
    if (i != null) { const byPos = c.lines[i]; if (byPos && !taken.has(byPos.id) && norm(byPos.service) === norm(r.service)) return [byPos, "position"]; }
    const bySvc = c.lines.find((l) => !taken.has(l.id) && norm(l.service) === norm(r.service));
    if (bySvc) return [bySvc, "service"];
    const loose = c.lines.find((l) => !taken.has(l.id) && (norm(l.service).startsWith(norm(r.service).slice(0, 25)) || norm(r.service).startsWith(norm(l.service).slice(0, 25))));
    return loose ? [loose, "service"] : [null, null];
  };
  for (const r of fromContract) {
    let [line, how] = lineFor(r);
    const shapeData = { shape: r.shape, params: r.params ?? {}, period: r.period, fx_rate: r.fx_rate, input_needed: r.evidence?.input_needed ?? null, advance_or_arrears: r.evidence?.advance_or_arrears ?? null, billing_rule_id: r.id, rule_status: r.status === "confirmed" ? "confirmed" : "proposed", confirmed_by: r.confirmed_by, confirmed_at: r.confirmed_at };
    if (line) {
      taken.add(line.id);
      if (line.rule_status === "confirmed" && line.shape) { stats.kept_confirmed++; continue; }
      how === "position" ? stats.folded_by_position++ : stats.folded_by_service++;
      if (apply) await prisma.contractLine.update({ where: { id: line.id }, data: { ...shapeData, quote: line.quote ?? r.evidence?.quote ?? null, source_document: line.source_document ?? r.evidence?.document ?? null } });
    } else {
      stats.terms_created++;
      const created = apply ? await prisma.contractLine.create({ data: { contract_id: c.id, service: r.service, billing_type: (BILLING_TYPE[r.shape] ?? (() => "Other"))(r), amount_text: amountText(r).slice(0, 500), amount: r.params?.amount ?? r.params?.fee ?? null, unit: r.params?.unit ?? null, currency: r.currency ?? "INR", start_date: r.start_date, end_date: r.end_date, read_from: String(r.evidence?.read_from ?? "Contract").slice(0, 60), source_document: r.evidence?.document ? String(r.evidence.document).slice(0, 300) : null, quote: r.evidence?.quote ?? null, sort_order: c.lines.length + stats.terms_created, ...shapeData } }) : { id: `new:${r.id}`, service: r.service };
      c.lines.push(created); taken.add(created.id);
    }
  }
  // Invoice-derived rules: evidence on the term with the same service.
  for (const r of fromInvoices) {
    const line = c.lines.find((l) => norm(l.service) === norm(r.service)) ?? c.lines.find((l) => norm(l.service).includes(norm(r.service).slice(0, 20)));
    if (!line || String(line.id).startsWith("new:")) continue;
    stats.invoice_evidence++;
    if (apply) await prisma.contractLine.update({ where: { id: line.id }, data: { rule_evidence: { from_invoices: { shape: r.shape, params: r.params, period: r.period, months_billed: r.evidence?.months_billed, last_invoice: r.evidence?.last_invoice, last_amount: r.evidence?.last_amount, last_wording: r.evidence?.last_wording, contract_verdict: r.evidence?.contract_verdict } } } });
  }
  stats.terms_without_shape += c.lines.filter((l) => !l.shape && !taken.has(l.id)).length;

  // Agreements: MSA / NDA / framework documents become company-level rows.
  if (!c.client) { stats.no_client++; continue; }
  const docs = Array.isArray(c.documents) ? c.documents : [];
  const orgDocs = docs.filter((d) => /^(msa|nda|framework|master|agreement)$/i.test(String(d?.type ?? "")) || /\bmsa\b|master service|non.?disclosure|\bnda\b/i.test(String(d?.name ?? "")) && !/addendum|sow|work order|\bpo\b/i.test(String(d?.name ?? "")));
  let msaId = null;
  for (const d of orgDocs) {
    const isNda = /nda|non.?disclosure/i.test(`${d.type} ${d.name}`);
    const kind = isNda ? "NDA" : "MSA";
    const title = String(d.name ?? kind).slice(0, 200);
    let ag = await prisma.agreement.findFirst({ where: { client_id: c.client.id, title }, select: { id: true } });
    if (ag) stats.agreements_reused++;
    else {
      stats.agreements_created++;
      const dated = kind === "MSA" && /agreement/i.test(c.basis ?? "");
      ag = apply ? await prisma.agreement.create({ data: { client_id: c.client.id, kind, title, start_date: dated ? c.start_date : null, end_date: dated ? c.end_date : null, signed: d.signed ?? null, documents: [d], notes: dated ? `Dates taken from the contract "${c.counterparty}" (${c.basis}).` : null }, select: { id: true } }) : { id: `new:${title}` };
    }
    if (kind === "MSA" && !msaId) msaId = ag.id;
  }
  if (msaId && !c.agreement_id) { stats.contracts_linked++; if (apply) await prisma.contract.update({ where: { id: c.id }, data: { agreement_id: msaId } }); }
}
console.log(`Database: ${dbName}   Mode: ${apply ? "APPLY" : "dry run"}`);
console.log(stats);
await prisma.$disconnect();
