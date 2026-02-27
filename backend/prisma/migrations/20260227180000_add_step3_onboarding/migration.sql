-- AlterTable
ALTER TABLE "InvestorProfileOnboarding"
ADD COLUMN "step3CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "step3Data" JSONB;
