import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { getZohoBooksApiUrl } from "@/lib/zoho/config";
import { getZohoAccessToken } from "@/lib/zoho/token-manager";
import { shouldExcludeBill, type BillExclusionRule } from "@/lib/bill-exclusion-rules";

const prisma = new PrismaClient();

/**
 * POST /api/sync/bills
 * Sync bills from Zoho Books
 *
 * Request body (optional):
 * {
 *   "range": "last_month" | "last_quarter" | "this_quarter" | "this_fiscal_year" | "last_fiscal_year" | "last_year" | "all"
 * }
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    console.log("🔄 [Zoho Bill Sync] Starting bill sync...");

    // Get Zoho Books access token
    const tokens = await getZohoAccessToken();

    if (!tokens) {
      throw new Error("Zoho Books not connected. Please connect in Settings.");
    }

    console.log("✅ [Zoho Bill Sync] Zoho Books connected");

    // Get date range from request body (default: last_year)
    const body = await req.json().catch(() => ({}));
    const range = body.range || "last_year";

    // Calculate date range based on selection
    const { fromDate, toDate } = calculateDateRange(range);
    const fromDateStr = fromDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const toDateStr = toDate.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`📅 [Zoho Bill Sync] Syncing bills for range: ${range} (${fromDateStr} to ${toDateStr})`);

    // Fetch all bills from Zoho Books with pagination
    // https://www.zoho.com/books/api/v3/#Bills_List_Bills
    let allBills: any[] = [];
    let page = 1;
    let hasMorePages = true;
    const perPage = 200; // Zoho Books max per page

    while (hasMorePages) {
      console.log(`🌐 [Zoho Bill Sync] Fetching page ${page}...`);

      const billsResponse = await fetch(
        `${tokens.api_domain}/books/v3/bills?organization_id=${tokens.organization_id}&date_start=${fromDateStr}&date_end=${toDateStr}&page=${page}&per_page=${perPage}`,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
          },
        }
      );

      if (!billsResponse.ok) {
        const error = await billsResponse.text();
        console.error("❌ [Zoho Bill Sync] API Error:", error);
        throw new Error(`Failed to fetch bills from Zoho Books: ${error}`);
      }

      const data = await billsResponse.json();
      const bills = data.bills || [];

      console.log(`✅ [Zoho Bill Sync] Retrieved ${bills.length} bills on page ${page}`);

      allBills = allBills.concat(bills);

      // Check if there are more pages
      // Zoho Books returns page_context with has_more_page
      hasMorePages = data.page_context?.has_more_page || false;
      page++;

      // Safety limit to prevent infinite loops
      if (page > 100) {
        console.warn("⚠️ [Zoho Bill Sync] Reached page limit of 100, stopping pagination");
        break;
      }
    }

    console.log(`📥 [Zoho Bill Sync] Total bills retrieved: ${allBills.length} (from ${page - 1} pages)`);

    // Debug: Log first bill structure to see all available fields
    if (allBills.length > 0) {
      console.log("📋 [Zoho Bill Sync] First bill object keys:", Object.keys(allBills[0]));
      console.log("📋 [Zoho Bill Sync] First bill full object:", JSON.stringify(allBills[0], null, 2));

      // Write to file for inspection
      const fs = require('fs');
      const path = require('path');
      const billSamplePath = path.join(process.cwd(), 'bill-sample.json');
      fs.writeFileSync(billSamplePath, JSON.stringify(allBills[0], null, 2));
      console.log(`📁 [Zoho Bill Sync] Bill sample written to: ${billSamplePath}`);
    }

    // Fetch enabled exclusion rules from database
    const exclusionRules = await prisma.billExclusionRule.findMany({
      where: { enabled: true },
    });

    // Convert database rules to BillExclusionRule format
    const rules: BillExclusionRule[] = exclusionRules.map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      enabled: rule.enabled,
      field: rule.field as BillExclusionRule["field"],
      operator: rule.operator as BillExclusionRule["operator"],
      value: rule.operator === "greater_than" || rule.operator === "less_than"
        ? parseFloat(rule.value)
        : rule.value,
      reason: rule.reason,
      is_default: rule.is_default,
    }));

    console.log(`📋 [Zoho Bill Sync] Loaded ${rules.length} active exclusion rules`);

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each bill
    for (const bill of allBills) {
      try {
        // Check if bill already exists
        const existingBill = await prisma.bill.findUnique({
          where: { zoho_bill_id: bill.bill_id },
        });

        // Parse custom fields - Zoho Books returns them as direct properties with cf_ prefix
        // Not in a custom_fields array
        const expenseCategoryValue = bill.cf_expense_category || null;
        const billedForMonthValue = bill.cf_billed_for_month || null;
        const billedForMonthUnformatted = bill.cf_billed_for_month_unformatted || null;

        // Check if bill should be auto-excluded
        const exclusionCheck = shouldExcludeBill(
          {
            vendor_name: bill.vendor_name,
            bill_number: bill.bill_number,
            account_name: bill.account_name,
            description: bill.description,
            notes: bill.notes,
            cf_expense_category: expenseCategoryValue,
            total: bill.total,
          },
          rules
        );

        // Log exclusion check for debugging
        if (exclusionCheck.exclude) {
          console.log(`🚫 [Zoho Bill Sync] Bill ${bill.bill_id} matches exclusion rule: ${exclusionCheck.reason}`);
        }

        const billData = {
          zoho_bill_id: bill.bill_id,
          vendor_id: bill.vendor_id || null,
          vendor_name: bill.vendor_name,
          bill_number: bill.bill_number,
          bill_date: new Date(bill.date),
          due_date: bill.due_date ? new Date(bill.due_date) : null,
          total: bill.total, // Total including taxes
          balance: bill.balance || 0, // Remaining unpaid amount
          status: mapBillStatus(bill.status),
          currency_code: bill.currency_code || "INR",
          reference_number: bill.reference_number || null,
          notes: bill.notes || null,
          // Custom fields - now using direct properties
          cf_expense_category: expenseCategoryValue,
          cf_expense_category_unformatted: bill.cf_expense_category_unformatted || null,
          cf_billed_for_month: billedForMonthValue,
          cf_billed_for_month_unformatted: billedForMonthUnformatted ? new Date(billedForMonthUnformatted) : null,
          // Apply auto-exclusion rules only for new bills
          include_in_calculation: existingBill
            ? existingBill.include_in_calculation // Preserve manual changes
            : !exclusionCheck.exclude, // Auto-exclude if matches rules
          exclusion_reason: existingBill?.exclusion_reason || exclusionCheck.reason || null,
          // Set details sync status to pending for new bills
          details_sync_status: existingBill?.details_sync_status || "pending",
        };

        if (existingBill) {
          // Update existing bill
          await prisma.bill.update({
            where: { zoho_bill_id: bill.bill_id },
            data: billData,
          });
          updatedCount++;
          console.log(`🔄 [Zoho Bill Sync] Updated bill: ${bill.bill_id}`);
        } else {
          // Create new bill
          await prisma.bill.create({
            data: billData,
          });
          createdCount++;
          console.log(`➕ [Zoho Bill Sync] Created bill: ${bill.bill_id}`);
        }
      } catch (error: any) {
        errorCount++;
        const errorMsg = `Failed to sync bill ${bill.bill_id}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ [Zoho Bill Sync] ${errorMsg}`);
      }
    }

    // Create sync log
    await prisma.syncLog.create({
      data: {
        sync_type: "zoho_bills",
        status: errorCount > 0 ? "completed_with_errors" : "success",
        records_synced: createdCount + updatedCount,
        error_message: errors.length > 0 ? errors.join("; ") : undefined,
        metadata: {
          created: createdCount,
          updated: updatedCount,
          errors: errorCount,
          total: allBills.length,
          pages: page - 1,
        },
      },
    });

    console.log(`📊 [Zoho Bill Sync] Summary - Created: ${createdCount}, Updated: ${updatedCount}, Errors: ${errorCount}`);

    return NextResponse.json({
      success: true,
      count: createdCount + updatedCount,
      created: createdCount,
      updated: updatedCount,
      errors: errorCount,
      errorMessages: errors,
    });
  } catch (error: any) {
    console.error("❌ [Zoho Bill Sync] Error:", error);

    // Create error sync log
    await prisma.syncLog.create({
      data: {
        sync_type: "zoho_bills",
        status: "failed",
        records_synced: 0,
        error_message: error.message,
      },
    });

    return NextResponse.json(
      { error: "Failed to sync bills", details: error.message },
      { status: 500 }
    );
  }
});

// Helper function to calculate date range based on selection
function calculateDateRange(range: string): { fromDate: Date; toDate: Date } {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  // India's fiscal year: April 1 to March 31
  const fiscalYearStart = currentMonth >= 3 ? currentYear : currentYear - 1; // April = month 3

  switch (range) {
    case "last_month": {
      const fromDate = new Date(currentYear, currentMonth - 1, 1); // First day of last month
      const toDate = new Date(currentYear, currentMonth, 0); // Last day of last month
      return { fromDate, toDate };
    }

    case "this_month": {
      const fromDate = new Date(currentYear, currentMonth, 1); // First day of this month
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
      const fromDate = new Date(fiscalYearStart, 3, 1); // April 1
      const toDate = today;
      return { fromDate, toDate };
    }

    case "last_fiscal_year": {
      const fromDate = new Date(fiscalYearStart - 1, 3, 1); // April 1 of last year
      const toDate = new Date(fiscalYearStart, 2, 31); // March 31 of this year
      return { fromDate, toDate };
    }

    case "last_year": {
      const fromDate = new Date(today);
      fromDate.setFullYear(currentYear - 1);
      const toDate = today;
      return { fromDate, toDate };
    }

    case "all": {
      const fromDate = new Date(2020, 0, 1); // Jan 1, 2020 - adjust as needed
      const toDate = today;
      return { fromDate, toDate };
    }

    default: {
      // Default to last year
      const fromDate = new Date(today);
      fromDate.setFullYear(currentYear - 1);
      const toDate = today;
      return { fromDate, toDate };
    }
  }
}

// Helper function to map Zoho bill status to our enum
function mapBillStatus(zohoStatus: string): "draft" | "open" | "overdue" | "paid" | "void" {
  switch (zohoStatus?.toLowerCase()) {
    case "draft":
      return "draft";
    case "open":
      return "open";
    case "overdue":
      return "overdue";
    case "paid":
      return "paid";
    case "void":
      return "void";
    default:
      return "open";
  }
}
