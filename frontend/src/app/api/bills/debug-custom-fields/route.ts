import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/protect-route";
import { getZohoAccessToken } from "@/lib/zoho/token-manager";

/**
 * GET /api/bills/debug-custom-fields
 * Debug endpoint to check custom fields structure from Zoho Books
 */
export const GET = withAuth(async (req, { user }) => {
  try {
    console.log("🔍 [Debug Custom Fields] Fetching sample bill from Zoho Books...");

    // Get Zoho Books access token
    const tokens = await getZohoAccessToken();

    if (!tokens) {
      throw new Error("Zoho Books not connected. Please connect in Settings.");
    }

    // Fetch just ONE bill from Zoho Books to inspect
    const billsResponse = await fetch(
      `${tokens.api_domain}/books/v3/bills?organization_id=${tokens.organization_id}&page=1&per_page=1`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
        },
      }
    );

    if (!billsResponse.ok) {
      const error = await billsResponse.text();
      console.error("❌ [Debug Custom Fields] API Error:", error);
      throw new Error(`Failed to fetch bills from Zoho Books: ${error}`);
    }

    const data = await billsResponse.json();
    const bills = data.bills || [];

    if (bills.length === 0) {
      return NextResponse.json({
        message: "No bills found in Zoho Books",
        bills: [],
      });
    }

    const sampleBill = bills[0];

    // Extract custom fields information
    const customFields = sampleBill.custom_fields || [];

    const customFieldsInfo = customFields.map((cf: any) => ({
      customfield_id: cf.customfield_id,
      label: cf.label,
      value: cf.value,
      value_unformatted: cf.value_unformatted,
      data_type: cf.data_type,
      placeholder: cf.placeholder,
    }));

    console.log("📋 [Debug Custom Fields] Sample bill custom fields:", JSON.stringify(customFieldsInfo, null, 2));

    return NextResponse.json({
      bill_id: sampleBill.bill_id,
      bill_number: sampleBill.bill_number,
      vendor_name: sampleBill.vendor_name,
      custom_fields: customFieldsInfo,
      all_field_ids: customFieldsInfo.map((cf: any) => cf.customfield_id),
      current_config: {
        expense_category_id: "662055000000036193",
        billed_for_month_id: "662055000000036189",
      },
      instructions: "Check if your custom field IDs match the current_config. If not, update the IDs in src/app/api/sync/bills/route.ts",
    });
  } catch (error: any) {
    console.error("❌ [Debug Custom Fields] Error:", error);
    return NextResponse.json(
      { error: "Failed to debug custom fields", details: error.message },
      { status: 500 }
    );
  }
});
