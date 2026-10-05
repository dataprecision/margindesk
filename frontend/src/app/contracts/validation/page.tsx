"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TEAM_LABEL, type Team } from "@/lib/contracts/validation";

interface Row {
  id: string;
  counterparty: string;
  spoc: string | null;
  basis: string;
  review_bucket: string | null;
  client: { id: string; name: string } | null;
  rule_count: number;
  confirmed_rule_count: number;
  verified: boolean;
  validation: { team: Team; done: boolean; missing: string[] }[];
}

const TEAMS: Team[] = ["paper", "commercial", "billing"];

export default function ValidationPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [team, setTeam] = useState<Team | "">("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/contracts")
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed to load"); setRows((d.contracts || []).filter((c: any) => c.direction === "customer" || c.direction === "both")); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, { done: number; ready: number; blocked: number }> = {};
    for (const t of TEAMS) c[t] = { done: 0, ready: 0, blocked: 0 };
    for (const r of rows) for (const v of r.validation) c[v.team][v.done ? "done" : v.missing.length ? "blocked" : "ready"]++;
    return c;
  }, [rows]);

  const visible = rows.filter((r) => {
    if (search && !`${r.counterparty} ${r.client?.name ?? ""} ${r.spoc ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (team) { const v = r.validation.find((x) => x.team === team)!; return onlyPending ? !v.done : true; }
    return onlyPending ? !r.verified : true;
  });

  const cell = (r: Row, t: Team) => {
    const v = r.validation.find((x) => x.team === t)!;
    if (v.done) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Checked</span>;
    if (v.missing.length === 0) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Ready to sign off</span>;
    return <div className="text-xs text-gray-700">{v.missing.slice(0, 2).map((m, i) => <div key={i}>• {m}</div>)}{v.missing.length > 2 && <div className="text-gray-400">+{v.missing.length - 2} more</div>}</div>;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Validation</h1>
        <p className="text-gray-600 mt-1"><Link href="/help/contract-validation" className="text-blue-700 hover:underline">How to validate a contract (guide)</Link>. Each customer contract is checked by three teams. Contracting attaches the SharePoint documents and confirms the paper; the lead confirms the billing rules; finance confirms the Zoho company, tax and PO. Estimates can only be raised for contracts all three have checked.</p>
      </div>
      {error && <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {TEAMS.map((t) => (
          <button key={t} onClick={() => setTeam(team === t ? "" : t)} className={`rounded-lg border p-4 text-left bg-white ${team === t ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200"}`}>
            <div className="text-sm font-semibold text-gray-900">{TEAM_LABEL[t]}</div>
            <div className="mt-1 text-xs text-gray-600 tabular-nums">
              <span className="text-green-700">{counts[t]?.done ?? 0} checked</span> · <span className="text-blue-700">{counts[t]?.ready ?? 0} ready to sign off</span> · <span className="text-amber-700">{counts[t]?.blocked ?? 0} with something missing</span>
            </div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or SPOC" className="px-3 py-2 border border-gray-300 rounded-md text-sm w-64 max-w-full" />
        <label className="text-sm text-gray-600 flex items-center gap-2"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />Only what is still pending{team ? ` for ${TEAM_LABEL[team]}` : ""}</label>
        <span className="ml-auto text-sm text-gray-500">{visible.length} of {rows.length}</span>
      </div>

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>{["Contract", "SPOC", ...TEAMS.map((t) => TEAM_LABEL[t])].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Nothing pending.</td></tr>
            ) : visible.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3">
                  <Link href={`/contracts/${r.id}`} className="font-medium text-blue-700 hover:underline">{r.counterparty}</Link>
                  <div className="text-xs text-gray-500">{r.client?.name && r.client.name !== r.counterparty ? `${r.client.name} · ` : ""}{r.basis}</div>
                </td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.spoc || "—"}</td>
                {TEAMS.map((t) => <td key={t} className="px-4 py-3">{cell(r, t)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
