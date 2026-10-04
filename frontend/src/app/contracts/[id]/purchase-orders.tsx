"use client";

import { useEffect, useState } from "react";
import { formatDate, toDateInput } from "@/lib/contracts/status";
import { PO_STATES, type PoState } from "@/lib/contracts/po-consumption";

// The purchase orders of one contract: add and edit by hand, see how much of
// each is consumed by Zoho invoices, and tag invoices the reference number
// did not catch.

export interface PurchaseOrder {
  id: string;
  po_number: string;
  po_date: string | null;
  valid_from: string | null;
  valid_to: string | null;
  value: string | null;
  currency: string | null;
  value_text: string | null;
  hours_text: string | null;
  rate_text: string | null;
  covers: string | null;
  document: string | null;
  opening_consumed: string | null;
  consumed: string | null;
  consumed_as_of: string | null;
  run_rate: string | null;
  projected_exhaustion: string | null;
  alert_state: PoState | null;
  notes: string | null;
}

interface InvoiceRow { id: string; invoice_number: string; date: string; status: string; currency: string; sub_total: string; reference_number: string | null; service_month: string | null; po_match: string | null }
interface CreditNoteRow { id: string; creditnote_number: string; date: string; status: string; currency: string; sub_total: string; reference_number: string | null }

export const STATE_STYLE: Record<PoState, string> = {
  healthy: "bg-green-100 text-green-700",
  low: "bg-amber-100 text-amber-800",
  exhausting_before_term: "bg-red-100 text-red-700",
  over_consumed: "bg-red-100 text-red-700",
  expiring_with_balance: "bg-amber-100 text-amber-800",
  fully_used: "bg-gray-100 text-gray-600",
  expired: "bg-gray-100 text-gray-600",
  no_value: "bg-gray-100 text-gray-600",
};

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const money = (v: string | number | null | undefined, cur?: string | null) => (v == null || v === "" ? "—" : `${cur ?? "INR"} ${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`);
const emptyPo = { po_number: "", po_date: "", valid_from: "", valid_to: "", value: "", currency: "INR", covers: "", document: "", opening_consumed: "", notes: "" };
type PoDraft = typeof emptyPo;

export function ConsumptionBar({ po }: { po: PurchaseOrder }) {
  if (po.value == null) return <span className="text-xs text-gray-500">value not known</span>;
  const value = Number(po.value), consumed = Number(po.consumed ?? 0);
  const pct = value > 0 ? Math.min(100, Math.max(0, (consumed / value) * 100)) : 0;
  const tone = consumed > value ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="min-w-[160px]">
      <div className="h-2 w-full rounded bg-gray-200 overflow-hidden"><div className={`h-2 ${tone}`} style={{ width: `${pct}%` }} /></div>
      <div className="mt-1 text-xs text-gray-600 tabular-nums">{money(consumed, po.currency)} of {money(value, po.currency)} ({Math.round((consumed / (value || 1)) * 100)}%)</div>
    </div>
  );
}

