import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { getZohoBooksApiUrl } from "@/lib/zoho/config";
import { getZohoAccessToken } from "@/lib/zoho/token-manager";
import { shouldExcludeExpense, type ExclusionRule } from "@/lib/exclusion-rules";

const prisma = new PrismaClient();

/**
 * POST /api/sync/expenses
 * Sync expenses from Zoho Books
 *
 * Request body (optional):
 * {
 *   "range": "last_month" | "last_quarter" | "this_quarter" | "this_fiscal_year" | "last_fiscal_year" | "last_year" | "all"
 * }
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    console.log("🔄 [Zoho Expense Sync] Starting expense sync...");

    // Get Zoho Books access token
    const tokens = await getZohoAccessToken();

    if (!tokens) {
      throw new Error("Zoho Books not connected. Please connect in Settings.");
    }

    console.log("✅ [Zoho Expense Sync] Zoho Books connected");

    // Get date range from request body (default: last_year)
    const body = await req.json().catch(() => ({}));
    const range = body.range || "last_year";

    // Calculate date range based on selection
    const { fromDate, toDate } = calculateDateRange(range);
    const fromDateStr = fromDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const toDateStr = toDate.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`📅 [Zoho Expense Sync] Syncing expenses for range: ${range} (${fromDateStr} to ${toDateStr})`);

    // Fetch all expenses from Zoho Books with pagination
    // https://www.zoho.com/books/api/v3/#Expenses_List_Expenses
    let allExpenses: any[] = [];
    let page = 1;
    let hasMorePages = true;
    const perPage = 200; // Zoho Books max per page

    while (hasMorePages) {
      console.log(`🌐 [Zoho Expense Sync] Fetching page ${page}...`);

      const expensesResponse = await fetch(
        `${tokens.api_domain}/books/v3/expenses?organization_id=${tokens.organization_id}&date_start=${fromDateStr}&date_end=${toDateStr}&page=${page}&per_page=${perPage}`,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
          },
        }
      );

      if (!expensesResponse.ok) {
        const error = await expensesResponse.text();
        console.error("❌ [Zoho Expense Sync] API Error:", error);
        throw new Error(`Failed to fetch expenses from Zoho Books: ${error}`);
      }

      const data = await expensesResponse.json();
      const expenses = data.expenses || [];

      console.log(`✅ [Zoho Expense Sync] Retrieved ${expenses.length} expenses on page ${page}`);

      allExpenses = allExpenses.concat(expenses);

      // Check if there are more pages
      // Zoho Books returns page_context with has_more_page
      hasMorePages = data.page_context?.has_more_page || false;
      page++;

      // Safety limit to prevent infinite loops
      if (page > 100) {
        console.warn("⚠️ [Zoho Expense Sync] Reached page limit of 100, stopping pagination");
        break;
      }
    }

    console.log(`📥 [Zoho Expense Sync] Total expenses retrieved: ${allExpenses.length} (from ${page - 1} pages)`);

    // Fetch enabled exclusion rules from database
    const exclusionRules = await prisma.expenseExclusionRule.findMany({
      where: { enabled: true },
    });

    // Convert database rules to ExclusionRule format
    const rules: ExclusionRule[] = exclusionRules.map(rule => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      enabled: rule.enabled,
      field: rule.field as ExclusionRule["field"],
      operator: rule.operator as ExclusionRule["operator"],
      value: rule.operator === "greater_than" || rule.operator === "less_than"
        ? parseFloat(rule.value)
        : rule.value,
      reason: rule.reason,
      is_default: rule.is_default,
    }));

    console.log(`📋 [Zoho Expense Sync] Loaded ${rules.length} active exclusion rules`);

    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process each expense
    for (const expense of allExpenses) {
      try {
        // Log first expense to see all available fields from Zoho
        if (allExpenses.indexOf(expense) === 0) {
          console.log('📋 [Zoho Expense Sync] Raw Zoho expense fields:', JSON.stringify(expense, null, 2));
          console.log('📋 [Zoho Expense Sync] Available keys:', Object.keys(expense));
        }

        // Check if expense already exists
        const existingExpense = await prisma.expense.findUnique({
          where: { zoho_expense_id: expense.expense_id },
        });

        // Use total_without_tax field for amount (excludes taxes)
        // Zoho Books provides: total (with tax) and total_without_tax (without tax)
        const amountWithoutTax = expense.total_without_tax || expense.total;

        // Check if expense should be auto-excluded
        const exclusionCheck = shouldExcludeExpense(
          {
            account_name: expense.account_name,
            description: expense.description,
            customer_name: expense.customer_name,
            amount: amountWithoutTax,
            total: expense.total,
            notes: expense.notes,
          },
          rules
        );

        // Log exclusion check for debugging
        if (exclusionCheck.exclude) {
          console.log(`🚫 [Zoho Expense Sync] Expense ${expense.expense_id} matches exclusion rule: ${exclusionCheck.reason}`);
        }

        const expenseData = {
          zoho_expense_id: expense.expense_id,
          account_id: expense.account_id || null,
          account_name: expense.account_name,
          expense_date: new Date(expense.date),
          amount: amountWithoutTax, // Amount excluding taxes
          total: expense.total, // Total including taxes
          status: mapExpenseStatus(expense.status),
          is_billable: expense.is_billable || false,
          customer_id: expense.customer_id || null,
          customer_name: expense.customer_name || null,
          currency_code: expense.currency_code || "INR",
          description: expense.description || null,
          reference_number: expense.reference_number || null,
          notes: expense.notes || null,
          // Apply auto-exclusion rules only for new expenses
          include_in_calculation: existingExpense
            ? existingExpense.include_in_calculation // Preserve manual changes
            : !exclusionCheck.exclude, // Auto-exclude if matches rules
          exclusion_reason: existingExpense?.exclusion_reason || exclusionCheck.reason || null,
        };

        if (existingExpense) {
          // Update existing expense
          await prisma.expense.update({
            where: { zoho_expense_id: expense.expense_id },
            data: expenseData,
          });
          updatedCount++;
          console.log(`🔄 [Zoho Expense Sync] Updated expense: ${expense.expense_id}`);
        } else {
          // Create new expense
          await prisma.expense.create({
            data: expenseData,
          });
          createdCount++;
          console.log(`➕ [Zoho Expense Sync] Created expense: ${expense.expense_id}`);
        }
      } catch (error: any) {
        errorCount++;
        const errorMsg = `Failed to sync expense ${expense.expense_id}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ [Zoho Expense Sync] ${errorMsg}`);
      }
    }

    // Create sync log
    await prisma.syncLog.create({
      data: {
        sync_type: "zoho_expenses",
        status: errorCount > 0 ? "completed_with_errors" : "success",
        records_synced: createdCount + updatedCount,
        error_message: errors.length > 0 ? errors.join("; ") : undefined,
        metadata: {
          created: createdCount,
          updated: updatedCount,
          errors: errorCount,
          total: allExpenses.length,
          pages: page - 1,
        },
      },
    });

    console.log(`📊 [Zoho Expense Sync] Summary - Created: ${createdCount}, Updated: ${updatedCount}, Errors: ${errorCount}`);

    return NextResponse.json({
      success: true,
      count: createdCount + updatedCount,
      created: createdCount,
      updated: updatedCount,
      errors: errorCount,
      errorMessages: errors,
    });
  } catch (error: any) {
    console.error("❌ [Zoho Expense Sync] Error:", error);

    // Create error sync log
    await prisma.syncLog.create({
      data: {
        sync_type: "zoho_expenses",
        status: "failed",
        records_synced: 0,
        error_message: error.message,
      },
    });

    return NextResponse.json(
      { error: "Failed to sync expenses", details: error.message },
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

// Helper function to map Zoho expense status to our enum
function mapExpenseStatus(zohoStatus: string): "unbilled" | "invoiced" | "reimbursed" | "non_billable" {
  switch (zohoStatus?.toLowerCase()) {
    case "unbilled":
      return "unbilled";
    case "invoiced":
      return "invoiced";
    case "reimbursed":
      return "reimbursed";
    case "non-billable":
    case "non_billable":
      return "non_billable";
    default:
      return "unbilled";
  }
}
