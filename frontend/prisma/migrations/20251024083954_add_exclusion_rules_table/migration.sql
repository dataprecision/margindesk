-- CreateEnum
CREATE TYPE "ExclusionRuleField" AS ENUM ('account_name', 'description', 'customer_name', 'amount', 'notes');

-- CreateEnum
CREATE TYPE "ExclusionRuleOperator" AS ENUM ('equals', 'contains', 'starts_with', 'ends_with', 'greater_than', 'less_than');

-- CreateTable
CREATE TABLE "ExclusionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "field" "ExclusionRuleField" NOT NULL,
    "operator" "ExclusionRuleOperator" NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExclusionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExclusionRule_enabled_idx" ON "ExclusionRule"("enabled");

-- CreateIndex
CREATE INDEX "ExclusionRule_is_default_idx" ON "ExclusionRule"("is_default");
