import { describe, expect, it } from 'vitest';

import {
  applyBaiodfStep2Prefill,
  defaultBaiodfStep2Fields,
  getBaiodfStep2Concentrations,
  validateBaiodfStep2Answer
} from '../src/lib/baiodf-step2.js';

describe('baiodf-step2', () => {
  it('enforces single-select custodian checkbox-map cardinality', () => {
    const validation = validateBaiodfStep2Answer('step2.custodianAndProduct', {
      custodian: {
        firstClearing: false,
        direct: true,
        mainStar: true,
        cnb: false,
        kingdomTrust: false,
        other: false
      },
      custodianOther: null,
      nameOfProduct: 'Product',
      sponsorIssuer: 'Issuer',
      dateOfPpm: '2026-02-27',
      datePpmSent: '2026-02-27'
    });

    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.fieldErrors['step2.custodianAndProduct.custodian']).toContain('exactly one');
    }
  });

  it('requires custodianOther when Other is selected', () => {
    const validation = validateBaiodfStep2Answer('step2.custodianAndProduct', {
      custodian: {
        firstClearing: false,
        direct: false,
        mainStar: false,
        cnb: false,
        kingdomTrust: false,
        other: true
      },
      custodianOther: '',
      nameOfProduct: 'Product',
      sponsorIssuer: 'Issuer',
      dateOfPpm: '2026-02-27',
      datePpmSent: '2026-02-27'
    });

    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.fieldErrors['step2.custodianAndProduct.custodianOther']).toContain('Specify');
    }
  });

  it('computes concentration percentages using expected formula', () => {
    const fields = defaultBaiodfStep2Fields();
    fields.existingAltPositions.existingIlliquidAltPositions = 10000;
    fields.existingAltPositions.existingSemiLiquidAltPositions = 5000;
    fields.existingAltPositions.existingTaxAdvantageAltPositions = 2000;
    fields.netWorthAndConcentration.totalNetWorth = 100000;

    const concentrations = getBaiodfStep2Concentrations(fields, 10000);
    expect(concentrations.existingIlliquidAltConcentrationPercent).toBe(10);
    expect(concentrations.existingSemiLiquidAltConcentrationPercent).toBe(5);
    expect(concentrations.existingTaxAdvantageAltConcentrationPercent).toBe(2);
    expect(concentrations.totalConcentrationPercent).toBe(25);
  });

  it('prefills SFC-derived totals without overwriting existing user-entered values', () => {
    const fields = defaultBaiodfStep2Fields();
    fields.netWorthAndConcentration.totalNetWorth = 250000;

    const prefilled = applyBaiodfStep2Prefill(fields, {
      totalNetWorth: 500000,
      liquidNetWorth: 120000
    });

    expect(prefilled.netWorthAndConcentration.totalNetWorth).toBe(250000);
    expect(prefilled.netWorthAndConcentration.liquidNetWorth).toBe(120000);
  });
});
