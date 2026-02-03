-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('reselling', 'outsourcing', 'custom');
CREATE TYPE "PodStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "ProjectType" AS ENUM ('hourly_blended', 'hourly_resource_based', 'reselling', 'outsourcing');
CREATE TYPE "BillingModel" AS ENUM ('time_and_material');
CREATE TYPE "RateType" AS ENUM ('blended', 'role_based');
CREATE TYPE "OveragePolicy" AS ENUM ('billable', 'absorbed');
CREATE TYPE "BillExclusionRuleField" AS ENUM ('vendor_name', 'bill_number', 'account_name', 'description', 'notes', 'cf_expense_category', 'total');
CREATE TYPE "BillExclusionRuleOperator" AS ENUM ('equals', 'contains', 'contains_any_of', 'starts_with', 'ends_with', 'greater_than', 'less_than');
CREATE TYPE "DetailsSyncStatus" AS ENUM ('pending', 'syncing', 'synced', 'error');
CREATE TYPE "JobStatus" AS ENUM ('running', 'completed', 'failed', 'cancelled');

-- AlterTable Bill
ALTER TABLE "Bill" ADD COLUMN "details_fetched_at" TIMESTAMP(3),
ADD COLUMN "details_sync_status" "DetailsSyncStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "exchange_rate" DECIMAL(10,6) DEFAULT 1,
ADD COLUMN "sub_total" DECIMAL(15,2),
ADD COLUMN "tax_total" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN "tds_total" DECIMAL(15,2) DEFAULT 0;

-- AlterTable PersonSalary
ALTER TABLE "PersonSalary" ADD COLUMN "is_support_staff" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Project
ALTER TABLE "Project" ALTER COLUMN "pricing_model" DROP NOT NULL;

-- CreateTable ProjectConfig
CREATE TABLE "ProjectConfig" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "project_type" "ProjectType" NOT NULL,
    "billing_model" "BillingModel" NOT NULL,
    "rate_type" "RateType" NOT NULL,
    "blended_rate" DECIMAL(10,2),
    "rate_card" JSONB,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billing_frequency" TEXT NOT NULL DEFAULT 'monthly',
    "hours_cap" INTEGER,
    "hours_cap_per_role" JSONB,
    "overage_policy" "OveragePolicy" NOT NULL DEFAULT 'billable',
    "po_amount" DECIMAL(12,2),
    "po_valid_from" TIMESTAMP(3),
    "po_valid_to" TIMESTAMP(3),
    "product_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable BillLineItem
CREATE TABLE "BillLineItem" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "zoho_line_item_id" TEXT,
    "item_id" TEXT,
    "item_name" TEXT NOT NULL,
    "account_id" TEXT,
    "account_name" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "rate" DECIMAL(15,2) NOT NULL,
    "item_total" DECIMAL(15,2) NOT NULL,
    "tax_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tds_tax_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "customer_id" TEXT,
    "customer_name" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable FinancialPod
CREATE TABLE "FinancialPod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leader_id" TEXT NOT NULL,
    "status" "PodStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialPod_pkey" PRIMARY KEY ("id")
);

