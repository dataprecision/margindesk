import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { computeRule, missingParams, SHAPE_BY_KEY } from "@/lib/billing/shapes";
import { contractStatus } from "@/lib/contracts/status";

// Draft estimates: what MarginDesk prepares for a contract and a month before
// anything is created in Zoho Books. The point is the readiness check: a
// draft lists every gap (paper, company, rule, input, PO, tax) that a person
// must close before a real estimate can be raised.

type Db = PrismaClient | Prisma.TransactionClient;

export interface Gap { code: string; text: string; blocking: boolean }
export const DRAFT_STATUS = {
  draft: "Gaps to close",
  ready: "Ready for lead sign-off",
  lead_signed: "Signed by lead, finance to check",
  finance_checked: "Checked by finance, ready for Zoho",
  cancelled: "Cancelled",
} as const;
export type DraftStatus = keyof typeof DRAFT_STATUS;
export const DRAFT_STATUS_STYLE: Record<DraftStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  ready: "bg-blue-100 text-blue-800",
  lead_signed: "bg-indigo-100 text-indigo-800",
  finance_checked: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

export const periodStart = (yyyyMm: string) => new Date(`${yyyyMm}-01T00:00:00.000Z`);
const periodEnd = (p: Date) => new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + 1, 0, 23, 59, 59));
const num = (v: unknown) => (v == null ? 0 : Number(v));

/**
 * Which terms drive the draft: every term that has a billing shape and is not
 * retired. "basis" says whether they are all confirmed yet.
 */
function pickRules<T extends { rule_status: string; shape: string | null }>(lines: T[]) {
  const live = lines.filter((r) => r.shape && r.rule_status !== "retired");
  const allConfirmed = live.length > 0 && live.every((r) => r.rule_status === "confirmed");
  return { rules: live, basis: allConfirmed ? ("confirmed" as const) : ("contract" as const) };
}

/** Rules in force for the month, excluding one-off and yearly / quarterly ones (listed as a gap instead). */
function inForce<T extends { period: string; shape: string; start_date: Date | null; end_date: Date | null }>(rules: T[], p: Date) {
  const end = periodEnd(p);
  const monthly = rules.filter((r) => (!r.start_date || r.start_date <= end) && (!r.end_date || r.end_date >= p));
  const included = monthly.filter((r) => r.period === "monthly" || r.period === "weekly" || r.shape === "milestone");
  const skipped = monthly.filter((r) => !included.includes(r));
  return { included, skipped };
}

export interface LineResult { quantity: number | null; rate: number | null; amount: number; explanation: string; missing: string[] }

/** Compute one line from its rule and the month's inputs. */
export function computeLine(shape: string, params: Record<string, any>, inputs: Record<string, any>): LineResult {
  const def = SHAPE_BY_KEY[shape];
  const r = computeRule(shape, params, inputs);
  const missingLabels = r.missing.map((k) => def?.inputs.find((i) => i.key === k)?.label ?? k);
  const quantity = inputs.quantity ?? inputs.base_amount ?? inputs.cost ?? null;
  const rate = params.rate ?? params.amount ?? params.fee ?? params.percent ?? null;
  return { quantity: quantity == null ? null : Number(quantity), rate: rate == null ? null : Number(rate), amount: r.amount, explanation: r.explanation, missing: missingLabels };
}

/**
 * Prepare (or refresh) the drafts of one month. Existing drafts keep the inputs
 * a person entered; drafts already signed or checked are left alone.
 */
