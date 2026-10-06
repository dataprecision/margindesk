// Maker-checker approval shared by agreements (MSA / NDA), contracts and
// billing lines. The maker is whoever last changed the record; the checker
// must be someone else. Any edit drops the record back to draft, so an
// approval always refers to the record as it is now.

import { Prisma, type UserRole } from "@prisma/client";

export type ApprovalStatus = "draft" | "submitted" | "approved" | "sent_back";
export type ApprovalAction = "submit" | "approve" | "send_back" | "withdraw";
export type ApprovalKind = "agreement" | "contract" | "line";

export const APPROVAL_LABEL: Record<ApprovalStatus | "lapsed", string> = { draft: "Draft", submitted: "Awaiting approval", approved: "Approved", sent_back: "Sent back", lapsed: "Approval lapsed" };
export const APPROVAL_STYLE: Record<ApprovalStatus | "lapsed", string> = {
  draft: "bg-gray-100 text-gray-700", submitted: "bg-blue-100 text-blue-800", approved: "bg-green-100 text-green-700", sent_back: "bg-red-100 text-red-700", lapsed: "bg-amber-100 text-amber-800",
};

/** Who may approve each kind. Submitting is open to every contract role. */
export const APPROVER_ROLES: Record<ApprovalKind, UserRole[]> = {
  agreement: ["owner", "legal"],
  line: ["owner", "finance", "billing"],
  contract: ["owner", "finance"],
};

export interface ApprovalFields {
  approval_status: string;
  last_edited_by: string | null;
  last_edited_at: Date | string | null;
  submitted_by: string | null;
  submitted_at: Date | string | null;
  approved_by: string | null;
  approved_at: Date | string | null;
  approval_note: string | null;
  approved_against?: unknown;
}

export interface ApprovalView {
  status: ApprovalStatus | "lapsed";
  stored: ApprovalStatus;
  lapsed: string[]; // why an approval no longer holds
  by: string | null; // who approved, submitted or sent back
  at: Date | string | null;
  note: string | null;
  maker: string | null;
}

export const actor = (user: { email?: string | null; name?: string | null }) => (user.email || user.name || "").toLowerCase();

/** The data to merge into any edit, so the record goes back to draft with its maker recorded. */
export function editResets(user: { email?: string | null; name?: string | null }) {
  return { approval_status: "draft", last_edited_by: actor(user), last_edited_at: new Date(), submitted_by: null, submitted_at: null, approved_by: null, approved_at: null, approval_note: null, approved_against: Prisma.DbNull };
}

/** Maker-checker: the approver can be neither the last editor nor the submitter. */
export function checkerProblem(user: { email?: string | null; name?: string | null; role: UserRole }, kind: ApprovalKind, rec: ApprovalFields): string | null {
  if (!APPROVER_ROLES[kind].includes(user.role)) return `Only ${APPROVER_ROLES[kind].join(" or ")} can approve a${kind === "agreement" ? "n agreement" : kind === "line" ? " billing line" : " contract"}`;
  const me = actor(user);
  if (rec.last_edited_by && rec.last_edited_by === me) return "You made the last change to this record, so someone else must approve it (maker-checker)";
  if (rec.submitted_by && rec.submitted_by === me) return "You submitted this record, so someone else must approve it (maker-checker)";
  return null;
}

/** What the approval looks like now: approved, unless something has since made it lapse. */
export function approvalView(rec: ApprovalFields, lapsed: string[] = []): ApprovalView {
  const stored = (["draft", "submitted", "approved", "sent_back"].includes(rec.approval_status) ? rec.approval_status : "draft") as ApprovalStatus;
  const status = stored === "approved" && lapsed.length ? "lapsed" : stored;
  const by = stored === "approved" ? rec.approved_by : stored === "submitted" ? rec.submitted_by : stored === "sent_back" ? rec.approved_by : rec.last_edited_by;
  const at = stored === "approved" ? rec.approved_at : stored === "submitted" ? rec.submitted_at : stored === "sent_back" ? rec.approved_at : rec.last_edited_at;
  return { status, stored, lapsed, by, at, note: rec.approval_note, maker: rec.last_edited_by };
}

const d = (v: Date | string | null | undefined) => (v ? new Date(v) : null);

/** Why an agreement's approval no longer holds. */
export function agreementLapse(a: { start_date: Date | string | null; end_date: Date | string | null }, today = new Date()): string[] {
  const out: string[] = [];
  const end = d(a.end_date);
  if (end && end < today) out.push(`the agreement ended on ${end.toISOString().slice(0, 10)}`);
  return out;
}

