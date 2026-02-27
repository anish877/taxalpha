import { describe, expect, it } from 'vitest';

import {
  applyStep3Answer,
  defaultStep3Fields,
  getVisibleStep3QuestionIds,
  validateStep3Answer,
  validateStep3Completion,
  type Step3Fields
} from '../src/lib/investor-profile-step3.js';

function buildCompleteStep3EntityFields(): Step3Fields {
  const fields = defaultStep3Fields();

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
    const typeKey = key as keyof Step3Fields['investmentKnowledge']['byType'];
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

describe('investor-profile-step3', () => {
  it('uses grouped question ids in visible flow and hides legacy per-field ids', () => {
    const fields = buildCompleteStep3EntityFields();
    const visible = getVisibleStep3QuestionIds(fields);

    expect(visible).toContain('step3.holder.contact.phones');
    expect(visible).toContain('step3.holder.legalAddress');
    expect(visible).toContain('step3.investment.knowledgeExperience');
    expect(visible).not.toContain('step3.holder.contact.phones.mobile');
    expect(visible).not.toContain('step3.holder.legalAddress.line1');
    expect(visible).not.toContain('step3.investment.byType.equities.sinceYear');
  });

  it('validates grouped phones answer with at least one number', () => {
    const emptyResult = validateStep3Answer('step3.holder.contact.phones', {
      home: '',
      business: '',
      mobile: ''
    });
    expect(emptyResult.success).toBe(false);
    if (!emptyResult.success) {
      expect(emptyResult.fieldErrors['step3.holder.contact.phones.mobile']).toContain('at least one');
    }

    const validResult = validateStep3Answer('step3.holder.contact.phones', {
      home: '',
      business: '',
      mobile: '+1 555 555 5555'
    });
    expect(validResult.success).toBe(true);
  });

  it('returns leaf field errors for grouped legal address validation', () => {
    const result = validateStep3Answer('step3.holder.legalAddress', {
      line1: 'P.O. Box 100',
      city: '',
      stateProvince: '',
      postalCode: '',
      country: 'USA'
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors['step3.holder.legalAddress.line1']).toContain('P.O. Box');
      expect(result.fieldErrors['step3.holder.legalAddress.city']).toContain('required');
      expect(result.fieldErrors['step3.holder.legalAddress.country']).toContain('valid');
    }
  });

  it('enforces grouped investment knowledge rules and conditional fields', () => {
    const invalidResult = validateStep3Answer('step3.investment.knowledgeExperience', {
      general: { limited: false, moderate: true, extensive: false, none: false },
      byType: {
        equities: { knowledge: { limited: false, moderate: true, extensive: false, none: false }, sinceYear: '' },
        other: { knowledge: { limited: false, moderate: true, extensive: false, none: false }, sinceYear: '', label: '' }
      }
    });

    expect(invalidResult.success).toBe(false);
    if (!invalidResult.success) {
      expect(invalidResult.fieldErrors['step3.investment.byType.equities.sinceYear']).toContain('required');
      expect(invalidResult.fieldErrors['step3.investment.byType.other.label']).toContain('required');
    }

    const fields = defaultStep3Fields();
    const validAnswer = structuredClone(fields.investmentKnowledge);
    validAnswer.general = { limited: false, moderate: true, extensive: false, none: false };
    for (const key of Object.keys(validAnswer.byType)) {
      const typeKey = key as keyof Step3Fields['investmentKnowledge']['byType'];
      validAnswer.byType[typeKey].knowledge = { limited: false, moderate: false, extensive: false, none: true };
      validAnswer.byType[typeKey].sinceYear = null;
    }
    validAnswer.byType.other.label = null;

    const validResult = validateStep3Answer('step3.investment.knowledgeExperience', validAnswer);
    expect(validResult.success).toBe(true);
  });

  it('applies grouped investment answer and clears stale values through sanitization', () => {
    const base = defaultStep3Fields();
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

    const next = applyStep3Answer(base, 'step3.investment.knowledgeExperience', payload);
    expect(next.investmentKnowledge.byType.other.sinceYear).toBeNull();
    expect(next.investmentKnowledge.byType.other.label).toBeNull();
  });

  it('clears stale values when branch selections change', () => {
    const base = defaultStep3Fields();
    base.holder.kind = { person: true, entity: false };
    base.holder.taxId.ssn = '111223333';
    base.holder.contact.dateOfBirth = '2000-01-01';
    base.holder.gender = { male: true, female: false };

    const entityResult = applyStep3Answer(base, 'step3.holder.kind', {
      person: false,
      entity: true
    });

    expect(entityResult.holder.taxId.ssn).toBeNull();
    expect(entityResult.holder.contact.dateOfBirth).toBeNull();
    expect(entityResult.holder.gender.male).toBe(false);

    entityResult.investmentKnowledge.byType.other.knowledge = {
      limited: false,
      moderate: true,
      extensive: false,
      none: false
    };
    entityResult.investmentKnowledge.byType.other.sinceYear = 2010;
    entityResult.investmentKnowledge.byType.other.label = 'Structured Notes';

    const otherCleared = applyStep3Answer(
      entityResult,
      'step3.investment.byType.other.knowledge',
      { limited: false, moderate: false, extensive: false, none: true }
    );

    expect(otherCleared.investmentKnowledge.byType.other.sinceYear).toBeNull();
    expect(otherCleared.investmentKnowledge.byType.other.label).toBeNull();

    const disclosureWithDetails = applyStep3Answer(
      otherCleared,
      'step3.disclosure.relatedAdvisorFirmEmployee',
      {
        selection: { yes: true, no: false },
        advisorEmployeeName: 'Jane Smith',
        advisorEmployeeRelationship: 'Sibling'
      }
    );

    const disclosureCleared = applyStep3Answer(
      disclosureWithDetails,
      'step3.disclosure.relatedAdvisorFirmEmployee',
      {
        selection: { yes: false, no: true },
        advisorEmployeeName: 'Jane Smith',
        advisorEmployeeRelationship: 'Sibling'
      }
    );

    expect(disclosureCleared.affiliations.advisorEmployeeName).toBeNull();
    expect(disclosureCleared.affiliations.advisorEmployeeRelationship).toBeNull();
  });

  it('validates since-year answer when knowledge path is active', () => {
    const fields = buildCompleteStep3EntityFields();

    const missingYear = validateStep3Answer(
      'step3.investment.byType.equities.sinceYear',
      '',
      fields
    );
    expect(missingYear.success).toBe(false);

    const validYear = validateStep3Answer(
      'step3.investment.byType.equities.sinceYear',
      2018,
      fields
    );
    expect(validYear.success).toBe(true);
  });

  it('allows completion without gov ID when requirement context is unknown', () => {
    const fields = buildCompleteStep3EntityFields();
    const errors = validateStep3Completion(fields);

    expect(errors['step3.govId.photoId1']).toBeUndefined();
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('requires at least one complete gov ID when documentary requirement is true', () => {
    const fields = buildCompleteStep3EntityFields();
    fields.governmentIdentification.requirementContext.requiresDocumentaryId = true;

    const errors = validateStep3Completion(fields);
    expect(errors['step3.govId.photoId1']).toContain('required');
  });

  it('rejects invalid liquid net worth range and partial gov ID', () => {
    const fields = buildCompleteStep3EntityFields();
    fields.financialInformation.liquidNetWorthRange = {
      fromBracket: '500k_1m',
      toBracket: '1m_5m'
    };
    fields.governmentIdentification.photoId1.type = 'Passport';

    const errors = validateStep3Completion(fields);
    expect(errors['step3.financial.liquidNetWorthRange.toBracket']).toContain('cannot exceed');
    expect(errors['step3.govId.photoId1.idNumber']).toContain('required');
  });
});
