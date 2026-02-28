-- CreateEnum
CREATE TYPE "StatementOfFinancialConditionOnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "StatementOfFinancialConditionOnboarding" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "StatementOfFinancialConditionOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "step1CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "step1Data" JSONB,
    "step2CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "step2Data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementOfFinancialConditionOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatementOfFinancialConditionOnboarding_clientId_key" ON "StatementOfFinancialConditionOnboarding"("clientId");

-- AddForeignKey
ALTER TABLE "StatementOfFinancialConditionOnboarding" ADD CONSTRAINT "StatementOfFinancialConditionOnboarding_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
