import { describe, expect, it } from 'vitest';

import {
  applyStep6Answer,
  defaultStep6Fields,
  getVisibleStep6QuestionIds,
  validateStep6Answer,
  validateStep6Completion
} from '../src/lib/investor-profile-step6.js';

describe('investor-profile-step6', () => {
  it('shows only decline question when declining and full block when providing', () => {
    const fields = defaultStep6Fields();
    fields.trustedContact.decline = { yes: true, no: false };

    const declineVisible = getVisibleStep6QuestionIds(fields);
    expect(declineVisible).toEqual(['step6.trustedContact.decline']);

    fields.trustedContact.decline = { yes: false, no: true };
    const provideVisible = getVisibleStep6QuestionIds(fields);
    expect(provideVisible).toEqual([
      'step6.trustedContact.decline',
      'step6.trustedContact.contactInfo',
      'step6.trustedContact.mailingAddress'
    ]);
  });

  it('rejects invalid decline selection and accepts exactly one selection', () => {
    const none = validateStep6Answer('step6.trustedContact.decline', { yes: false, no: false });
    expect(none.success).toBe(false);

    const both = validateStep6Answer('step6.trustedContact.decline', { yes: true, no: true });
    expect(both.success).toBe(false);

    const valid = validateStep6Answer('step6.trustedContact.decline', { yes: false, no: true });
    expect(valid.success).toBe(true);
  });

  it('validates trusted contact grouped info rules', () => {
    const invalid = validateStep6Answer('step6.trustedContact.contactInfo', {
      name: '',
      email: 'bad',
      phones: {
        home: '',
        business: '',
        mobile: ''
      }
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.fieldErrors['step6.trustedContact.contactInfo.name']).toContain('required');
      expect(invalid.fieldErrors['step6.trustedContact.contactInfo.email']).toContain('valid');
      expect(invalid.fieldErrors['step6.trustedContact.contactInfo.phones.mobile']).toContain('at least one');
    }

    const valid = validateStep6Answer('step6.trustedContact.contactInfo', {
      name: 'Jane Contact',
      email: 'jane@example.com',
      phones: {
        home: '',
        business: '',
        mobile: '+1 555 555 1000'
      }
    });
    expect(valid.success).toBe(true);
  });

  it('returns leaf errors for mailing address validation', () => {
    const invalid = validateStep6Answer('step6.trustedContact.mailingAddress', {
      line1: '',
      city: '',
      stateProvince: '',
      postalCode: '',
      country: 'USA'
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.fieldErrors['step6.trustedContact.mailingAddress.line1']).toContain('required');
      expect(invalid.fieldErrors['step6.trustedContact.mailingAddress.country']).toContain('valid');
    }
  });

  it('preserves trusted contact values when decline is selected and completion still passes', () => {
    const fields = defaultStep6Fields();
    fields.trustedContact.decline = { yes: false, no: true };
    fields.trustedContact.contactInfo = {
      name: 'Jane Contact',
      email: 'jane@example.com',
      phones: {
        home: null,
        business: null,
        mobile: '+1 555 555 1000'
      }
    };
    fields.trustedContact.mailingAddress = {
      line1: '100 Main St',
      city: 'Austin',
      stateProvince: 'TX',
      postalCode: '78701',
      country: 'US'
    };

    const declined = applyStep6Answer(fields, 'step6.trustedContact.decline', { yes: true, no: false });
    expect(declined.trustedContact.contactInfo.name).toBe('Jane Contact');
    expect(declined.trustedContact.mailingAddress.line1).toBe('100 Main St');

    const errors = validateStep6Completion(declined);
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
