import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { getZohoAccessToken } from "@/lib/zoho/token-manager";

const prisma = new PrismaClient();

/**
 * POST /api/bills/[id]/details
 * Fetch and sync details for a single bill
 */
export const POST = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;

    console.log(`🔄 [Single Bill Details] Fetching details for bill: ${id}`);

    // Get the bill
    const bill = await prisma.bill.findUnique({
      where: { id },
    });

    if (!bill) {
      return NextResponse.json(
        { error: "Bill not found" },
        { status: 404 }
      );
    }

    if (!bill.zoho_bill_id) {
      return NextResponse.json(
        { error: "Bill does not have a Zoho ID" },
        { status: 400 }
      );
    }

    // Get Zoho access token
    const tokens = await getZohoAccessToken();
    if (!tokens) {
      throw new Error("Zoho Books not connected. Please connect in Settings.");
    }

    // Update status to syncing
    await prisma.bill.update({
      where: { id },
      data: { details_sync_status: "syncing" },
    });

    // Fetch bill details from Zoho
    const billDetailResponse = await fetch(
      `${tokens.api_domain}/books/v3/bills/${bill.zoho_bill_id}?organization_id=${tokens.organization_id}`,
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
        },
      }
    );

    if (!billDetailResponse.ok) {
      throw new Error(`Zoho API error: ${billDetailResponse.statusText}`);
    }

    const detailData = await billDetailResponse.json();
    const billDetails = detailData.bill;

    // Update bill with financial details
    await prisma.bill.update({
      where: { id },
      data: {
        sub_total: billDetails.sub_total || null,
        tax_total: billDetails.tax_total || 0,
        exchange_rate: billDetails.exchange_rate || 1,
        tds_total: billDetails.tds_amount || 0,
        details_fetched_at: new Date(),
        details_sync_status: "synced",
      },
    });

    // Sync line items if available
    if (billDetails.line_items && billDetails.line_items.length > 0) {
      console.log(`📋 [Single Bill Details] Syncing ${billDetails.line_items.length} line items`);

      // Delete existing line items
      await prisma.billLineItem.deleteMany({
        where: { bill_id: id },
      });

      // Extract tags helper
      const extractTags = (lineItem: any): string[] => {
        if (!lineItem.tags || !Array.isArray(lineItem.tags)) return [];
        return lineItem.tags.map((tag: any) => tag.tag_option_name || tag.tag_name).filter(Boolean);
      };

      // Create line items
      const lineItemsData = billDetails.line_items.map((lineItem: any) => ({
        bill_id: id,
        zoho_line_item_id: lineItem.line_item_id,
        item_id: lineItem.item_id || null,
        item_name: lineItem.name,
        account_id: lineItem.account_id || null,
        account_name: lineItem.account_name || null,
        description: lineItem.description || null,
        quantity: lineItem.quantity || 1,
        rate: lineItem.rate || 0,
        item_total: lineItem.item_total || 0,
        tax_percentage: lineItem.tax_percentage || 0,
        tax_amount: lineItem.line_item_taxes && lineItem.line_item_taxes.length > 0
          ? lineItem.line_item_taxes.reduce((sum: number, tax: any) => sum + (tax.tax_amount || 0), 0)
          : 0,
        tds_tax_amount: lineItem.tds_tax_amount || 0,
        customer_id: lineItem.customer_id || null,
        customer_name: lineItem.customer_name || null,
        tags: extractTags(lineItem),
      }));

      await prisma.billLineItem.createMany({
        data: lineItemsData,
      });
    }

    console.log(`✅ [Single Bill Details] Synced details for bill: ${bill.bill_number}`);

    return NextResponse.json({
      success: true,
      message: "Bill details synced successfully",
    });
  } catch (error: any) {
    console.error("❌ [Single Bill Details] Error:", error);

    // Mark bill as error
    const { id } = await params;
    await prisma.bill.update({
      where: { id },
      data: { details_sync_status: "error" },
    }).catch(() => {});

    return NextResponse.json(
      { error: "Failed to sync bill details", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/bills/[id]/details
 * Delete bill details (line items) for a single bill
 */
export const DELETE = withAuth(async (req, { user, params }) => {
  try {
    const { id } = await params;

    console.log(`🗑️ [Single Bill Details] Deleting details for bill: ${id}`);

    // Delete line items
    await prisma.billLineItem.deleteMany({
      where: { bill_id: id },
    });

    // Reset bill details fields
    await prisma.bill.update({
      where: { id },
      data: {
        sub_total: null,
        tax_total: 0,
        exchange_rate: 1,
        tds_total: 0,
        details_fetched_at: null,
        details_sync_status: "pending",
      },
    });

    console.log(`✅ [Single Bill Details] Deleted details for bill: ${id}`);

    return NextResponse.json({
      success: true,
      message: "Bill details deleted successfully",
    });
  } catch (error: any) {
    console.error("❌ [Single Bill Details] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete bill details", details: error.message },
      { status: 500 }
    );
  }
});
