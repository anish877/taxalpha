-- AlterTable
ALTER TABLE "InvestorProfileOnboarding"
ADD COLUMN "step2CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "step2Data" JSONB;
