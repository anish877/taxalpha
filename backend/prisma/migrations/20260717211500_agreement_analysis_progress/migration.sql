ALTER TABLE "ClientUploadedPdfFill"
ADD COLUMN "analysisStage" TEXT;

UPDATE "ClientUploadedPdfFill"
SET "analysisStage" = 'MAPPING_FIELDS'
WHERE "status" = 'ANALYZING';
