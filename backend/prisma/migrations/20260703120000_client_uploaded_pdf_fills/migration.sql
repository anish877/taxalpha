CREATE TABLE "ClientUploadedPdfFill" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "originalFileKey" TEXT,
    "originalPdfUrl" TEXT,
    "fileName" TEXT,
    "pdfFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "mappingLayout" JSONB NOT NULL,
    "resolvedLayout" JSONB NOT NULL,
    "valueOverrides" JSONB NOT NULL DEFAULT '{}',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "generatedPdfUrl" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientUploadedPdfFill_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientUploadedPdfFill_clientId_updatedAt_idx" ON "ClientUploadedPdfFill"("clientId", "updatedAt" DESC);
CREATE INDEX "ClientUploadedPdfFill_ownerUserId_idx" ON "ClientUploadedPdfFill"("ownerUserId");
CREATE INDEX "ClientUploadedPdfFill_pdfFingerprint_idx" ON "ClientUploadedPdfFill"("pdfFingerprint");

ALTER TABLE "ClientUploadedPdfFill" ADD CONSTRAINT "ClientUploadedPdfFill_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientUploadedPdfFill" ADD CONSTRAINT "ClientUploadedPdfFill_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
