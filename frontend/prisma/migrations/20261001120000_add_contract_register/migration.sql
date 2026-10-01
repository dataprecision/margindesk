-- CreateEnum
CREATE TYPE "ContractDirection" AS ENUM ('customer', 'vendor', 'both', 'nda');

-- CreateEnum
CREATE TYPE "ContractTaskStatus" AS ENUM ('open', 'done', 'dismissed');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'legal';

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "counterparty" TEXT NOT NULL,
    "client_id" TEXT,
    "direction" "ContractDirection" NOT NULL DEFAULT 'customer',
    "basis" TEXT NOT NULL,
    "bill_to" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "spoc" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'active',
    "po_status" TEXT,
    "notes" TEXT,
    "open_questions" JSONB NOT NULL DEFAULT '[]',
    "documents" JSONB,
    "source_key" TEXT,
    "loaded_at" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractLine" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "project_id" TEXT,
    "service" TEXT NOT NULL,
    "billing_type" TEXT NOT NULL,
    "amount_text" TEXT NOT NULL,
    "amount" DECIMAL(15,2),
    "unit" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "date_note" TEXT,
    "read_from" TEXT NOT NULL DEFAULT 'Contract',
    "source_document" TEXT,
    "quote" TEXT,
    "extra_rule" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractPurchaseOrder" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "po_date" TIMESTAMP(3),
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "value_text" TEXT,
    "hours_text" TEXT,
    "rate_text" TEXT,
    "covers" TEXT,
    "document" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTask" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "owner" TEXT,
    "status" "ContractTaskStatus" NOT NULL DEFAULT 'open',
    "auto_key" TEXT,
    "created_by" TEXT,
    "completed_by" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_source_key_key" ON "Contract"("source_key");

-- CreateIndex
CREATE INDEX "Contract_end_date_idx" ON "Contract"("end_date");

-- CreateIndex
CREATE INDEX "Contract_client_id_idx" ON "Contract"("client_id");

-- CreateIndex
CREATE INDEX "Contract_spoc_idx" ON "Contract"("spoc");

-- CreateIndex
CREATE INDEX "ContractLine_contract_id_idx" ON "ContractLine"("contract_id");

-- CreateIndex
CREATE INDEX "ContractLine_end_date_idx" ON "ContractLine"("end_date");

-- CreateIndex
CREATE INDEX "ContractLine_project_id_idx" ON "ContractLine"("project_id");

-- CreateIndex
CREATE INDEX "ContractPurchaseOrder_contract_id_idx" ON "ContractPurchaseOrder"("contract_id");

-- CreateIndex
CREATE INDEX "ContractPurchaseOrder_valid_to_idx" ON "ContractPurchaseOrder"("valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTask_auto_key_key" ON "ContractTask"("auto_key");

-- CreateIndex
CREATE INDEX "ContractTask_due_date_idx" ON "ContractTask"("due_date");

-- CreateIndex
CREATE INDEX "ContractTask_status_due_date_idx" ON "ContractTask"("status", "due_date");

-- CreateIndex
CREATE INDEX "ContractTask_owner_idx" ON "ContractTask"("owner");

-- CreateIndex
CREATE INDEX "ContractTask_contract_id_idx" ON "ContractTask"("contract_id");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPurchaseOrder" ADD CONSTRAINT "ContractPurchaseOrder_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractTask" ADD CONSTRAINT "ContractTask_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

