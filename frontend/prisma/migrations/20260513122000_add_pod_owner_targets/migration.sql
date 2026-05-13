-- CreateTable
CREATE TABLE "PodOwnerTarget" (
    "id" TEXT NOT NULL,
    "pod_owner_id" TEXT NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "profitability_target" DECIMAL(5,2) NOT NULL,
    "revenue_growth_target" DECIMAL(5,2) NOT NULL,
    "baseline_revenue" DECIMAL(15,2) NOT NULL,
    "notes" TEXT,
    "set_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PodOwnerTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PodOwnerTarget_pod_owner_id_fiscal_year_key"
    ON "PodOwnerTarget"("pod_owner_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "PodOwnerTarget_fiscal_year_idx" ON "PodOwnerTarget"("fiscal_year");

-- AddForeignKey
ALTER TABLE "PodOwnerTarget" ADD CONSTRAINT "PodOwnerTarget_pod_owner_id_fkey"
    FOREIGN KEY ("pod_owner_id") REFERENCES "PodOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodOwnerTarget" ADD CONSTRAINT "PodOwnerTarget_set_by_user_id_fkey"
    FOREIGN KEY ("set_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
