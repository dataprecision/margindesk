"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDate, toDateInput } from "@/lib/contracts/status";

interface Task {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  due_date: string;
  owner: string | null;
  status: "open" | "done" | "dismissed";
  contract: { id: string; counterparty: string } | null;
}

const KIND_LABEL: Record<string, string> = {
  renewal: "Renewal",
  purchase_order: "Purchase order",
  invoice_deadline: "Invoice deadline",
  follow_up: "Follow-up",
  review: "Open pointers",
  document: "Document awaited",
};

const KIND_STYLE: Record<string, string> = {
  renewal: "bg-amber-100 text-amber-800",
  purchase_order: "bg-indigo-100 text-indigo-700",
  invoice_deadline: "bg-red-100 text-red-700",
  follow_up: "bg-gray-100 text-gray-700",
  review: "bg-amber-100 text-amber-800",
  document: "bg-red-100 text-red-700",
};

const BUCKETS = ["Overdue", "Today", "Next 7 days", "Next 30 days", "Later"] as const;
type Bucket = (typeof BUCKETS)[number];

const BUCKET_STYLE: Record<Bucket, string> = {
  Overdue: "text-red-700",
  Today: "text-blue-700",
  "Next 7 days": "text-gray-900",
  "Next 30 days": "text-gray-900",
  Later: "text-gray-500",
};

function bucketOf(due: string): Bucket {
  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const d = new Date(due);
  const days = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86_400_000);
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days <= 7) return "Next 7 days";
  if (days <= 30) return "Next 30 days";
  return "Later";
}

const inputClass = "px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";

