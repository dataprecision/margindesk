import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseDate } from "@/lib/contracts/api";
import { contractStatus, daysLeft } from "@/lib/contracts/status";

/**
 * GET /api/contracts/[id]
 */
export const GET = withRole(CONTRACT_API_ROLES, async (_req: Request, { params }) => {
  try {
    const { id } = await params;
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        lines: { orderBy: [{ sort_order: "asc" }, { created_at: "asc" }], include: { project: { select: { id: true, name: true } } } },
        purchase_orders: { orderBy: [{ valid_to: "desc" }, { po_date: "desc" }] },
        tasks: { orderBy: [{ status: "asc" }, { due_date: "asc" }] },
        billing_rules: { orderBy: [{ status: "asc" }, { service: "asc" }, { label: "asc" }] },
      },
    });
    if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

    const today = new Date();
    return NextResponse.json({
      ...contract,
      status: contractStatus(contract.start_date, contract.end_date, today),
      days_left: daysLeft(contract.end_date, today),
      lines: contract.lines.map((l) => ({
        ...l,
        status: contractStatus(l.start_date, l.end_date, today),
        days_left: daysLeft(l.end_date, today),
      })),
    });
  } catch (error) {
    console.error("Error fetching contract:", error);
    return NextResponse.json({ error: "Failed to fetch contract" }, { status: 500 });
  }
});

const TEXT_FIELDS = ["counterparty", "basis", "bill_to", "spoc", "stage", "po_status", "notes", "direction"] as const;
const REVIEW_BUCKETS = ["clean", "open", "document_awaited"];

/**
 * PATCH /api/contracts/[id]
 * Edit the contract header, resolve open questions, or mark it verified.
 */
export const PATCH = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    const before = await prisma.contract.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    for (const f of TEXT_FIELDS) {
      if (f in body) data[f] = body[f] === "" && f !== "counterparty" && f !== "basis" ? null : body[f];
    }
    if ("start_date" in body) data.start_date = parseDate(body.start_date);
    if ("end_date" in body) data.end_date = parseDate(body.end_date);
    if ("client_id" in body) data.client_id = body.client_id || null;
    if ("open_questions" in body && Array.isArray(body.open_questions)) data.open_questions = body.open_questions;
    if ("review_pointers" in body && Array.isArray(body.review_pointers)) data.review_pointers = body.review_pointers;
    if ("review_bucket" in body) {
      if (body.review_bucket !== null && !REVIEW_BUCKETS.includes(body.review_bucket)) return NextResponse.json({ error: "Unknown review bucket" }, { status: 400 });
      data.review_bucket = body.review_bucket;
    }
    if ("verified" in body) {
      data.verified = !!body.verified;
      data.verified_by = body.verified ? user.name || user.email : null;
      data.verified_at = body.verified ? new Date() : null;
    }

    const contract = await prisma.contract.update({ where: { id }, data });
    await audit(user, "Contract", id, "update", before, contract);
    return NextResponse.json({ contract });
  } catch (error: any) {
    console.error("Error updating contract:", error);
    return NextResponse.json({ error: error?.message || "Failed to update contract" }, { status: 400 });
  }
});
