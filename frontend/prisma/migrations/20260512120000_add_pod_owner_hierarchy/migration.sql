-- CreateTable
CREATE TABLE "PodOwner" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PodOwner_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "FinancialPod" ADD COLUMN "owner_id" TEXT;

-- CreateIndex
CREATE INDEX "PodOwner_person_id_idx" ON "PodOwner"("person_id");

-- CreateIndex
CREATE INDEX "PodOwner_parent_id_idx" ON "PodOwner"("parent_id");

-- CreateIndex
CREATE INDEX "PodOwner_end_date_idx" ON "PodOwner"("end_date");

-- CreateIndex
CREATE INDEX "FinancialPod_owner_id_idx" ON "FinancialPod"("owner_id");

-- AddForeignKey
ALTER TABLE "PodOwner" ADD CONSTRAINT "PodOwner_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodOwner" ADD CONSTRAINT "PodOwner_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "PodOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialPod" ADD CONSTRAINT "FinancialPod_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "PodOwner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
