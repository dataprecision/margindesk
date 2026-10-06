// The server side of an approval action on one record: shared by the three
// approval routes. Validates the step, enforces maker-checker, freezes what
// was approved (documents with their SharePoint modified dates) and writes
// the audit log.

import { Prisma, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { missingParams } from "@/lib/billing/shapes";
import { audit } from "@/lib/contracts/api";
import { documentVersions } from "@/lib/sharepoint";
import { APPROVAL_LABEL, APPROVER_ROLES, actor, approvalBlockers, checkerProblem, type ApprovalAction, type ApprovalKind } from "./approval";

type User = { id: string; email?: string | null; name?: string | null; role: UserRole };

const SUBMITTER_ROLES: UserRole[] = ["owner", "finance", "legal", "billing"];

export async function runApproval(kind: ApprovalKind, id: string, action: ApprovalAction, note: string | null, user: User): Promise<{ ok: true; record: any } | { ok: false; error: string; status: number }> {
  if (!["submit", "approve", "send_back", "withdraw"].includes(action)) return { ok: false, error: "Unknown action", status: 400 };
  const model: any = kind === "agreement" ? prisma.agreement : kind === "contract" ? prisma.contract : prisma.contractLine;
  const rec = await model.findUnique({ where: { id }, include: kind === "contract" ? { agreement: true, lines: true } : kind === "line" ? { contract: { select: { id: true, agreement: true } } } : undefined });
  if (!rec) return { ok: false, error: "Not found", status: 404 };
  const entity = kind === "agreement" ? "Agreement" : kind === "contract" ? "Contract" : "ContractLine";
  const me = actor(user);
  const data: Record<string, unknown> = {};

  if (action === "submit") {
    if (!SUBMITTER_ROLES.includes(user.role)) return { ok: false, error: "Your role cannot submit for approval", status: 403 };
    if (rec.approval_status === "approved") return { ok: false, error: "Already approved", status: 400 };
    const blockers = approvalBlockers(kind, { ...rec, approval_note: note ?? rec.approval_note }, { agreement: kind === "contract" ? rec.agreement : kind === "line" ? rec.contract?.agreement : undefined, lines: rec.lines, missingParams });
    if (blockers.length) return { ok: false, error: `Not ready: ${blockers.join("; ")}`, status: 400 };
    Object.assign(data, { approval_status: "submitted", submitted_by: me, submitted_at: new Date(), approved_by: null, approved_at: null, approval_note: note ?? rec.approval_note ?? null });
    if (!rec.last_edited_by) Object.assign(data, { last_edited_by: me, last_edited_at: new Date() });
  }
  if (action === "withdraw") {
    if (rec.approval_status !== "submitted") return { ok: false, error: "Nothing to withdraw", status: 400 };
    if (rec.submitted_by !== me && user.role !== "owner") return { ok: false, error: "Only the submitter can withdraw it", status: 403 };
    Object.assign(data, { approval_status: "draft", submitted_by: null, submitted_at: null });
  }
  if (action === "approve" || action === "send_back") {
    const revoking = action === "send_back" && rec.approval_status === "approved";
    if (rec.approval_status !== "submitted" && !revoking) return { ok: false, error: `It is ${APPROVAL_LABEL[rec.approval_status as keyof typeof APPROVAL_LABEL]?.toLowerCase() ?? rec.approval_status}; it must be submitted for approval first`, status: 400 };
    // Revoking an approval needs an approver role but not a different person: the approver may withdraw their own approval.
    const problem = revoking ? (APPROVER_ROLES[kind].includes(user.role) ? null : "Only an approver can revoke an approval") : checkerProblem(user, kind, rec);
    if (problem) return { ok: false, error: problem, status: 403 };
    if (action === "send_back") {
      if (!String(note ?? "").trim()) return { ok: false, error: "Say why it is being sent back", status: 400 };
      Object.assign(data, { approval_status: "sent_back", approved_by: me, approved_at: new Date(), approval_note: note, approved_against: Prisma.DbNull });
    } else {
      const blockers = approvalBlockers(kind, rec, { agreement: kind === "contract" ? rec.agreement : kind === "line" ? rec.contract?.agreement : undefined, lines: rec.lines, missingParams });
      if (blockers.length) return { ok: false, error: `Cannot approve: ${blockers.join("; ")}`, status: 400 };
      const docs: { name: string; uri?: string | null }[] = kind === "line"
        ? ((await prisma.contract.findUnique({ where: { id: rec.contract_id }, select: { documents: true } }))?.documents as any[] ?? []).filter((x) => rec.source_document && x?.name && String(rec.source_document).toLowerCase().includes(String(x.name).toLowerCase()))
        : Array.isArray(rec.documents) ? rec.documents : [];
      const versions = await documentVersions(docs.map((x) => x.uri ?? "").filter((u) => /^https?:\/\//i.test(u)));
      const against = kind === "line"
        ? { service: rec.service, amount_text: rec.amount_text, currency: rec.currency, unit: rec.unit, start_date: rec.start_date, end_date: rec.end_date, quote: rec.quote, source_document: rec.source_document, read_from: rec.read_from, shape: rec.shape, params: rec.params, period: rec.period, advance_or_arrears: rec.advance_or_arrears, documents: docs.map((x) => ({ ...x, ...versions[x.uri ?? ""] })) }
        : kind === "agreement"
          ? { title: rec.title, kind: rec.kind, start_date: rec.start_date, end_date: rec.end_date, notice_days: rec.notice_days, auto_renewal: rec.auto_renewal, signed: rec.signed, documents: docs.map((x) => ({ ...x, ...versions[x.uri ?? ""] })) }
          : { counterparty: rec.counterparty, basis: rec.basis, bill_to: rec.bill_to, start_date: rec.start_date, end_date: rec.end_date, agreement_id: rec.agreement_id, agreement_approved_at: rec.agreement?.approved_at ?? null, checks: { paper: rec.paper_checked_at, commercial: rec.commercial_checked_at, billing: rec.billing_checked_at }, lines: (rec.lines ?? []).filter((l: any) => l.rule_status !== "retired").map((l: any) => ({ id: l.id, service: l.service, approved_by: l.approved_by, approved_at: l.approved_at })), documents: docs.map((x) => ({ ...x, ...versions[x.uri ?? ""] })) };
      Object.assign(data, { approval_status: "approved", approved_by: me, approved_at: new Date(), approval_note: note ?? rec.approval_note ?? null, approved_against: JSON.parse(JSON.stringify(against)) });
      if (kind === "line") Object.assign(data, { rule_status: "confirmed", confirmed_by: user.name || user.email, confirmed_at: new Date() });
    }
  }
  if (kind === "line" && action !== "approve" && rec.rule_status === "confirmed") Object.assign(data, { rule_status: "proposed", confirmed_by: null, confirmed_at: null });

  const { agreement: _a, lines: _l, contract: _c, ...before } = rec;
  const record = await model.update({ where: { id }, data });
  await audit(user, entity, id, `approval_${action}`, before, record);
  return { ok: true, record };
}
