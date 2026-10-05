import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseDate } from "@/lib/contracts/api";
import { contractStatus } from "@/lib/contracts/status";

/** GET /api/companies/[id]/agreements: the company's MSA / NDA / framework agreements with the contracts each governs. */
export const GET = withRole(CONTRACT_API_ROLES, async (_req: Request, { params }) => {
  try {
    const { id } = await params;
    const agreements = await prisma.agreement.findMany({
      where: { client_id: id },
      include: { contracts: { select: { id: true, counterparty: true, basis: true, start_date: true, end_date: true, review_bucket: true }, orderBy: { counterparty: "asc" } } },
      orderBy: [{ kind: "asc" }, { end_date: "desc" }],
    });
    const today = new Date();
    return NextResponse.json({
      agreements: agreements.map((a) => ({
        ...a,
        status: contractStatus(a.start_date, a.end_date, today),
        contracts: a.contracts.map((c) => ({ ...c, beyond_agreement: !!(a.end_date && c.end_date && c.end_date > a.end_date) })),
      })),
    });
  } catch (error) {
    console.error("Error fetching agreements:", error);
    return NextResponse.json({ error: "Failed to fetch agreements" }, { status: 500 });
  }
});

/** POST /api/companies/[id]/agreements: add an MSA, NDA or framework agreement by hand. */
export const POST = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    const company = await prisma.client.findUnique({ where: { id }, select: { id: true } });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const agreement = await prisma.agreement.create({
      data: {
        client_id: id, kind: ["MSA", "NDA", "Framework", "Other"].includes(body.kind) ? body.kind : "MSA", title,
        start_date: parseDate(body.start_date), end_date: parseDate(body.end_date), auto_renewal: body.auto_renewal == null ? null : !!body.auto_renewal,
        renewal_note: body.renewal_note || null, notice_days: body.notice_days === "" || body.notice_days == null ? null : Number(body.notice_days),
        signed: body.signed == null ? null : !!body.signed, documents: Array.isArray(body.documents) ? body.documents : [], notes: body.notes || null,
      },
    });
    await audit(user, "Agreement", agreement.id, "create", undefined, agreement);
    return NextResponse.json({ agreement }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating agreement:", error);
    return NextResponse.json({ error: error?.message || "Failed to create agreement" }, { status: 400 });
  }
});
