import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit } from "@/lib/contracts/api";
import { recomputePurchaseOrders } from "@/lib/contracts/po-consumption";

/**
 * PATCH /api/invoices/[id]
 * Tag a Zoho invoice to a purchase order by hand (or untag it). A manual tag
 * is kept by the nightly re-match. The invoice itself is Zoho's and read-only.
 */
export const PATCH = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    const before = await prisma.zohoInvoice.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (!("purchase_order_id" in body)) return NextResponse.json({ error: "purchase_order_id is required" }, { status: 400 });
    if (body.purchase_order_id) {
      const po = await prisma.contractPurchaseOrder.findUnique({ where: { id: body.purchase_order_id }, select: { id: true } });
      if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }
    const invoice = await prisma.zohoInvoice.update({ where: { id }, data: { purchase_order_id: body.purchase_order_id || null, po_match: body.purchase_order_id ? "manual" : "manual_none" } });
    await audit(user, "ZohoInvoice", id, "tag_po", before, invoice);
    await recomputePurchaseOrders();
    return NextResponse.json({ invoice });
  } catch (error: any) {
    console.error("Error tagging invoice:", error);
    return NextResponse.json({ error: error?.message || "Failed to tag invoice" }, { status: 400 });
  }
});
