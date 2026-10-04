import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit } from "@/lib/contracts/api";

const ROLES = ["business", "legal", "accounts_billing", "escalation_1", "escalation_2", "escalation_3"];
const FIELDS = ["name", "designation", "department", "email", "phone", "mobile", "notes"] as const;

/**
 * PATCH /api/companies/contacts/[contactId]
 * Roles, notes and (for contacts added by hand) the person's details. Details
 * of a Zoho-sourced contact come from Zoho and are not edited here.
 */
export const PATCH = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { contactId } = await params;
    const body = await (req as NextRequest).json();
    const before = await prisma.clientContact.findUnique({ where: { id: contactId } });
    if (!before) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    const data: Record<string, unknown> = {};
    if ("roles" in body && Array.isArray(body.roles)) data.roles = body.roles.filter((r: string) => ROLES.includes(r));
    if ("notes" in body) data.notes = body.notes || null;
    if ("active" in body) data.active = !!body.active;
    if (before.source === "manual") for (const f of FIELDS) if (f in body) data[f] = body[f] === "" ? null : body[f];
    const contact = await prisma.clientContact.update({ where: { id: contactId }, data });
    await audit(user, "ClientContact", contactId, "update", before, contact);
    return NextResponse.json({ contact });
  } catch (error: any) {
    console.error("Error updating contact:", error);
    return NextResponse.json({ error: error?.message || "Failed to update contact" }, { status: 400 });
  }
});

/** DELETE /api/companies/contacts/[contactId]: only contacts added by hand; Zoho ones are deactivated instead. */
export const DELETE = withRole(CONTRACT_API_ROLES, async (_req: Request, { user, params }) => {
  try {
    const { contactId } = await params;
    const before = await prisma.clientContact.findUnique({ where: { id: contactId } });
    if (!before) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    if (before.source !== "manual") {
      const contact = await prisma.clientContact.update({ where: { id: contactId }, data: { active: false } });
      await audit(user, "ClientContact", contactId, "deactivate", before, contact);
      return NextResponse.json({ contact, deactivated: true });
    }
    await prisma.clientContact.delete({ where: { id: contactId } });
    await audit(user, "ClientContact", contactId, "delete", before, undefined);
    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error("Error deleting contact:", error);
    return NextResponse.json({ error: error?.message || "Failed to delete contact" }, { status: 400 });
  }
});
