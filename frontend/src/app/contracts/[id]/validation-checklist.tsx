"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/contracts/status";
import { TEAM_LABEL, type Team, type TeamCheck } from "@/lib/contracts/validation";
import SharePointPicker from "@/components/contracts/sharepoint-picker";

// The three team sign-offs on a contract, each with its checklist, and a quick
// way for contracting to attach the SharePoint links the paper check needs.

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const WHO: Record<Team, string> = { paper: "Attach the signed agreement and the current PO from SharePoint, then confirm the basis, dates and invoiced-to entity match them.", commercial: "Invoicing: each billing line below must be approved (submitted by one person, approved by another) against the wording and past invoices; and the SPOC must be a person from People.", billing: "Invoicing: confirm the company is linked to its Zoho Books record, with GSTIN, currency, payment terms, and a valid PO where the customer uses them." };

export default function ValidationChecklist({ contractId, clientId, checks, documents, saving, call, role }: {
  contractId: string;
  clientId?: string | null;
  checks: TeamCheck[];
  role?: string;
  documents: { name: string; uri?: string | null; type?: string | null }[];
  saving: boolean;
  call: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<{ name: string; uri: string }[]>([{ name: "", uri: "" }]);
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState("");
  const attachPicked = async (files: { name: string; uri: string }[]) => {
    const kept = documents.filter((d) => !files.some((x) => x.name === d.name && !(d.uri && /^https?:\/\//i.test(d.uri))));
    return call(`/api/contracts/${contractId}`, "PATCH", { documents: [...kept, ...files.map((f) => ({ ...f, type: "Link" }))] });
  };
  const allDone = checks.every((c) => c.done);
  // Files the reading identified but that have no web link yet: offered as names to pick.
  const unlinked = documents.filter((d) => !(d.uri && /^https?:\/\//i.test(d.uri)));
  const isHttps = (u: string) => /^https:\/\/[^\s]+$/i.test(u.trim());

  const attach = async () => {
    const filled = rows.filter((r) => r.uri.trim() || r.name.trim());
    const bad = filled.find((r) => !isHttps(r.uri));
    if (!filled.length) { setProblem("Paste at least one link."); return; }
    if (bad) { setProblem(`"${bad.uri || bad.name}" is not a web link. In SharePoint open the file, choose Copy link, and paste that (it starts with https://).`); return; }
    setProblem("");
    const add = filled.map((r) => ({ name: r.name.trim() || r.uri.replace(/^https?:\/\//, "").split("?")[0].split("/").pop() || "Document", uri: r.uri.trim(), type: "Link" }));
    // A picked name replaces the unlinked entry of the same name rather than duplicating it.
    const kept = documents.filter((d) => !add.some((x) => x.name === d.name && !(d.uri && /^https?:\/\//i.test(d.uri))));
    if (await call(`/api/contracts/${contractId}`, "PATCH", { documents: [...kept, ...add] })) { setRows([{ name: "", uri: "" }]); setAdding(false); }
  };

  return (
    <section className={`rounded-lg border ${allDone ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"} shadow-sm`}>
      <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Validation {allDone ? "complete" : `(${checks.filter((c) => c.done).length} of 3 teams)`}</h2>
          <p className="text-xs text-gray-500 mt-1">Three teams check this contract against the documents. Estimates can be raised only once all three have signed off.</p>
        </div>
        <Link href="/help/contract-validation" className="text-sm text-blue-700 hover:underline">How to validate (guide)</Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
        {checks.map((c) => {
          const blockers = c.items.filter((i) => !i.ok && !(c.team === "paper" && /End date missing/.test(i.text)));
          const mine = role === "legal" ? c.team === "paper" : role === "billing" ? c.team !== "paper" : true;
          if (!mine) {
            return (
              <div key={c.team} className="px-6 py-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900">{TEAM_LABEL[c.team]}</h3>
                  {c.done ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Checked</span> : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Pending</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1">{c.team === "paper" ? "Contracting's part." : "Invoicing's part."}{c.done && c.checked_at ? ` Checked on ${formatDate(c.checked_at)}.` : ""}</p>
              </div>
            );
          }
          return (
            <div key={c.team} className="px-6 py-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{TEAM_LABEL[c.team]}</h3>
                {c.done ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Checked</span> : blockers.length === 0 ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Ready</span> : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">{blockers.length} to do</span>}
              </div>
              <p className="text-xs text-gray-500 mt-1">{WHO[c.team]}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {c.items.map((i, k) => <li key={k} className={`flex gap-2 ${i.ok ? "text-gray-700" : "text-amber-800"}`}><span>{i.ok ? "✓" : "○"}</span><span>{i.text}</span></li>)}
              </ul>
              {c.team === "paper" && !c.done && (
                <div className="mt-3">
                  {adding ? (
                    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                      <div className="text-xs text-gray-600">In SharePoint open the file, choose <span className="font-medium">Copy link</span>, paste it here and say which document it is.</div>
                      {unlinked.length > 0 && <div className="text-xs text-gray-500">Files the reading found for this contract: {unlinked.map((d) => d.name).join("; ")}</div>}
                      {rows.map((r, i) => (
                        <div key={i} className="grid grid-cols-1 md:grid-cols-5 gap-2">
                          <input className={`${inputClass} md:col-span-3`} value={r.uri} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, uri: e.target.value } : x)))} placeholder="https://dwao.sharepoint.com/…" />
                          <input className={`${inputClass} md:col-span-2`} list={`doc-names-${contractId}`} value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Which document (pick or type)" />
                        </div>
                      ))}
                      <datalist id={`doc-names-${contractId}`}>{unlinked.map((d, i) => <option key={i} value={d.name} />)}</datalist>
                      {problem && <div className="text-xs text-red-700">{problem}</div>}
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setRows([...rows, { name: "", uri: "" }])} className="px-3 py-1.5 border border-gray-300 bg-white rounded-md text-xs">Add another</button>
                        <button disabled={saving} onClick={attach} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium disabled:opacity-50">Attach</button>
                        <button onClick={() => { setAdding(false); setProblem(""); }} className="px-3 py-1.5 border border-gray-300 bg-white rounded-md text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : picking && clientId ? (
                    <SharePointPicker clientId={clientId} alreadyAttached={documents.map((d) => d.uri ?? "").filter(Boolean)} onAttach={attachPicked} onClose={() => setPicking(false)} saving={saving} />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {clientId && <button onClick={() => setPicking(true)} className="px-3 py-1.5 border border-blue-300 bg-blue-50 text-blue-800 rounded-md text-xs font-medium hover:bg-blue-100">Pick from SharePoint</button>}
                      <button onClick={() => setAdding(true)} className="px-3 py-1.5 border border-gray-300 bg-white text-gray-800 rounded-md text-xs font-medium hover:bg-gray-50">Paste a link</button>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4">
                {c.done ? (
                  <div className="text-xs text-gray-600">Checked on {formatDate(c.checked_at)}. <button disabled={saving} onClick={() => call(`/api/contracts/${contractId}`, "PATCH", { check: c.team, done: false })} className="text-blue-700 hover:underline">Undo</button></div>
                ) : (
                  <button disabled={saving || blockers.length > 0} title={blockers.length ? blockers.join("; ") : undefined} onClick={() => call(`/api/contracts/${contractId}`, "PATCH", { check: c.team, done: true })} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium disabled:opacity-40">
                    Mark {c.team === "paper" ? "paper" : c.team === "commercial" ? "billing lines" : "Zoho and tax"} checked
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
