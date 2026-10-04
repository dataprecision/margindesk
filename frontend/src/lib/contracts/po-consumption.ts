import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

// Purchase order consumption. A customer's PO lives in the register with a
// value and validity; Zoho invoices that quote the PO number (or that a
// person tagged to it) consume it, credit notes give some back. Nightly we
// re-match, recompute and raise a follow-up when a PO is running out.

type Db = PrismaClient | Prisma.TransactionClient;

export const PO_STATES = {
  healthy: "Healthy",
  low: "80% used",
  exhausting_before_term: "Runs out before its end date",
  over_consumed: "Over-consumed",
  expiring_with_balance: "Expiring with money left",
  fully_used: "Fully used",
  expired: "Expired",
  no_value: "Value not known",
} as const;
export type PoState = keyof typeof PO_STATES;
export const ALERT_STATES: PoState[] = ["low", "exhausting_before_term", "over_consumed", "expiring_with_balance"];

/** "PO-CSPL-26/13338 " -> "POCSPL2613338" */
export const normPo = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const DAY = 86_400_000;
const num = (v: unknown) => (v == null ? 0 : Number(v));

/** Amount of an invoice or credit note in the PO's currency (INR when they differ). */
function inPoCurrency(doc: { sub_total: unknown; currency: string; exchange_rate: unknown }, poCurrency: string | null) {
  const cur = poCurrency || "INR";
  if (doc.currency === cur) return num(doc.sub_total);
  return num(doc.sub_total) * (num(doc.exchange_rate) || 1);
}

/**
 * Tag invoices and credit notes to purchase orders by the reference number
 * they quote. Manual tags are never changed.
 */
export async function matchDocumentsToPurchaseOrders(db: Db = defaultPrisma) {
  const pos = await db.contractPurchaseOrder.findMany({
    select: { id: true, po_number: true, contract: { select: { zoho_customer_id: true, client: { select: { zoho_contact_id: true } } } } },
  });
  const byCustomer = new Map<string, { id: string; key: string }[]>();
  for (const p of pos) {
    const key = normPo(p.po_number);
    if (key.length < 3) continue;
    for (const cust of [p.contract.zoho_customer_id, p.contract.client?.zoho_contact_id]) {
      if (!cust) continue;
      byCustomer.set(cust, [...(byCustomer.get(cust) ?? []), { id: p.id, key }]);
    }
  }
  const find = (customer: string, reference: string | null) => {
    const ref = normPo(reference);
    if (!ref) return null;
    const hits = (byCustomer.get(customer) ?? []).filter((p) => ref === p.key || ref.includes(p.key));
    if (hits.length === 0) return null;
    return hits.sort((a, b) => b.key.length - a.key.length)[0].id; // the most specific number wins
  };

  let invoices = 0, notes = 0;
  // A null po_match must count as "not manual": Prisma's `not` would drop the nulls.
  const notManual = { OR: [{ po_match: null }, { po_match: { notIn: ["manual", "manual_none"] } }] };
  const unmatched = await db.zohoInvoice.findMany({ where: { ...notManual, reference_number: { not: null } }, select: { id: true, zoho_customer_id: true, reference_number: true, purchase_order_id: true } });
  for (const inv of unmatched) {
    const poId = find(inv.zoho_customer_id, inv.reference_number);
    if (poId !== inv.purchase_order_id) { await db.zohoInvoice.update({ where: { id: inv.id }, data: { purchase_order_id: poId, po_match: poId ? "reference" : null } }); invoices++; }
  }
  const cns = await db.zohoCreditNote.findMany({ where: notManual, select: { id: true, zoho_customer_id: true, reference_number: true, purchase_order_id: true, applied_invoice_ids: true } });
  for (const cn of cns) {
    let poId = find(cn.zoho_customer_id, cn.reference_number);
    if (!poId && cn.applied_invoice_ids.length) {
      const inv = await db.zohoInvoice.findFirst({ where: { zoho_invoice_id: { in: cn.applied_invoice_ids }, purchase_order_id: { not: null } }, select: { purchase_order_id: true } });
      poId = inv?.purchase_order_id ?? null;
    }
    if (poId !== cn.purchase_order_id) { await db.zohoCreditNote.update({ where: { id: cn.id }, data: { purchase_order_id: poId, po_match: poId ? "reference" : null } }); notes++; }
  }
  return { invoices_retagged: invoices, credit_notes_retagged: notes };
}

