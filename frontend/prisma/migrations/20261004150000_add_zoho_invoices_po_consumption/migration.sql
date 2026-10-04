-- Additive: read-only copies of Zoho invoices and credit notes; consumption fields on purchase orders.
ALTER TABLE "ContractPurchaseOrder" ADD COLUMN "opening_consumed" DECIMAL(15,2),
                                    ADD COLUMN "consumed" DECIMAL(15,2),
                                    ADD COLUMN "consumed_as_of" TIMESTAMP(3),
                                    ADD COLUMN "run_rate" DECIMAL(15,2),
                                    ADD COLUMN "projected_exhaustion" TIMESTAMP(3),
                                    ADD COLUMN "alert_state" TEXT,
                                    ADD COLUMN "notes" TEXT;
CREATE INDEX "ContractPurchaseOrder_alert_state_idx" ON "ContractPurchaseOrder"("alert_state");

CREATE TABLE "ZohoInvoice" (
    "id" TEXT NOT NULL,
    "zoho_invoice_id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "zoho_customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "client_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchange_rate" DECIMAL(12,6) NOT NULL DEFAULT 1,
    "sub_total" DECIMAL(15,2) NOT NULL,
    "tax_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "reference_number" TEXT,
    "service_month" TIMESTAMP(3),
    "team" TEXT,
    "zoho_estimate_id" TEXT,
    "purchase_order_id" TEXT,
    "po_match" TEXT,
    "last_modified_time" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZohoInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ZohoInvoice_zoho_invoice_id_key" ON "ZohoInvoice"("zoho_invoice_id");
CREATE INDEX "ZohoInvoice_zoho_customer_id_idx" ON "ZohoInvoice"("zoho_customer_id");
CREATE INDEX "ZohoInvoice_client_id_idx" ON "ZohoInvoice"("client_id");
CREATE INDEX "ZohoInvoice_date_idx" ON "ZohoInvoice"("date");
CREATE INDEX "ZohoInvoice_purchase_order_id_idx" ON "ZohoInvoice"("purchase_order_id");
CREATE INDEX "ZohoInvoice_reference_number_idx" ON "ZohoInvoice"("reference_number");
ALTER TABLE "ZohoInvoice" ADD CONSTRAINT "ZohoInvoice_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "ContractPurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ZohoInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "zoho_line_item_id" TEXT,
    "item_name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "rate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(15,2) NOT NULL,
    "hsn_sac" TEXT,
    "tax_percentage" DECIMAL(5,2),
    CONSTRAINT "ZohoInvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ZohoInvoiceLine_zoho_line_item_id_key" ON "ZohoInvoiceLine"("zoho_line_item_id");
CREATE INDEX "ZohoInvoiceLine_invoice_id_idx" ON "ZohoInvoiceLine"("invoice_id");
ALTER TABLE "ZohoInvoiceLine" ADD CONSTRAINT "ZohoInvoiceLine_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ZohoInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ZohoCreditNote" (
    "id" TEXT NOT NULL,
    "zoho_creditnote_id" TEXT NOT NULL,
    "creditnote_number" TEXT NOT NULL,
    "zoho_customer_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "client_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchange_rate" DECIMAL(12,6) NOT NULL DEFAULT 1,
    "sub_total" DECIMAL(15,2) NOT NULL,
    "total" DECIMAL(15,2) NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "reference_number" TEXT,
    "applied_invoice_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purchase_order_id" TEXT,
    "po_match" TEXT,
    "last_modified_time" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZohoCreditNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ZohoCreditNote_zoho_creditnote_id_key" ON "ZohoCreditNote"("zoho_creditnote_id");
CREATE INDEX "ZohoCreditNote_zoho_customer_id_idx" ON "ZohoCreditNote"("zoho_customer_id");
CREATE INDEX "ZohoCreditNote_date_idx" ON "ZohoCreditNote"("date");
CREATE INDEX "ZohoCreditNote_purchase_order_id_idx" ON "ZohoCreditNote"("purchase_order_id");
ALTER TABLE "ZohoCreditNote" ADD CONSTRAINT "ZohoCreditNote_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "ContractPurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
