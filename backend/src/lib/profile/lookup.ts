import type { PrismaClient } from '@prisma/client';

import type { ProfileLookup } from '../dynamic-step-engine.js';
import { getSfcStep1Totals, normalizeSfcStep1Fields } from '../statement-of-financial-condition-step1.js';
import { GOLD_SOURCE_RANK, projectGoldForm, type ProjectedEntry } from './gold-projections.js';

/**
 * Build the cross-form auto-fill lookup for a client (spec Part 3.4).
 *
 * Source of truth = the already-filled GOLD onboarding tables, projected at
 * read-time through the gold-projection tables (so it always reflects the
 * latest base-form data without editing the gold POST handlers). Any explicit
 * ClientProfileValue rows are merged in. Lower sourceRank wins ties.
 */
function deepMerge(target: Record<string, unknown>, src: unknown): Record<string, unknown> {
  if (!src || typeof src !== 'object') return target;
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      deepMerge(target[k] as Record<string, unknown>, v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

export async function getProfileLookup(
  prisma: PrismaClient,
  clientId: string,
  options?: { investmentId?: string }
): Promise<ProfileLookup> {
  const entries: ProjectedEntry[] = [];

  // 1. Investor Profile onboarding (the rich source).
  const ip = await prisma.investorProfileOnboarding.findUnique({ where: { clientId } });
  if (ip) {
    const primaryMerged: Record<string, unknown> = {};
    for (const key of ['step1Data', 'step2Data', 'step3Data', 'step5Data', 'step6Data', 'step7Data'] as const) {
      deepMerge(primaryMerged, (ip as Record<string, unknown>)[key]);
    }
    entries.push(...projectGoldForm('INVESTOR_PROFILE', primaryMerged));

    const additionalMerged: Record<string, unknown> = {};
    deepMerge(additionalMerged, ip.step4Data);
    entries.push(...projectGoldForm('INVESTOR_PROFILE_ADDITIONAL_HOLDER', additionalMerged));
  }

  // 2. Statement of Financial Condition: identity reinforcement plus computed
  // financial totals that are useful for subscription/accreditation PDFs.
  const sfc = await prisma.statementOfFinancialConditionOnboarding.findUnique({ where: { clientId } });
  if (sfc) {
    const sfcStep1 = normalizeSfcStep1Fields(sfc.step1Data);
    entries.push(...projectGoldForm('SFC', sfcStep1));
    const totals = getSfcStep1Totals(sfcStep1);
    entries.push(
      { canonicalField: 'financial.totalNetWorth', value: totals.totalNetWorth, sourceFormCode: 'SFC', sourceRank: GOLD_SOURCE_RANK.SFC },
      { canonicalField: 'financial.netWorthExPrimaryResidence', value: totals.totalNetWorthAssetsLessPrimaryResidenceLiabilities, sourceFormCode: 'SFC', sourceRank: GOLD_SOURCE_RANK.SFC },
      { canonicalField: 'financial.totalAnnualIncome', value: totals.totalAnnualIncome, sourceFormCode: 'SFC', sourceRank: GOLD_SOURCE_RANK.SFC },
      { canonicalField: 'financial.totalLiquidAssets', value: totals.totalLiquidAssets, sourceFormCode: 'SFC', sourceRank: GOLD_SOURCE_RANK.SFC },
      { canonicalField: 'financial.totalLiabilities', value: totals.totalLiabilities, sourceFormCode: 'SFC', sourceRank: GOLD_SOURCE_RANK.SFC },
      { canonicalField: 'financial.totalPotentialLiquidity', value: totals.totalPotentialLiquidity, sourceFormCode: 'SFC', sourceRank: GOLD_SOURCE_RANK.SFC }
    );
  }

  // 3. Alternative Investment Order Disclosure: subscription amount/product and
  // alternative-investment concentration inputs.
  const baiodf = options?.investmentId
    ? await prisma.investmentBaiodfOnboarding.findFirst({
        where: { clientId, investmentId: options.investmentId }
      })
    : await prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.findUnique({ where: { clientId } });
  if (baiodf) {
    const merged: Record<string, unknown> = {};
    for (const key of ['step1Data', 'step2Data', 'step3Data'] as const) {
      deepMerge(merged, (baiodf as Record<string, unknown>)[key]);
    }
    entries.push(...projectGoldForm('BAIODF', merged));
  }

  // 4. 506(c) verification: accreditation acknowledgements and account header.
  const baiv = await prisma.brokerageAccreditedInvestorVerificationOnboarding.findUnique({ where: { clientId } });
  if (baiv) {
    const merged: Record<string, unknown> = {};
    for (const key of ['step1Data', 'step2Data'] as const) {
      deepMerge(merged, (baiv as Record<string, unknown>)[key]);
    }
    entries.push(...projectGoldForm('BAIV_506C', merged));
  }

  // 5. Explicit ClientProfileValue rows (future writes / uploaded never write).
  const rows = await prisma.clientProfileValue.findMany({ where: { clientId } });
  for (const r of rows) {
    entries.push({ canonicalField: r.canonicalField, value: r.value, sourceFormCode: r.sourceFormCode, sourceRank: r.sourceRank });
  }

  // 3. Collapse by canonicalField with lowest-rank-wins precedence.
  const lookup: ProfileLookup = {};
  const rankSeen: Record<string, number> = {};
  for (const e of entries) {
    const prevRank = rankSeen[e.canonicalField];
    if (prevRank === undefined || e.sourceRank < prevRank) {
      lookup[e.canonicalField] = { value: e.value, sourceFormCode: e.sourceFormCode };
      rankSeen[e.canonicalField] = e.sourceRank;
    }
  }
  return lookup;
}

export { GOLD_SOURCE_RANK };
