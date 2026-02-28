import { describe, expect, it } from 'vitest';

import {
  applyBaiodfStep1Prefill,
  defaultBaiodfStep1Fields,
  validateBaiodfStep1Answer,
  validateBaiodfStep1Completion
} from '../src/lib/baiodf-step1.js';

describe('baiodf-step1', () => {
  it('enforces yes/no map cardinality for qualified account', () => {
    const validation = validateBaiodfStep1Answer('step1.orderBasics', {
      proposedPrincipalAmount: 1000,
      qualifiedAccount: { yes: true, no: true },
      qualifiedAccountRmdCertification: true,
      solicitedTrade: { yes: true, no: false },
      taxAdvantagePurchase: { yes: false, no: true }
    });

    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.fieldErrors['step1.orderBasics.qualifiedAccount']).toContain('exactly one');
    }
  });

  it('requires qualified account certification when qualified account is yes', () => {
    const validation = validateBaiodfStep1Answer('step1.orderBasics', {
      proposedPrincipalAmount: 1000,
      qualifiedAccount: { yes: true, no: false },
      qualifiedAccountRmdCertification: false,
      solicitedTrade: { yes: true, no: false },
      taxAdvantagePurchase: { yes: false, no: true }
    });

    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.fieldErrors['step1.orderBasics.qualifiedAccountRmdCertification']).toContain('required');
    }
  });

  it('prefills only empty account registration fields', () => {
    const fields = defaultBaiodfStep1Fields();
    fields.accountRegistration.rrName = '';
    fields.accountRegistration.rrNo = '1001';
    fields.accountRegistration.customerNames = '';

    const prefilled = applyBaiodfStep1Prefill(fields, {
      rrName: 'RR One',
      rrNo: '2002',
      customerNames: 'John Smith'
    });

    expect(prefilled.accountRegistration.rrName).toBe('RR One');
    expect(prefilled.accountRegistration.rrNo).toBe('1001');
    expect(prefilled.accountRegistration.customerNames).toBe('John Smith');
  });

  it('marks completion errors when required groups are missing', () => {
    const fields = defaultBaiodfStep1Fields();
    const errors = validateBaiodfStep1Completion(fields);

    expect(errors['step1.accountRegistration.rrName']).toContain('required');
    expect(errors['step1.orderBasics.qualifiedAccount']).toContain('exactly one');
    expect(errors['step1.orderBasics.solicitedTrade']).toContain('exactly one');
    expect(errors['step1.orderBasics.taxAdvantagePurchase']).toContain('exactly one');
  });
});
