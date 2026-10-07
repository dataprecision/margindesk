import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES } from "@/lib/contracts/api";
import { APPROVER_ROLES, actor, agreementLapse, approvalView, type ApprovalKind } from "@/lib/contracts/approval";

/**
 * GET /api/approvals
 * The approval queue for the signed-in person: what awaits a role they hold
 * and did not make or submit themselves ("for_me"), what they made or
 * submitted that waits on someone else ("mine"), and recent decisions on
 * their own submissions ("decided").
 */
export const GET = withRole(CONTRACT_API_ROLES, async (_req: Request, { user }) => {
  try {
    const me = actor(user);
    const today = new Date();
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [agreements, lines, contracts] = await Promise.all([
      prisma.agreement.findMany({ where: { OR: [{ approval_status: "submitted" }, { approval_status: { in: ["approved", "sent_back"] }, approved_at: { gte: since } }] }, include: { client: { select: { id: true, name: true } }, contracts: { select: { id: true, counterparty: true } } } }),
      prisma.contractLine.findMany({ where: { OR: [{ approval_status: "submitted" }, { approval_status: { in: ["approved", "sent_back"] }, approved_at: { gte: since } }] }, include: { contract: { select: { id: true, counterparty: true, agreement: { select: { end_date: true } } } } } }),
      prisma.contract.findMany({ where: { OR: [{ approval_status: "submitted" }, { approval_status: { in: ["approved", "sent_back"] }, approved_at: { gte: since } }] }, select: { id: true, counterparty: true, basis: true, start_date: true, end_date: true, approval_status: true, last_edited_by: true, last_edited_at: true, submitted_by: true, submitted_at: true, approved_by: true, approved_at: true, approval_note: true, client: { select: { id: true, name: true } } } }),
    ]);
    type Item = { kind: ApprovalKind; id: string; title: string; detail: string; contract_id: string | null; company_id: string | null; company: string | null; endpoint: string; approval: ReturnType<typeof approvalView>; can_approve: boolean; is_mine: boolean };
    const items: Item[] = [
      ...agreements.map((a) => ({ kind: "agreement" as const, id: a.id, title: `${a.kind}: ${a.title}`, detail: `${a.start_date ? a.start_date.toISOString().slice(0, 10) : "?"} → ${a.end_date ? a.end_date.toISOString().slice(0, 10) : "open"}${a.contracts.length ? ` · governs ${a.contracts.map((c) => c.counterparty).join(", ")}` : ""}`, contract_id: a.contracts[0]?.id ?? null, company_id: a.client.id, company: a.client.name, endpoint: `/api/agreements/${a.id}/approval`, approval: approvalView(a, agreementLapse(a, today)), rec: a })),
      ...lines.map((l) => ({ kind: "line" as const, id: l.id, title: l.service, detail: `${l.currency} ${l.amount_text}${l.unit ? ` ${l.unit}` : ""}${l.source_document ? ` · ${l.source_document}` : ""}`, contract_id: l.contract.id, company_id: null, company: l.contract.counterparty, endpoint: `/api/contracts/lines/${l.id}/approval`, approval: approvalView(l), rec: l })),
      ...contracts.map((c) => ({ kind: "contract" as const, id: c.id, title: `Contract: ${c.counterparty}`, detail: `${c.basis} · ${c.start_date ? c.start_date.toISOString().slice(0, 10) : "?"} → ${c.end_date ? c.end_date.toISOString().slice(0, 10) : "open"}`, contract_id: c.id, company_id: c.client?.id ?? null, company: c.client?.name ?? c.counterparty, endpoint: `/api/contracts/${c.id}/approval`, approval: approvalView(c), rec: c })),
    ].map(({ rec, ...it }) => {
      const maker = rec.last_edited_by === me || rec.submitted_by === me;
      return { ...it, can_approve: it.approval.stored === "submitted" && APPROVER_ROLES[it.kind].includes(user.role) && !maker, is_mine: maker };
    });
    const byAge = (a: Item, b: Item) => new Date(a.approval.at ?? 0).getTime() - new Date(b.approval.at ?? 0).getTime();
    return NextResponse.json({
      for_me: items.filter((i) => i.can_approve).sort(byAge),
      // Submitted and waiting, but not for this person: their own, or another role's.
      waiting: items.filter((i) => i.approval.stored === "submitted" && !i.can_approve).sort(byAge),
      decided: items.filter((i) => i.approval.stored !== "submitted").sort((a, b) => -byAge(a, b)),
    });
  } catch (error: any) {
    console.error("Error loading approvals:", error);
    return NextResponse.json({ error: error?.message || "Failed to load approvals" }, { status: 500 });
  }
});
