-- CreateEnum
CREATE TYPE "BillingRuleStatus" AS ENUM ('proposed', 'confirmed', 'retired');

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "zoho_customer_id" TEXT;

-- CreateTable
CREATE TABLE "BillingRule" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "project_id" TEXT,
    "service" TEXT NOT NULL,
    "label" TEXT,
    "family" TEXT,
    "shape" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "fx_rate" DECIMAL(12,4),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" "BillingRuleStatus" NOT NULL DEFAULT 'proposed',
    "confidence" TEXT,
    "evidence" JSONB,
    "notes" TEXT,
    "auto_key" TEXT,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingRule_auto_key_key" ON "BillingRule"("auto_key");

-- CreateIndex
CREATE INDEX "BillingRule_contract_id_idx" ON "BillingRule"("contract_id");

-- CreateIndex
CREATE INDEX "BillingRule_status_idx" ON "BillingRule"("status");

-- CreateIndex
CREATE INDEX "BillingRule_project_id_idx" ON "BillingRule"("project_id");

-- AddForeignKey
ALTER TABLE "BillingRule" ADD CONSTRAINT "BillingRule_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingRule" ADD CONSTRAINT "BillingRule_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

