ALTER TABLE "InvestorProfileOnboarding"
ADD COLUMN "step6CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "step6Data" JSONB,
ADD COLUMN "step7CurrentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "step7Data" JSONB;
