-- Admin role
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Enums for AI-ingested forms
CREATE TYPE "FormSource" AS ENUM ('SEED', 'UPLOAD');
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- FormCatalog: ingestion metadata
ALTER TABLE "FormCatalog" ADD COLUMN "source" "FormSource" NOT NULL DEFAULT 'SEED';
ALTER TABLE "FormCatalog" ADD COLUMN "status" "FormStatus" NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "FormCatalog" ADD COLUMN "schema" JSONB;
ALTER TABLE "FormCatalog" ADD COLUMN "templateUrl" TEXT;
ALTER TABLE "FormCatalog" ADD COLUMN "unmappedCount" INTEGER;
