"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DRAFT_STATUS, DRAFT_STATUS_STYLE as STATUS_STYLE, type DraftStatus } from "@/lib/billing/drafts";
import { SHAPE_BY_KEY } from "@/lib/billing/shapes";
import { formatDate } from "@/lib/contracts/status";

interface Line {
  id: string; rule_id: string | null; service: string; description: string | null; shape: string; params: Record<string, any>; inputs: Record<string, any>;
  quantity: string | null; rate: string | null; amount: string; explanation: string | null; missing: string[];
  line: { id: string; rule_status: string; confirmed_by: string | null } | null;
}
interface Po { id: string; po_number: string; value: string | null; consumed: string | null; currency: string | null; valid_to: string | null; alert_state?: string | null }
interface Draft {
  id: string; period: string; currency: string; status: DraftStatus; sub_total: string; fx_rate: string | null; notes: string | null;
  gaps: { code: string; text: string; blocking: boolean }[];
  prepared_at: string; prepared_by: string | null; lead_signed_by: string | null; lead_signed_at: string | null; finance_checked_by: string | null; finance_checked_at: string | null; zoho_estimate_id: string | null;
  lines: Line[];
  contract: { id: string; counterparty: string; bill_to: string | null; spoc: string | null; basis: string; review_bucket: string | null; start_date: string | null; end_date: string | null; po_status: string | null; purchase_orders: Po[] };
  client: { id: string; name: string; gstin: string | null; placeholder: boolean; zoho_contact_id: string | null; billing_currency: string; payment_terms: number | null } | null;
  purchase_order: Po | null;
}

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const money = (v: string | number | null | undefined, cur: string) => (v == null ? "—" : `${cur} ${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const monthLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default function DraftEstimatePage() {
  const { id } = useParams() as { id: string };
  const [draft, setDraft] = useState<Draft | null>(null);
  const [inputs, setInputs] = useState<Record<string, Record<string, any>>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/estimates/${id}`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Failed to load draft");
    setDraft(d);
    setInputs(Object.fromEntries(d.lines.map((l: Line) => [l.id, l.inputs ?? {}])));
    setDirty(false);
  }, [id]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  const call = async (body: unknown) => {
    setSaving(true); setError("");
    try {
      const r = await fetch(`/api/estimates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Save failed");
      await load();
      return true;
    } catch (e: any) { setError(e.message); return false; } finally { setSaving(false); }
  };

  if (!draft) return <div className="container mx-auto px-4 py-8 text-gray-600">{error || "Loading draft…"}</div>;
  const locked = draft.status === "lead_signed" || draft.status === "finance_checked";
  const blocking = draft.gaps.filter((g) => g.blocking);
  const warnings = draft.gaps.filter((g) => !g.blocking);
  const saveInputs = () => call({ lines: Object.entries(inputs).map(([lineId, inp]) => ({ id: lineId, inputs: inp })) });

  const exportCsv = () => {
    const rows = [["Company", "Invoiced to", "Service month", "PO", "Service", "Description", "Quantity", "Rate", "Amount", "Currency", "How it was worked out"]];
    for (const l of draft.lines) rows.push([draft.client?.name ?? draft.contract.counterparty, draft.contract.bill_to ?? "", draft.period.slice(0, 7), draft.purchase_order?.po_number ?? "", l.service, l.description ?? "", l.quantity ?? "", l.rate ?? "", l.amount, draft.currency, l.explanation ?? ""]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `estimate_${(draft.client?.name ?? draft.contract.counterparty).replace(/[^a-z0-9]+/gi, "_")}_${draft.period.slice(0, 7)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/contracts/estimates" className="text-sm text-gray-600 hover:text-gray-900">← Draft estimates</Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">{draft.client?.name ?? draft.contract.counterparty} · {monthLabel(draft.period)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[draft.status]}`}>{DRAFT_STATUS[draft.status]}</span>
            <Link href={`/contracts/${draft.contract.id}`} className="text-blue-700 hover:underline">{draft.contract.counterparty}</Link>
            <span className="text-gray-500">Prepared {formatDate(draft.prepared_at)}{draft.prepared_by ? ` by ${draft.prepared_by}` : ""}</span>
            {draft.lead_signed_by && <span className="text-gray-500">· signed by {draft.lead_signed_by} on {formatDate(draft.lead_signed_at)}</span>}
            {draft.finance_checked_by && <span className="text-gray-500">· checked by {draft.finance_checked_by} on {formatDate(draft.finance_checked_at)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv} className="px-4 py-2 border border-gray-300 bg-white rounded-md text-sm font-medium hover:bg-gray-50">Export CSV</button>
          {draft.status === "ready" && <button disabled={saving || dirty} onClick={() => call({ action: "lead_signed" })} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Lead sign-off</button>}
          {draft.status === "lead_signed" && <button disabled={saving} onClick={() => call({ action: "finance_checked" })} className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50">Finance checked</button>}
          {locked && <button disabled={saving} onClick={() => call({ action: "reopen" })} className="px-4 py-2 border border-gray-300 bg-white rounded-md text-sm font-medium hover:bg-gray-50">Reopen</button>}
          {draft.status !== "cancelled" && !locked && <button disabled={saving} onClick={() => { if (window.confirm("Cancel this draft for the month?")) call({ action: "cancelled" }); }} className="px-4 py-2 border border-gray-300 bg-white rounded-md text-sm text-red-700 hover:bg-red-50">Cancel draft</button>}
        </div>
      </div>
      {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <section className={`rounded-lg border p-4 ${blocking.length ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
        <h2 className="text-sm font-semibold text-gray-900">{blocking.length ? `${blocking.length} thing${blocking.length > 1 ? "s" : ""} to close before this can be raised` : "Everything needed to raise this estimate is in place"}</h2>
        {blocking.length > 0 && <ul className="mt-2 space-y-1 text-sm text-gray-800 list-disc pl-5">{blocking.map((g, i) => <li key={i}>{g.text}</li>)}</ul>}
        {warnings.length > 0 && <ul className="mt-2 space-y-1 text-xs text-gray-600 list-disc pl-5">{warnings.map((g, i) => <li key={i}>{g.text}</li>)}</ul>}
      </section>

      <section className="bg-white rounded-lg shadow p-6 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-sm">
        <div><div className="text-xs uppercase tracking-wide text-gray-500">Invoiced to</div><div className="mt-1 text-gray-900">{draft.contract.bill_to || "—"}</div></div>
        <div><div className="text-xs uppercase tracking-wide text-gray-500">Company in Zoho</div><div className="mt-1 text-gray-900">{draft.client ? (draft.client.zoho_contact_id ? `Linked${draft.client.gstin ? ` · ${draft.client.gstin}` : ""}` : "Not yet") : "No company"}</div></div>
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">Purchase order</div>
          <select className={`${inputClass} mt-1`} disabled={locked || saving} value={draft.purchase_order?.id ?? ""} onChange={(e) => call({ purchase_order_id: e.target.value || null })}>
            <option value="">None</option>
            {draft.contract.purchase_orders.map((p) => <option key={p.id} value={p.id}>{p.po_number}{p.value != null ? ` · ${Number(Number(p.value) - Number(p.consumed ?? 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 })} left` : ""}{p.valid_to ? ` · to ${formatDate(p.valid_to)}` : ""}</option>)}
          </select>
        </div>
        {draft.currency !== "INR" && (
          <div><div className="text-xs uppercase tracking-wide text-gray-500">Exchange rate to INR</div><input className={`${inputClass} mt-1`} disabled={locked || saving} defaultValue={draft.fx_rate ?? ""} onBlur={(e) => { if (e.target.value !== (draft.fx_rate ?? "")) call({ fx_rate: e.target.value }); }} placeholder="e.g. 84.5" /></div>
        )}
      </section>

      <section className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Lines ({draft.lines.length}) · {money(draft.sub_total, draft.currency)} before tax</h2>
            <p className="text-xs text-gray-500 mt-1">One line per billing rule. Enter the month's numbers; the amount is worked out from the rule.</p>
          </div>
          {dirty && !locked && <button disabled={saving} onClick={saveInputs} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Save numbers and recompute</button>}
        </div>
        <ul className="divide-y divide-gray-200">
          {draft.lines.map((l) => {
            const def = SHAPE_BY_KEY[l.shape];
            return (
              <li key={l.id} className="px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900">{l.service}{l.description ? <span className="text-gray-500"> · {l.description}</span> : null}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{def?.label ?? l.shape}{l.line ? ` · term ${l.line.rule_status === "confirmed" ? "confirmed" : "not yet confirmed"}` : ""}</div>
                    {l.explanation && <div className="text-xs text-gray-600 mt-1">{l.explanation}</div>}
                    {l.missing.length > 0 && <div className="text-xs text-amber-700 mt-1">Needs: {l.missing.join(", ")}</div>}
                  </div>
                  <div className="text-right tabular-nums text-sm font-medium text-gray-900 whitespace-nowrap">{money(l.amount, draft.currency)}</div>
                </div>
                {def && def.inputs.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    {def.inputs.map((inp) => (
                      <label key={inp.key} className="text-xs text-gray-600">{inp.label}
                        {inp.type === "select" ? (
                          <select className={inputClass} disabled={locked} value={inputs[l.id]?.[inp.key] ?? ""} onChange={(e) => { setInputs({ ...inputs, [l.id]: { ...inputs[l.id], [inp.key]: e.target.value } }); setDirty(true); }}>
                            <option value="">—</option>
                            {(inp.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input className={inputClass} disabled={locked} inputMode="decimal" value={inputs[l.id]?.[inp.key] ?? ""} onChange={(e) => { setInputs({ ...inputs, [l.id]: { ...inputs[l.id], [inp.key]: e.target.value } }); setDirty(true); }} />
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Notes for finance</div>
        {notes === null ? (
          <div className="text-sm text-gray-800 whitespace-pre-line">{draft.notes || <span className="text-gray-400">None</span>} <button onClick={() => setNotes(draft.notes ?? "")} className="ml-2 text-xs text-blue-700 hover:underline">edit</button></div>
        ) : (
          <div className="space-y-2">
            <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex gap-2">
              <button disabled={saving} onClick={async () => { if (await call({ notes })) setNotes(null); }} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm">Save</button>
              <button onClick={() => setNotes(null)} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm">Cancel</button>
            </div>
          </div>
        )}
        {draft.status === "finance_checked" && (
          <div className="mt-4 text-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Zoho estimate number, once raised by hand</div>
            <input className={`${inputClass} max-w-xs`} defaultValue={draft.zoho_estimate_id ?? ""} onBlur={(e) => { if (e.target.value !== (draft.zoho_estimate_id ?? "")) call({ zoho_estimate_id: e.target.value }); }} placeholder="e.g. SN/26-27/0912" />
          </div>
        )}
      </section>
    </div>
  );
}
