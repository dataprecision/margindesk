import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES } from "@/lib/contracts/api";

const SKIP = new Set(["updated_at", "created_at", "last_edited_at", "approved_against", "rule_evidence", "review_pointers", "open_questions"]);
const fmt = (v: any) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 120));

/**
 * GET /api/contracts/[id]/audit[?format=csv]
 * Everything that happened to this contract, its billing lines, purchase
 * orders, drafts and governing agreement: who, when, what changed.
 */
export const GET = withRole(CONTRACT_API_ROLES, async (req: Request, { params }) => {
  try {
    const { id } = await params;
    const c = await prisma.contract.findUnique({ where: { id }, select: { id: true, counterparty: true, agreement_id: true, lines: { select: { id: true, service: true } }, purchase_orders: { select: { id: true, po_number: true } }, draft_estimates: { select: { id: true, period: true } } } });
    if (!c) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    const names = new Map<string, string>([[c.id, c.counterparty]]);
    for (const l of c.lines) names.set(l.id, l.service);
    for (const p of c.purchase_orders) names.set(p.id, `PO ${p.po_number ?? ""}`.trim());
    for (const d of c.draft_estimates) names.set(d.id, `Draft ${d.period.toISOString().slice(0, 7)}`);
    const ids = [c.id, ...(c.agreement_id ? [c.agreement_id] : []), ...c.lines.map((l) => l.id), ...c.purchase_orders.map((p) => p.id), ...c.draft_estimates.map((d) => d.id)];
    // Deleted lines leave entries too: include every ContractLine entry whose before/after names this contract.
    const [rows, deletedLines] = await Promise.all([
      prisma.auditLog.findMany({ where: { entity_id: { in: ids } }, orderBy: { at: "desc" }, take: 1000 }),
      prisma.auditLog.findMany({ where: { entity: "ContractLine", entity_id: { notIn: ids }, OR: [{ before_json: { path: ["contract_id"], equals: id } }, { after_json: { path: ["contract_id"], equals: id } }] }, orderBy: { at: "desc" }, take: 200 }),
    ]);
    const all = [...rows, ...deletedLines].sort((a, b) => b.at.getTime() - a.at.getTime());
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(all.map((r) => r.actor_id))) } }, select: { id: true, name: true, email: true } });
    const who = new Map(users.map((u) => [u.id, u.name || u.email]));
    const entries = all.map((r) => {
      const before = (r.before_json ?? {}) as Record<string, any>, after = (r.after_json ?? {}) as Record<string, any>;
      const changes = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
        .filter((k) => !SKIP.has(k) && JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
        .map((k) => ({ field: k, from: fmt(before[k]), to: fmt(after[k]) }));
      const name = names.get(r.entity_id) ?? (r.entity === "ContractLine" ? after.service ?? before.service ?? "billing line" : r.entity === "Agreement" ? after.title ?? before.title ?? "agreement" : r.entity_id);
      return { id: r.id, at: r.at, by: who.get(r.actor_id) ?? r.actor_id, entity: r.entity, entity_id: r.entity_id, name, action: r.action, changes, note: after.approval_note && after.approval_note !== before.approval_note ? after.approval_note : null };
    });
    if (new URL(req.url).searchParams.get("format") === "csv") {
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = ["when,who,record,name,action,field,from,to,note", ...entries.flatMap((e) => (e.changes.length ? e.changes : [{ field: "", from: "", to: "" }]).map((ch) => [e.at.toISOString(), e.by, e.entity, e.name, e.action, ch.field, ch.from, ch.to, e.note ?? ""].map(esc).join(",")))].join("\n");
      return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="audit-${c.counterparty.replace(/[^\w-]+/g, "_")}.csv"` } });
    }
    return NextResponse.json({ entries });
  } catch (error: any) {
    console.error("Error reading audit trail:", error);
    return NextResponse.json({ error: error?.message || "Failed to read the audit trail" }, { status: 500 });
  }
});
