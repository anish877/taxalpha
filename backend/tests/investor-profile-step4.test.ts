import { describe, expect, it } from 'vitest';

import {
  applyStep4Answer,
  defaultStep4Fields,
  getVisibleStep4QuestionIds,
  validateStep4Answer,
  validateStep4Completion,
  type Step4Fields
} from '../src/lib/investor-profile-step4.js';

function buildCompleteStep4EntityFields(): Step4Fields {
  const fields = defaultStep4Fields();

  fields.holder.kind = { person: false, entity: true };
  fields.holder.name = 'Acme Trust LLC';
  fields.holder.taxId.hasEin = { yes: false, no: true };
  fields.holder.contact.email = 'entity@example.com';
  fields.holder.contact.phones.mobile = '+1 555 555 5555';
  fields.holder.legalAddress = {
    line1: '123 Main St',
    city: 'Austin',
    stateProvince: 'TX',
    postalCode: '78701',
    country: 'US'
  };
  fields.holder.mailingDifferent = { yes: false, no: true };
  fields.holder.citizenship.primary = ['US'];

  fields.investmentKnowledge.general = {
    limited: false,
    moderate: true,
    extensive: false,
    none: false
  };

  for (const key of Object.keys(fields.investmentKnowledge.byType)) {
    const typeKey = key as keyof Step4Fields['investmentKnowledge']['byType'];
    fields.investmentKnowledge.byType[typeKey].knowledge = {
      limited: false,
      moderate: false,
      extensive: false,
      none: true
    };
    fields.investmentKnowledge.byType[typeKey].sinceYear = null;
  }

  fields.investmentKnowledge.byType.other.label = null;

  fields.financialInformation.annualIncomeRange = {
    fromBracket: '100k_250k',
    toBracket: '250k_500k'
  };
  fields.financialInformation.netWorthExPrimaryResidenceRange = {
    fromBracket: '250k_500k',
    toBracket: '500k_1m'
  };
  fields.financialInformation.liquidNetWorthRange = {
    fromBracket: '100k_250k',
    toBracket: '250k_500k'
  };
  fields.financialInformation.taxBracket = {
    bracket_0_15: false,
    bracket_15_1_32: true,
    bracket_32_1_50: false,
    bracket_50_1_plus: false
  };

  fields.affiliations.employeeAdvisorFirm = { yes: false, no: true };
  fields.affiliations.relatedAdvisorFirmEmployee = { yes: false, no: true };
  fields.affiliations.employeeBrokerDealer = { yes: false, no: true };
  fields.affiliations.relatedBrokerDealerEmployee = { yes: false, no: true };
  fields.affiliations.maintainsOtherBrokerageAccounts = { yes: false, no: true };
  fields.affiliations.exchangeOrFinraAffiliation = { yes: false, no: true };
  fields.affiliations.seniorOfficerDirectorTenPercentPublicCompany = { yes: false, no: true };

  return fields;
}

describe('investor-profile-step4', () => {
  it('uses grouped question ids in visible flow and hides legacy per-field ids', () => {
    const fields = buildCompleteStep4EntityFields();
    const visible = getVisibleStep4QuestionIds(fields);

    expect(visible).toContain('step4.holder.contact.phones');
    expect(visible).toContain('step4.holder.legalAddress');
    expect(visible).toContain('step4.investment.knowledgeExperience');
    expect(visible).not.toContain('step4.holder.contact.phones.mobile');
    expect(visible).not.toContain('step4.holder.legalAddress.line1');
    expect(visible).not.toContain('step4.investment.byType.equities.sinceYear');
  });

  it('validates grouped phones answer with at least one number', () => {
    const emptyResult = validateStep4Answer('step4.holder.contact.phones', {
      home: '',
      business: '',
      mobile: ''
    });
    expect(emptyResult.success).toBe(false);
    if (!emptyResult.success) {
      expect(emptyResult.fieldErrors['step4.holder.contact.phones.mobile']).toContain('at least one');
    }

    const validResult = validateStep4Answer('step4.holder.contact.phones', {
      home: '',
      business: '',
      mobile: '+1 555 555 5555'
    });
    expect(validResult.success).toBe(true);
  });

  it('returns leaf field errors for grouped legal address validation', () => {
    const result = validateStep4Answer('step4.holder.legalAddress', {
      line1: 'P.O. Box 100',
      city: '',
      stateProvince: '',
      postalCode: '',
      country: 'USA'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors['step4.holder.legalAddress.line1']).toContain('P.O. Box');
      expect(result.fieldErrors['step4.holder.legalAddress.city']).toContain('required');
      expect(result.fieldErrors['step4.holder.legalAddress.country']).toContain('valid');
    }
  });

  it('enforces grouped investment knowledge rules and conditional fields', () => {
    const invalidResult = validateStep4Answer('step4.investment.knowledgeExperience', {
      general: { limited: false, moderate: true, extensive: false, none: false },
      byType: {
        equities: { knowledge: { limited: false, moderate: true, extensive: false, none: false }, sinceYear: '' },
        other: { knowledge: { limited: false, moderate: true, extensive: false, none: false }, sinceYear: '', label: '' }
      }
    });

    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.fieldErrors['step4.investment.byType.equities.sinceYear']).toContain('required');
      expect(invalidResult.fieldErrors['step4.investment.byType.other.label']).toContain('required');
    }
  });

  it('applies grouped investment answer and clears stale values through sanitization', () => {
    const base = defaultStep4Fields();
    base.investmentKnowledge.byType.other.knowledge = {
      limited: false,
      moderate: true,
      extensive: false,
      none: false
    };
    base.investmentKnowledge.byType.other.sinceYear = 2010;
    base.investmentKnowledge.byType.other.label = 'Structured Notes';

    const payload = structuredClone(base.investmentKnowledge);
    payload.general = { limited: false, moderate: true, extensive: false, none: false };
    payload.byType.other.knowledge = { limited: false, moderate: false, extensive: false, none: true };
    payload.byType.other.sinceYear = 2015;
    payload.byType.other.label = 'Should clear';

    const next = applyStep4Answer(base, 'step4.investment.knowledgeExperience', payload);
    expect(next.investmentKnowledge.byType.other.sinceYear).toBeNull();
    expect(next.investmentKnowledge.byType.other.label).toBeNull();
  });

  it('accepts homemaker as a valid employment status', () => {
    const result = validateStep4Answer('step4.holder.employment.status', {
      employed: false,
      selfEmployed: false,
      retired: false,
      unemployed: false,
      homemaker: true,
      student: false
    });

    expect(result.success).toBe(true);
  });

  it('allows completion without gov ID when requirement context is unknown', () => {
    const fields = buildCompleteStep4EntityFields();
    const errors = validateStep4Completion(fields);

    expect(errors['step4.govId.photoId1']).toBeUndefined();
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
