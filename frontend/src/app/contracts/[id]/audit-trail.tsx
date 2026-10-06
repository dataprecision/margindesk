"use client";

import { useEffect, useState } from "react";

// Who did what to this contract, its lines, POs, drafts and agreement.
// Loaded on demand; accounts can download it as CSV.

interface Entry { id: string; at: string; by: string; entity: string; name: string; action: string; changes: { field: string; from: string; to: string }[]; note: string | null }

const ACTION: Record<string, string> = { create: "added", update: "changed", delete: "deleted", revise: "new version from a date", approval_submit: "submitted for approval", approval_approve: "approved", approval_send_back: "sent back / revoked", approval_withdraw: "withdrew submission", check_paper: "contracting check", check_commercial: "billing-lines check", check_billing: "Zoho and tax check" };
const ENTITY: Record<string, string> = { Contract: "Contract", ContractLine: "Billing line", Agreement: "Agreement", ContractPurchaseOrder: "Purchase order", DraftEstimate: "Draft estimate" };
const FIELD: Record<string, string> = { approval_status: "approval", amount_text: "amount as written", start_date: "start", end_date: "end", bill_to: "invoiced to", source_document: "document", rule_status: "line status", advance_or_arrears: "timing", input_needed: "input needed", approved_by: "approved by", submitted_by: "submitted by", last_edited_by: "edited by", approval_note: "note" };
const fmtAt = (s: string) => new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function AuditTrail({ contractId }: { contractId: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (!open || entries) return;
    fetch(`/api/contracts/${contractId}/audit`).then((r) => r.json()).then((d) => setEntries(d.entries ?? [])).catch(() => setEntries([]));
  }, [open, entries, contractId]);
  const shown = entries ? (all ? entries : entries.slice(0, 30)) : [];
  return (
    <section className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => setOpen(!open)} className="text-left">
          <h2 className="text-lg font-semibold text-gray-900">Audit trail {open ? "▾" : "▸"}</h2>
          <p className="text-xs text-gray-500 mt-1">Every change, check and approval on this contract, with who and when. For accounts and auditors.</p>
        </button>
        <a href={`/api/contracts/${contractId}/audit?format=csv`} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50">Download CSV</a>
      </div>
      {open && (
        <div className="border-t border-gray-200">
          {!entries ? <div className="px-6 py-6 text-sm text-gray-500">Loading…</div> : entries.length === 0 ? <div className="px-6 py-6 text-sm text-gray-500">Nothing recorded yet.</div> : (
            <ul className="divide-y divide-gray-100">
              {shown.map((e) => (
                <li key={e.id} className="px-6 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs text-gray-500 tabular-nums whitespace-nowrap">{fmtAt(e.at)}</span>
                    <span className="font-medium text-gray-900">{e.by}</span>
                    <span className="text-gray-700">{ACTION[e.action] ?? e.action}</span>
                    <span className="text-gray-500">{ENTITY[e.entity] ?? e.entity}: {e.name}</span>
                  </div>
                  {e.note && <div className="text-xs text-gray-700 mt-0.5">“{e.note}”</div>}
                  {e.changes.length > 0 && (
                    <ul className="mt-1 text-xs text-gray-600 space-y-0.5">
                      {e.changes.slice(0, 8).map((c, i) => <li key={i}><span className="text-gray-500">{FIELD[c.field] ?? c.field.replace(/_/g, " ")}:</span> {c.from} <span className="text-gray-400">→</span> {c.to}</li>)}
                      {e.changes.length > 8 && <li className="text-gray-400">+{e.changes.length - 8} more fields</li>}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {entries && entries.length > 30 && !all && <div className="px-6 py-3 border-t border-gray-100"><button onClick={() => setAll(true)} className="text-sm text-blue-700 hover:underline">Show all {entries.length}</button></div>}
        </div>
      )}
    </section>
  );
}
