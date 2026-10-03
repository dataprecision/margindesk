-- Additive: review bucket and pointers on contracts; numeric value and status on purchase orders.
ALTER TABLE "Contract" ADD COLUMN "review_bucket" TEXT,
                       ADD COLUMN "review_pointers" JSONB NOT NULL DEFAULT '[]',
                       ADD COLUMN "read_file" TEXT,
                       ADD COLUMN "read_at" TIMESTAMP(3);
CREATE INDEX "Contract_review_bucket_idx" ON "Contract"("review_bucket");

ALTER TABLE "ContractPurchaseOrder" ADD COLUMN "value" DECIMAL(15,2),
                                    ADD COLUMN "currency" TEXT,
                                    ADD COLUMN "status" TEXT,
                                    ADD COLUMN "auto_key" TEXT;
CREATE UNIQUE INDEX "ContractPurchaseOrder_auto_key_key" ON "ContractPurchaseOrder"("auto_key");
