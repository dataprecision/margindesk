-- CreateEnum
CREATE TYPE "PersonIdentifierKind" AS ENUM ('email', 'employee_code', 'zoho_id', 'm365_id');

-- CreateTable
CREATE TABLE "PersonIdentifier" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "kind" "PersonIdentifierKind" NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonIdentifier_kind_value_idx" ON "PersonIdentifier"("kind", "value");

-- CreateIndex
CREATE INDEX "PersonIdentifier_person_id_idx" ON "PersonIdentifier"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "PersonIdentifier_kind_value_person_id_key" ON "PersonIdentifier"("kind", "value", "person_id");

-- AddForeignKey
ALTER TABLE "PersonIdentifier" ADD CONSTRAINT "PersonIdentifier_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

