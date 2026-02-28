import { describe, expect, it } from 'vitest';

import {
  applyBaiodfStep3Prefill,
  defaultBaiodfStep3Fields,
  validateBaiodfStep3Answer,
  validateBaiodfStep3Completion
} from '../src/lib/baiodf-step3.js';

describe('baiodf-step3', () => {
  it('requires all 10 acknowledgements to be true', () => {
    const fields = defaultBaiodfStep3Fields();
    fields.acknowledgements.illiquidLongTerm = true;

    const validation = validateBaiodfStep3Answer(
      'step3.acknowledgements',
      fields.acknowledgements,
      { requiresJointOwnerSignature: false }
    );

    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.fieldErrors['step3.acknowledgements']).toContain('required disclosures');
    }
  });

  it('requires joint account owner signature when context requires it', () => {
    const validation = validateBaiodfStep3Answer(
      'step3.signatures.accountOwners',
      {
        accountOwner: {
          typedSignature: 'John Smith',
          printedName: 'John Smith',
          date: '2026-02-27'
        },
        jointAccountOwner: {
          typedSignature: '',
          printedName: '',
          date: ''
        }
      },
      { requiresJointOwnerSignature: true }
    );

    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(
        validation.fieldErrors['step3.signatures.accountOwners.jointAccountOwner.typedSignature']
      ).toContain('required');
    }
  });

  it('prefills signatures without overwriting user-entered values', () => {
    const fields = defaultBaiodfStep3Fields();
    fields.signatures.accountOwner.printedName = 'Edited Account Owner';

    const prefilled = applyBaiodfStep3Prefill(fields, {
      requiresJointOwnerSignature: true,
      accountOwner: {
        typedSignature: 'John Smith',
        printedName: 'John Smith',
        date: '2026-02-27'
      },
      jointAccountOwner: {
        typedSignature: 'Jane Smith',
        printedName: 'Jane Smith',
        date: '2026-02-27'
      },
      financialProfessional: {
        typedSignature: 'Advisor One',
        printedName: 'Advisor One',
        date: '2026-02-27'
      }
    });

    expect(prefilled.signatures.accountOwner.printedName).toBe('Edited Account Owner');
    expect(prefilled.signatures.accountOwner.typedSignature).toBe('John Smith');
    expect(prefilled.signatures.jointAccountOwner.printedName).toBe('Jane Smith');
    expect(prefilled.signatures.financialProfessional.printedName).toBe('Advisor One');
  });

  it('passes completion for valid fully signed payload', () => {
    const fields = defaultBaiodfStep3Fields();
    fields.acknowledgements = {
      illiquidLongTerm: true,
      reviewedProspectusOrPpm: true,
      understandFeesAndExpenses: true,
      noPublicMarket: true,
      limitedRedemptionAndSaleRisk: true,
      speculativeMayLoseInvestment: true,
      distributionsMayVaryOrStop: true,
      meetsSuitabilityStandards: true,
      featuresRisksDiscussed: true,
      meetsFinancialGoalsAndAccurate: true
    };
    fields.signatures.accountOwner = {
      typedSignature: 'John Smith',
      printedName: 'John Smith',
      date: '2026-02-27'
    };
    fields.signatures.jointAccountOwner = {
      typedSignature: 'Jane Smith',
      printedName: 'Jane Smith',
      date: '2026-02-27'
    };
    fields.signatures.financialProfessional = {
      typedSignature: 'Advisor One',
      printedName: 'Advisor One',
      date: '2026-02-27'
    };

    const errors = validateBaiodfStep3Completion(fields, { requiresJointOwnerSignature: true });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
