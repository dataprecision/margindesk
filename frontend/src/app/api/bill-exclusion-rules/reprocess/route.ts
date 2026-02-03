import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { withAuth } from "@/lib/auth/protect-route";
import { shouldExcludeBill, type BillExclusionRule } from "@/lib/bill-exclusion-rules";

const prisma = new PrismaClient();

/**
 * POST /api/bill-exclusion-rules/reprocess
 * Reprocess all existing bills against current exclusion rules
 */
export const POST = withAuth(async (req, { user }) => {
  try {
    console.log("🔄 [Bill Rules Reprocess] Starting reprocessing of all bills...");

    // Fetch all enabled exclusion rules
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

    console.log(`📋 [Bill Rules Reprocess] Loaded ${rules.length} active exclusion rules`);

    // Fetch all bills from database
    const bills = await prisma.bill.findMany();
    console.log(`📥 [Bill Rules Reprocess] Found ${bills.length} bills to process`);

    let updatedCount = 0;
    let excludedCount = 0;
    let includedCount = 0;

    // Process each bill
    for (const bill of bills) {
      // Check if bill should be auto-excluded
      const exclusionCheck = shouldExcludeBill(
        {
          vendor_name: bill.vendor_name,
          bill_number: bill.bill_number,
          account_name: null, // Not stored in current schema
          description: null, // Not stored in current schema
          notes: bill.notes,
          cf_expense_category: bill.cf_expense_category,
          total: bill.total,
        },
        rules
      );

      // Calculate new state
      const newIncludeState = !exclusionCheck.exclude;
      const newExclusionReason = exclusionCheck.reason || null;

      // Only update if the state changed
      if (
        bill.include_in_calculation !== newIncludeState ||
        bill.exclusion_reason !== newExclusionReason
      ) {
        await prisma.bill.update({
          where: { id: bill.id },
          data: {
            include_in_calculation: newIncludeState,
            exclusion_reason: newExclusionReason,
          },
        });

        updatedCount++;
        if (newIncludeState) {
          includedCount++;
        } else {
          excludedCount++;
        }

        console.log(
          `${newIncludeState ? "✅" : "🚫"} [Bill Rules Reprocess] ${bill.bill_number}: ${
            newIncludeState ? "included" : `excluded - ${newExclusionReason}`
          }`
        );
      }
    }

    console.log(
      `📊 [Bill Rules Reprocess] Complete - Updated: ${updatedCount}, Excluded: ${excludedCount}, Included: ${includedCount}`
    );

    return NextResponse.json({
      success: true,
      total: bills.length,
      updated: updatedCount,
      excluded: excludedCount,
      included: includedCount,
      rulesApplied: rules.length,
    });
  } catch (error: any) {
    console.error("❌ [Bill Rules Reprocess] Error:", error);
    return NextResponse.json(
      { error: "Failed to reprocess bills", details: error.message },
      { status: 500 }
    );
  }
});
