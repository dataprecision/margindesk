-- Additive: the SPOC on a contract becomes a link to a Person; the name column stays for display.
ALTER TABLE "Contract" ADD COLUMN "spoc_person_id" TEXT;
CREATE INDEX "Contract_spoc_person_id_idx" ON "Contract"("spoc_person_id");
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_spoc_person_id_fkey" FOREIGN KEY ("spoc_person_id") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
