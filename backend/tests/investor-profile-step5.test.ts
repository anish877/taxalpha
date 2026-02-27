import { describe, expect, it } from 'vitest';

import {
  applyStep5Answer,
  defaultStep5Fields,
  getVisibleStep5QuestionIds,
  validateStep5Answer,
  validateStep5Completion,
  type Step5Fields
} from '../src/lib/investor-profile-step5.js';

function buildCompleteStep5Fields(): Step5Fields {
  const fields = defaultStep5Fields();

  fields.profile.riskExposure = {
    low: false,
    moderate: true,
    speculation: false,
    highRisk: false
  };
  fields.profile.accountObjectives = {
    income: true,
    longTermGrowth: true,
    shortTermGrowth: false
  };

  fields.investments.fixedValues.marketIncome = {
    equities: 1000,
    options: 0,
    fixedIncome: 2000,
    mutualFunds: 3000,
    unitInvestmentTrusts: 0,
    exchangeTradedFunds: 4000
  };
  fields.investments.fixedValues.alternativesInsurance = {
    realEstate: 5000,
    insurance: 1000,
    variableAnnuities: 0,
    fixedAnnuities: 0,
    preciousMetals: 250,
    commoditiesFutures: 0
  };

  fields.investments.hasOther = { yes: false, no: true };
  fields.investments.otherEntries.entries = [];

  fields.horizonAndLiquidity.timeHorizon = {
    fromYear: 2026,
    toYear: 2034
  };
  fields.horizonAndLiquidity.liquidityNeeds = {
    high: false,
    medium: true,
    low: false
  };

  return fields;
}

describe('investor-profile-step5', () => {
  it('shows otherEntries only when hasOther is yes', () => {
    const fields = defaultStep5Fields();
    fields.investments.hasOther = { yes: false, no: true };

    const withoutOther = getVisibleStep5QuestionIds(fields);
    expect(withoutOther).not.toContain('step5.investments.otherEntries');

    fields.investments.hasOther = { yes: true, no: false };
    const withOther = getVisibleStep5QuestionIds(fields);
    expect(withOther).toContain('step5.investments.otherEntries');
  });

  it('validates risk and liquidity as exactly-one selections', () => {
    const invalidRisk = validateStep5Answer('step5.profile.riskExposure', {
      low: false,
      moderate: false,
      speculation: false,
      highRisk: false
    });
    expect(invalidRisk.success).toBe(false);

    const validRisk = validateStep5Answer('step5.profile.riskExposure', {
      low: false,
      moderate: true,
      speculation: false,
      highRisk: false
    });
    expect(validRisk.success).toBe(true);

    const invalidLiquidity = validateStep5Answer('step5.horizonAndLiquidity', {
      timeHorizon: { fromYear: 2026, toYear: 2034 },
      liquidityNeeds: { high: true, medium: true, low: false }
    });
    expect(invalidLiquidity.success).toBe(false);

    const validLiquidity = validateStep5Answer('step5.horizonAndLiquidity', {
      timeHorizon: { fromYear: 2026, toYear: 2034 },
      liquidityNeeds: { high: false, medium: true, low: false }
    });
    expect(validLiquidity.success).toBe(true);
  });

  it('requires at least one investment objective', () => {
    const invalid = validateStep5Answer('step5.profile.accountObjectives', {
      income: false,
      longTermGrowth: false,
      shortTermGrowth: false
    });
    expect(invalid.success).toBe(false);

    const valid = validateStep5Answer('step5.profile.accountObjectives', {
      income: false,
      longTermGrowth: true,
      shortTermGrowth: false
    });
    expect(valid.success).toBe(true);
  });

  it('validates fixed value blocks and accepts 0', () => {
    const invalid = validateStep5Answer('step5.investments.fixedValues.marketIncome', {
      equities: '',
      options: 0,
      fixedIncome: 10,
      mutualFunds: 20,
      unitInvestmentTrusts: 30,
      exchangeTradedFunds: 40
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.fieldErrors['step5.investments.fixedValues.marketIncome.equities']).toContain('required');
    }

    const valid = validateStep5Answer('step5.investments.fixedValues.marketIncome', {
      equities: 0,
      options: 0,
      fixedIncome: 0,
      mutualFunds: 0,
      unitInvestmentTrusts: 0,
      exchangeTradedFunds: 0
    });
    expect(valid.success).toBe(true);
  });

  it('enforces other entries when hasOther is yes and sanitizes when changed to no', () => {
    const invalid = validateStep5Answer('step5.investments.otherEntries', {
      entries: []
    });
    expect(invalid.success).toBe(false);

    const valid = validateStep5Answer('step5.investments.otherEntries', {
      entries: [{ label: 'Structured Notes', value: 0 }]
    });
    expect(valid.success).toBe(true);

    const fields = defaultStep5Fields();
    fields.investments.hasOther = { yes: true, no: false };
    fields.investments.otherEntries.entries = [{ label: 'Structured Notes', value: 500 }];

    const updated = applyStep5Answer(fields, 'step5.investments.hasOther', { yes: false, no: true });
    expect(updated.investments.otherEntries.entries).toHaveLength(0);
  });

  it('enforces horizon year bounds and order', () => {
    const invalid = validateStep5Answer('step5.horizonAndLiquidity', {
      timeHorizon: { fromYear: 2040, toYear: 2030 },
      liquidityNeeds: { high: false, medium: true, low: false }
    });
    expect(invalid.success).toBe(false);

    const valid = validateStep5Answer('step5.horizonAndLiquidity', {
      timeHorizon: { fromYear: 2026, toYear: 2034 },
      liquidityNeeds: { high: false, medium: false, low: true }
    });
    expect(valid.success).toBe(true);
  });

  it('passes completion checks for a fully valid payload', () => {
    const fields = buildCompleteStep5Fields();
    const errors = validateStep5Completion(fields);
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