export default function PurchaseOrders({ contractId, purchaseOrders, onChange }: { contractId: string; purchaseOrders: PurchaseOrder[]; onChange: () => Promise<void> }) {
  const [draft, setDraft] = useState<PoDraft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ invoices: InvoiceRow[]; credit_notes: CreditNoteRow[]; untagged: InvoiceRow[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const call = async (url: string, method: string, body?: unknown) => {
    setSaving(true); setError("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Save failed");
      await onChange();
      if (open) await loadDetail(open);
      return true;
    } catch (e: any) { setError(e.message); return false; } finally { setSaving(false); }
  };

  const loadDetail = async (poId: string) => {
    const r = await fetch(`/api/contracts/purchase-orders/${poId}`);
    const d = await r.json();
    if (r.ok) setDetail({ invoices: d.purchase_order.invoices, credit_notes: d.purchase_order.credit_notes, untagged: d.untagged_invoices });
  };
  useEffect(() => { if (open) loadDetail(open); else setDetail(null); }, [open]);

  const startEdit = (p: PurchaseOrder) => {
    setEditing(p.id);
    setDraft({ po_number: p.po_number, po_date: toDateInput(p.po_date), valid_from: toDateInput(p.valid_from), valid_to: toDateInput(p.valid_to), value: p.value ?? "", currency: p.currency ?? "INR", covers: p.covers ?? "", document: p.document ?? "", opening_consumed: p.opening_consumed ?? "", notes: p.notes ?? "" });
  };

  const form = (onSubmit: () => Promise<void>, label: string) => draft && (
    <form className="px-6 py-4 border-b border-gray-200 bg-gray-50 grid grid-cols-2 md:grid-cols-4 gap-3" onSubmit={async (e) => { e.preventDefault(); await onSubmit(); }}>
      <label className="text-xs text-gray-600">PO number<input className={inputClass} value={draft.po_number} onChange={(e) => setDraft({ ...draft, po_number: e.target.value })} required /></label>
      <label className="text-xs text-gray-600">PO date<input type="date" className={inputClass} value={draft.po_date} onChange={(e) => setDraft({ ...draft, po_date: e.target.value })} /></label>
      <label className="text-xs text-gray-600">Valid from<input type="date" className={inputClass} value={draft.valid_from} onChange={(e) => setDraft({ ...draft, valid_from: e.target.value })} /></label>
      <label className="text-xs text-gray-600">Valid to<input type="date" className={inputClass} value={draft.valid_to} onChange={(e) => setDraft({ ...draft, valid_to: e.target.value })} /></label>
      <label className="text-xs text-gray-600">Value before tax<input className={inputClass} inputMode="decimal" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="e.g. 3900000" /></label>
      <label className="text-xs text-gray-600">Currency<input className={inputClass} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /></label>
      <label className="text-xs text-gray-600">Already invoiced before our records<input className={inputClass} inputMode="decimal" value={draft.opening_consumed} onChange={(e) => setDraft({ ...draft, opening_consumed: e.target.value })} placeholder="0" /></label>
      <label className="text-xs text-gray-600">Document link<input className={inputClass} value={draft.document} onChange={(e) => setDraft({ ...draft, document: e.target.value })} placeholder="https://…" /></label>
      <label className="text-xs text-gray-600 col-span-2">Covers<input className={inputClass} value={draft.covers} onChange={(e) => setDraft({ ...draft, covers: e.target.value })} placeholder="Which services or months this PO pays for" /></label>
      <label className="text-xs text-gray-600 col-span-2">Notes<input className={inputClass} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      <div className="col-span-2 md:col-span-4 flex gap-2">
        <button type="submit" disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50">{label}</button>
        <button type="button" onClick={() => { setDraft(null); setEditing(null); }} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">Cancel</button>
      </div>
    </form>
  );

  return (
    <section className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Purchase orders ({purchaseOrders.length})</h2>
          <p className="text-xs text-gray-500 mt-1">Consumption comes from Zoho invoices that quote the PO number, less credit notes, refreshed nightly. Open a PO to see them and to tag invoices the number did not catch.</p>
        </div>
        {!draft && <button onClick={() => { setEditing(null); setDraft(emptyPo); }} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Add PO</button>}
      </div>
      {error && <div className="mx-6 mt-3 rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-700">{error}</div>}
      {draft && !editing && form(async () => { if (await call(`/api/contracts/${contractId}/purchase-orders`, "POST", draft)) setDraft(null); }, "Add purchase order")}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>{["PO number", "Valid", "Consumed", "Balance", "Run rate / month", "Runs out", "State", ""].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {purchaseOrders.map((p) => {
              const balance = p.value == null ? null : Number(p.value) - Number(p.consumed ?? 0);
              return (
                <tr key={p.id} className="align-top">
                  <td colSpan={8} className="p-0">
                    {editing === p.id && draft ? form(async () => { if (await call(`/api/contracts/purchase-orders/${p.id}`, "PATCH", draft)) { setDraft(null); setEditing(null); } }, "Save") : (
                      <table className="min-w-full"><tbody><tr>
                        <td className="px-4 py-3 w-48">
                          <button onClick={() => setOpen(open === p.id ? null : p.id)} className="font-medium text-blue-700 hover:underline text-left">{p.po_number}</button>
                          {p.covers && <div className="text-xs text-gray-500 max-w-xs">{p.covers}</div>}
                          {p.document && /^https?:/.test(p.document) && <a href={p.document} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline">document</a>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-xs text-gray-700">{formatDate(p.valid_from)} → {formatDate(p.valid_to)}</td>
                        <td className="px-4 py-3"><ConsumptionBar po={p} /></td>
                        <td className="px-4 py-3 tabular-nums whitespace-nowrap">{balance == null ? "—" : <span className={balance < 0 ? "text-red-700 font-medium" : ""}>{money(balance, p.currency)}</span>}</td>
                        <td className="px-4 py-3 tabular-nums whitespace-nowrap">{p.run_rate && Number(p.run_rate) > 0 ? money(p.run_rate, p.currency) : "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">{p.projected_exhaustion ? formatDate(p.projected_exhaustion) : "—"}</td>
                        <td className="px-4 py-3">{p.alert_state && <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATE_STYLE[p.alert_state]}`}>{PO_STATES[p.alert_state]}</span>}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <button onClick={() => startEdit(p)} className="text-blue-700 hover:underline">edit</button>
                          <button onClick={() => { if (window.confirm(`Delete PO ${p.po_number}? Invoices tagged to it are kept.`)) call(`/api/contracts/purchase-orders/${p.id}`, "DELETE"); }} className="ml-3 text-red-600 hover:underline">delete</button>
                        </td>
                      </tr>
                      {open === p.id && (
                        <tr><td colSpan={8} className="px-6 pb-4">
                          {!detail ? <div className="text-xs text-gray-500">Loading…</div> : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                              <div>
                                <div className="font-medium text-gray-800 mb-1">Invoices on this PO ({detail.invoices.length})</div>
                                <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
                                  {detail.invoices.map((i) => (
                                    <li key={i.id} className="px-3 py-1.5 flex items-center gap-2">
                                      <span className="font-medium">{i.invoice_number}</span><span className="text-gray-500">{formatDate(i.date)}</span>
                                      <span className="ml-auto tabular-nums">{money(i.sub_total, i.currency)}</span>
                                      <span className="text-gray-400">{i.po_match === "manual" ? "tagged by hand" : "by reference"}</span>
                                      <button disabled={saving} onClick={() => call(`/api/invoices/${i.id}`, "PATCH", { purchase_order_id: null })} className="text-red-600 hover:underline">untag</button>
                                    </li>
                                  ))}
                                  {detail.credit_notes.map((c) => (
                                    <li key={c.id} className="px-3 py-1.5 flex items-center gap-2 text-green-800"><span className="font-medium">Credit note {c.creditnote_number}</span><span className="text-gray-500">{formatDate(c.date)}</span><span className="ml-auto tabular-nums">− {money(c.sub_total, c.currency)}</span></li>
                                  ))}
                                  {detail.invoices.length + detail.credit_notes.length === 0 && <li className="px-3 py-3 text-gray-500">No invoice quotes this PO number yet.</li>}
                                </ul>
                              </div>
                              <div>
                                <div className="font-medium text-gray-800 mb-1">This customer's invoices with no PO ({detail.untagged.length})</div>
                                <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md max-h-64 overflow-y-auto">
                                  {detail.untagged.map((i) => (
                                    <li key={i.id} className="px-3 py-1.5 flex items-center gap-2">
                                      <span className="font-medium">{i.invoice_number}</span><span className="text-gray-500">{formatDate(i.date)}</span>
                                      {i.reference_number && <span className="text-gray-400 truncate max-w-[10rem]" title={i.reference_number}>ref {i.reference_number}</span>}
                                      <span className="ml-auto tabular-nums">{money(i.sub_total, i.currency)}</span>
                                      <button disabled={saving} onClick={() => call(`/api/invoices/${i.id}`, "PATCH", { purchase_order_id: p.id })} className="text-blue-700 hover:underline">tag to this PO</button>
                                    </li>
                                  ))}
                                  {detail.untagged.length === 0 && <li className="px-3 py-3 text-gray-500">Every invoice of this customer is on a PO.</li>}
                                </ul>
                              </div>
                            </div>
                          )}
                        </td></tr>
                      )}
                      </tbody></table>
                    )}
                  </td>
                </tr>
              );
            })}
            {purchaseOrders.length === 0 && !draft && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No purchase orders on file.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
