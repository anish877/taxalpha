ALTER TABLE "ClientUploadedPdfFill"
ADD COLUMN "analysisStartedAt" TIMESTAMP(3),
ADD COLUMN "analysisRunId" TEXT,
ADD COLUMN "analysisError" TEXT,
ADD COLUMN "analysisAttempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "ClientUploadedPdfFill"
SET "status" = 'ANALYSIS_FAILED',
    "analysisError" = 'Analysis was interrupted. Retry analysis.'
WHERE "investmentId" IS NOT NULL
  AND "status" = 'ANALYZING';
