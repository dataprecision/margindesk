import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit } from "@/lib/contracts/api";

export const CONTACT_ROLES = ["business", "legal", "accounts_billing", "escalation_1", "escalation_2", "escalation_3"];

/**
 * POST /api/companies/[id]/contacts
 * A contact on the other side, added by hand.
 */
export const POST = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const company = await prisma.client.findUnique({ where: { id }, select: { id: true } });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const roles = Array.isArray(body.roles) ? body.roles.filter((r: string) => CONTACT_ROLES.includes(r)) : [];
    const contact = await prisma.clientContact.create({
      data: { client_id: id, name, designation: body.designation || null, department: body.department || null, email: body.email || null, phone: body.phone || null, mobile: body.mobile || null, roles, notes: body.notes || null, source: "manual" },
    });
    await audit(user, "ClientContact", contact.id, "create", undefined, contact);
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating contact:", error);
    return NextResponse.json({ error: error?.message || "Failed to create contact" }, { status: 400 });
  }
});
