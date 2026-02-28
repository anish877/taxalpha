-- CreateEnum
CREATE TYPE "BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "BrokerageAlternativeInvestmentOrderDisclosureOnboarding" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "step1CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "step1Data" JSONB,
    "step2CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "step2Data" JSONB,
    "step3CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "step3Data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerageAlternativeInvestmentOrderDisclosureOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrokerageAlternativeInvestmentOrderDisclosureOnboarding_clientId_key" ON "BrokerageAlternativeInvestmentOrderDisclosureOnboarding"("clientId");

-- AddForeignKey
ALTER TABLE "BrokerageAlternativeInvestmentOrderDisclosureOnboarding" ADD CONSTRAINT "BrokerageAlternativeInvestmentOrderDisclosureOnboarding_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
