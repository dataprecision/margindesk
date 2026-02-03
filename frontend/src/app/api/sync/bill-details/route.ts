import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { getZohoAccessToken } from "@/lib/zoho/token-manager";

const prisma = new PrismaClient();

/**
 * POST /api/sync/bill-details
 * Start a background job to sync bill details (line items + financial data)
 *
 * Request body:
 * {
 *   "filter_type": "bill_date" | "billed_for_month",
 *   "filter_value": "2024-01" | "last_month" | etc,
 *   "force_refetch": boolean (optional, default: false)
 * }
 *
 * Response:
 * {
 *   "job_id": "cuid",
 *   "message": "Bill details sync started"
 * }
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    console.log("🔄 [Bill Details Sync] Starting bill details sync job...");

    const body = await req.json();
    const filter_type = body.filter_type || "bill_date";
    const filter_value = body.filter_value || "last_month";
    const force_refetch = body.force_refetch || false;

    console.log(`📋 [Bill Details Sync] Filter: ${filter_type} = ${filter_value}, Force: ${force_refetch}`);

    // Validate filter_type
    if (filter_type !== "bill_date" && filter_type !== "billed_for_month") {
      return NextResponse.json(
        { error: "Invalid filter_type. Must be 'bill_date' or 'billed_for_month'" },
        { status: 400 }
      );
    }

    // Get Zoho Books access token
    const tokens = await getZohoAccessToken();
    if (!tokens) {
      throw new Error("Zoho Books not connected. Please connect in Settings.");
    }

    // Create a job record
    const job = await prisma.detailSyncJob.create({
      data: {
        filter_type,
        filter_value,
        force_refetch,
        status: "running",
      },
    });

    console.log(`✅ [Bill Details Sync] Job created: ${job.id}`);

    // Start background processing (don't await)
    processBillDetails(job.id, filter_type, filter_value, force_refetch, tokens).catch((error) => {
      console.error(`❌ [Bill Details Sync] Job ${job.id} failed:`, error);
    });

    return NextResponse.json({
      job_id: job.id,
      message: "Bill details sync started",
    });
  } catch (error: any) {
    console.error("❌ [Bill Details Sync] Error:", error);
    return NextResponse.json(
      { error: "Failed to start bill details sync", details: error.message },
      { status: 500 }
    );
  }
});

/**
 * Background processing function for bill details sync
 */
async function processBillDetails(
  jobId: string,
  filterType: string,
  filterValue: string,
  forceRefetch: boolean,
  tokens: any
) {
  try {
    console.log(`🔄 [Job ${jobId}] Starting background processing...`);

    // Build where clause based on filter type
    const where: any = {};

    if (filterType === "bill_date") {
      const { fromDate, toDate } = calculateDateRange(filterValue);
      where.bill_date = {
        gte: fromDate,
        lte: toDate,
      };
    } else if (filterType === "billed_for_month") {
      const { fromDate, toDate } = calculateDateRange(filterValue);
      where.cf_billed_for_month_unformatted = {
        gte: fromDate,
        lte: toDate,
      };
    }

    // If not force refetch, only get bills without details
    if (!forceRefetch) {
      where.details_sync_status = "pending";
    }

    // Fetch bills matching the filter
    const bills = await prisma.bill.findMany({
      where,
      select: {
        id: true,
        zoho_bill_id: true,
        bill_number: true,
        vendor_name: true,
      },
    });

    console.log(`📥 [Job ${jobId}] Found ${bills.length} bills to process`);

    // Update job with total count
    await prisma.detailSyncJob.update({
      where: { id: jobId },
      data: { total_bills: bills.length },
    });

    let successCount = 0;
    let errorCount = 0;
    const errorMessages: string[] = [];

    // Process each bill
    for (const bill of bills) {
      try {
        console.log(`🔍 [Job ${jobId}] Fetching details for bill ${bill.bill_number}...`);

        // Update bill status to syncing
        await prisma.bill.update({
          where: { id: bill.id },
          data: { details_sync_status: "syncing" },
        });

        // Fetch detailed bill information from Zoho
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
          where: { id: bill.id },
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
          console.log(`📋 [Job ${jobId}] Syncing ${billDetails.line_items.length} line items for ${bill.bill_number}`);

          // Delete existing line items
          await prisma.billLineItem.deleteMany({
            where: { bill_id: bill.id },
          });

          // Extract tags helper
          const extractTags = (lineItem: any): string[] => {
            if (!lineItem.tags || !Array.isArray(lineItem.tags)) return [];
            return lineItem.tags.map((tag: any) => tag.tag_option_name || tag.tag_name).filter(Boolean);
          };

          // Create line items
          const lineItemsData = billDetails.line_items.map((lineItem: any) => ({
            bill_id: bill.id,
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

        successCount++;
        console.log(`✅ [Job ${jobId}] Synced details for ${bill.bill_number}`);
      } catch (error: any) {
        errorCount++;
        const errorMsg = `Failed to sync ${bill.bill_number}: ${error.message}`;
        errorMessages.push(errorMsg);
        console.error(`❌ [Job ${jobId}] ${errorMsg}`);

        // Mark bill as error
        await prisma.bill.update({
          where: { id: bill.id },
          data: { details_sync_status: "error" },
        }).catch(() => {}); // Ignore update errors
      }

      // Update job progress
      await prisma.detailSyncJob.update({
        where: { id: jobId },
        data: {
          processed_bills: successCount + errorCount,
          success_count: successCount,
          error_count: errorCount,
          error_messages: errorMessages,
        },
      });
    }

    // Mark job as completed
    await prisma.detailSyncJob.update({
      where: { id: jobId },
      data: {
        status: errorCount > 0 && successCount === 0 ? "failed" : "completed",
        completed_at: new Date(),
      },
    });

    console.log(`📊 [Job ${jobId}] Completed - Success: ${successCount}, Errors: ${errorCount}`);
  } catch (error: any) {
    console.error(`❌ [Job ${jobId}] Fatal error:`, error);

    // Mark job as failed
    await prisma.detailSyncJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error_messages: [error.message],
        completed_at: new Date(),
      },
    }).catch(() => {}); // Ignore update errors
  }
}

