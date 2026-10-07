"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatDate } from "@/lib/contracts/status";
import { APPROVER_ROLES, type ApprovalKind, type ApprovalView } from "@/lib/contracts/approval";
import ApprovalControls from "@/components/contracts/approval-controls";

// The approval inbox: what waits for me, what waits on others, recent decisions.

interface Item { kind: ApprovalKind; id: string; title: string; detail: string; contract_id: string | null; company_id: string | null; company: string | null; endpoint: string; approval: ApprovalView; can_approve: boolean; is_mine: boolean }
const KIND: Record<ApprovalKind, string> = { agreement: "Agreement", line: "Billing line", contract: "Contract" };

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<{ for_me: Item[]; waiting: Item[]; decided: Item[] } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"for_me" | "waiting" | "decided">("for_me");
  const load = useCallback(() => fetch("/api/approvals").then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Failed to load"); setData(d); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const call = async (url: string, method: string, body?: unknown) => {
    setSaving(true); setError("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      await load();
      return d;
    } catch (e: any) { setError(e.message); return false; } finally { setSaving(false); }
  };
  const role = session?.user?.role;
  const myKinds = (Object.keys(APPROVER_ROLES) as ApprovalKind[]).filter((k) => role && (APPROVER_ROLES[k] as string[]).includes(role));
  const rows = data ? data[tab] : [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-3xl font-bold text-gray-900">Approvals</h1>
      <p className="text-gray-600 mt-1">{myKinds.length ? `You can approve: ${myKinds.map((k) => KIND[k].toLowerCase() + "s").join(", ")}. ` : "Your role does not approve anything; you can see what is waiting. "}Nothing you made or submitted yourself appears under "For me" (maker-checker).</p>
      {error && <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <div className="mt-6 flex flex-wrap gap-2">
        {([["for_me", "For me"], ["waiting", "Waiting on others"], ["decided", "Decided, last 30 days"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-md text-sm border ${tab === k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}>{label}{data ? ` (${data[k].length})` : ""}</button>
        ))}
      </div>
      <div className="mt-4 bg-white rounded-lg shadow divide-y divide-gray-200">
        {!data ? <div className="px-6 py-10 text-center text-gray-500">Loading…</div> : rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-500">{tab === "for_me" ? "Nothing waiting for you." : tab === "waiting" ? "Nothing waiting on others." : "No decisions in the last 30 days."}</div>
        ) : rows.map((it) => (
          <div key={`${it.kind}:${it.id}`} className="px-4 sm:px-6 py-4 grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-7 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-xs text-gray-700">{KIND[it.kind]}</span>
                {it.contract_id ? <Link href={`/contracts/${it.contract_id}`} className="font-medium text-blue-700 hover:underline">{it.title}</Link> : it.company_id ? <Link href={`/companies/${it.company_id}`} className="font-medium text-blue-700 hover:underline">{it.title}</Link> : <span className="font-medium text-gray-900">{it.title}</span>}
              </div>
              <div className="text-xs text-gray-600 mt-1">{it.company && !it.title.includes(it.company) ? `${it.company} · ` : ""}{it.detail}</div>
              {it.approval.stored === "submitted" && <div className="text-xs text-gray-500 mt-1">Submitted by {it.approval.by} on {formatDate(it.approval.at)}{it.approval.maker && it.approval.maker !== it.approval.by ? ` · last edited by ${it.approval.maker}` : ""}</div>}
            </div>
            <div className="lg:col-span-5">
              <ApprovalControls kind={it.kind} endpoint={it.endpoint} approval={it.approval} role={role} me={session?.user?.email} saving={saving} call={call} compact />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
