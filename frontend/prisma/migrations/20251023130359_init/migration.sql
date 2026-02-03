-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('TnM', 'Retainer', 'Milestone');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'active', 'on_hold', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('draft', 'active', 'expired', 'closed');

-- CreateEnum
CREATE TYPE "ProjectCostType" AS ENUM ('tool', 'travel', 'contractor', 'other');

-- CreateEnum
CREATE TYPE "OverheadMethod" AS ENUM ('per_head', 'rev_pct', 'direct_cost_pct', 'hybrid');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'void');

-- CreateEnum
CREATE TYPE "AccrualSnapshotStatus" AS ENUM ('open', 'frozen');

-- CreateEnum
CREATE TYPE "JournalExportType" AS ENUM ('unbilled', 'deferred', 'reversal');

-- CreateEnum
CREATE TYPE "DocCategory" AS ENUM ('PO', 'MSA', 'SOW', 'NDA', 'Policy', 'SOP', 'Audit');

-- CreateEnum
CREATE TYPE "DocAccessTier" AS ENUM ('public', 'restricted', 'legal');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('draft', 'active', 'obsolete');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('approved', 'rejected');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'finance', 'pm', 'readonly');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoho_contact_id" TEXT,
    "billing_currency" TEXT NOT NULL DEFAULT 'INR',
    "gstin" TEXT,
    "pan" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricing_model" "PricingModel" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "zoho_project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "microsoft_user_id" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "ctc_monthly" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "utilization_target" DECIMAL(5,2) NOT NULL DEFAULT 0.80,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "manual_ctc_override" BOOLEAN NOT NULL DEFAULT false,
    "manual_override_by" TEXT,
    "manual_override_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PO" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "amount_total" DECIMAL(15,2) NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3) NOT NULL,
    "zoho_purchaseorder_id" TEXT,
    "status" "POStatus" NOT NULL DEFAULT 'draft',
    "amount_billed_to_date" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "amount_remaining" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PO_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "period_month" TIMESTAMP(3) NOT NULL,
    "hours_billable" DECIMAL(6,2) NOT NULL,
    "hours_nonbillable" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "pct_effort" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCost" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "period_month" TIMESTAMP(3) NOT NULL,
    "type" "ProjectCostType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverheadPool" (
    "id" TEXT NOT NULL,
    "period_month" TIMESTAMP(3) NOT NULL,
    "hr" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "it" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "admin" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mgmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "misc" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverheadPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverheadPolicy" (
    "id" TEXT NOT NULL,
    "period_month" TIMESTAMP(3) NOT NULL,
    "method" "OverheadMethod" NOT NULL,
    "params_json" JSONB NOT NULL,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverheadPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPlan" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "rule_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "period_month" TIMESTAMP(3) NOT NULL,
    "zoho_invoice_id" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "issued_on" TIMESTAMP(3) NOT NULL,
    "due_on" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "sync_checksum" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashReceipt" (
    "id" TEXT NOT NULL,
    "zoho_payment_id" TEXT,
    "invoice_id" TEXT NOT NULL,
    "received_on" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "ref_no" TEXT,
    "payment_mode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccrualSnapshot" (
    "id" TEXT NOT NULL,
    "period_month" TIMESTAMP(3) NOT NULL,
    "status" "AccrualSnapshotStatus" NOT NULL DEFAULT 'open',
    "frozen_at" TIMESTAMP(3),
    "frozen_by" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "superseded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccrualSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccrualLine" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "earned_rev" DECIMAL(15,2) NOT NULL,
    "invoiced_rev" DECIMAL(15,2) NOT NULL,
    "unbilled_rev" DECIMAL(15,2) NOT NULL,
    "deferred_rev" DECIMAL(15,2) NOT NULL,
    "direct_cost" DECIMAL(15,2) NOT NULL,
    "overhead_alloc" DECIMAL(15,2) NOT NULL,
    "gross_amt" DECIMAL(15,2) NOT NULL,
    "gross_pct" DECIMAL(7,4) NOT NULL,
    "net_amt" DECIMAL(15,2) NOT NULL,
    "net_pct" DECIMAL(7,4) NOT NULL,
    "at_risk_wip" DECIMAL(15,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccrualLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalExport" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "type" "JournalExportType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocSpace" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "client_id" TEXT,
    "title" TEXT NOT NULL,
    "category" "DocCategory" NOT NULL,
    "version" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "signed" BOOLEAN NOT NULL DEFAULT false,
    "signed_by" TEXT,
    "signed_at" TIMESTAMP(3),
    "retention_till" TIMESTAMP(3),
    "access_tier" "DocAccessTier" NOT NULL DEFAULT 'restricted',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "DocStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "docspace_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "approver_id" TEXT NOT NULL,
    "decision" "ApprovalDecision",
    "decided_at" TIMESTAMP(3),
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'readonly',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "sync_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "records_synced" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "metadata" JSONB,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_zoho_contact_id_key" ON "Client"("zoho_contact_id");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_zoho_contact_id_idx" ON "Client"("zoho_contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "Project_zoho_project_id_key" ON "Project"("zoho_project_id");

-- CreateIndex
CREATE INDEX "Project_client_id_idx" ON "Project"("client_id");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_start_date_end_date_idx" ON "Project"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Person_microsoft_user_id_key" ON "Person"("microsoft_user_id");

-- CreateIndex
CREATE INDEX "Person_email_idx" ON "Person"("email");

-- CreateIndex
CREATE INDEX "Person_billable_idx" ON "Person"("billable");

-- CreateIndex
CREATE INDEX "Person_microsoft_user_id_idx" ON "Person"("microsoft_user_id");

-- CreateIndex
CREATE INDEX "Person_department_idx" ON "Person"("department");

-- CreateIndex
CREATE UNIQUE INDEX "PO_po_number_key" ON "PO"("po_number");

-- CreateIndex
CREATE UNIQUE INDEX "PO_zoho_purchaseorder_id_key" ON "PO"("zoho_purchaseorder_id");

-- CreateIndex
CREATE INDEX "PO_project_id_idx" ON "PO"("project_id");

-- CreateIndex
CREATE INDEX "PO_status_idx" ON "PO"("status");

-- CreateIndex
CREATE INDEX "PO_valid_from_valid_to_idx" ON "PO"("valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "Allocation_period_month_idx" ON "Allocation"("period_month");

-- CreateIndex
CREATE INDEX "Allocation_project_id_period_month_idx" ON "Allocation"("project_id", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_person_id_project_id_period_month_key" ON "Allocation"("person_id", "project_id", "period_month");

-- CreateIndex
CREATE INDEX "ProjectCost_project_id_period_month_idx" ON "ProjectCost"("project_id", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "OverheadPool_period_month_key" ON "OverheadPool"("period_month");

-- CreateIndex
CREATE INDEX "OverheadPool_period_month_idx" ON "OverheadPool"("period_month");

-- CreateIndex
CREATE UNIQUE INDEX "OverheadPolicy_period_month_key" ON "OverheadPolicy"("period_month");

-- CreateIndex
CREATE INDEX "OverheadPolicy_period_month_idx" ON "OverheadPolicy"("period_month");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_project_id_key" ON "BillingPlan"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_zoho_invoice_id_key" ON "Invoice"("zoho_invoice_id");

-- CreateIndex
CREATE INDEX "Invoice_project_id_period_month_idx" ON "Invoice"("project_id", "period_month");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_zoho_invoice_id_idx" ON "Invoice"("zoho_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "CashReceipt_zoho_payment_id_key" ON "CashReceipt"("zoho_payment_id");

-- CreateIndex
CREATE INDEX "CashReceipt_invoice_id_idx" ON "CashReceipt"("invoice_id");

-- CreateIndex
CREATE INDEX "CashReceipt_zoho_payment_id_idx" ON "CashReceipt"("zoho_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "AccrualSnapshot_period_month_key" ON "AccrualSnapshot"("period_month");

-- CreateIndex
CREATE UNIQUE INDEX "AccrualSnapshot_superseded_by_key" ON "AccrualSnapshot"("superseded_by");

-- CreateIndex
CREATE INDEX "AccrualSnapshot_period_month_version_idx" ON "AccrualSnapshot"("period_month", "version");

-- CreateIndex
CREATE INDEX "AccrualSnapshot_status_idx" ON "AccrualSnapshot"("status");

-- CreateIndex
CREATE INDEX "AccrualLine_project_id_idx" ON "AccrualLine"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "AccrualLine_snapshot_id_project_id_key" ON "AccrualLine"("snapshot_id", "project_id");

-- CreateIndex
CREATE INDEX "JournalExport_snapshot_id_idx" ON "JournalExport"("snapshot_id");

-- CreateIndex
CREATE INDEX "DocSpace_project_id_idx" ON "DocSpace"("project_id");

-- CreateIndex
CREATE INDEX "DocSpace_client_id_idx" ON "DocSpace"("client_id");

-- CreateIndex
CREATE INDEX "DocSpace_category_idx" ON "DocSpace"("category");

-- CreateIndex
CREATE INDEX "DocSpace_status_idx" ON "DocSpace"("status");

-- CreateIndex
CREATE INDEX "DocSpace_retention_till_idx" ON "DocSpace"("retention_till");

-- CreateIndex
CREATE INDEX "Approval_approver_id_idx" ON "Approval"("approver_id");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_docspace_id_step_key" ON "Approval"("docspace_id", "step");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entity_id_idx" ON "AuditLog"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "AuditLog_actor_id_idx" ON "AuditLog"("actor_id");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "SyncLog_sync_type_started_at_idx" ON "SyncLog"("sync_type", "started_at");

-- CreateIndex
CREATE INDEX "SyncLog_status_idx" ON "SyncLog"("status");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PO" ADD CONSTRAINT "PO_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCost" ADD CONSTRAINT "ProjectCost_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPlan" ADD CONSTRAINT "BillingPlan_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReceipt" ADD CONSTRAINT "CashReceipt_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccrualSnapshot" ADD CONSTRAINT "AccrualSnapshot_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "AccrualSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccrualLine" ADD CONSTRAINT "AccrualLine_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "AccrualSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccrualLine" ADD CONSTRAINT "AccrualLine_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalExport" ADD CONSTRAINT "JournalExport_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "AccrualSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocSpace" ADD CONSTRAINT "DocSpace_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocSpace" ADD CONSTRAINT "DocSpace_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_docspace_id_fkey" FOREIGN KEY ("docspace_id") REFERENCES "DocSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
