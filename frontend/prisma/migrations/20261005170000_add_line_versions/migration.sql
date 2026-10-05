-- Additive: a billing line can replace an earlier version of itself from a date.
ALTER TABLE "ContractLine" ADD COLUMN "replaces_line_id" TEXT;
CREATE INDEX "ContractLine_replaces_line_id_idx" ON "ContractLine"("replaces_line_id");
ALTER TABLE "ContractLine" ADD CONSTRAINT "ContractLine_replaces_line_id_fkey" FOREIGN KEY ("replaces_line_id") REFERENCES "ContractLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
