/*
  Warnings:

  - A unique constraint covering the columns `[zoho_employee_id]` on the table `Person` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "zoho_employee_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Person_zoho_employee_id_key" ON "Person"("zoho_employee_id");

-- CreateIndex
CREATE INDEX "Person_zoho_employee_id_idx" ON "Person"("zoho_employee_id");