export default function ContractTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [owner, setOwner] = useState("");
  const [kind, setKind] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ title: string; due_date: string; owner: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/contracts/tasks?status=${showClosed ? "all" : "open"}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load follow-ups");
      setTasks(data.tasks || []);
      setOwners(data.owners || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [showClosed]);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Save failed");
      await load();
      return data;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const visible = useMemo(
    () => tasks.filter((t) => (!owner || (owner === "__none" ? !t.owner : t.owner === owner)) && (!kind || t.kind === kind)),
    [tasks, owner, kind]
  );

  const open = visible.filter((t) => t.status === "open");
  const closed = visible.filter((t) => t.status !== "open");
  const grouped = BUCKETS.map((b) => ({ bucket: b, items: open.filter((t) => bucketOf(t.due_date) === b) })).filter((g) => g.items.length);

  // Within a bucket, show tasks day by day
  const byDay = (items: Task[]) => {
    const days = new Map<string, Task[]>();
    items.forEach((t) => {
      const key = t.due_date.slice(0, 10);
      days.set(key, [...(days.get(key) ?? []), t]);
    });
    return Array.from(days.entries());
  };

  const row = (t: Task) => (
    <li key={t.id} className="px-5 py-3 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${KIND_STYLE[t.kind] ?? KIND_STYLE.follow_up}`}>{KIND_LABEL[t.kind] ?? t.kind}</span>
          <span className={`text-sm text-gray-900 ${t.status === "done" ? "line-through" : ""}`}>{t.title}</span>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          {t.owner || "No owner"}
          {t.contract && (
            <>
              {" · "}
              <Link href={`/contracts/${t.contract.id}`} className="text-blue-700 hover:underline">Open contract</Link>
            </>
          )}
          {t.status !== "open" && ` · ${t.status}`}
        </div>
        {t.detail && (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-blue-700">Details</summary>
            <div className="mt-1 text-xs text-gray-600 whitespace-pre-line">{t.detail}</div>
          </details>
        )}
      </div>
      <div className="flex gap-3 text-xs whitespace-nowrap">
        {t.status === "open" ? (
          <>
            <button disabled={busy} onClick={() => call(`/api/contracts/tasks/${t.id}`, "PATCH", { status: "done" })} className="text-green-700 font-medium hover:underline">Done</button>
            <button disabled={busy} onClick={() => call(`/api/contracts/tasks/${t.id}`, "PATCH", { status: "dismissed" })} className="text-gray-500 hover:underline">Dismiss</button>
          </>
        ) : (
          <button disabled={busy} onClick={() => call(`/api/contracts/tasks/${t.id}`, "PATCH", { status: "open" })} className="text-blue-700 hover:underline">Reopen</button>
        )}
      </div>
    </li>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <Link href="/contracts" className="text-sm text-gray-600 hover:text-gray-900">← Contracts</Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">Contract follow-ups</h1>
          <p className="text-gray-600 mt-1">Renewals, purchase orders and other follow-ups, by the day they are due.</p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={async () => {
              const result = await call("/api/contracts/tasks/generate", "POST");
              if (result) setMessage(result.created ? `Added ${result.created} follow-up${result.created > 1 ? "s" : ""} from contract dates.` : "Follow-ups are up to date.");
            }}
            className="px-4 py-2 border border-gray-300 bg-white rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Check contract dates
          </button>
          {!draft && <button onClick={() => setDraft({ title: "", due_date: toDateInput(new Date()), owner: owner && owner !== "__none" ? owner : "" })} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">Add follow-up</button>}
        </div>
      </div>

      {error && <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">{message}</div>}

      {draft && (
        <div className="mb-6 bg-white rounded-lg shadow p-5 flex flex-wrap gap-3 items-end">
          <label className="text-sm text-gray-700 flex-1 min-w-[16rem]">What needs doing?<input className={`${inputClass} w-full`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <label className="text-sm text-gray-700">Due<input type="date" className={`${inputClass} block`} value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></label>
          <label className="text-sm text-gray-700">Owner<input className={`${inputClass} block`} value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} /></label>
          <button disabled={busy} onClick={async () => { if (await call("/api/contracts/tasks", "POST", draft)) setDraft(null); }} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium disabled:opacity-50">Add</button>
          <button onClick={() => setDraft(null)} className="px-4 py-2 border border-gray-300 rounded-md text-sm">Cancel</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {BUCKETS.map((b) => (
          <div key={b} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className={`text-2xl font-bold ${BUCKET_STYLE[b]}`}>{open.filter((t) => bucketOf(t.due_date) === b).length}</div>
            <div className="text-sm text-gray-600">{b}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass}>
          <option value="">Everyone</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          <option value="__none">No owner</option>
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
          <option value="">All kinds</option>
          {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show done and dismissed
        </label>
      </div>

      {loading ? (
        <div className="text-gray-500 py-10 text-center">Loading follow-ups…</div>
      ) : grouped.length === 0 && closed.length === 0 ? (
        <div className="bg-white rounded-lg shadow py-12 text-center text-gray-500">
          Nothing to follow up. Use “Check contract dates” to look for renewals and purchase orders that are due.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ bucket, items }) => (
            <section key={bucket} className="bg-white rounded-lg shadow">
              <h2 className={`px-5 py-3 border-b border-gray-200 text-sm font-semibold uppercase tracking-wide ${BUCKET_STYLE[bucket]}`}>{bucket} ({items.length})</h2>
              {byDay(items).map(([day, dayItems]) => (
                <div key={day}>
                  <div className="px-5 py-2 bg-gray-50 text-xs font-medium text-gray-600 border-b border-gray-200">
                    {new Date(day).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}, {formatDate(day)}
                  </div>
                  <ul className="divide-y divide-gray-200">{dayItems.map(row)}</ul>
                </div>
              ))}
            </section>
          ))}
          {closed.length > 0 && (
            <section className="bg-white rounded-lg shadow opacity-80">
              <h2 className="px-5 py-3 border-b border-gray-200 text-sm font-semibold uppercase tracking-wide text-gray-500">Done and dismissed ({closed.length})</h2>
              <ul className="divide-y divide-gray-200">{closed.map(row)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
