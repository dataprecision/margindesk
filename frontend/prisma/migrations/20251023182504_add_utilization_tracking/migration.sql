-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('public', 'restricted', 'optional');

-- CreateTable
CREATE TABLE "Leave" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "leave_type" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "days" DECIMAL(4,2) NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "zoho_leave_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'public',
    "description" TEXT,
    "zoho_holiday_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyUtilization" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "working_hours" DECIMAL(6,2) NOT NULL,
    "worked_hours" DECIMAL(6,2) NOT NULL,
    "billable_hours" DECIMAL(6,2) NOT NULL,
    "utilization_pct" DECIMAL(5,2) NOT NULL,
    "billable_utilization" DECIMAL(5,2) NOT NULL,
    "leave_days" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "holiday_days" DECIMAL(4,2) NOT NULL DEFAULT 0,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyUtilization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Leave_zoho_leave_id_key" ON "Leave"("zoho_leave_id");

-- CreateIndex
CREATE INDEX "Leave_person_id_start_date_idx" ON "Leave"("person_id", "start_date");

-- CreateIndex
CREATE INDEX "Leave_status_idx" ON "Leave"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_zoho_holiday_id_key" ON "Holiday"("zoho_holiday_id");

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX "Holiday_type_idx" ON "Holiday"("type");

-- CreateIndex
CREATE INDEX "MonthlyUtilization_month_idx" ON "MonthlyUtilization"("month");

-- CreateIndex
CREATE INDEX "MonthlyUtilization_utilization_pct_idx" ON "MonthlyUtilization"("utilization_pct");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyUtilization_person_id_month_key" ON "MonthlyUtilization"("person_id", "month");

-- AddForeignKey
ALTER TABLE "Leave" ADD CONSTRAINT "Leave_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyUtilization" ADD CONSTRAINT "MonthlyUtilization_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
