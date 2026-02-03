-- CreateTable
CREATE TABLE "ManagerHistory" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagerHistory_person_id_idx" ON "ManagerHistory"("person_id");

-- CreateIndex
CREATE INDEX "ManagerHistory_manager_id_idx" ON "ManagerHistory"("manager_id");

-- CreateIndex
CREATE INDEX "ManagerHistory_person_id_start_date_idx" ON "ManagerHistory"("person_id", "start_date");

-- AddForeignKey
ALTER TABLE "ManagerHistory" ADD CONSTRAINT "ManagerHistory_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerHistory" ADD CONSTRAINT "ManagerHistory_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
