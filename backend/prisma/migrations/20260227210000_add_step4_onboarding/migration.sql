ALTER TABLE "InvestorProfileOnboarding"
ADD COLUMN "step4CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "step4Data" JSONB;
