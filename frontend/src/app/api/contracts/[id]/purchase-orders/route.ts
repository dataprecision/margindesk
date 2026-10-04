import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES, audit, parseDate } from "@/lib/contracts/api";
import { matchDocumentsToPurchaseOrders, recomputePurchaseOrders } from "@/lib/contracts/po-consumption";

/**
 * POST /api/contracts/[id]/purchase-orders
 * A purchase order added by hand. Invoices quoting its number are tagged at once.
 */
export const POST = withRole(CONTRACT_API_ROLES, async (req: Request, { user, params }) => {
  try {
    const { id } = await params;
    const body = await (req as NextRequest).json();
    const po_number = String(body.po_number ?? "").trim();
    if (!po_number) return NextResponse.json({ error: "PO number is required" }, { status: 400 });
    const contract = await prisma.contract.findUnique({ where: { id }, select: { id: true } });
    if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    const value = body.value === "" || body.value == null ? null : Number(String(body.value).replace(/,/g, ""));
    if (value != null && !Number.isFinite(value)) return NextResponse.json({ error: "Value must be a number" }, { status: 400 });
    const po = await prisma.contractPurchaseOrder.create({
      data: {
        contract_id: id, po_number, po_date: parseDate(body.po_date), valid_from: parseDate(body.valid_from), valid_to: parseDate(body.valid_to),
        value, currency: body.currency || "INR", value_text: value != null ? `${body.currency || "INR"} ${value}` : body.value_text || null,
        covers: body.covers || null, document: body.document || null, hours_text: body.hours_text || null, rate_text: body.rate_text || null,
        opening_consumed: body.opening_consumed === "" || body.opening_consumed == null ? null : Number(String(body.opening_consumed).replace(/,/g, "")),
        notes: body.notes || null, status: parseDate(body.valid_to) && parseDate(body.valid_to)! < new Date() ? "expired" : parseDate(body.valid_to) ? "valid" : "no validity stated",
      },
    });
    await audit(user, "ContractPurchaseOrder", po.id, "create", undefined, po);
    await matchDocumentsToPurchaseOrders();
    await recomputePurchaseOrders();
    return NextResponse.json({ purchase_order: await prisma.contractPurchaseOrder.findUnique({ where: { id: po.id } }) }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating purchase order:", error);
    return NextResponse.json({ error: error?.message || "Failed to create purchase order" }, { status: 400 });
  }
});
