-- FormStatus: add NEEDS_REVIEW (additive enum value)
ALTER TYPE "FormStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';

-- FormCatalog: ingestion state for the multi-pass pipeline / clarifications
ALTER TABLE "FormCatalog" ADD COLUMN "ingestionState" JSONB;

-- DynamicFormResponse: additive step-wise storage (keep answers + default)
ALTER TABLE "DynamicFormResponse" ADD COLUMN "stepData" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "DynamicFormResponse" ADD COLUMN "stepCursors" JSONB NOT NULL DEFAULT '{}';

-- Client: preview flag for admin demo sessions
ALTER TABLE "Client" ADD COLUMN "isPreview" BOOLEAN NOT NULL DEFAULT false;

-- Canonical cross-form investor profile store
CREATE TABLE "ClientProfileValue" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "canonicalField" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "sourceFormCode" TEXT NOT NULL,
    "sourceRank" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientProfileValue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClientProfileValue_clientId_canonicalField_key" ON "ClientProfileValue"("clientId", "canonicalField");
CREATE INDEX "ClientProfileValue_clientId_idx" ON "ClientProfileValue"("clientId");
ALTER TABLE "ClientProfileValue" ADD CONSTRAINT "ClientProfileValue_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
