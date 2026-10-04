import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/protect-route";
import { matchDocumentsToPurchaseOrders, recomputePurchaseOrders } from "@/lib/contracts/po-consumption";

/**
 * POST /api/contracts/po-consumption
 * Re-tag Zoho invoices and credit notes to purchase orders by reference
 * number, recompute consumption and raise follow-ups. Run nightly after the
 * invoice sync; owner or finance can run it on demand.
 */
export const POST = withRole(["owner", "finance"], async () => {
  try {
    const matched = await matchDocumentsToPurchaseOrders();
    const result = await recomputePurchaseOrders();
    return NextResponse.json({ success: true, ...matched, ...result });
  } catch (error: any) {
    console.error("Error computing PO consumption:", error);
    return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });
  }
});
