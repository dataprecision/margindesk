import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withRole } from "@/lib/auth/protect-route";
import { CONTRACT_API_ROLES } from "@/lib/contracts/api";

/**
 * GET /api/purchase-orders
 * Every customer PO in the register with its consumption and state.
 */
export const GET = withRole(CONTRACT_API_ROLES, async () => {
  try {
    const pos = await prisma.contractPurchaseOrder.findMany({
      include: {
        contract: { select: { id: true, counterparty: true, spoc: true, client: { select: { id: true, name: true } } } },
        _count: { select: { invoices: true, credit_notes: true } },
      },
      orderBy: [{ alert_state: "asc" }, { valid_to: "asc" }],
    });
    return NextResponse.json({
      purchase_orders: pos.map(({ _count, ...p }) => ({ ...p, invoice_count: _count.invoices, credit_note_count: _count.credit_notes })),
    });
  } catch (error) {
    console.error("Error fetching purchase orders:", error);
    return NextResponse.json({ error: "Failed to fetch purchase orders" }, { status: 500 });
  }
});
