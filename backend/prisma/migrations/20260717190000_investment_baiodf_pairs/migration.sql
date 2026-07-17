CREATE TYPE "ClientSetupStatus" AS ENUM ('INCOMPLETE', 'ACTIVE');

ALTER TABLE "Client"
ADD COLUMN "setupStatus" "ClientSetupStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE "ClientInvestment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "baiodfSyncRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientInvestment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ClientUploadedPdfFill"
ADD COLUMN "investmentId" TEXT,
ALTER COLUMN "pdfFingerprint" DROP NOT NULL,
ALTER COLUMN "mappingLayout" DROP NOT NULL,
ALTER COLUMN "resolvedLayout" DROP NOT NULL;

ALTER TABLE "ClientFormPdf"
ADD COLUMN "investmentId" TEXT;

INSERT INTO "ClientInvestment" ("id", "clientId", "name", "position", "createdAt", "updatedAt")
SELECT 'legacy_' || substr(md5(client."id"), 1, 24), client."id", 'Legacy investment', 1,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Client" client
JOIN "ClientFormSelection" selection ON selection."clientId" = client."id"
JOIN "FormCatalog" form ON form."id" = selection."formId"
WHERE form."code" = 'BAIODF';

CREATE TABLE "InvestmentBaiodfOnboarding" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "status" "BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "step1CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "step1Data" JSONB,
    "step2CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "step2Data" JSONB,
    "step3CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "step3Data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvestmentBaiodfOnboarding_pkey" PRIMARY KEY ("id")
);

INSERT INTO "InvestmentBaiodfOnboarding" (
  "id", "clientId", "investmentId", "status",
  "step1CurrentQuestionIndex", "step1Data", "step2CurrentQuestionIndex", "step2Data",
  "step3CurrentQuestionIndex", "step3Data", "createdAt", "updatedAt"
)
SELECT onboarding."id" || '_investment', onboarding."clientId", investment."id", onboarding."status",
       onboarding."step1CurrentQuestionIndex", onboarding."step1Data",
       onboarding."step2CurrentQuestionIndex", onboarding."step2Data",
       onboarding."step3CurrentQuestionIndex", onboarding."step3Data",
       onboarding."createdAt", onboarding."updatedAt"
FROM "BrokerageAlternativeInvestmentOrderDisclosureOnboarding" onboarding
JOIN "ClientInvestment" investment ON investment."clientId" = onboarding."clientId" AND investment."position" = 1;

UPDATE "ClientFormPdf" pdf
SET "investmentId" = investment."id"
FROM "ClientInvestment" investment
WHERE pdf."clientId" = investment."clientId" AND pdf."workspaceFormCode" = 'BAIODF';

CREATE UNIQUE INDEX "ClientInvestment_clientId_position_key" ON "ClientInvestment"("clientId", "position");
CREATE INDEX "ClientInvestment_clientId_idx" ON "ClientInvestment"("clientId");
CREATE UNIQUE INDEX "InvestmentBaiodfOnboarding_investmentId_key" ON "InvestmentBaiodfOnboarding"("investmentId");
CREATE INDEX "InvestmentBaiodfOnboarding_clientId_idx" ON "InvestmentBaiodfOnboarding"("clientId");
CREATE UNIQUE INDEX "ClientUploadedPdfFill_investmentId_key" ON "ClientUploadedPdfFill"("investmentId");
CREATE INDEX "ClientFormPdf_investmentId_receivedAt_idx" ON "ClientFormPdf"("investmentId", "receivedAt" DESC);

ALTER TABLE "ClientInvestment"
ADD CONSTRAINT "ClientInvestment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestmentBaiodfOnboarding"
ADD CONSTRAINT "InvestmentBaiodfOnboarding_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvestmentBaiodfOnboarding"
ADD CONSTRAINT "InvestmentBaiodfOnboarding_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "ClientInvestment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientUploadedPdfFill"
ADD CONSTRAINT "ClientUploadedPdfFill_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "ClientInvestment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientFormPdf"
ADD CONSTRAINT "ClientFormPdf_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "ClientInvestment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
