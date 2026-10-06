import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseDate } from "@/lib/contracts/api";
import { editResets } from "@/lib/contracts/approval";

const TEXT = ["title", "kind", "renewal_note", "notes"] as const;

/** PATCH /api/agreements/[id]: dates, renewal, notice period, documents, legal's paper check. */
export const PATCH = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    const before = await prisma.agreement.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
    const data: Record<string, unknown> = {};
    for (const f of TEXT) if (f in body) data[f] = body[f] === "" ? null : body[f];
    if (data.title === null) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    if ("start_date" in body) data.start_date = parseDate(body.start_date);
    if ("end_date" in body) data.end_date = parseDate(body.end_date);
    if ("auto_renewal" in body) data.auto_renewal = body.auto_renewal == null || body.auto_renewal === "" ? null : !!body.auto_renewal;
    if ("notice_days" in body) data.notice_days = body.notice_days === "" || body.notice_days == null ? null : Number(body.notice_days);
    if ("signed" in body) data.signed = body.signed == null || body.signed === "" ? null : !!body.signed;
    if ("documents" in body && Array.isArray(body.documents)) data.documents = body.documents;
    if ("paper_checked" in body) {
      if (!["owner", "legal"].includes(user.role)) return NextResponse.json({ error: "Only contracting can check the paper" }, { status: 403 });
      data.paper_checked_by = body.paper_checked ? user.name || user.email : null;
      data.paper_checked_at = body.paper_checked ? new Date() : null;
    }
    const substantive = Object.keys(data).some((k) => !k.startsWith("paper_checked"));
    if (substantive) Object.assign(data, editResets(user));
    const agreement = await prisma.agreement.update({ where: { id }, data });
    // Contracts approved under this agreement were approved against its old dates and documents.
    if (substantive) await prisma.contract.updateMany({ where: { agreement_id: id, approval_status: { in: ["approved", "submitted"] } }, data: editResets(user) });
    await audit(user, "Agreement", id, "update", before, agreement);
    return NextResponse.json({ agreement });
  } catch (error: any) {
    console.error("Error updating agreement:", error);
    return NextResponse.json({ error: error?.message || "Failed to update agreement" }, { status: 400 });
  }
});

/** DELETE /api/agreements/[id]: contracts under it are kept and unlinked. */
export const DELETE = withRole(["owner", "legal"], async (_req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const before = await prisma.agreement.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
    await prisma.agreement.delete({ where: { id } });
    await audit(user, "Agreement", id, "delete", before, undefined);
    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error("Error deleting agreement:", error);
    return NextResponse.json({ error: error?.message || "Failed to delete agreement" }, { status: 400 });
  }
});
