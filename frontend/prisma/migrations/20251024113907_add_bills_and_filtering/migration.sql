-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('unbilled', 'invoiced', 'reimbursed', 'billable', 'non_billable');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('draft', 'open', 'overdue', 'paid', 'void');

-- AlterTable
ALTER TABLE "Leave" ALTER COLUMN "days" SET DATA TYPE DECIMAL(6,2);

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "employee_code" TEXT;

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "zoho_expense_id" TEXT,
    "account_id" TEXT,
    "account_name" TEXT,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "total" DECIMAL(15,2) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'unbilled',
    "is_billable" BOOLEAN NOT NULL DEFAULT false,
    "customer_id" TEXT,
    "customer_name" TEXT,
    "person_id" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'INR',
    "description" TEXT,
    "reference_number" TEXT,
    "notes" TEXT,
    "include_in_calculation" BOOLEAN NOT NULL DEFAULT true,
    "exclusion_reason" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "zoho_bill_id" TEXT,
    "vendor_id" TEXT,
    "vendor_name" TEXT NOT NULL,
    "bill_number" TEXT NOT NULL,
    "bill_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "total" DECIMAL(15,2) NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'open',
    "currency_code" TEXT NOT NULL DEFAULT 'INR',
    "reference_number" TEXT,
    "notes" TEXT,
    "cf_expense_category" TEXT,
    "cf_expense_category_unformatted" TEXT,
    "cf_billed_for_month" TEXT,
    "cf_billed_for_month_unformatted" TIMESTAMP(3),
    "include_in_calculation" BOOLEAN NOT NULL DEFAULT true,
    "exclusion_reason" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_zoho_expense_id_key" ON "Expense"("zoho_expense_id");

-- CreateIndex
CREATE INDEX "Expense_zoho_expense_id_idx" ON "Expense"("zoho_expense_id");

-- CreateIndex
CREATE INDEX "Expense_person_id_idx" ON "Expense"("person_id");

-- CreateIndex
CREATE INDEX "Expense_expense_date_idx" ON "Expense"("expense_date");

-- CreateIndex
CREATE INDEX "Expense_status_idx" ON "Expense"("status");

-- CreateIndex
CREATE INDEX "Expense_include_in_calculation_idx" ON "Expense"("include_in_calculation");

-- CreateIndex
CREATE INDEX "Expense_tags_idx" ON "Expense"("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_zoho_bill_id_key" ON "Bill"("zoho_bill_id");

-- CreateIndex
CREATE INDEX "Bill_zoho_bill_id_idx" ON "Bill"("zoho_bill_id");

-- CreateIndex
CREATE INDEX "Bill_vendor_id_idx" ON "Bill"("vendor_id");

-- CreateIndex
CREATE INDEX "Bill_bill_date_idx" ON "Bill"("bill_date");

-- CreateIndex
CREATE INDEX "Bill_status_idx" ON "Bill"("status");

-- CreateIndex
CREATE INDEX "Bill_cf_expense_category_idx" ON "Bill"("cf_expense_category");

-- CreateIndex
CREATE INDEX "Bill_cf_billed_for_month_unformatted_idx" ON "Bill"("cf_billed_for_month_unformatted");

-- CreateIndex
CREATE INDEX "Bill_include_in_calculation_idx" ON "Bill"("include_in_calculation");

-- CreateIndex
CREATE INDEX "Bill_tags_idx" ON "Bill"("tags");

-- CreateIndex
CREATE UNIQUE INDEX "Person_employee_code_key" ON "Person"("employee_code");

-- CreateIndex
CREATE INDEX "Person_employee_code_idx" ON "Person"("employee_code");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

