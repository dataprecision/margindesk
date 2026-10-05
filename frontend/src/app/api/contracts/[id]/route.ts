import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseDate } from "@/lib/contracts/api";
import { contractStatus, daysLeft } from "@/lib/contracts/status";
import { blockersFor, validationChecks, type Team } from "@/lib/contracts/validation";

/**
 * GET /api/contracts/[id]
 */
export const GET = withRole(CONTRACT_API_ROLES, async (_req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, placeholder: true, zoho_contact_id: true, gstin: true, billing_currency: true, payment_terms: true } },
        spoc_person: { select: { id: true, name: true, email: true } },
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
      validation: validationChecks(contract),
      // The contracting team checks the paper, not how it is billed.
      billing_rules: user.role === "legal" ? [] : contract.billing_rules,
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
    if ("spoc_person_id" in body) {
      if (body.spoc_person_id) {
        const person = await prisma.person.findUnique({ where: { id: body.spoc_person_id }, select: { id: true, name: true } });
        if (!person) return NextResponse.json({ error: "SPOC must be a person from the People list" }, { status: 400 });
        data.spoc_person_id = person.id;
        data.spoc = person.name;
      } else {
        data.spoc_person_id = null;
      }
    }
    if ("open_questions" in body && Array.isArray(body.open_questions)) data.open_questions = body.open_questions;
    if ("documents" in body && Array.isArray(body.documents)) data.documents = body.documents;
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
    // Team sign-offs: { check: "paper" | "commercial" | "billing", done: true | false }
    if (body.check && ["paper", "commercial", "billing"].includes(body.check)) {
      const team = body.check as Team;
      const roleOk = team === "paper" ? ["owner", "legal"].includes(user.role) : ["owner", "finance", "billing", "pm"].includes(user.role);
      if (!roleOk) return NextResponse.json({ error: `Your role cannot sign off ${team}` }, { status: 403 });
      if (body.done) {
        const full = await prisma.contract.findUnique({ where: { id }, include: { client: { select: { placeholder: true, zoho_contact_id: true, gstin: true, billing_currency: true, payment_terms: true } }, billing_rules: { select: { status: true, source: true } }, purchase_orders: { select: { status: true, value: true, valid_to: true } } } });
        const blockers = blockersFor(team, full!);
        if (blockers.length) return NextResponse.json({ error: `Not yet: ${blockers.join("; ")}` }, { status: 400 });
      }
      data[`${team}_checked_by`] = body.done ? user.name || user.email : null;
      data[`${team}_checked_at`] = body.done ? new Date() : null;
    }

    let contract = await prisma.contract.update({ where: { id }, data });
    // "Checked by a person" means all three teams have signed off.
    const allDone = !!(contract.paper_checked_at && contract.commercial_checked_at && contract.billing_checked_at);
    if (allDone !== contract.verified && !("verified" in body)) {
      contract = await prisma.contract.update({ where: { id }, data: { verified: allDone, verified_by: allDone ? "all three teams" : null, verified_at: allDone ? new Date() : null } });
    }
    await audit(user, "Contract", id, body.check ? `check_${body.check}` : "update", before, contract);
    return NextResponse.json({ contract });
  } catch (error: any) {
    console.error("Error updating contract:", error);
    return NextResponse.json({ error: error?.message || "Failed to update contract" }, { status: 400 });
  }
});
