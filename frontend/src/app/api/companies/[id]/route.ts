import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit } from "@/lib/contracts/api";
import { contractStatus } from "@/lib/contracts/status";

const OWNER_FIELDS = ["owner_person_id", "legal_person_id", "finance_person_id"] as const;

/**
 * GET /api/companies/[id]
 * The company with its contacts, contracts and, for a placeholder, the Zoho
 * record the nightly sync suggests.
 */
export const GET = withRole(CONTRACT_API_ROLES, async (_req: Request, { params }) => {
  try {
    const { id } = await params;
    const company = await prisma.client.findUnique({
      where: { id },
      include: {
        owner_person: { select: { id: true, name: true, email: true } },
        legal_person: { select: { id: true, name: true, email: true } },
        finance_person: { select: { id: true, name: true, email: true } },
        people: { orderBy: [{ active: "desc" }, { is_primary: "desc" }, { name: "asc" }] },
        contracts: { select: { id: true, counterparty: true, basis: true, direction: true, start_date: true, end_date: true, review_bucket: true, spoc: true }, orderBy: { counterparty: "asc" } },
        projects: { select: { id: true, name: true, status: true }, orderBy: { name: "asc" } },
      },
    });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const suggested = company.suggested_zoho_contact_id
      ? await prisma.client.findUnique({ where: { zoho_contact_id: company.suggested_zoho_contact_id }, select: { id: true, name: true, gstin: true, pan: true, contact_type: true } })
      : null;
    const today = new Date();
    return NextResponse.json({
      ...company,
      suggested_match: suggested,
      contracts: company.contracts.map((c) => ({ ...c, status: contractStatus(c.start_date, c.end_date, today) })),
    });
  } catch (error) {
    console.error("Error fetching company:", error);
    return NextResponse.json({ error: "Failed to fetch company" }, { status: 500 });
  }
});

/**
 * PATCH /api/companies/[id]
 * Our owners and notes on any company; name, GSTIN and PAN on a placeholder
 * only (Zoho is the master otherwise). `merge_into` confirms a placeholder's
 * match: its contracts, contacts and projects move to the Zoho-backed company
 * and the placeholder is removed.
 */
export const PATCH = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    const before = await prisma.client.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    if (body.merge_into) {
      if (!before.placeholder) return NextResponse.json({ error: "Only a placeholder can be merged" }, { status: 400 });
      const target = await prisma.client.findUnique({ where: { id: body.merge_into } });
      if (!target || target.id === id) return NextResponse.json({ error: "Target company not found" }, { status: 404 });
      await prisma.$transaction([
        prisma.contract.updateMany({ where: { client_id: id }, data: { client_id: target.id } }),
        prisma.clientContact.updateMany({ where: { client_id: id }, data: { client_id: target.id } }),
        prisma.project.updateMany({ where: { client_id: id }, data: { client_id: target.id } }),
        prisma.docSpace.updateMany({ where: { client_id: id }, data: { client_id: target.id } }),
        prisma.client.update({ where: { id: target.id }, data: { owner_person_id: target.owner_person_id ?? before.owner_person_id, legal_person_id: target.legal_person_id ?? before.legal_person_id, finance_person_id: target.finance_person_id ?? before.finance_person_id, notes: [target.notes, before.notes].filter(Boolean).join("\n") || null } }),
        prisma.contractTask.updateMany({ where: { auto_key: `company-match:${id}`, status: "open" }, data: { status: "done", completed_by: user.name || user.email, completed_at: new Date() } }),
        prisma.client.delete({ where: { id } }),
      ]);
      await audit(user, "Client", target.id, "merge_placeholder", before, target);
      return NextResponse.json({ company: target, merged: true });
    }

    const data: Record<string, unknown> = {};
    for (const f of OWNER_FIELDS) {
      if (f in body) {
        if (body[f]) {
          const person = await prisma.person.findUnique({ where: { id: body[f] }, select: { id: true } });
          if (!person) return NextResponse.json({ error: "Owners must be people from the People list" }, { status: 400 });
        }
        data[f] = body[f] || null;
      }
    }
    if ("notes" in body) data.notes = body.notes || null;
    if (before.placeholder) {
      if ("name" in body && String(body.name).trim()) data.name = String(body.name).trim();
      if ("gstin" in body) data.gstin = body.gstin || null;
      if ("pan" in body) data.pan = body.pan || null;
      if ("contact_type" in body) data.contact_type = body.contact_type || null;
    }
    const company = await prisma.client.update({ where: { id }, data });
    await audit(user, "Client", id, "update", before, company);
    return NextResponse.json({ company });
  } catch (error: any) {
    console.error("Error updating company:", error);
    return NextResponse.json({ error: error?.message || "Failed to update company" }, { status: 400 });
  }
});
