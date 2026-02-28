import { describe, expect, it } from 'vitest';

import {
  applySfcStep2Prefill,
  defaultSfcStep2Fields,
  validateSfcStep2Answer,
  validateSfcStep2Completion
} from '../src/lib/statement-of-financial-condition-step2.js';

describe('statement-of-financial-condition-step2', () => {
  it('enforces all acknowledgements as accepted', () => {
    const invalid = validateSfcStep2Answer(
      'step2.acknowledgements',
      {
        attestDataAccurateComplete: true,
        agreeReportMaterialChanges: true,
        understandMayNeedRecertification: false,
        understandMayNeedSupportingDocumentation: true,
        understandInfoUsedForBestInterestRecommendations: true
      },
      { requiresJointOwnerSignature: false }
    );
    expect(invalid.success).toBe(false);

    const valid = validateSfcStep2Answer(
      'step2.acknowledgements',
      {
        attestDataAccurateComplete: true,
        agreeReportMaterialChanges: true,
        understandMayNeedRecertification: true,
        understandMayNeedSupportingDocumentation: true,
        understandInfoUsedForBestInterestRecommendations: true
      },
      { requiresJointOwnerSignature: false }
    );
    expect(valid.success).toBe(true);
  });

  it('requires joint account owner signature when context requires it', () => {
    const validation = validateSfcStep2Answer(
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
      expect(validation.fieldErrors['step2.signatures.accountOwners.jointAccountOwner.typedSignature']).toContain(
        'required'
      );
    }
  });

  it('prefills signature fields without overwriting user-entered values', () => {
    const fields = defaultSfcStep2Fields();
    fields.signatures.accountOwner.printedName = 'Edited Name';

    const prefilled = applySfcStep2Prefill(fields, {
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

    expect(prefilled.signatures.accountOwner.printedName).toBe('Edited Name');
    expect(prefilled.signatures.accountOwner.typedSignature).toBe('John Smith');
    expect(prefilled.signatures.jointAccountOwner.printedName).toBe('Jane Smith');
    expect(prefilled.signatures.financialProfessional.printedName).toBe('Advisor One');
  });

  it('passes completion for fully valid data', () => {
    const fields = defaultSfcStep2Fields();
    fields.acknowledgements = {
      attestDataAccurateComplete: true,
      agreeReportMaterialChanges: true,
      understandMayNeedRecertification: true,
      understandMayNeedSupportingDocumentation: true,
      understandInfoUsedForBestInterestRecommendations: true
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

    const errors = validateSfcStep2Completion(fields, { requiresJointOwnerSignature: true });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});

