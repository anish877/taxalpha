import { describe, expect, it } from 'vitest';

import {
  applyBaiv506cStep1Prefill,
  normalizeBaiv506cStep1Fields,
  validateBaiv506cStep1Answer,
  validateBaiv506cStep1Completion
} from '../src/lib/baiv-506c-step1.js';

describe('baiv-506c-step1', () => {
  it('normalizes whitespace for required text fields', () => {
    const normalized = normalizeBaiv506cStep1Fields({
      accountRegistration: {
        rrName: '  RR One  ',
        rrNo: ' 1001 ',
        customerNames: '  John Smith  '
      }
    });

    expect(normalized.accountRegistration.rrName).toBe('RR One');
    expect(normalized.accountRegistration.rrNo).toBe('1001');
    expect(normalized.accountRegistration.customerNames).toBe('John Smith');
  });

  it('validates required account registration fields', () => {
    const validation = validateBaiv506cStep1Answer('step1.accountRegistration', {
      rrName: '',
      rrNo: ' ',
      customerNames: ''
    });

    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.fieldErrors['step1.accountRegistration.rrName']).toContain('required');
      expect(validation.fieldErrors['step1.accountRegistration.rrNo']).toContain('required');
      expect(validation.fieldErrors['step1.accountRegistration.customerNames']).toContain('required');
    }
  });

  it('prefills only empty target values and does not overwrite entered values', () => {
    const prefilled = applyBaiv506cStep1Prefill(
      {
        accountRegistration: {
          rrName: '',
          rrNo: '1001',
          customerNames: ''
        }
      },
      {
        rrName: 'RR Prefill',
        rrNo: '2222',
        customerNames: 'Client Name'
      }
    );

    expect(prefilled.accountRegistration.rrName).toBe('RR Prefill');
    expect(prefilled.accountRegistration.rrNo).toBe('1001');
    expect(prefilled.accountRegistration.customerNames).toBe('Client Name');
  });

  it('requires all completion fields in step 1', () => {
    const errors = validateBaiv506cStep1Completion({
      accountRegistration: {
        rrName: '',
        rrNo: '',
        customerNames: ''
      }
    });

    expect(errors['step1.accountRegistration.rrName']).toContain('required');
    expect(errors['step1.accountRegistration.rrNo']).toContain('required');
    expect(errors['step1.accountRegistration.customerNames']).toContain('required');
  });
});
