-- Additive: maker-checker approval on agreements, contracts and billing lines; frozen source on draft lines.
ALTER TABLE "Agreement" ADD COLUMN "approval_status" TEXT NOT NULL DEFAULT 'draft', ADD COLUMN "last_edited_by" TEXT, ADD COLUMN "last_edited_at" TIMESTAMP(3), ADD COLUMN "submitted_by" TEXT, ADD COLUMN "submitted_at" TIMESTAMP(3), ADD COLUMN "approved_by" TEXT, ADD COLUMN "approved_at" TIMESTAMP(3), ADD COLUMN "approval_note" TEXT, ADD COLUMN "approved_against" JSONB;
ALTER TABLE "Contract" ADD COLUMN "approval_status" TEXT NOT NULL DEFAULT 'draft', ADD COLUMN "last_edited_by" TEXT, ADD COLUMN "last_edited_at" TIMESTAMP(3), ADD COLUMN "submitted_by" TEXT, ADD COLUMN "submitted_at" TIMESTAMP(3), ADD COLUMN "approved_by" TEXT, ADD COLUMN "approved_at" TIMESTAMP(3), ADD COLUMN "approval_note" TEXT, ADD COLUMN "approved_against" JSONB;
ALTER TABLE "ContractLine" ADD COLUMN "approval_status" TEXT NOT NULL DEFAULT 'draft', ADD COLUMN "last_edited_by" TEXT, ADD COLUMN "last_edited_at" TIMESTAMP(3), ADD COLUMN "submitted_by" TEXT, ADD COLUMN "submitted_at" TIMESTAMP(3), ADD COLUMN "approved_by" TEXT, ADD COLUMN "approved_at" TIMESTAMP(3), ADD COLUMN "approval_note" TEXT, ADD COLUMN "approved_against" JSONB;
CREATE INDEX "Agreement_approval_status_idx" ON "Agreement"("approval_status");
CREATE INDEX "Contract_approval_status_idx" ON "Contract"("approval_status");
CREATE INDEX "ContractLine_approval_status_idx" ON "ContractLine"("approval_status");
ALTER TABLE "DraftEstimateLine" ADD COLUMN "source" JSONB;
