import { describe, expect, it } from 'vitest';

import {
  applyBaiv506cStep2Prefill,
  defaultBaiv506cStep2Fields,
  validateBaiv506cStep2Answer,
  validateBaiv506cStep2Completion
} from '../src/lib/baiv-506c-step2.js';

describe('baiv-506c-step2', () => {
  it('enforces all 4 acknowledgements as true', () => {
    const invalid = validateBaiv506cStep2Answer(
      'step2.acknowledgements',
      {
        rule506cGuidelineAcknowledged: true,
        secRuleReviewedAndUnderstood: true,
        incomeOrNetWorthVerified: false,
        documentationReviewed: true
      },
      { requiresJointOwnerSignature: false }
    );
    expect(invalid.success).toBe(false);

    const valid = validateBaiv506cStep2Answer(
      'step2.acknowledgements',
      {
        rule506cGuidelineAcknowledged: true,
        secRuleReviewedAndUnderstood: true,
        incomeOrNetWorthVerified: true,
        documentationReviewed: true
      },
      { requiresJointOwnerSignature: false }
    );
    expect(valid.success).toBe(true);
  });

  it('requires valid signatures and rejects future dates', () => {
    const validation = validateBaiv506cStep2Answer(
      'step2.signatures.financialProfessional',
      {
        financialProfessional: {
          typedSignature: 'Advisor One',
          printedName: 'Advisor One',
          date: '2099-01-01'
        }
      },
      { requiresJointOwnerSignature: false }
    );

    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.fieldErrors['step2.signatures.financialProfessional.financialProfessional.date']).toContain(
        'future'
      );
    }
  });

  it('requires joint owner signature when account type requires it', () => {
    const validation = validateBaiv506cStep2Answer(
      'step2.signatures.accountOwners',
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
        validation.fieldErrors['step2.signatures.accountOwners.jointAccountOwner.typedSignature']
      ).toContain('required');
    }
  });

  it('prefills signatures without overwriting existing user-entered values', () => {
    const fields = defaultBaiv506cStep2Fields();
    fields.signatures.accountOwner.printedName = 'Edited Owner';

    const prefilled = applyBaiv506cStep2Prefill(fields, {
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

    expect(prefilled.signatures.accountOwner.printedName).toBe('Edited Owner');
    expect(prefilled.signatures.accountOwner.typedSignature).toBe('John Smith');
    expect(prefilled.signatures.jointAccountOwner.printedName).toBe('Jane Smith');
    expect(prefilled.signatures.financialProfessional.printedName).toBe('Advisor One');
  });

  it('passes completion with valid acknowledgements and signatures', () => {
    const fields = defaultBaiv506cStep2Fields();
    fields.acknowledgements = {
      rule506cGuidelineAcknowledged: true,
      secRuleReviewedAndUnderstood: true,
      incomeOrNetWorthVerified: true,
      documentationReviewed: true
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

    const errors = validateBaiv506cStep2Completion(fields, { requiresJointOwnerSignature: true });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
