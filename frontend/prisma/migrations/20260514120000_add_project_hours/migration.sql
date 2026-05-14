-- CreateTable
CREATE TABLE "ProjectHours" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "period_month" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(8,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectHours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectHours_project_id_period_month_key" ON "ProjectHours"("project_id", "period_month");

-- CreateIndex
CREATE INDEX "ProjectHours_project_id_period_month_idx" ON "ProjectHours"("project_id", "period_month");

-- AddForeignKey
ALTER TABLE "ProjectHours" ADD CONSTRAINT "ProjectHours_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