export async function prepareDrafts(period: Date, db: Db = defaultPrisma, preparedBy?: string, contractIds?: string[]) {
  const contracts = await db.contract.findMany({
    where: { direction: { in: ["customer", "both"] }, ...(contractIds ? { id: { in: contractIds } } : {}), lines: { some: { shape: { not: null }, rule_status: { not: "retired" } } } },
    include: {
      client: { select: { id: true, name: true, placeholder: true, zoho_contact_id: true, gstin: true, billing_currency: true } },
      lines: { where: { shape: { not: null }, rule_status: { not: "retired" } }, orderBy: { sort_order: "asc" } },
      purchase_orders: { select: { id: true, po_number: true, value: true, consumed: true, currency: true, valid_from: true, valid_to: true, status: true } },
    },
  });
  const stats = { contracts: contracts.length, drafts: 0, ready: 0, left_alone: 0 };
  for (const c of contracts) {
    const { rules, basis } = pickRules(c.lines);
    const { included, skipped } = inForce(rules.map((l) => ({ ...l, shape: l.shape!, period: l.period ?? "monthly" })), period);
    if (included.length === 0) continue;
    const byCurrency = new Map<string, typeof included>();
    for (const r of included) byCurrency.set(r.currency || "INR", [...(byCurrency.get(r.currency || "INR") ?? []), r]);
    for (const [currency, cur] of byCurrency) {
      const existing = await db.draftEstimate.findUnique({ where: { contract_id_period_currency: { contract_id: c.id, period, currency } }, include: { lines: true } });
      if (existing && ["lead_signed", "finance_checked", "cancelled"].includes(existing.status)) { stats.left_alone++; continue; }
      const keptInputs = new Map((existing?.lines ?? []).map((l) => [l.line_id, l.inputs as Record<string, any>]));
      const lines = cur.map((r, i) => {
        const inputs = keptInputs.get(r.id) ?? (r.shape === "fixed" ? {} : {});
        const res = computeLine(r.shape, r.params as Record<string, any>, inputs);
        return { line_id: r.id, service: r.service, description: null, shape: r.shape, params: r.params as Prisma.InputJsonValue, inputs: inputs as Prisma.InputJsonValue, quantity: res.quantity, rate: res.rate, amount: res.amount, explanation: res.explanation, missing: res.missing, sort_order: i };
      });
      // The PO: keep a chosen one, else the valid PO in this currency with the most left.
      const validPos = c.purchase_orders.filter((p) => (p.currency || "INR") === currency && p.value != null && (!p.valid_to || p.valid_to >= period) && (!p.valid_from || p.valid_from <= periodEnd(period)));
      const po = (existing?.purchase_order_id && c.purchase_orders.find((p) => p.id === existing.purchase_order_id)) || validPos.sort((a, b) => (num(b.value) - num(b.consumed)) - (num(a.value) - num(a.consumed)))[0] || null;
      const subTotal = lines.reduce((s, l) => s + l.amount, 0);
      const gaps = buildGaps({ contract: c, client: c.client, rules: cur.map((r) => ({ status: r.rule_status, shape: r.shape, params: r.params, service: r.service })), basis, lines, skipped, po, currency, subTotal, fxRate: existing?.fx_rate == null ? null : Number(existing.fx_rate) });
      const status = gaps.some((g) => g.blocking) ? "draft" : "ready";
      const data = { client_id: c.client?.id ?? null, status, purchase_order_id: po?.id ?? null, sub_total: subTotal, gaps: gaps as unknown as Prisma.InputJsonValue, prepared_at: new Date(), prepared_by: preparedBy ?? null };
      if (existing) {
        await db.draftEstimate.update({ where: { id: existing.id }, data: { ...data, lines: { deleteMany: {}, create: lines } } });
      } else {
        await db.draftEstimate.create({ data: { ...data, contract_id: c.id, period, currency, lines: { create: lines } } });
      }
      stats.drafts++;
      if (status === "ready") stats.ready++;
    }
  }
  return stats;
}

