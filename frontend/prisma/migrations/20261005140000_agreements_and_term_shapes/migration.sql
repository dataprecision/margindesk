-- Additive: organisation-level agreements; billing shapes on terms; draft lines point at terms.
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MSA',
    "title" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "auto_renewal" BOOLEAN,
    "renewal_note" TEXT,
    "notice_days" INTEGER,
    "signed" BOOLEAN,
    "documents" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "paper_checked_by" TEXT,
    "paper_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Agreement_client_id_idx" ON "Agreement"("client_id");
CREATE INDEX "Agreement_end_date_idx" ON "Agreement"("end_date");
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contract" ADD COLUMN "agreement_id" TEXT;
CREATE INDEX "Contract_agreement_id_idx" ON "Contract"("agreement_id");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContractLine" ADD COLUMN "shape" TEXT,
                           ADD COLUMN "params" JSONB NOT NULL DEFAULT '{}',
                           ADD COLUMN "period" TEXT,
                           ADD COLUMN "fx_rate" DECIMAL(12,4),
                           ADD COLUMN "input_needed" TEXT,
                           ADD COLUMN "advance_or_arrears" TEXT,
                           ADD COLUMN "rule_status" TEXT NOT NULL DEFAULT 'proposed',
                           ADD COLUMN "confirmed_by" TEXT,
                           ADD COLUMN "confirmed_at" TIMESTAMP(3),
                           ADD COLUMN "rule_evidence" JSONB,
                           ADD COLUMN "billing_rule_id" TEXT;
CREATE INDEX "ContractLine_rule_status_idx" ON "ContractLine"("rule_status");

ALTER TABLE "DraftEstimateLine" ADD COLUMN "line_id" TEXT;
CREATE INDEX "DraftEstimateLine_line_id_idx" ON "DraftEstimateLine"("line_id");
ALTER TABLE "DraftEstimateLine" ADD CONSTRAINT "DraftEstimateLine_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "ContractLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
