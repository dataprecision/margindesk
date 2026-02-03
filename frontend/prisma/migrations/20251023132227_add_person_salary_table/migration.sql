-- CreateTable
CREATE TABLE "PersonSalary" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "base_salary" DECIMAL(12,2) NOT NULL,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtime" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonSalary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonSalary_person_id_idx" ON "PersonSalary"("person_id");

-- CreateIndex
CREATE INDEX "PersonSalary_month_idx" ON "PersonSalary"("month");

-- CreateIndex
CREATE UNIQUE INDEX "PersonSalary_person_id_month_key" ON "PersonSalary"("person_id", "month");

-- AddForeignKey
ALTER TABLE "PersonSalary" ADD CONSTRAINT "PersonSalary_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