/** Consumption, run rate, projection and state for every PO; follow-ups for the ones in trouble. */
export async function recomputePurchaseOrders(db: Db = defaultPrisma, today: Date = new Date()) {
  const pos = await db.contractPurchaseOrder.findMany({
    include: {
      invoices: { where: { status: { notIn: ["void", "draft"] } }, select: { sub_total: true, currency: true, exchange_rate: true, date: true } },
      credit_notes: { where: { status: { notIn: ["void", "draft"] } }, select: { sub_total: true, currency: true, exchange_rate: true, date: true } },
      contract: { select: { id: true, counterparty: true, spoc: true, client: { select: { name: true, finance_person: { select: { name: true } }, legal_person: { select: { name: true } } } } } },
    },
  });
  const counts: Record<string, number> = {};
  let tasks = 0;
  const threeMonthsAgo = new Date(today.getTime() - 90 * DAY);
  for (const po of pos) {
    const value = po.value == null ? null : num(po.value);
    const consumed = num(po.opening_consumed) + po.invoices.reduce((s, i) => s + inPoCurrency(i, po.currency), 0) - po.credit_notes.reduce((s, c) => s + inPoCurrency(c, po.currency), 0);
    const recent = po.invoices.filter((i) => i.date >= threeMonthsAgo).reduce((s, i) => s + inPoCurrency(i, po.currency), 0) - po.credit_notes.filter((c) => c.date >= threeMonthsAgo).reduce((s, c) => s + inPoCurrency(c, po.currency), 0);
    const runRate = Math.max(0, recent / 3);
    const balance = value == null ? null : value - consumed;
    let projected: Date | null = null;
    if (balance != null && balance > 0 && runRate > 0) projected = new Date(today.getTime() + (balance / runRate) * 30.44 * DAY);

    let state: PoState;
    const daysToEnd = po.valid_to ? Math.round((po.valid_to.getTime() - today.getTime()) / DAY) : null;
    if (value == null) state = "no_value";
    else if (balance! < 0) state = "over_consumed";
    else if (balance === 0 && runRate === 0) state = "fully_used"; // a one-off PO invoiced in full, nothing running
    else if (daysToEnd != null && daysToEnd < 0) state = "expired";
    else if (projected && po.valid_to && projected < po.valid_to) state = "exhausting_before_term";
    else if (consumed >= 0.8 * value) state = "low";
    else if (daysToEnd != null && daysToEnd <= 30 && balance! > 0 && runRate > 0) state = "expiring_with_balance";
    else state = "healthy";
    counts[state] = (counts[state] ?? 0) + 1;

    await db.contractPurchaseOrder.update({ where: { id: po.id }, data: { consumed, consumed_as_of: today, run_rate: runRate, projected_exhaustion: projected, alert_state: state } });

    // One open follow-up per PO while it is in trouble; closed when it is not.
    const cur = po.currency || "INR";
    const fmt = (n: number) => `${cur} ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    const owners = [po.contract.spoc && `SPOC ${po.contract.spoc}`, po.contract.client?.finance_person && `finance ${po.contract.client.finance_person.name}`, po.contract.client?.legal_person && `legal ${po.contract.client.legal_person.name}`].filter(Boolean).join(", ");
    const title = `PO ${po.po_number} (${po.contract.client?.name ?? po.contract.counterparty}): ${PO_STATES[state]}`;
    const detail = [
      value != null ? `Value ${fmt(value)}, consumed ${fmt(consumed)}, balance ${fmt(balance!)}.` : "No value recorded for this PO.",
      runRate > 0 ? `Run rate ${fmt(runRate)} a month.` : "No invoices in the last three months.",
      projected ? `At this rate it runs out around ${projected.toISOString().slice(0, 10)}${po.valid_to ? `; it is valid to ${po.valid_to.toISOString().slice(0, 10)}` : ""}.` : null,
      owners ? `For ${owners}.` : null,
    ].filter(Boolean).join(" ");
    for (const s of ALERT_STATES) {
      const auto_key = `po-alert:${po.id}:${s}`;
      const existing = await db.contractTask.findUnique({ where: { auto_key } });
      if (s === state) {
        tasks++;
        if (!existing) await db.contractTask.create({ data: { auto_key, contract_id: po.contract.id, kind: "po_alert", title, detail, due_date: new Date(today.getTime() + 7 * DAY), owner: po.contract.spoc, created_by: "po-consumption" } });
        else if (existing.status === "open") await db.contractTask.update({ where: { id: existing.id }, data: { title, detail } });
      } else if (existing && existing.status === "open") {
        await db.contractTask.update({ where: { id: existing.id }, data: { status: "done", completed_by: "po-consumption", completed_at: today } });
      }
    }
  }
  return { purchase_orders: pos.length, by_state: counts, open_alerts: tasks };
}
