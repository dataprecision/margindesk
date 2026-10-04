-- Additive: company fields on Client (customer or vendor, placeholders, our owners) and the contacts table.
ALTER TABLE "Client" ADD COLUMN "contact_type" TEXT,
                     ADD COLUMN "zoho_status" TEXT,
                     ADD COLUMN "legal_name" TEXT,
                     ADD COLUMN "payment_terms" INTEGER,
                     ADD COLUMN "primary_email" TEXT,
                     ADD COLUMN "primary_phone" TEXT,
                     ADD COLUMN "website" TEXT,
                     ADD COLUMN "notes" TEXT,
                     ADD COLUMN "placeholder" BOOLEAN NOT NULL DEFAULT false,
                     ADD COLUMN "suggested_zoho_contact_id" TEXT,
                     ADD COLUMN "owner_person_id" TEXT,
                     ADD COLUMN "legal_person_id" TEXT,
                     ADD COLUMN "finance_person_id" TEXT;
CREATE INDEX "Client_contact_type_idx" ON "Client"("contact_type");
CREATE INDEX "Client_placeholder_idx" ON "Client"("placeholder");
ALTER TABLE "Client" ADD CONSTRAINT "Client_owner_person_id_fkey" FOREIGN KEY ("owner_person_id") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_legal_person_id_fkey" FOREIGN KEY ("legal_person_id") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_finance_person_id_fkey" FOREIGN KEY ("finance_person_id") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "zoho_contact_person_id" TEXT,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientContact_zoho_contact_person_id_key" ON "ClientContact"("zoho_contact_person_id");
CREATE INDEX "ClientContact_client_id_idx" ON "ClientContact"("client_id");
CREATE INDEX "ClientContact_email_idx" ON "ClientContact"("email");
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