// Helper function to calculate date range
function calculateDateRange(range: string): { fromDate: Date; toDate: Date } {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  // India's fiscal year: April 1 to March 31
  const fiscalYearStart = currentMonth >= 3 ? currentYear : currentYear - 1;

  switch (range) {
    case "last_month": {
      const fromDate = new Date(currentYear, currentMonth - 1, 1);
      const toDate = new Date(currentYear, currentMonth, 0);
      return { fromDate, toDate };
    }

    case "this_month": {
      const fromDate = new Date(currentYear, currentMonth, 1);
      const toDate = today;
      return { fromDate, toDate };
    }

    case "last_quarter": {
      const lastQuarterStartMonth = Math.floor((currentMonth - 3) / 3) * 3;
      const fromDate = new Date(currentYear, lastQuarterStartMonth, 1);
      const toDate = new Date(currentYear, lastQuarterStartMonth + 3, 0);
      return { fromDate, toDate };
    }

    case "this_quarter": {
      const thisQuarterStartMonth = Math.floor(currentMonth / 3) * 3;
      const fromDate = new Date(currentYear, thisQuarterStartMonth, 1);
      const toDate = today;
      return { fromDate, toDate };
    }

    case "this_fiscal_year": {
      const fromDate = new Date(fiscalYearStart, 3, 1);
      const toDate = today;
      return { fromDate, toDate };
    }

    case "last_fiscal_year": {
      const fromDate = new Date(fiscalYearStart - 1, 3, 1);
      const toDate = new Date(fiscalYearStart, 2, 31);
      return { fromDate, toDate };
    }

    case "last_year": {
      const fromDate = new Date(today);
      fromDate.setFullYear(currentYear - 1);
      const toDate = today;
      return { fromDate, toDate };
    }

    case "all": {
      const fromDate = new Date(2020, 0, 1);
      const toDate = today;
      return { fromDate, toDate };
    }

    default: {
      // Assume it's a specific month in YYYY-MM format
      const [year, month] = range.split("-").map(Number);
      if (year && month) {
        const fromDate = new Date(year, month - 1, 1);
        const toDate = new Date(year, month, 0);
        return { fromDate, toDate };
      }

      // Default to last month
      const fromDate = new Date(currentYear, currentMonth - 1, 1);
      const toDate = new Date(currentYear, currentMonth, 0);
      return { fromDate, toDate };
    }
  }
}
