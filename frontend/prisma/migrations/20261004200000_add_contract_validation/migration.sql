-- Additive: per-team validation sign-offs on contracts.
ALTER TABLE "Contract" ADD COLUMN "paper_checked_by" TEXT,
                       ADD COLUMN "paper_checked_at" TIMESTAMP(3),
                       ADD COLUMN "commercial_checked_by" TEXT,
                       ADD COLUMN "commercial_checked_at" TIMESTAMP(3),
                       ADD COLUMN "billing_checked_by" TEXT,
                       ADD COLUMN "billing_checked_at" TIMESTAMP(3);
