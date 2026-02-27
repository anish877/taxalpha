ALTER TABLE "InvestorProfileOnboarding"
ADD COLUMN "step5CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "step5Data" JSONB;
