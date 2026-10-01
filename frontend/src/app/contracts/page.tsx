"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { STATUS_ORDER, STATUS_STYLE, formatDate, type ContractStatus } from "@/lib/contracts/status";

interface ContractRow {
  id: string;
  counterparty: string;
  direction: "customer" | "vendor" | "both" | "nda";
  basis: string;
  start_date: string | null;
  end_date: string | null;
  spoc: string | null;
  stage: string;
  po_status: string | null;
  verified: boolean;
  status: ContractStatus;
  days_left: number | null;
  line_count: number;
  next_line_end: string | null;
  rule_count: number;
  confirmed_rule_count: number;
  open_task_count: number;
  overdue_task_count: number;
  open_question_count: number;
}

const DIRECTION_LABEL: Record<ContractRow["direction"], string> = {
  customer: "Customer",
  vendor: "Vendor",
  both: "Customer and vendor",
  nda: "NDA only",
};

export default function ContractsPage() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<ContractStatus | "">("");
  const [direction, setDirection] = useState("");
  const [spoc, setSpoc] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/contracts")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load contracts");
        setContracts(data.contracts || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    contracts.forEach((x) => (c[x.status] = (c[x.status] || 0) + 1));
    return c;
  }, [contracts]);

  const spocs = useMemo(() => Array.from(new Set(contracts.map((c) => c.spoc).filter(Boolean))).sort() as string[], [contracts]);

  const visible = contracts
    .filter(
      (c) =>
        (!status || c.status === status) &&
        (!direction || c.direction === direction) &&
        (!spoc || c.spoc === spoc) &&
        (!search || `${c.counterparty} ${c.basis} ${c.spoc ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    )
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.counterparty.localeCompare(b.counterparty));

  const overdue = contracts.reduce((n, c) => n + c.overdue_task_count, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contracts</h1>
          <p className="text-gray-600 mt-1">Every agreement that lets us bill a client or pay a vendor, with its dates and billing terms.</p>
        </div>
        <Link href="/contracts/tasks" className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700">
          Follow-ups{overdue > 0 ? ` (${overdue} overdue)` : ""}
        </Link>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <button
          onClick={() => setStatus("")}
          className={`rounded-lg border p-4 text-left bg-white ${status === "" ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200"}`}
        >
          <div className="text-2xl font-bold text-gray-900">{contracts.length}</div>
          <div className="text-sm text-gray-600">All contracts</div>
        </button>
        {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(status === s ? "" : s)}
            className={`rounded-lg border p-4 text-left bg-white ${status === s ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200"}`}
          >
            <div className="text-2xl font-bold text-gray-900">{counts[s]}</div>
            <div className="text-sm text-gray-600">{s}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search counterparty, basis or SPOC"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm w-72 max-w-full"
        />
        <select value={direction} onChange={(e) => setDirection(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option value="">Customers and vendors</option>
          {Object.entries(DIRECTION_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select value={spoc} onChange={(e) => setSpoc(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option value="">All SPOCs</option>
          {spocs.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="ml-auto self-center text-sm text-gray-500">{visible.length} of {contracts.length}</span>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Counterparty", "Based on", "Start", "End", "Days left", "Status", "SPOC", "Billing rules", "Follow-ups", "Checked"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-500">Loading contracts…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-500">No contracts match these filters.</td></tr>
            ) : (
              visible.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/contracts/${c.id}`} className="font-medium text-blue-700 hover:underline">{c.counterparty}</Link>
                    <div className="text-xs text-gray-500">{DIRECTION_LABEL[c.direction]}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.basis}
                    {c.po_status && <div className="text-xs text-gray-500">{c.po_status}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatDate(c.start_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatDate(c.end_date)}</td>
                  <td className="px-4 py-3 tabular-nums">{c.days_left ?? "—"}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_STYLE[c.status]}`}>{c.status}</span></td>
                  <td className="px-4 py-3 text-gray-700">{c.spoc || "—"}</td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                    {c.rule_count ? `${c.confirmed_rule_count} of ${c.rule_count} confirmed` : "—"}
                    {c.next_line_end && <div className="text-xs text-gray-500">next term ends {formatDate(c.next_line_end)}</div>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {c.open_task_count || "—"}
                    {c.overdue_task_count > 0 && <span className="ml-1 text-xs text-red-600">({c.overdue_task_count} overdue)</span>}
                  </td>
                  <td className="px-4 py-3">{c.verified ? <span className="text-green-700">Yes</span> : <span className="text-gray-400">Not yet</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
