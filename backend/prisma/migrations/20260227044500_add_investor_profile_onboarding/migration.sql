-- CreateEnum
CREATE TYPE "InvestorProfileOnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "InvestorProfileOnboarding" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "InvestorProfileOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "step1RrName" TEXT,
    "step1Data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestorProfileOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestorProfileOnboarding_clientId_key" ON "InvestorProfileOnboarding"("clientId");

-- AddForeignKey
ALTER TABLE "InvestorProfileOnboarding" ADD CONSTRAINT "InvestorProfileOnboarding_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
