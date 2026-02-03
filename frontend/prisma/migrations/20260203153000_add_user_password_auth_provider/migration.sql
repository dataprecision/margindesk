-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "auth_provider" TEXT NOT NULL DEFAULT 'microsoft';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_auth_provider_idx" ON "User"("auth_provider");
