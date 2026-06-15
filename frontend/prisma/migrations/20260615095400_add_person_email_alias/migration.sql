-- AlterTable
ALTER TABLE "User" ADD COLUMN "microsoft_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_microsoft_user_id_key" ON "User"("microsoft_user_id");

-- CreateIndex
CREATE INDEX "User_microsoft_user_id_idx" ON "User"("microsoft_user_id");

-- CreateTable
CREATE TABLE "PersonEmailAlias" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonEmailAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonEmailAlias_email_key" ON "PersonEmailAlias"("email");

-- CreateIndex
CREATE INDEX "PersonEmailAlias_person_id_idx" ON "PersonEmailAlias"("person_id");

-- AddForeignKey
ALTER TABLE "PersonEmailAlias" ADD CONSTRAINT "PersonEmailAlias_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
