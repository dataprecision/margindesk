"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DRAFT_STATUS, DRAFT_STATUS_STYLE as STATUS_STYLE, type DraftStatus } from "@/lib/billing/drafts";

interface DraftRow {
  id: string;
  period: string;
  currency: string;
  status: DraftStatus;
  sub_total: string;
  gaps: { code: string; text: string; blocking: boolean }[];
  gap_count: number;
  line_count: number;
  contract: { id: string; counterparty: string; spoc: string | null; review_bucket: string | null };
  client: { id: string; name: string } | null;
  purchase_order: { id: string; po_number: string; value: string | null; consumed: string | null } | null;
}

const ORDER: DraftStatus[] = ["ready", "draft", "lead_signed", "finance_checked", "cancelled"];
const money = (v: string | number, cur: string) => `${cur} ${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function DraftEstimatesPage() {
  const [period, setPeriod] = useState(thisMonth());
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<DraftStatus | "">("");
  const [search, setSearch] = useState("");

  const load = (p: string) => {
    setLoading(true);
    return fetch(`/api/estimates?period=${p}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed to load drafts"); setDrafts(d.drafts || []); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(period); }, [period]);

  const prepare = async () => {
    setPreparing(true); setError("");
    try {
      const r = await fetch("/api/estimates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not prepare drafts");
      await load(period);
    } catch (e: any) { setError(e.message); } finally { setPreparing(false); }
  };

  const counts = useMemo(() => { const c: Record<string, number> = {}; drafts.forEach((d) => (c[d.status] = (c[d.status] || 0) + 1)); return c; }, [drafts]);
  const gapCounts = useMemo(() => {
    const c: Record<string, number> = {};
    drafts.forEach((d) => (d.gaps || []).filter((g) => g.blocking).forEach((g) => (c[g.code] = (c[g.code] || 0) + 1)));
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [drafts]);
  const visible = drafts
    .filter((d) => (!status || d.status === status) && (!search || `${d.client?.name ?? ""} ${d.contract.counterparty}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || Number(b.sub_total) - Number(a.sub_total));
  const total = (s: DraftStatus) => drafts.filter((d) => d.status === s && d.currency === "INR").reduce((n, d) => n + Number(d.sub_total), 0);

  const GAP_LABEL: Record<string, string> = { company: "No company", company_zoho: "Company not in Zoho", bill_to: "No invoiced-to", paper: "No contract in effect", expired: "Contract expired", rules_unconfirmed: "Rules not confirmed", rule_params: "Rule needs a number", input: "Month's number missing", po_missing: "No valid PO", po_balance: "PO balance short" };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Draft estimates</h1>
          <p className="text-gray-600 mt-1">What we could raise this month, prepared from the billing rules, and every gap that must be closed first. Nothing here is created in Zoho Books.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <button onClick={prepare} disabled={preparing} className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50">{preparing ? "Preparing…" : drafts.length ? "Refresh drafts" : "Prepare drafts"}</button>
        </div>
      </div>
      {error && <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {ORDER.filter((s) => s !== "cancelled").map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? "" : s)} className={`rounded-lg border p-4 text-left bg-white ${status === s ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200"}`}>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{counts[s] || 0}</div>
            <div className="text-sm text-gray-600">{DRAFT_STATUS[s]}</div>
            {counts[s] ? <div className="text-xs text-gray-500 tabular-nums">INR {total(s).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div> : null}
          </button>
        ))}
      </div>
      {gapCounts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <span className="self-center text-gray-500">Blocking gaps across drafts:</span>
          {gapCounts.map(([code, n]) => <span key={code} className="px-2 py-1 rounded-full bg-amber-50 text-amber-800">{GAP_LABEL[code] ?? code}: {n}</span>)}
        </div>
      )}
      <div className="flex gap-3 mb-4">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company" className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64 max-w-full" />
        <span className="ml-auto self-center text-sm text-gray-500">{visible.length} of {drafts.length}</span>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>{["Company", "Contract", "Lines", "Amount (before tax)", "PO", "Status", "Blocking gaps"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">{drafts.length ? "No drafts match." : "No drafts for this month yet. Prepare them from the billing rules."}</td></tr>
            ) : visible.map((d) => (
              <tr key={d.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3"><Link href={`/contracts/estimates/${d.id}`} className="font-medium text-blue-700 hover:underline">{d.client?.name ?? d.contract.counterparty}</Link>{d.contract.spoc && <div className="text-xs text-gray-500">{d.contract.spoc}</div>}</td>
                <td className="px-4 py-3 text-gray-700"><Link href={`/contracts/${d.contract.id}`} className="hover:underline">{d.contract.counterparty}</Link></td>
                <td className="px-4 py-3 tabular-nums">{d.line_count}</td>
                <td className="px-4 py-3 tabular-nums whitespace-nowrap">{money(d.sub_total, d.currency)}</td>
                <td className="px-4 py-3 text-xs">{d.purchase_order ? <>{d.purchase_order.po_number}{d.purchase_order.value != null && <div className="text-gray-500">{Number(Number(d.purchase_order.value) - Number(d.purchase_order.consumed ?? 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 })} left</div>}</> : <span className="text-gray-400">none</span>}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLE[d.status]}`}>{DRAFT_STATUS[d.status]}</span></td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  {(d.gaps || []).filter((g) => g.blocking).slice(0, 3).map((g, i) => <div key={i}>{GAP_LABEL[g.code] ?? g.code}</div>)}
                  {d.gap_count > 3 && <div className="text-gray-400">+{d.gap_count - 3} more</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
