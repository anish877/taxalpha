-- This migration may run before the BAIODF onboarding table exists in a clean
-- migration chain. Guard renames so shadow DB creation does not fail.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'BrokerageAlternativeInvestmentOrderDisclosureOnboarding'
      AND constraint_name = 'BrokerageAlternativeInvestmentOrderDisclosureOnboarding_clientI'
  ) THEN
    EXECUTE 'ALTER TABLE "BrokerageAlternativeInvestmentOrderDisclosureOnboarding" RENAME CONSTRAINT "BrokerageAlternativeInvestmentOrderDisclosureOnboarding_clientI" TO "BrokerageAlternativeInvestmentOrderDisclosureOnboarding_cl_fkey"';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('"BrokerageAlternativeInvestmentOrderDisclosureOnboarding_clientI"') IS NOT NULL THEN
    EXECUTE 'ALTER INDEX "BrokerageAlternativeInvestmentOrderDisclosureOnboarding_clientI" RENAME TO "BrokerageAlternativeInvestmentOrderDisclosureOnboarding_cli_key"';
  END IF;
END
$$;
