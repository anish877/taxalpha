-- AlterTable
ALTER TABLE "InvestorProfileOnboarding"
ADD COLUMN "step1RrNo" TEXT,
ADD COLUMN "step1CustomerNames" TEXT,
ADD COLUMN "step1AccountNo" TEXT,
ADD COLUMN "step1AccountType" JSONB,
ADD COLUMN "step1CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0;