/** Why a billing line's approval no longer holds. */
export function lineLapse(l: { start_date: Date | string | null; end_date: Date | string | null; rule_status?: string }, agreement: { end_date: Date | string | null; approval_status?: string } | null, today = new Date()): string[] {
  const out: string[] = [];
  const end = d(l.end_date), agEnd = agreement ? d(agreement.end_date) : null;
  if (end && end < today) out.push(`the line ended on ${end.toISOString().slice(0, 10)}`);
  if (agEnd && agEnd < today) out.push("the governing agreement has ended");
  if (agEnd && end && end > agEnd) out.push("the line runs beyond the governing agreement");
  if (l.rule_status === "retired") out.push("the line was retired");
  return out;
}

/** Why a contract's approval no longer holds: paper, agreement or any line changed or lapsed since. */
export function contractLapse(c: { start_date: Date | string | null; end_date: Date | string | null; approved_at: Date | string | null; paper_checked_at: Date | string | null; commercial_checked_at: Date | string | null; billing_checked_at: Date | string | null },
  agreement: ApprovalFields & { start_date: Date | string | null; end_date: Date | string | null } | null,
  lines: (ApprovalFields & { start_date: Date | string | null; end_date: Date | string | null; rule_status: string; shape: string | null })[], today = new Date()): string[] {
  const out: string[] = [];
  const end = d(c.end_date);
  if (end && end < today) out.push(`the contract ended on ${end.toISOString().slice(0, 10)}`);
  if (!c.paper_checked_at || !c.commercial_checked_at || !c.billing_checked_at) out.push("a team check was undone");
  if (agreement) {
    if (agreement.approval_status !== "approved") out.push(`the governing agreement is ${APPROVAL_LABEL[(agreement.approval_status as ApprovalStatus) ?? "draft"].toLowerCase()}`);
    for (const r of agreementLapse(agreement, today)) out.push(r);
    const agEnd = d(agreement.end_date);
    if (agEnd && end && end > agEnd) out.push("the contract runs beyond its agreement");
  }
  const live = lines.filter((l) => l.rule_status !== "retired");
  const notApproved = live.filter((l) => l.approval_status !== "approved");
  if (notApproved.length) out.push(`${notApproved.length} billing line${notApproved.length > 1 ? "s are" : " is"} not approved`);
  const lapsedLines = live.filter((l) => l.approval_status === "approved" && lineLapse(l, agreement, today).some((r) => !/ended on/.test(r)));
  if (lapsedLines.length) out.push(`${lapsedLines.length} billing line approval${lapsedLines.length > 1 ? "s have" : " has"} lapsed`);
  return Array.from(new Set(out));
}

/** What must be true before a record can be submitted or approved; empty means it may. */
export function approvalBlockers(kind: ApprovalKind, rec: any, ctx: { agreement?: any; lines?: any[]; missingParams?: (shape: string, params: any) => string[] } = {}): string[] {
  const out: string[] = [];
  if (kind === "agreement") {
    if (!rec.start_date) out.push("start date missing");
    if (!rec.end_date && rec.auto_renewal !== true) out.push("end date missing (or mark it as auto-renewing)");
    const docs = Array.isArray(rec.documents) ? rec.documents : [];
    if (!docs.some((x: any) => typeof x?.uri === "string" && /^https?:\/\//i.test(x.uri))) out.push("no signed document linked from SharePoint");
    if (rec.signed === false) out.push("recorded as unsigned");
  }
  if (kind === "line") {
    if (!rec.shape) out.push("how it is billed is not set");
    else if (ctx.missingParams) { const g = ctx.missingParams(rec.shape, rec.params ?? {}); if (g.length) out.push(`billing numbers still needed: ${g.join(", ")}`); }
    if (!String(rec.quote ?? "").trim()) out.push("the clause as written (with page or clause number) is missing");
    if (!rec.source_document) out.push("the source document is not named");
    if (!rec.start_date) out.push("start date missing");
    if (!/^(contract|purchase order)$/i.test(String(rec.read_from ?? "")) && !String(rec.approval_note ?? "").trim()) out.push("not read from a signed contract or PO: an evidence note (who agreed it, and the email link) is required");
    if (rec.rule_status === "retired") out.push("the line is retired");
  }
  if (kind === "contract") {
    if (!rec.paper_checked_at) out.push("contracting has not checked the paper");
    if (!rec.commercial_checked_at) out.push("the billing lines are not checked");
    if (!rec.billing_checked_at) out.push("Zoho and tax are not checked");
    if (rec.agreement_id && ctx.agreement && ctx.agreement.approval_status !== "approved") out.push("the governing agreement is not approved");
    if (ctx.agreement && agreementLapse(ctx.agreement).length) out.push("the governing agreement has ended");
    const live = (ctx.lines ?? []).filter((l) => l.rule_status !== "retired");
    if (!live.length) out.push("no live billing line");
    const na = live.filter((l) => l.approval_status !== "approved");
    if (na.length) out.push(`${na.length} billing line${na.length > 1 ? "s" : ""} not approved`);
  }
  return out;
}
