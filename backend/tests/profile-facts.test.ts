import { describe, expect, it } from 'vitest';

import type { ProfileLookup } from '../src/lib/dynamic-step-engine.js';
import { factDefinitions, resolveFact } from '../src/lib/profile/facts.js';

const lookup = (values: Record<string, unknown>): ProfileLookup =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { value, sourceFormCode: key.startsWith('financial.') ? 'SFC' : 'INVESTOR_PROFILE' }])
  );

describe('smart PDF facts', () => {
  it('exposes a registered palette of smart facts', () => {
    const keys = factDefinitions().map((fact) => fact.key);
    expect(keys).toContain('account.rgpifInvestmentType');
    expect(keys).toContain('accreditation.naturalPersonNetWorthQualified');
    expect(keys).toContain('accreditation.naturalPersonIncomeQualified');
  });

  it('resolves account routing and RGPIF investment type one-hot values', () => {
    const data = lookup({
      'account.registrationType': { limitedLiabilityCompany: true }
    });

    expect(resolveFact('account.isEntity', data)).toMatchObject({ value: true, needsReview: false });
    expect(resolveFact('account.requiresControlPerson', data)).toMatchObject({ value: true, needsReview: false });
    expect(resolveFact('account.isJoint', data)).toMatchObject({ value: false, needsReview: false });
    expect(resolveFact('account.rgpifInvestmentType', data)).toMatchObject({
      value: { llc: true },
      confidence: 'high',
      needsReview: false
    });
  });

  it('resolves natural-person net-worth accreditation from SFC totals', () => {
    const data = lookup({
      'account.registrationType': { individual: true },
      'financial.netWorthExPrimaryResidence': 1_250_000
    });

    expect(resolveFact('accreditation.naturalPersonNetWorthQualified', data)).toMatchObject({
      value: true,
      confidence: 'high',
      needsReview: false,
      missingInputs: []
    });
  });

  it('requires net worth to exceed, not merely equal, the $1 million threshold', () => {
    const data = lookup({
      'account.registrationType': { individual: true },
      'financial.netWorthExPrimaryResidence': 1_000_000
    });

    expect(resolveFact('accreditation.naturalPersonNetWorthQualified', data)).toMatchObject({
      value: false,
      confidence: 'high',
      needsReview: false
    });
  });

  it('keeps income accreditation unresolved without exact income-history inputs', () => {
    const resolved = resolveFact('accreditation.naturalPersonIncomeQualified', lookup({}));
    expect(resolved).toMatchObject({
      value: undefined,
      confidence: 'blocked',
      needsReview: true,
      missingInputs: ['priorYearIncome1', 'priorYearIncome2', 'currentYearIncomeExpectation']
    });
  });

  it('resolves BAIV acknowledgements only when every captured acknowledgement is true', () => {
    const complete = lookup({
      'accreditation.rule506cGuidelineAcknowledged': true,
      'accreditation.secRuleReviewedAndUnderstood': true,
      'accreditation.incomeOrNetWorthVerified': true,
      'accreditation.documentationReviewed': true
    });
    expect(resolveFact('accreditation.baivAcknowledgementsComplete', complete)).toMatchObject({
      value: true,
      needsReview: false
    });

    const incomplete = lookup({ 'accreditation.documentationReviewed': true });
    expect(resolveFact('accreditation.baivAcknowledgementsComplete', incomplete)).toMatchObject({
      value: undefined,
      needsReview: true
    });
  });

  it('marks entity accreditation as review-needed without exact entity evidence fields', () => {
    const data = lookup({
      'account.registrationType': { corporation: true }
    });

    expect(resolveFact('accreditation.entityAccreditationCandidate', data)).toMatchObject({
      value: undefined,
      confidence: 'blocked',
      needsReview: true,
      missingInputs: ['entity.totalAssets', 'entity.notFormedForSpecificInvestment', 'entity.allEquityOwnersAccredited']
    });
  });
});
