import { describe, expect, it } from 'vitest';

import {
  applySfcStep1Prefill,
  defaultSfcStep1Fields,
  getSfcStep1Totals,
  validateSfcStep1Answer,
  validateSfcStep1Completion
} from '../src/lib/statement-of-financial-condition-step1.js';

describe('statement-of-financial-condition-step1', () => {
  it('prefills registration values only when target fields are empty', () => {
    const fields = defaultSfcStep1Fields();
    fields.accountRegistration.rrName = '';
    fields.accountRegistration.rrNo = '1001';
    fields.accountRegistration.customerNames = '';

    const result = applySfcStep1Prefill(fields, {
      rrName: 'RR One',
      rrNo: '2002',
      customerNames: 'John Smith'
    });

    expect(result.accountRegistration.rrName).toBe('RR One');
    expect(result.accountRegistration.rrNo).toBe('1001');
    expect(result.accountRegistration.customerNames).toBe('John Smith');
  });

  it('normalizes blank numeric inputs to 0 for amount maps', () => {
    const validation = validateSfcStep1Answer('step1.liabilities', {
      mortgagePrimaryResidence: '',
      mortgagesSecondaryInvestment: '  ',
      homeEquityLoans: null,
      creditCards: undefined,
      otherLiabilities: '0'
    });

    expect(validation.success).toBe(true);
    if (validation.success) {
      const value = validation.value as {
        mortgagePrimaryResidence: number;
        creditCards: number;
        otherLiabilities: number;
      };
      expect(value.mortgagePrimaryResidence).toBe(0);
      expect(value.creditCards).toBe(0);
      expect(value.otherLiabilities).toBe(0);
    }
  });

  it('returns totals using configured formulas', () => {
    const fields = defaultSfcStep1Fields();
    fields.liquidNonQualifiedAssets.cashMoneyMarketsCds = 100;
    fields.liquidNonQualifiedAssets.brokerageNonManaged = 200;
    fields.liabilities.creditCards = 50;
    fields.illiquidNonQualifiedAssets.primaryResidence = 500;
    fields.illiquidNonQualifiedAssets.investmentRealEstate = 300;
    fields.illiquidNonQualifiedAssets.privateBusiness = 200;
    fields.liquidQualifiedAssets.cashMoneyMarketsCds = 75;
    fields.incomeSummary.salaryCommissions = 120;
    fields.illiquidQualifiedAssets.purchaseAmountValue = 25;

    const totals = getSfcStep1Totals(fields);
    expect(totals.totalLiabilities).toBe(50);
    expect(totals.totalLiquidAssets).toBe(300);
    expect(totals.totalAssetsLessPrimaryResidence).toBe(800);
    expect(totals.totalNetWorth).toBe(1250);
    expect(totals.totalPotentialLiquidity).toBe(375);
    expect(totals.totalIlliquidQualifiedAssets).toBe(25);
  });

  it('requires account registration completion fields', () => {
    const fields = defaultSfcStep1Fields();
    const errors = validateSfcStep1Completion(fields);

    expect(errors['step1.accountRegistration.rrName']).toContain('required');
    expect(errors['step1.accountRegistration.rrNo']).toContain('required');
    expect(errors['step1.accountRegistration.customerNames']).toContain('required');
  });
});