-- CreateTable PodMembership
CREATE TABLE "PodMembership" (
    "id" TEXT NOT NULL,
    "pod_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "allocation_pct" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PodMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable PodProjectMapping
CREATE TABLE "PodProjectMapping" (
    "id" TEXT NOT NULL,
    "pod_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PodProjectMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable BillExclusionRule
CREATE TABLE "BillExclusionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "field" "BillExclusionRuleField" NOT NULL,
    "operator" "BillExclusionRuleOperator" NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillExclusionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable DetailSyncJob
CREATE TABLE "DetailSyncJob" (
    "id" TEXT NOT NULL,
    "filter_type" TEXT NOT NULL,
    "filter_value" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'running',
    "total_bills" INTEGER NOT NULL DEFAULT 0,
    "processed_bills" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "force_refetch" BOOLEAN NOT NULL DEFAULT false,
    "error_messages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DetailSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable TimesheetEntry
CREATE TABLE "TimesheetEntry" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "work_date" TIMESTAMP(3) NOT NULL,
    "task_name" TEXT,
    "task_type" TEXT,
    "hours_logged" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "import_batch_id" TEXT NOT NULL,
    "source_row_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_billable" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TimesheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable TimesheetImportBatch
CREATE TABLE "TimesheetImportBatch" (
    "id" TEXT NOT NULL,
    "imported_by" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "processed_rows" INTEGER NOT NULL,
    "skipped_rows" INTEGER NOT NULL,
    "deleted_entries" INTEGER NOT NULL DEFAULT 0,
    "error_messages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimesheetImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable Product
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "is_predefined" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable ResellingInvoice
CREATE TABLE "ResellingInvoice" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "period_month" TIMESTAMP(3) NOT NULL,
    "invoice_number" TEXT,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "invoice_amount" DECIMAL(15,2) NOT NULL,
    "total_oem_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "resource_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "other_expenses" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "gross_profit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "profit_margin_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResellingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable ResellingBillAllocation
CREATE TABLE "ResellingBillAllocation" (
    "id" TEXT NOT NULL,
    "reselling_invoice_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "allocation_percentage" DECIMAL(5,2) NOT NULL,
    "allocated_amount" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResellingBillAllocation_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ProjectConfig_project_id_key" ON "ProjectConfig"("project_id");
CREATE INDEX "ProjectConfig_project_id_idx" ON "ProjectConfig"("project_id");
CREATE INDEX "ProjectConfig_project_type_idx" ON "ProjectConfig"("project_type");
CREATE UNIQUE INDEX "BillLineItem_zoho_line_item_id_key" ON "BillLineItem"("zoho_line_item_id");
CREATE INDEX "BillLineItem_bill_id_idx" ON "BillLineItem"("bill_id");
CREATE INDEX "BillLineItem_zoho_line_item_id_idx" ON "BillLineItem"("zoho_line_item_id");
CREATE INDEX "BillLineItem_customer_id_idx" ON "BillLineItem"("customer_id");
CREATE INDEX "BillLineItem_item_id_idx" ON "BillLineItem"("item_id");
CREATE INDEX "FinancialPod_leader_id_idx" ON "FinancialPod"("leader_id");
CREATE INDEX "FinancialPod_status_idx" ON "FinancialPod"("status");
CREATE INDEX "PodMembership_person_id_end_date_idx" ON "PodMembership"("person_id", "end_date");
CREATE INDEX "PodMembership_pod_id_end_date_idx" ON "PodMembership"("pod_id", "end_date");
CREATE UNIQUE INDEX "PodMembership_pod_id_person_id_start_date_key" ON "PodMembership"("pod_id", "person_id", "start_date");
CREATE INDEX "PodProjectMapping_project_id_end_date_idx" ON "PodProjectMapping"("project_id", "end_date");
CREATE INDEX "PodProjectMapping_pod_id_end_date_idx" ON "PodProjectMapping"("pod_id", "end_date");
CREATE UNIQUE INDEX "PodProjectMapping_pod_id_project_id_start_date_key" ON "PodProjectMapping"("pod_id", "project_id", "start_date");
CREATE INDEX "BillExclusionRule_enabled_idx" ON "BillExclusionRule"("enabled");
CREATE INDEX "BillExclusionRule_is_default_idx" ON "BillExclusionRule"("is_default");
CREATE INDEX "DetailSyncJob_status_idx" ON "DetailSyncJob"("status");
CREATE INDEX "DetailSyncJob_started_at_idx" ON "DetailSyncJob"("started_at");
CREATE INDEX "DetailSyncJob_filter_type_filter_value_idx" ON "DetailSyncJob"("filter_type", "filter_value");
CREATE INDEX "TimesheetEntry_work_date_idx" ON "TimesheetEntry"("work_date");
CREATE INDEX "TimesheetEntry_person_id_work_date_idx" ON "TimesheetEntry"("person_id", "work_date");
CREATE INDEX "TimesheetEntry_project_id_work_date_idx" ON "TimesheetEntry"("project_id", "work_date");
CREATE INDEX "TimesheetEntry_import_batch_id_idx" ON "TimesheetEntry"("import_batch_id");
CREATE UNIQUE INDEX "TimesheetEntry_person_id_project_id_work_date_source_row_ha_key" ON "TimesheetEntry"("person_id", "project_id", "work_date", "source_row_hash");
CREATE INDEX "TimesheetImportBatch_created_at_idx" ON "TimesheetImportBatch"("created_at");
CREATE INDEX "TimesheetImportBatch_period_start_period_end_idx" ON "TimesheetImportBatch"("period_start", "period_end");
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");
CREATE INDEX "Product_type_idx" ON "Product"("type");
CREATE INDEX "Product_is_predefined_idx" ON "Product"("is_predefined");
CREATE INDEX "ResellingInvoice_project_id_period_month_idx" ON "ResellingInvoice"("project_id", "period_month");
CREATE INDEX "ResellingInvoice_product_id_period_month_idx" ON "ResellingInvoice"("product_id", "period_month");
CREATE INDEX "ResellingInvoice_invoice_id_idx" ON "ResellingInvoice"("invoice_id");
CREATE INDEX "ResellingInvoice_period_month_idx" ON "ResellingInvoice"("period_month");
CREATE INDEX "ResellingBillAllocation_bill_id_idx" ON "ResellingBillAllocation"("bill_id");
CREATE INDEX "ResellingBillAllocation_product_id_idx" ON "ResellingBillAllocation"("product_id");
CREATE UNIQUE INDEX "ResellingBillAllocation_reselling_invoice_id_bill_id_key" ON "ResellingBillAllocation"("reselling_invoice_id", "bill_id");
CREATE INDEX "Bill_details_sync_status_idx" ON "Bill"("details_sync_status");
CREATE INDEX "PersonSalary_is_support_staff_idx" ON "PersonSalary"("is_support_staff");
CREATE UNIQUE INDEX "ProjectCost_project_id_period_month_type_key" ON "ProjectCost"("project_id", "period_month", "type");

-- Foreign Keys
ALTER TABLE "ProjectConfig" ADD CONSTRAINT "ProjectConfig_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectConfig" ADD CONSTRAINT "ProjectConfig_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillLineItem" ADD CONSTRAINT "BillLineItem_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialPod" ADD CONSTRAINT "FinancialPod_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PodMembership" ADD CONSTRAINT "PodMembership_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PodMembership" ADD CONSTRAINT "PodMembership_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "FinancialPod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PodProjectMapping" ADD CONSTRAINT "PodProjectMapping_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "FinancialPod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PodProjectMapping" ADD CONSTRAINT "PodProjectMapping_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "TimesheetImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResellingInvoice" ADD CONSTRAINT "ResellingInvoice_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResellingInvoice" ADD CONSTRAINT "ResellingInvoice_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResellingInvoice" ADD CONSTRAINT "ResellingInvoice_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResellingBillAllocation" ADD CONSTRAINT "ResellingBillAllocation_reselling_invoice_id_fkey" FOREIGN KEY ("reselling_invoice_id") REFERENCES "ResellingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResellingBillAllocation" ADD CONSTRAINT "ResellingBillAllocation_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResellingBillAllocation" ADD CONSTRAINT "ResellingBillAllocation_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
