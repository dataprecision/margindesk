-- AddColumn
ALTER TABLE "BillLineItem" ADD COLUMN "project_id" TEXT;

-- CreateIndex
CREATE INDEX "BillLineItem_project_id_idx" ON "BillLineItem"("project_id");

-- AddForeignKey
ALTER TABLE "BillLineItem" ADD CONSTRAINT "BillLineItem_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
