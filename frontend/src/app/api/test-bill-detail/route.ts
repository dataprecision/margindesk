import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/protect-route";
import { getZohoAccessToken } from "@/lib/zoho/token-manager";
import fs from "fs";
import path from "path";

/**
 * GET /api/test-bill-detail
 * Test endpoint to fetch detailed bill information
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    console.log("🔍 [Test Bill Detail] Starting test...");

    // Get Zoho Books access token
    const tokens = await getZohoAccessToken();

    if (!tokens) {
      throw new Error("Zoho Books not connected. Please connect in Settings.");
    }

    // Use the specific bill ID
    const billId = "4929735000013655468";

    console.log(`🔍 [Test Bill Detail] Fetching bill: ${billId}`);

    // Fetch detailed bill information
    const response = await fetch(
      `${tokens.api_domain}/books/v3/bills/${billId}?organization_id=${tokens.organization_id}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ [Test Bill Detail] API Error:", error);
      throw new Error(`Failed to fetch bill details: ${error}`);
    }

    const data = await response.json();
    const bill = data.bill || data;

    console.log("✅ [Test Bill Detail] Detailed bill received");

    // Write to file
    const detailPath = path.join(process.cwd(), "bill-detail-sample.json");
    fs.writeFileSync(detailPath, JSON.stringify(bill, null, 2));
    console.log(`📁 [Test Bill Detail] Written to: ${detailPath}`);

    // Log available fields
    console.log("\n📋 [Test Bill Detail] Available fields:");
    console.log(Object.keys(bill));

    // Check for line_items
    if (bill.line_items) {
      console.log(`\n✅ [Test Bill Detail] line_items found! Count: ${bill.line_items.length}`);
      if (bill.line_items.length > 0) {
        console.log("   First line item keys:", Object.keys(bill.line_items[0]));
        console.log("   First line item sample:", JSON.stringify(bill.line_items[0], null, 2));
      }
    } else {
      console.log("\n❌ [Test Bill Detail] No line_items in response");
    }

    // Check for payments
    if (bill.payments) {
      console.log(`\n✅ [Test Bill Detail] payments found! Count: ${bill.payments.length}`);
      if (bill.payments.length > 0) {
        console.log("   First payment keys:", Object.keys(bill.payments[0]));
        console.log("   First payment sample:", JSON.stringify(bill.payments[0], null, 2));
      }
    } else {
      console.log("\n❌ [Test Bill Detail] No payments in response");
    }

    return NextResponse.json({
      success: true,
      billId,
      hasLineItems: !!bill.line_items,
      lineItemsCount: bill.line_items?.length || 0,
      hasPayments: !!bill.payments,
      paymentsCount: bill.payments?.length || 0,
      availableFields: Object.keys(bill),
      message: "Detailed bill data written to bill-detail-sample.json",
    });
  } catch (error: any) {
    console.error("❌ [Test Bill Detail] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bill details", details: error.message },
      { status: 500 }
    );
  }
});
