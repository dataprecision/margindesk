import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit } from "@/lib/contracts/api";

/**
 * GET /api/companies
 * Every company we deal with (customers and vendors from Zoho Books, plus
 * placeholders created here), with its owners and counts.
 */
export const GET = withRole(CONTRACT_API_ROLES, async (req: Request) => {
  try {
    const { searchParams } = new URL(req.url);
    const withActivity = searchParams.get("all") !== "true";
    const clients = await prisma.client.findMany({
      where: withActivity ? { OR: [{ contracts: { some: {} } }, { projects: { some: {} } }, { placeholder: true }, { people: { some: {} } }] } : {},
      include: {
        owner_person: { select: { id: true, name: true } },
        legal_person: { select: { id: true, name: true } },
        finance_person: { select: { id: true, name: true } },
        _count: { select: { contracts: true, projects: true, people: true } },
        contracts: { select: { review_bucket: true, end_date: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      companies: clients.map(({ contracts, _count, ...c }) => ({
        ...c,
        contract_count: _count.contracts,
        project_count: _count.projects,
        contact_count: _count.people,
        open_contracts: contracts.filter((x) => x.review_bucket === "open").length,
        document_awaited: contracts.filter((x) => x.review_bucket === "document_awaited").length,
      })),
    });
  } catch (error) {
    console.error("Error fetching companies:", error);
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 });
  }
});

/**
 * POST /api/companies
 * A placeholder company for a contract signed before the Zoho record exists.
 */
export const POST = withRole(CONTRACT_API_ROLES, async (req: Request, { user }) => {
  try {
    const body = await (req as NextRequest).json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const existing = await prisma.client.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true, name: true } });
    if (existing) return NextResponse.json({ error: `A company called "${existing.name}" already exists`, company: existing }, { status: 409 });
    const company = await prisma.client.create({
      data: { name, placeholder: true, contact_type: body.contact_type === "vendor" ? "vendor" : "customer", gstin: body.gstin || null, pan: body.pan || null, notes: body.notes || null, tags: ["placeholder"] },
    });
    await audit(user, "Client", company.id, "create", undefined, company);
    return NextResponse.json({ company }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating company:", error);
    return NextResponse.json({ error: error?.message || "Failed to create company" }, { status: 400 });
  }
});
