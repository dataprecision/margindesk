-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "manager_id" TEXT;

-- CreateIndex
CREATE INDEX "Person_manager_id_idx" ON "Person"("manager_id");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
