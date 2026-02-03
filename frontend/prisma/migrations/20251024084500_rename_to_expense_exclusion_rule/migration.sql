-- AlterTable: Rename ExclusionRule to ExpenseExclusionRule
ALTER TABLE "ExclusionRule" RENAME TO "ExpenseExclusionRule";

-- AlterEnum: Rename enums
ALTER TYPE "ExclusionRuleField" RENAME TO "ExpenseExclusionRuleField";
ALTER TYPE "ExclusionRuleOperator" RENAME TO "ExpenseExclusionRuleOperator";

-- Rename indexes
ALTER INDEX "ExclusionRule_enabled_idx" RENAME TO "ExpenseExclusionRule_enabled_idx";
ALTER INDEX "ExclusionRule_is_default_idx" RENAME TO "ExpenseExclusionRule_is_default_idx";
