"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/contracts/status";
import { TEAM_LABEL, type Team, type TeamCheck } from "@/lib/contracts/validation";

// The three team sign-offs on a contract, each with its checklist, and a quick
// way for contracting to attach the SharePoint links the paper check needs.

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500";
const WHO: Record<Team, string> = { paper: "Attach the signed agreement and the current PO from SharePoint, then confirm the basis, dates and invoiced-to entity match them.", commercial: "Invoicing: confirm every billing rule below (Confirm on each rule) against the terms and past invoices, and make sure the SPOC is a person from People.", billing: "Invoicing: confirm the company is linked to its Zoho Books record, with GSTIN, currency, payment terms, and a valid PO where the customer uses them." };

export default function ValidationChecklist({ contractId, checks, documents, saving, call }: {
  contractId: string;
  checks: TeamCheck[];
  documents: { name: string; uri?: string | null; type?: string | null }[];
  saving: boolean;
  call: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const [links, setLinks] = useState("");
  const [adding, setAdding] = useState(false);
  const allDone = checks.every((c) => c.done);

  const attach = async () => {
    const add = links.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [a, b] = l.split("|").map((s) => s.trim()); return b ? { name: a, uri: b, type: "Link" } : { name: a.replace(/^https?:\/\//, "").slice(0, 80), uri: a, type: "Link" }; });
    if (!add.length) return;
    if (await call(`/api/contracts/${contractId}`, "PATCH", { documents: [...documents, ...add] })) { setLinks(""); setAdding(false); }
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
                    <div className="space-y-2">
                      <textarea className={inputClass} rows={3} value={links} onChange={(e) => setLinks(e.target.value)} placeholder={"MSA signed 2026 | https://dwao.sharepoint.com/...\nPO 4500093633 | https://dwao.sharepoint.com/..."} />
                      <div className="flex gap-2">
                        <button disabled={saving} onClick={attach} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium">Attach</button>
                        <button onClick={() => setAdding(false)} className="px-3 py-1.5 border border-gray-300 rounded-md text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAdding(true)} className="text-xs text-blue-700 hover:underline">Attach SharePoint links (one per line, “Name | link”)</button>
                  )}
                </div>
              )}
              <div className="mt-4">
                {c.done ? (
                  <div className="text-xs text-gray-600">Checked on {formatDate(c.checked_at)}. <button disabled={saving} onClick={() => call(`/api/contracts/${contractId}`, "PATCH", { check: c.team, done: false })} className="text-blue-700 hover:underline">Undo</button></div>
                ) : (
                  <button disabled={saving || blockers.length > 0} title={blockers.length ? blockers.join("; ") : undefined} onClick={() => call(`/api/contracts/${contractId}`, "PATCH", { check: c.team, done: true })} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium disabled:opacity-40">
                    Mark {c.team === "paper" ? "paper" : c.team === "commercial" ? "rules" : "Zoho and tax"} checked
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
