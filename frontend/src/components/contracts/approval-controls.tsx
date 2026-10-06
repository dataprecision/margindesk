"use client";

import { useState } from "react";
import { formatDate } from "@/lib/contracts/status";
import { APPROVAL_LABEL, APPROVAL_STYLE, APPROVER_ROLES, type ApprovalKind, type ApprovalView } from "@/lib/contracts/approval";

// The maker-checker buttons for one record: Submit for approval, Withdraw,
// Approve, Send back (with a reason). The server enforces who may do what;
// this only hides what cannot apply.

export function ApprovalBadge({ approval, size = "xs" }: { approval: ApprovalView; size?: "xs" | "sm" }) {
  return <span title={approval.lapsed.join("; ") || undefined} className={`inline-block px-2 py-0.5 rounded-full text-${size} font-medium whitespace-nowrap ${APPROVAL_STYLE[approval.status]}`}>{APPROVAL_LABEL[approval.status]}</span>;
}

export default function ApprovalControls({ kind, endpoint, approval, role, me, saving, call, compact, blockers }: {
  kind: ApprovalKind;
  endpoint: string; // …/approval
  approval: ApprovalView;
  role?: string;
  me?: string | null;
  saving: boolean;
  call: (url: string, method: string, body?: unknown) => Promise<boolean | any>;
  compact?: boolean;
  blockers?: string[];
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const mine = (me ?? "").toLowerCase();
  const canApproveRole = !!role && (APPROVER_ROLES[kind] as string[]).includes(role);
  const isMaker = !!mine && (approval.maker === mine || (approval.stored === "submitted" && approval.by === mine));
  const noun = kind === "agreement" ? "agreement" : kind === "contract" ? "contract" : "billing line";
  const act = (action: string, n?: string) => call(endpoint, "POST", { action, note: n });

  const who = approval.by ? <span className="text-gray-500">{approval.status === "approved" ? "approved" : approval.status === "lapsed" ? "approved" : approval.stored === "submitted" ? "submitted" : approval.stored === "sent_back" ? "sent back" : "last edited"} by {approval.by}{approval.at ? ` on ${formatDate(approval.at)}` : ""}</span> : null;

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <ApprovalBadge approval={approval} size={compact ? "xs" : "sm"} />
        {who}
      </div>
      {approval.status === "lapsed" && <div className="text-xs text-amber-800">No longer holds: {approval.lapsed.join("; ")}. Edit and resubmit.</div>}
      {approval.stored === "sent_back" && approval.note && <div className="text-xs text-red-700">Reason: {approval.note}</div>}
      {approval.stored === "approved" && approval.note && approval.status !== "lapsed" && <div className="text-xs text-gray-600">Note: {approval.note}</div>}
      {blockers && blockers.length > 0 && approval.stored !== "approved" && <div className="text-xs text-amber-800">Before it can be submitted: {blockers.join("; ")}</div>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {(approval.stored === "draft" || approval.stored === "sent_back" || approval.status === "lapsed") && (
          <button disabled={saving || (blockers?.length ?? 0) > 0} title={blockers?.length ? blockers.join("; ") : undefined} onClick={() => act("submit")} className="text-blue-700 hover:underline disabled:opacity-40 disabled:no-underline">Submit for approval</button>
        )}
        {approval.stored === "submitted" && isMaker && <button disabled={saving} onClick={() => act("withdraw")} className="text-gray-600 hover:underline">Withdraw</button>}
        {approval.stored === "submitted" && canApproveRole && !isMaker && (
          <>
            <button disabled={saving} onClick={() => act("approve")} className="font-medium text-green-700 hover:underline">Approve {noun}</button>
            <button disabled={saving} onClick={() => setReason("")} className="text-red-700 hover:underline">Send back</button>
          </>
        )}
        {approval.stored === "submitted" && canApproveRole && isMaker && <span className="text-gray-500">Waiting for someone else to approve (you made or submitted it).</span>}
        {approval.stored === "submitted" && !canApproveRole && !isMaker && <span className="text-gray-500">Awaiting {APPROVER_ROLES[kind].join(" or ")}.</span>}
        {approval.stored === "approved" && canApproveRole && <button disabled={saving} onClick={() => setReason("")} className="text-gray-500 hover:underline">Revoke approval</button>}
      </div>
      {reason !== null && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 space-y-2">
          <textarea className="w-full px-2 py-1 border border-gray-300 rounded-md text-xs" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={approval.stored === "approved" ? `Why is the approval of this ${noun} being revoked? (kept in the audit trail)` : `Why is this ${noun} being sent back? (kept in the audit trail)`} autoFocus />
          <div className="flex gap-2">
            <button disabled={saving || !note.trim()} onClick={async () => { const ok = await act("send_back", note.trim()); if (ok) { setReason(null); setNote(""); } }} className="px-2 py-1 bg-red-600 text-white rounded text-xs font-medium disabled:opacity-40">{approval.stored === "approved" ? "Revoke" : "Send back"}</button>
            <button onClick={() => { setReason(null); setNote(""); }} className="px-2 py-1 border border-gray-300 bg-white rounded text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
