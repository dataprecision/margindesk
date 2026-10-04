import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseDate } from "@/lib/contracts/api";
import { matchDocumentsToPurchaseOrders, recomputePurchaseOrders } from "@/lib/contracts/po-consumption";

const TEXT = ["po_number", "currency", "covers", "document", "hours_text", "rate_text", "value_text", "notes"] as const;
const DATES = ["po_date", "valid_from", "valid_to"] as const;
const AMOUNTS = ["value", "opening_consumed"] as const;

/**
 * GET /api/contracts/purchase-orders/[poId]
 * The PO with the invoices and credit notes tagged to it.
 */
export const GET = withRole(CONTRACT_API_ROLES, async (_req: Request, { params }) => {
  try {
    const { poId } = await params;
    const po = await prisma.contractPurchaseOrder.findUnique({
      where: { id: poId },
      include: {
        invoices: { orderBy: { date: "desc" }, select: { id: true, invoice_number: true, date: true, status: true, currency: true, sub_total: true, total: true, balance: true, reference_number: true, service_month: true, po_match: true } },
        credit_notes: { orderBy: { date: "desc" }, select: { id: true, creditnote_number: true, date: true, status: true, currency: true, sub_total: true, reference_number: true, po_match: true } },
        contract: { select: { id: true, counterparty: true, zoho_customer_id: true, client: { select: { id: true, name: true, zoho_contact_id: true } } } },
      },
    });
    if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    // Invoices of the same customer with no PO: candidates to tag by hand.
    const customers = [po.contract.zoho_customer_id, po.contract.client?.zoho_contact_id].filter((x): x is string => !!x);
    const untagged = customers.length
      ? await prisma.zohoInvoice.findMany({ where: { zoho_customer_id: { in: customers }, purchase_order_id: null, status: { notIn: ["void", "draft"] } }, orderBy: { date: "desc" }, take: 60, select: { id: true, invoice_number: true, date: true, status: true, currency: true, sub_total: true, reference_number: true, service_month: true } })
      : [];
    return NextResponse.json({ purchase_order: po, untagged_invoices: untagged });
  } catch (error) {
    console.error("Error fetching purchase order:", error);
    return NextResponse.json({ error: "Failed to fetch purchase order" }, { status: 500 });
  }
});

/** PATCH /api/contracts/purchase-orders/[poId]: edit the PO; consumption is recomputed. */
export const PATCH = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { poId } = await params;
    const body = await (req as NextRequest).json();
    const before = await prisma.contractPurchaseOrder.findUnique({ where: { id: poId } });
    if (!before) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    const data: Record<string, unknown> = {};
    for (const f of TEXT) if (f in body) data[f] = body[f] === "" ? null : body[f];
    for (const f of DATES) if (f in body) data[f] = parseDate(body[f]);
    for (const f of AMOUNTS) if (f in body) {
      const n = body[f] === "" || body[f] == null ? null : Number(String(body[f]).replace(/,/g, ""));
      if (n != null && !Number.isFinite(n)) return NextResponse.json({ error: `${f} must be a number` }, { status: 400 });
      data[f] = n;
    }
    if (data.po_number === null) return NextResponse.json({ error: "PO number is required" }, { status: 400 });
    const validTo = "valid_to" in data ? (data.valid_to as Date | null) : before.valid_to;
    data.status = validTo ? (validTo < new Date() ? "expired" : "valid") : "no validity stated";
    const po = await prisma.contractPurchaseOrder.update({ where: { id: poId }, data });
    await audit(user, "ContractPurchaseOrder", poId, "update", before, po);
    await matchDocumentsToPurchaseOrders();
    await recomputePurchaseOrders();
    return NextResponse.json({ purchase_order: await prisma.contractPurchaseOrder.findUnique({ where: { id: poId } }) });
  } catch (error: any) {
    console.error("Error updating purchase order:", error);
    return NextResponse.json({ error: error?.message || "Failed to update purchase order" }, { status: 400 });
  }
});

/** DELETE /api/contracts/purchase-orders/[poId]: invoices tagged to it are untagged, not deleted. */
export const DELETE = withRole(CONTRACT_API_ROLES, async (_req: Request, { user, params }) => {
  try {
    const { poId } = await params;
    const before = await prisma.contractPurchaseOrder.findUnique({ where: { id: poId } });
    if (!before) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    await prisma.contractPurchaseOrder.delete({ where: { id: poId } });
    await audit(user, "ContractPurchaseOrder", poId, "delete", before, undefined);
    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error("Error deleting purchase order:", error);
    return NextResponse.json({ error: error?.message || "Failed to delete purchase order" }, { status: 400 });
  }
});
