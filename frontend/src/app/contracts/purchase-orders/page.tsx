"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/contracts/status";
import { PO_STATES, ALERT_STATES, type PoState } from "@/lib/contracts/po-consumption";
import { ConsumptionBar, STATE_STYLE, type PurchaseOrder } from "../[id]/purchase-orders";

interface Row extends PurchaseOrder {
  contract: { id: string; counterparty: string; spoc: string | null; client: { id: string; name: string } | null };
  invoice_count: number;
  credit_note_count: number;
}

const ORDER: PoState[] = ["over_consumed", "exhausting_before_term", "low", "expiring_with_balance", "healthy", "no_value", "fully_used", "expired"];
const money = (v: string | number | null | undefined, cur?: string | null) => (v == null ? "—" : `${cur ?? "INR"} ${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`);

export default function PurchaseOrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [state, setState] = useState<PoState | "">("");
  const [search, setSearch] = useState("");
  const [recomputing, setRecomputing] = useState(false);

  const load = () =>
    fetch("/api/purchase-orders")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed to load purchase orders"); setRows(d.purchase_orders || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { if (r.alert_state) c[r.alert_state] = (c[r.alert_state] || 0) + 1; });
    return c;
  }, [rows]);

  const visible = rows
    .filter((r) => (!state || r.alert_state === state) && (!search || `${r.po_number} ${r.contract.counterparty} ${r.contract.client?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => ORDER.indexOf(a.alert_state ?? "healthy") - ORDER.indexOf(b.alert_state ?? "healthy") || (a.valid_to ?? "9").localeCompare(b.valid_to ?? "9"));

  const recompute = async () => {
    setRecomputing(true);
    try { await fetch("/api/contracts/po-consumption", { method: "POST" }); await load(); } finally { setRecomputing(false); }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Purchase orders</h1>
          <p className="text-gray-600 mt-1">Every customer PO in the register, how much of it Zoho invoices have used, and which ones are running out before their term.</p>
        </div>
        <button onClick={recompute} disabled={recomputing} className="px-4 py-2 border border-gray-300 bg-white rounded-md font-medium hover:bg-gray-50 disabled:opacity-50">{recomputing ? "Recomputing…" : "Recompute now"}</button>
      </div>
      {error && <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <div className="flex flex-wrap gap-2 mb-4">
        {ORDER.filter((s) => counts[s]).map((s) => (
          <button key={s} onClick={() => setState(state === s ? "" : s)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${STATE_STYLE[s]} ${state === s ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}>
            {PO_STATES[s]}: {counts[s]}
          </button>
        ))}
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO or company" className="ml-auto px-3 py-2 border border-gray-300 rounded-md text-sm w-64 max-w-full" />
      </div>
      <p className="text-xs text-gray-500 mb-3">{ALERT_STATES.map((s) => PO_STATES[s]).join(", ")} raise a follow-up to the contract SPOC with the finance and legal owners named.</p>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>{["Company", "PO number", "Valid", "Consumed", "Balance", "Run rate / month", "Runs out", "State", "Invoices"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No purchase orders match.</td></tr>
            ) : visible.map((r) => {
              const balance = r.value == null ? null : Number(r.value) - Number(r.consumed ?? 0);
              return (
                <tr key={r.id} className="hover:bg-gray-50 align-top">
                  <td className="px-4 py-3">
                    <Link href={`/contracts/${r.contract.id}`} className="font-medium text-blue-700 hover:underline">{r.contract.client?.name ?? r.contract.counterparty}</Link>
                    {r.contract.spoc && <div className="text-xs text-gray-500">{r.contract.spoc}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.po_number}</div>
                    {r.covers && <div className="text-xs text-gray-500 max-w-xs truncate" title={r.covers}>{r.covers}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-xs">{formatDate(r.valid_from)} → {formatDate(r.valid_to)}</td>
                  <td className="px-4 py-3"><ConsumptionBar po={r} /></td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">{balance == null ? "—" : <span className={balance < 0 ? "text-red-700 font-medium" : ""}>{money(balance, r.currency)}</span>}</td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">{r.run_rate && Number(r.run_rate) > 0 ? money(r.run_rate, r.currency) : "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{r.projected_exhaustion ? formatDate(r.projected_exhaustion) : "—"}</td>
                  <td className="px-4 py-3">{r.alert_state && <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATE_STYLE[r.alert_state]}`}>{PO_STATES[r.alert_state]}</span>}</td>
                  <td className="px-4 py-3 tabular-nums">{r.invoice_count || "—"}{r.credit_note_count ? <span className="text-xs text-gray-500"> (−{r.credit_note_count} CN)</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