function buildGaps(x: {
  contract: { bill_to: string | null; review_bucket: string | null; start_date: Date | null; end_date: Date | null; po_status: string | null; basis: string; paper_checked_at: Date | null; commercial_checked_at: Date | null; billing_checked_at: Date | null };
  client: { placeholder: boolean; zoho_contact_id: string | null; gstin: string | null } | null;
  rules: { status: string; shape: string; params: unknown; service: string }[];
  basis: "confirmed" | "contract" | "invoices";
  lines: { service: string; missing: string[] }[];
  skipped: { service: string; period: string }[];
  po: { po_number: string; value: unknown; consumed: unknown } | null;
  currency: string; subTotal: number; fxRate: number | null;
}): Gap[] {
  const gaps: Gap[] = [];
  const { contract, client } = x;
  if (!client) gaps.push({ code: "company", text: "No company linked to this contract.", blocking: true });
  else if (client.placeholder || !client.zoho_contact_id) gaps.push({ code: "company_zoho", text: "The company is not in Zoho Books yet; finance must create and link it.", blocking: true });
  if (!contract.bill_to) gaps.push({ code: "bill_to", text: "No invoiced-to entity on the contract.", blocking: true });
  if (contract.review_bucket === "document_awaited") gaps.push({ code: "paper", text: `No contract in effect (${contract.basis}); the signed agreement, renewal or PO is awaited.`, blocking: true });
  else if (contractStatus(contract.start_date, contract.end_date) === "Expired") gaps.push({ code: "expired", text: "The contract's end date has passed.", blocking: true });
  if (contract.review_bucket === "open") gaps.push({ code: "pointers", text: "The contract still has open pointers from the reading.", blocking: false });
  const unchecked = [!contract.paper_checked_at && "contracting", !contract.commercial_checked_at && "the lead", !contract.billing_checked_at && "finance"].filter(Boolean);
  if (unchecked.length) gaps.push({ code: "validation", text: `Not yet validated by ${unchecked.join(", ")}.`, blocking: true });
  if (x.basis !== "confirmed") gaps.push({ code: "rules_unconfirmed", text: `${x.rules.filter((r) => r.status !== "confirmed").length} of ${x.rules.length} billing terms are not confirmed by invoicing yet.`, blocking: true });
  const unconfirmed = x.basis === "confirmed" ? [] : x.rules.filter((r) => r.status !== "confirmed");
  for (const r of x.rules) {
    const miss = missingParams(r.shape, (r.params ?? {}) as Record<string, any>);
    if (miss.length) gaps.push({ code: "rule_params", text: `${r.service}: the rule still needs ${miss.join(", ")}.`, blocking: true });
  }
  for (const l of x.lines) if (l.missing.length) gaps.push({ code: "input", text: `${l.service}: needs ${l.missing.join(", ")} for this month.`, blocking: true });
  if (x.skipped.length) gaps.push({ code: "other_periods", text: `${x.skipped.length} ${x.skipped.map((s) => s.period).join(" / ")} rule(s) are not in this monthly draft: ${x.skipped.map((s) => s.service).join("; ").slice(0, 200)}.`, blocking: false });
  const poPolicy = (contract.po_status ?? "").toLowerCase();
  const needsPo = /required/.test(poPolicy);
  const usesPo = needsPo || /practice|issued|yes/.test(poPolicy);
  if (!x.po && needsPo) gaps.push({ code: "po_missing", text: "The contract requires a purchase order and none is valid for this month.", blocking: true });
  else if (!x.po && usesPo) gaps.push({ code: "po_missing", text: "This customer usually issues purchase orders; none is valid for this month.", blocking: false });
  if (x.po) {
    const balance = num(x.po.value) - num(x.po.consumed);
    if (balance < x.subTotal) gaps.push({ code: "po_balance", text: `PO ${x.po.po_number} has ${balance.toLocaleString("en-IN", { maximumFractionDigits: 0 })} left against ${x.subTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })} on this draft.`, blocking: needsPo });
  }
  if (x.currency !== "INR" && x.fxRate == null) gaps.push({ code: "fx", text: `Billing in ${x.currency}: the exchange rate for this month is not set.`, blocking: false });
  if (x.currency === "INR" && client && !client.gstin) gaps.push({ code: "gstin", text: "No GSTIN on the company; check the GST treatment before raising.", blocking: false });
  void unconfirmed;
  return gaps;
}

/** Recompute one draft after a person changed inputs, the PO or the rate. */
export async function recomputeDraft(draftId: string, db: Db = defaultPrisma) {
  const d = await db.draftEstimate.findUnique({
    where: { id: draftId },
    include: {
      lines: { orderBy: { sort_order: "asc" } },
      contract: { include: { client: { select: { id: true, name: true, placeholder: true, zoho_contact_id: true, gstin: true } }, purchase_orders: { select: { id: true, po_number: true, value: true, consumed: true, currency: true, valid_from: true, valid_to: true, status: true } }, lines: { where: { shape: { not: null }, rule_status: { not: "retired" } } } } },
    },
  });
  if (!d) return null;
  let subTotal = 0;
  const lineRes: { service: string; missing: string[] }[] = [];
  for (const l of d.lines) {
    const res = computeLine(l.shape, l.params as Record<string, any>, (l.inputs ?? {}) as Record<string, any>);
    subTotal += res.amount;
    lineRes.push({ service: l.service, missing: res.missing });
    await db.draftEstimateLine.update({ where: { id: l.id }, data: { quantity: res.quantity, rate: res.rate, amount: res.amount, explanation: res.explanation, missing: res.missing } });
  }
  const { rules, basis } = pickRules(d.contract.lines);
  const { skipped } = inForce(rules.map((l) => ({ ...l, shape: l.shape!, period: l.period ?? "monthly" })), d.period);
  const po = d.purchase_order_id ? d.contract.purchase_orders.find((p) => p.id === d.purchase_order_id) ?? null : null;
  const used = rules.filter((r) => d.lines.some((l) => l.line_id === r.id)).map((r) => ({ status: r.rule_status, shape: r.shape!, params: r.params, service: r.service }));
  const gaps = buildGaps({ contract: d.contract, client: d.contract.client, rules: used, basis, lines: lineRes, skipped, po, currency: d.currency, subTotal, fxRate: d.fx_rate == null ? null : Number(d.fx_rate) });
  const status = ["lead_signed", "finance_checked", "cancelled"].includes(d.status) ? d.status : gaps.some((g) => g.blocking) ? "draft" : "ready";
  return db.draftEstimate.update({ where: { id: draftId }, data: { sub_total: subTotal, gaps: gaps as unknown as Prisma.InputJsonValue, status } });
}
