-- Additive: draft estimates prepared in MarginDesk before anything exists in Zoho Books.
CREATE TABLE "DraftEstimate" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "client_id" TEXT,
    "period" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "purchase_order_id" TEXT,
    "fx_rate" DECIMAL(12,6),
    "sub_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "gaps" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "prepared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prepared_by" TEXT,
    "lead_signed_by" TEXT,
    "lead_signed_at" TIMESTAMP(3),
    "finance_checked_by" TEXT,
    "finance_checked_at" TIMESTAMP(3),
    "zoho_estimate_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftEstimate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DraftEstimate_contract_id_period_currency_key" ON "DraftEstimate"("contract_id", "period", "currency");
CREATE INDEX "DraftEstimate_period_idx" ON "DraftEstimate"("period");
CREATE INDEX "DraftEstimate_status_idx" ON "DraftEstimate"("status");
CREATE INDEX "DraftEstimate_client_id_idx" ON "DraftEstimate"("client_id");
ALTER TABLE "DraftEstimate" ADD CONSTRAINT "DraftEstimate_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftEstimate" ADD CONSTRAINT "DraftEstimate_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DraftEstimate" ADD CONSTRAINT "DraftEstimate_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "ContractPurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DraftEstimateLine" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "service" TEXT NOT NULL,
    "description" TEXT,
    "shape" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "inputs" JSONB NOT NULL DEFAULT '{}',
    "quantity" DECIMAL(12,4),
    "rate" DECIMAL(15,4),
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "missing" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DraftEstimateLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DraftEstimateLine_draft_id_idx" ON "DraftEstimateLine"("draft_id");
CREATE INDEX "DraftEstimateLine_rule_id_idx" ON "DraftEstimateLine"("rule_id");
ALTER TABLE "DraftEstimateLine" ADD CONSTRAINT "DraftEstimateLine_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "DraftEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftEstimateLine" ADD CONSTRAINT "DraftEstimateLine_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "BillingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
