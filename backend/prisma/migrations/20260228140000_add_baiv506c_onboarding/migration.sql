-- CreateEnum
CREATE TYPE "BrokerageAccreditedInvestorVerificationOnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "BrokerageAccreditedInvestorVerificationOnboarding" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "BrokerageAccreditedInvestorVerificationOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "step1CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "step1Data" JSONB,
    "step2CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "step2Data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerageAccreditedInvestorVerificationOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrokerageAccreditedInvestorVerificationOnboarding_clientId_key" ON "BrokerageAccreditedInvestorVerificationOnboarding"("clientId");

-- AddForeignKey
ALTER TABLE "BrokerageAccreditedInvestorVerificationOnboarding" ADD CONSTRAINT "BrokerageAccreditedInvestorVerificationOnboarding_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
