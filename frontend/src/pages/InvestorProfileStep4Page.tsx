
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  InvestorProfileFinancialRangeBracket,
  InvestorProfileInvestmentTypeKey,
  InvestorProfileStepFourFields,
  InvestorProfileStepFourQuestionConfig,
  InvestorProfileStepFourQuestionId,
  InvestorProfileStepFourResponse,
  InvestorProfileStepFourUpdateRequest
} from '../types/api';

const COUNTRY_OPTIONS: Array<{ code: string; label: string }> = [
  { code: 'US', label: 'United States' },
  { code: 'CA', label: 'Canada' },
  { code: 'MX', label: 'Mexico' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'DE', label: 'Germany' },
  { code: 'FR', label: 'France' },
  { code: 'ES', label: 'Spain' },
  { code: 'IT', label: 'Italy' },
  { code: 'NL', label: 'Netherlands' },
  { code: 'CH', label: 'Switzerland' },
  { code: 'SE', label: 'Sweden' },
  { code: 'NO', label: 'Norway' },
  { code: 'DK', label: 'Denmark' },
  { code: 'IE', label: 'Ireland' },
  { code: 'PT', label: 'Portugal' },
  { code: 'AU', label: 'Australia' },
  { code: 'NZ', label: 'New Zealand' },
  { code: 'JP', label: 'Japan' },
  { code: 'KR', label: 'South Korea' },
  { code: 'SG', label: 'Singapore' },
  { code: 'IN', label: 'India' },
  { code: 'CN', label: 'China' },
  { code: 'HK', label: 'Hong Kong' },
  { code: 'AE', label: 'United Arab Emirates' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'ZA', label: 'South Africa' },
  { code: 'BR', label: 'Brazil' },
  { code: 'AR', label: 'Argentina' },
  { code: 'CL', label: 'Chile' },
  { code: 'CO', label: 'Colombia' }
];

const INVESTMENT_TYPES: Array<{ key: InvestorProfileInvestmentTypeKey; label: string }> = [
  { key: 'commoditiesFutures', label: 'Commodities, Futures' },
  { key: 'equities', label: 'Equities' },
  { key: 'exchangeTradedFunds', label: 'Exchange Traded Funds' },
  { key: 'fixedAnnuities', label: 'Fixed Annuities' },
  { key: 'fixedInsurance', label: 'Fixed Insurance' },
  { key: 'mutualFunds', label: 'Mutual Funds' },
  { key: 'options', label: 'Options' },
  { key: 'preciousMetals', label: 'Precious Metals' },
  { key: 'realEstate', label: 'Real Estate' },
  { key: 'unitInvestmentTrusts', label: 'Unit Investment Trusts' },
  { key: 'variableAnnuities', label: 'Variable Annuities' },
  { key: 'leveragedInverseEtfs', label: 'Leveraged/Inverse ETFs' },
  { key: 'complexProducts', label: 'Complex Products' },
  { key: 'alternativeInvestments', label: 'Alternative Investments' },
  { key: 'other', label: 'Other' }
];

const KNOWLEDGE_OPTIONS = [
  { key: 'limited', label: 'Limited' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'extensive', label: 'Extensive' },
  { key: 'none', label: 'None' }
] as const;

const RANGE_BRACKET_OPTIONS: Array<{ key: InvestorProfileFinancialRangeBracket; label: string }> = [
  { key: 'under_50k', label: 'Under $50K' },
  { key: '50k_100k', label: '$50K - $100K' },
  { key: '100k_250k', label: '$100K - $250K' },
  { key: '250k_500k', label: '$250K - $500K' },
  { key: '500k_1m', label: '$500K - $1M' },
  { key: '1m_5m', label: '$1M - $5M' },
  { key: '5m_plus', label: '$5M+' }
];

type YesNoMap = { yes: boolean; no: boolean };

function createEmptyKnowledgeMap() {
  return {
    limited: false,
    moderate: false,
    extensive: false,
    none: false
  };
}

function createEmptyYesNoMap(): YesNoMap {
  return {
    yes: false,
    no: false
  };
}

function createEmptyStep4Fields(): InvestorProfileStepFourFields {
  const byType = Object.fromEntries(
    INVESTMENT_TYPES.map((type) => [
      type.key,
      {
        knowledge: createEmptyKnowledgeMap(),
        sinceYear: null,
        label: null
      }
    ])
  ) as InvestorProfileStepFourFields['investmentKnowledge']['byType'];

  return {
    holder: {
      kind: { person: false, entity: false },
      name: '',
      taxId: {
        ssn: null,
        hasEin: { yes: false, no: false },
        ein: null
      },
      contact: {
        email: '',
        dateOfBirth: null,
        specifiedAdult: null,
        phones: {
          home: null,
          business: null,
          mobile: null
        }
      },
      legalAddress: {
        line1: null,
        city: null,
        stateProvince: null,
        postalCode: null,
        country: null
      },
      mailingDifferent: { yes: false, no: false },
      mailingAddress: {
        line1: null,
        city: null,
        stateProvince: null,
        postalCode: null,
        country: null
      },
      citizenship: {
        primary: [],
        additional: []
      },
      gender: { male: false, female: false },
      maritalStatus: {
        single: false,
        married: false,
        divorced: false,
        domesticPartner: false,
        widower: false
      },
      employment: {
        status: {
          employed: false,
          selfEmployed: false,
          retired: false,
          unemployed: false,
          homemaker: false,
          student: false
        },
        occupation: null,
        yearsEmployed: null,
        typeOfBusiness: null,
        employerName: null,
        employerAddress: {
          line1: null,
          city: null,
          stateProvince: null,
          postalCode: null,
          country: null
        }
      }
    },
    investmentKnowledge: {
      general: createEmptyKnowledgeMap(),
      byType: {
        ...byType,
        other: {
          knowledge: createEmptyKnowledgeMap(),
          sinceYear: null,
          label: null
        }
      }
    },
    financialInformation: {
      annualIncomeRange: {
        fromBracket: null,
        toBracket: null
      },
      netWorthExPrimaryResidenceRange: {
        fromBracket: null,
        toBracket: null
      },
      liquidNetWorthRange: {
        fromBracket: null,
        toBracket: null
      },
      taxBracket: {
        bracket_0_15: false,
        bracket_15_1_32: false,
        bracket_32_1_50: false,
        bracket_50_1_plus: false
      }
    },
    governmentIdentification: {
      photoId1: {
        type: null,
        idNumber: null,
        countryOfIssue: null,
        dateOfIssue: null,
        dateOfExpiration: null
      },
      photoId2: {
        type: null,
        idNumber: null,
        countryOfIssue: null,
        dateOfIssue: null,
        dateOfExpiration: null
      },
      requirementContext: {
        requiresDocumentaryId: null,
        isNonResidentAlien: null
      }
    },
    affiliations: {
      employeeAdvisorFirm: createEmptyYesNoMap(),
      relatedAdvisorFirmEmployee: createEmptyYesNoMap(),
      advisorEmployeeName: null,
      advisorEmployeeRelationship: null,
      employeeBrokerDealer: createEmptyYesNoMap(),
      brokerDealerName: null,
      relatedBrokerDealerEmployee: createEmptyYesNoMap(),
      relatedBrokerDealerName: null,
      relatedBrokerDealerEmployeeName: null,
      relatedBrokerDealerRelationship: null,
      maintainsOtherBrokerageAccounts: createEmptyYesNoMap(),
      otherBrokerageFirms: null,
      yearsOfInvestmentExperience: null,
      exchangeOrFinraAffiliation: createEmptyYesNoMap(),
      affiliationDetails: null,
      seniorOfficerDirectorTenPercentPublicCompany: createEmptyYesNoMap(),
      publicCompanyNames: null
    }
  };
}

const QUESTION_CONFIG: Partial<
  Record<InvestorProfileStepFourQuestionId, InvestorProfileStepFourQuestionConfig>
> = {
  'step4.holder.kind': {
    key: 'step4.holder.kind',
    title: 'Is the secondary account holder a person or an entity?',
    helper: 'Choose one to control the rest of this section.',
    type: 'single-choice-cards',
    options: [
      { key: 'person', label: 'Person' },
      { key: 'entity', label: 'Entity' }
    ]
  },
  'step4.holder.name': {
    key: 'step4.holder.name',
    title: 'What legal name should appear on this account?',
    helper: 'Use full legal name (person) or legal entity/trust name.',
    type: 'text',
    placeholder: 'Enter legal name'
  },
  'step4.holder.taxId.ssn': {
    key: 'step4.holder.taxId.ssn',
    title: 'What is the SSN?',
    helper: 'Enter 9 digits.',
    type: 'text',
    placeholder: '###-##-####'
  },
  'step4.holder.taxId.hasEin': {
    key: 'step4.holder.taxId.hasEin',
    title: 'Does this holder have an EIN?',
    helper: 'Choose Yes or No.',
    type: 'single-choice-cards',
    options: [
      { key: 'yes', label: 'Yes' },
      { key: 'no', label: 'No' }
    ]
  },
  'step4.holder.taxId.ein': {
    key: 'step4.holder.taxId.ein',
    title: 'What is the EIN?',
    helper: 'Enter EIN as 9 digits.',
    type: 'text',
    placeholder: '##-#######'
  },
  'step4.holder.contact.email': {
    key: 'step4.holder.contact.email',
    title: 'What email should we use?',
    helper: 'This becomes the primary email for this holder.',
    type: 'text',
    placeholder: 'name@example.com'
  },
  'step4.holder.contact.dateOfBirth': {
    key: 'step4.holder.contact.dateOfBirth',
    title: 'What is the date of birth?',
    helper: 'Date must be in the past.',
    type: 'date'
  },
  'step4.holder.contact.specifiedAdult': {
    key: 'step4.holder.contact.specifiedAdult',
    title: 'Who is the specified adult?',
    helper: 'Required for holders under 18.',
    type: 'text',
    placeholder: 'Enter specified adult'
  },
  'step4.holder.contact.phones': {
    key: 'step4.holder.contact.phones',
    title: 'What are the best phone numbers for this holder?',
    helper: 'Provide at least one of Home, Business, or Mobile.',
    type: 'phones-block'
  },
  'step4.holder.contact.phones.home': {
    key: 'step4.holder.contact.phones.home',
    title: 'Home phone (optional).',
    helper: 'At least one phone is required by the end of phone questions.',
    type: 'text',
    placeholder: 'Enter home phone'
  },
  'step4.holder.contact.phones.business': {
    key: 'step4.holder.contact.phones.business',
    title: 'Business phone (optional).',
    helper: 'At least one phone is required by the end of phone questions.',
    type: 'text',
    placeholder: 'Enter business phone'
  },
  'step4.holder.contact.phones.mobile': {
    key: 'step4.holder.contact.phones.mobile',
    title: 'Mobile phone (optional).',
    helper: 'At least one of Home, Business, or Mobile must be provided.',
    type: 'text',
    placeholder: 'Enter mobile phone'
  },
  'step4.holder.legalAddress': {
    key: 'step4.holder.legalAddress',
    title: 'What is the legal address?',
    helper: 'Enter full legal address. P.O. Box is not allowed.',
    type: 'address-block'
  },
  'step4.holder.legalAddress.line1': {
    key: 'step4.holder.legalAddress.line1',
    title: 'What is the legal street address?',
    helper: 'P.O. Box is not allowed.',
    type: 'text',
    placeholder: 'Street address'
  },
  'step4.holder.legalAddress.city': {
    key: 'step4.holder.legalAddress.city',
    title: 'Legal address city?',
    helper: 'Enter city.',
    type: 'text',
    placeholder: 'City'
  },
  'step4.holder.legalAddress.stateProvince': {
    key: 'step4.holder.legalAddress.stateProvince',
    title: 'Legal address state/province?',
    helper: 'Enter state or province.',
    type: 'text',
    placeholder: 'State/Province'
  },
  'step4.holder.legalAddress.postalCode': {
    key: 'step4.holder.legalAddress.postalCode',
    title: 'Legal address ZIP/postal code?',
    helper: 'Enter ZIP or postal code.',
    type: 'text',
    placeholder: 'ZIP/Postal code'
  },
  'step4.holder.legalAddress.country': {
    key: 'step4.holder.legalAddress.country',
    title: 'Legal address country?',
    helper: 'Select one country code.',
    type: 'country-multi'
  },
  'step4.holder.mailingDifferent': {
    key: 'step4.holder.mailingDifferent',
    title: 'Is mailing address different from legal address?',
    helper: 'Choose Yes if mailing is different.',
    type: 'single-choice-cards',
    options: [
      { key: 'yes', label: 'Yes' },
      { key: 'no', label: 'No' }
    ]
  },
  'step4.holder.mailingAddress': {
    key: 'step4.holder.mailingAddress',
    title: 'What is the mailing address?',
    helper: 'Enter full mailing address.',
    type: 'address-block'
  },
  'step4.holder.mailingAddress.line1': {
    key: 'step4.holder.mailingAddress.line1',
    title: 'Mailing street address?',
    helper: 'Enter full mailing street address.',
    type: 'text',
    placeholder: 'Mailing address'
  },
  'step4.holder.mailingAddress.city': {
    key: 'step4.holder.mailingAddress.city',
    title: 'Mailing city?',
    helper: 'Enter mailing city.',
    type: 'text',
    placeholder: 'City'
  },
  'step4.holder.mailingAddress.stateProvince': {
    key: 'step4.holder.mailingAddress.stateProvince',
    title: 'Mailing state/province?',
    helper: 'Enter mailing state or province.',
    type: 'text',
    placeholder: 'State/Province'
  },
  'step4.holder.mailingAddress.postalCode': {
    key: 'step4.holder.mailingAddress.postalCode',
    title: 'Mailing ZIP/postal code?',
    helper: 'Enter mailing ZIP or postal code.',
    type: 'text',
    placeholder: 'ZIP/Postal code'
  },
  'step4.holder.mailingAddress.country': {
    key: 'step4.holder.mailingAddress.country',
    title: 'Mailing country?',
    helper: 'Select one country code.',
    type: 'country-multi'
  },
  'step4.holder.citizenship.primary': {
    key: 'step4.holder.citizenship.primary',
    title: 'Primary citizenship(s)?',
    helper: 'Select primary citizenship country code(s).',
    type: 'country-multi'
  },
  'step4.holder.citizenship.additional': {
    key: 'step4.holder.citizenship.additional',
    title: 'Any additional citizenships?',
    helper: 'Optional. Choose any additional citizenship country codes.',
    type: 'country-multi'
  },
  'step4.holder.gender': {
    key: 'step4.holder.gender',
    title: 'Gender',
    helper: 'Choose one option.',
    type: 'single-choice-cards',
    options: [
      { key: 'male', label: 'Male' },
      { key: 'female', label: 'Female' }
    ]
  },
  'step4.holder.maritalStatus': {
    key: 'step4.holder.maritalStatus',
    title: 'Marital status',
    helper: 'Choose one status.',
    type: 'single-choice-cards',
    options: [
      { key: 'single', label: 'Single' },
      { key: 'married', label: 'Married' },
      { key: 'divorced', label: 'Divorced' },
      { key: 'domesticPartner', label: 'Domestic Partner' },
      { key: 'widower', label: 'Widow(er)' }
    ]
  },
  'step4.holder.employment.status': {
    key: 'step4.holder.employment.status',
    title: 'Employment and industry affiliation',
    helper: 'Choose one current employment status.',
    type: 'single-choice-cards',
    options: [
      { key: 'employed', label: 'Employed' },
      { key: 'selfEmployed', label: 'Self-Employed' },
      { key: 'retired', label: 'Retired' },
      { key: 'unemployed', label: 'Unemployed' },
      { key: 'homemaker', label: 'Homemaker' },
      { key: 'student', label: 'Student' }
    ]
  },
  'step4.holder.employment.occupation': {
    key: 'step4.holder.employment.occupation',
    title: 'Occupation?',
    helper: 'Enter current occupation.',
    type: 'text',
    placeholder: 'Occupation'
  },
  'step4.holder.employment.yearsEmployed': {
    key: 'step4.holder.employment.yearsEmployed',
    title: 'Years employed?',
    helper: 'Enter whole number (0 or more).',
    type: 'number'
  },
  'step4.holder.employment.typeOfBusiness': {
    key: 'step4.holder.employment.typeOfBusiness',
    title: 'Type of business?',
    helper: 'Enter business type.',
    type: 'text',
    placeholder: 'Type of business'
  },
  'step4.holder.employment.employerName': {
    key: 'step4.holder.employment.employerName',
    title: 'Employer name?',
    helper: 'Use company or business legal name.',
    type: 'text',
    placeholder: 'Employer name'
  },
  'step4.holder.employment.employerAddress.line1': {
    key: 'step4.holder.employment.employerAddress.line1',
    title: 'Employer address?',
    helper: 'Enter street address.',
    type: 'text',
    placeholder: 'Employer address'
  },
  'step4.holder.employment.employerAddress.city': {
    key: 'step4.holder.employment.employerAddress.city',
    title: 'Employer city?',
    helper: 'Enter city.',
    type: 'text',
    placeholder: 'City'
  },
  'step4.holder.employment.employerAddress.stateProvince': {
    key: 'step4.holder.employment.employerAddress.stateProvince',
    title: 'Employer state/province?',
    helper: 'Enter state or province.',
    type: 'text',
    placeholder: 'State/Province'
  },
  'step4.holder.employment.employerAddress.postalCode': {
    key: 'step4.holder.employment.employerAddress.postalCode',
    title: 'Employer ZIP/postal code?',
    helper: 'Enter ZIP or postal code.',
    type: 'text',
    placeholder: 'ZIP/Postal code'
  },
  'step4.holder.employment.employerAddress.country': {
    key: 'step4.holder.employment.employerAddress.country',
    title: 'Employer country?',
    helper: 'Select one country code.',
    type: 'country-multi'
  },
  'step4.investment.knowledgeExperience': {
    key: 'step4.investment.knowledgeExperience',
    title: 'Tell us your overall investment knowledge and by-type experience.',
    helper: 'Choose one level for overall and each investment type. Add Since Year where knowledge is not None.',
    type: 'investment-knowledge-block'
  },
  'step4.investment.generalKnowledge': {
    key: 'step4.investment.generalKnowledge',
    title: 'How would you describe overall investment knowledge and experience?',
    helper: 'Choose one option that best reflects your current knowledge level.',
    type: 'single-choice-cards',
    options: [...KNOWLEDGE_OPTIONS]
  },
  'step4.investment.byType.other.label': {
    key: 'step4.investment.byType.other.label',
    title: 'What is the Other investment type?',
    helper: 'Required when Other knowledge is not None.',
    type: 'text',
    placeholder: 'Describe other investment type'
  },
  'step4.financial.annualIncomeRange': {
    key: 'step4.financial.annualIncomeRange',
    title: 'What is annual income range?',
    helper: 'Choose both From and To brackets.',
    type: 'range-bracket'
  },
  'step4.financial.netWorthExPrimaryResidenceRange': {
    key: 'step4.financial.netWorthExPrimaryResidenceRange',
    title: 'What is net worth (excluding primary residence) range?',
    helper: 'Choose both From and To brackets.',
    type: 'range-bracket'
  },
  'step4.financial.liquidNetWorthRange': {
    key: 'step4.financial.liquidNetWorthRange',
    title: 'What is liquid net worth range?',
    helper: 'Choose both From and To brackets.',
    type: 'range-bracket'
  },
  'step4.financial.taxBracket': {
    key: 'step4.financial.taxBracket',
    title: 'What is the tax bracket?',
    helper: 'Choose one tax bracket.',
    type: 'single-choice-cards',
    options: [
      { key: 'bracket_0_15', label: '0 - 15%' },
      { key: 'bracket_15_1_32', label: '15.1% - 32%' },
      { key: 'bracket_32_1_50', label: '32.1% - 50%' },
      { key: 'bracket_50_1_plus', label: '50.1% +' }
    ]
  },
  'step4.govId.photoId1': {
    key: 'step4.govId.photoId1',
    title: 'Government Photo ID #1',
    helper: 'Provide unexpired government-issued photo ID details.',
    type: 'photo-id-block'
  },
  'step4.govId.photoId2': {
    key: 'step4.govId.photoId2',
    title: 'Government Photo ID #2 (optional)',
    helper: 'Optional second ID. If any field is entered, all fields become required.',
    type: 'photo-id-block'
  },
  'step4.disclosure.employeeAdvisorFirm': {
    key: 'step4.disclosure.employeeAdvisorFirm',
    title: 'Are you an employee of this advisor firm?',
    helper: 'Choose Yes or No.',
    type: 'single-choice-cards',
    options: [
      { key: 'yes', label: 'Yes' },
      { key: 'no', label: 'No' }
    ]
  },
  'step4.disclosure.relatedAdvisorFirmEmployee': {
    key: 'step4.disclosure.relatedAdvisorFirmEmployee',
    title: 'Are you related to an employee at this advisory firm?',
    helper: 'If Yes, add employee name and relationship.',
    type: 'disclosure-related-advisor'
  },
  'step4.disclosure.employeeBrokerDealer': {
    key: 'step4.disclosure.employeeBrokerDealer',
    title: 'Are you an employee of a broker-dealer?',
    helper: 'If Yes, add broker-dealer name.',
    type: 'disclosure-employee-broker'
  },
  'step4.disclosure.relatedBrokerDealerEmployee': {
    key: 'step4.disclosure.relatedBrokerDealerEmployee',
    title: 'Are you related to an employee at a broker-dealer?',
    helper: 'If Yes, add broker-dealer, employee name, and relationship.',
    type: 'disclosure-related-broker'
  },
  'step4.disclosure.maintainsOtherBrokerageAccounts': {
    key: 'step4.disclosure.maintainsOtherBrokerageAccounts',
    title: 'Are you maintaining any other brokerage accounts?',
    helper: 'If Yes, add firm names and years of investment experience.',
    type: 'disclosure-other-brokerage'
  },
  'step4.disclosure.exchangeOrFinraAffiliation': {
    key: 'step4.disclosure.exchangeOrFinraAffiliation',
    title:
      'Are you or any member of your immediate family affiliated with or employed by a stock exchange or FINRA member?',
    helper: 'If Yes, employer authorization is required. Provide affiliation details.',
    type: 'disclosure-exchange-finra'
  },
  'step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany': {
    key: 'step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany',
    title: 'Are you a senior officer, director, or 10% or more shareholder of a public company?',
    helper: 'If Yes, add company name(s).',
    type: 'disclosure-public-company'
  }
};

for (const investmentType of INVESTMENT_TYPES) {
  QUESTION_CONFIG[`step4.investment.byType.${investmentType.key}.knowledge`] = {
    key: `step4.investment.byType.${investmentType.key}.knowledge`,
    title: `What is your knowledge level for ${investmentType.label}?`,
    helper: 'Choose one option.',
    type: 'single-choice-cards',
    options: [...KNOWLEDGE_OPTIONS]
  };

  QUESTION_CONFIG[`step4.investment.byType.${investmentType.key}.sinceYear`] = {
    key: `step4.investment.byType.${investmentType.key}.sinceYear`,
    title: `Since what year have you had experience with ${investmentType.label}?`,
    helper: 'Use a 4-digit year.',
    type: 'number'
  };
}

function getInvestmentTypeFromQuestionId(
  questionId: InvestorProfileStepFourQuestionId,
  suffix: 'knowledge' | 'sinceYear'
): InvestorProfileInvestmentTypeKey | null {
  const prefix = 'step4.investment.byType.';
  const expectedSuffix = `.${suffix}`;

  if (!questionId.startsWith(prefix) || !questionId.endsWith(expectedSuffix)) {
    return null;
  }

  const rawType = questionId.slice(prefix.length, questionId.length - expectedSuffix.length);
  const matched = INVESTMENT_TYPES.find((type) => type.key === rawType);
  return matched?.key ?? null;
}

function findQuestionIndex(
  currentQuestionId: InvestorProfileStepFourQuestionId | null,
  visible: InvestorProfileStepFourQuestionId[]
): number {
  if (!currentQuestionId) {
    return 0;
  }

  const index = visible.indexOf(currentQuestionId);
  return index >= 0 ? index : 0;
}

function getErrorForQuestion(
  questionId: InvestorProfileStepFourQuestionId,
  fieldErrors: Record<string, string>
): string | null {
  const config = QUESTION_CONFIG[questionId];
  const directKey = config?.fieldErrorKey ?? questionId;

  if (fieldErrors[directKey]) {
    return fieldErrors[directKey];
  }

  if (questionId === 'step4.investment.knowledgeExperience') {
    const investmentErrorKey = Object.keys(fieldErrors).find((key) => key.startsWith('step4.investment.'));
    if (investmentErrorKey) {
      return fieldErrors[investmentErrorKey];
    }
  }

  const prefixedKey = Object.keys(fieldErrors).find((key) => key.startsWith(`${questionId}.`));
  return prefixedKey ? fieldErrors[prefixedKey] : null;
}

function selectOne(map: Record<string, boolean>, selectedKey: string): void {
  Object.keys(map).forEach((key) => {
    map[key] = key === selectedKey;
  });
}

function setSingleChoice(
  fields: InvestorProfileStepFourFields,
  questionId: InvestorProfileStepFourQuestionId,
  selectedKey: string
): InvestorProfileStepFourFields {
  const next = structuredClone(fields);

  if (questionId === 'step4.holder.kind') selectOne(next.holder.kind, selectedKey);
  if (questionId === 'step4.holder.taxId.hasEin') selectOne(next.holder.taxId.hasEin, selectedKey);
  if (questionId === 'step4.holder.mailingDifferent') selectOne(next.holder.mailingDifferent, selectedKey);
  if (questionId === 'step4.holder.gender') selectOne(next.holder.gender, selectedKey);
  if (questionId === 'step4.holder.maritalStatus') selectOne(next.holder.maritalStatus, selectedKey);
  if (questionId === 'step4.holder.employment.status') selectOne(next.holder.employment.status, selectedKey);
  if (questionId === 'step4.investment.generalKnowledge') selectOne(next.investmentKnowledge.general, selectedKey);
  if (questionId === 'step4.financial.taxBracket') selectOne(next.financialInformation.taxBracket, selectedKey);
  if (questionId === 'step4.disclosure.employeeAdvisorFirm') selectOne(next.affiliations.employeeAdvisorFirm, selectedKey);

  const investmentType = getInvestmentTypeFromQuestionId(questionId, 'knowledge');
  if (investmentType) {
    selectOne(next.investmentKnowledge.byType[investmentType].knowledge, selectedKey);
  }

  return next;
}

function getAnswer(fields: InvestorProfileStepFourFields, questionId: InvestorProfileStepFourQuestionId): unknown {
  switch (questionId) {
    case 'step4.holder.kind':
      return fields.holder.kind;
    case 'step4.holder.name':
      return fields.holder.name;
    case 'step4.holder.taxId.ssn':
      return fields.holder.taxId.ssn ?? '';
    case 'step4.holder.taxId.hasEin':
      return fields.holder.taxId.hasEin;
    case 'step4.holder.taxId.ein':
      return fields.holder.taxId.ein ?? '';
    case 'step4.holder.contact.email':
      return fields.holder.contact.email;
    case 'step4.holder.contact.dateOfBirth':
      return fields.holder.contact.dateOfBirth ?? '';
    case 'step4.holder.contact.specifiedAdult':
      return fields.holder.contact.specifiedAdult ?? '';
    case 'step4.holder.contact.phones':
      return fields.holder.contact.phones;
    case 'step4.holder.contact.phones.home':
      return fields.holder.contact.phones.home ?? '';
    case 'step4.holder.contact.phones.business':
      return fields.holder.contact.phones.business ?? '';
    case 'step4.holder.contact.phones.mobile':
      return fields.holder.contact.phones.mobile ?? '';
    case 'step4.holder.legalAddress':
      return fields.holder.legalAddress;
    case 'step4.holder.legalAddress.line1':
      return fields.holder.legalAddress.line1 ?? '';
    case 'step4.holder.legalAddress.city':
      return fields.holder.legalAddress.city ?? '';
    case 'step4.holder.legalAddress.stateProvince':
      return fields.holder.legalAddress.stateProvince ?? '';
    case 'step4.holder.legalAddress.postalCode':
      return fields.holder.legalAddress.postalCode ?? '';
    case 'step4.holder.legalAddress.country':
      return fields.holder.legalAddress.country ?? '';
    case 'step4.holder.mailingDifferent':
      return fields.holder.mailingDifferent;
    case 'step4.holder.mailingAddress':
      return fields.holder.mailingAddress;
    case 'step4.holder.mailingAddress.line1':
      return fields.holder.mailingAddress.line1 ?? '';
    case 'step4.holder.mailingAddress.city':
      return fields.holder.mailingAddress.city ?? '';
    case 'step4.holder.mailingAddress.stateProvince':
      return fields.holder.mailingAddress.stateProvince ?? '';
    case 'step4.holder.mailingAddress.postalCode':
      return fields.holder.mailingAddress.postalCode ?? '';
    case 'step4.holder.mailingAddress.country':
      return fields.holder.mailingAddress.country ?? '';
    case 'step4.holder.citizenship.primary':
      return fields.holder.citizenship.primary;
    case 'step4.holder.citizenship.additional':
      return fields.holder.citizenship.additional;
    case 'step4.holder.gender':
      return fields.holder.gender;
    case 'step4.holder.maritalStatus':
      return fields.holder.maritalStatus;
    case 'step4.holder.employment.status':
      return fields.holder.employment.status;
    case 'step4.holder.employment.occupation':
      return fields.holder.employment.occupation ?? '';
    case 'step4.holder.employment.yearsEmployed':
      return fields.holder.employment.yearsEmployed ?? '';
    case 'step4.holder.employment.typeOfBusiness':
      return fields.holder.employment.typeOfBusiness ?? '';
    case 'step4.holder.employment.employerName':
      return fields.holder.employment.employerName ?? '';
    case 'step4.holder.employment.employerAddress.line1':
      return fields.holder.employment.employerAddress.line1 ?? '';
    case 'step4.holder.employment.employerAddress.city':
      return fields.holder.employment.employerAddress.city ?? '';
    case 'step4.holder.employment.employerAddress.stateProvince':
      return fields.holder.employment.employerAddress.stateProvince ?? '';
    case 'step4.holder.employment.employerAddress.postalCode':
      return fields.holder.employment.employerAddress.postalCode ?? '';
    case 'step4.holder.employment.employerAddress.country':
      return fields.holder.employment.employerAddress.country ?? '';
    case 'step4.investment.knowledgeExperience':
      return fields.investmentKnowledge;
    case 'step4.investment.generalKnowledge':
      return fields.investmentKnowledge.general;
    case 'step4.investment.byType.other.label':
      return fields.investmentKnowledge.byType.other.label ?? '';
    case 'step4.financial.annualIncomeRange':
      return fields.financialInformation.annualIncomeRange;
    case 'step4.financial.netWorthExPrimaryResidenceRange':
      return fields.financialInformation.netWorthExPrimaryResidenceRange;
    case 'step4.financial.liquidNetWorthRange':
      return fields.financialInformation.liquidNetWorthRange;
    case 'step4.financial.taxBracket':
      return fields.financialInformation.taxBracket;
    case 'step4.govId.photoId1':
      return fields.governmentIdentification.photoId1;
    case 'step4.govId.photoId2':
      return fields.governmentIdentification.photoId2;
    case 'step4.disclosure.employeeAdvisorFirm':
      return fields.affiliations.employeeAdvisorFirm;
    case 'step4.disclosure.relatedAdvisorFirmEmployee':
      return {
        selection: fields.affiliations.relatedAdvisorFirmEmployee,
        advisorEmployeeName: fields.affiliations.advisorEmployeeName ?? '',
        advisorEmployeeRelationship: fields.affiliations.advisorEmployeeRelationship ?? ''
      };
    case 'step4.disclosure.employeeBrokerDealer':
      return {
        selection: fields.affiliations.employeeBrokerDealer,
        brokerDealerName: fields.affiliations.brokerDealerName ?? ''
      };
    case 'step4.disclosure.relatedBrokerDealerEmployee':
      return {
        selection: fields.affiliations.relatedBrokerDealerEmployee,
        relatedBrokerDealerName: fields.affiliations.relatedBrokerDealerName ?? '',
        relatedBrokerDealerEmployeeName: fields.affiliations.relatedBrokerDealerEmployeeName ?? '',
        relatedBrokerDealerRelationship: fields.affiliations.relatedBrokerDealerRelationship ?? ''
      };
    case 'step4.disclosure.maintainsOtherBrokerageAccounts':
      return {
        selection: fields.affiliations.maintainsOtherBrokerageAccounts,
        otherBrokerageFirms: fields.affiliations.otherBrokerageFirms ?? '',
        yearsOfInvestmentExperience: fields.affiliations.yearsOfInvestmentExperience ?? ''
      };
    case 'step4.disclosure.exchangeOrFinraAffiliation':
      return {
        selection: fields.affiliations.exchangeOrFinraAffiliation,
        affiliationDetails: fields.affiliations.affiliationDetails ?? ''
      };
    case 'step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany':
      return {
        selection: fields.affiliations.seniorOfficerDirectorTenPercentPublicCompany,
        publicCompanyNames: fields.affiliations.publicCompanyNames ?? ''
      };
    default: {
      const investmentTypeKnowledge = getInvestmentTypeFromQuestionId(questionId, 'knowledge');
      if (investmentTypeKnowledge) {
        return fields.investmentKnowledge.byType[investmentTypeKnowledge].knowledge;
      }

      const investmentTypeYear = getInvestmentTypeFromQuestionId(questionId, 'sinceYear');
      if (investmentTypeYear) {
        return fields.investmentKnowledge.byType[investmentTypeYear].sinceYear ?? '';
      }

      return null;
    }
  }
}

function applyAnswer(
  fields: InvestorProfileStepFourFields,
  questionId: InvestorProfileStepFourQuestionId,
  answer: unknown
): InvestorProfileStepFourFields {
  const next = structuredClone(fields);

  if (questionId === 'step4.holder.name') next.holder.name = String(answer ?? '');
  if (questionId === 'step4.holder.taxId.ssn') next.holder.taxId.ssn = String(answer ?? '');
  if (questionId === 'step4.holder.taxId.ein') next.holder.taxId.ein = String(answer ?? '');
  if (questionId === 'step4.holder.contact.email') next.holder.contact.email = String(answer ?? '');
  if (questionId === 'step4.holder.contact.dateOfBirth') next.holder.contact.dateOfBirth = String(answer ?? '');
  if (questionId === 'step4.holder.contact.specifiedAdult') next.holder.contact.specifiedAdult = String(answer ?? '');
  if (questionId === 'step4.holder.contact.phones') {
    next.holder.contact.phones = answer as InvestorProfileStepFourFields['holder']['contact']['phones'];
  }
  if (questionId === 'step4.holder.contact.phones.home') next.holder.contact.phones.home = String(answer ?? '');
  if (questionId === 'step4.holder.contact.phones.business') next.holder.contact.phones.business = String(answer ?? '');
  if (questionId === 'step4.holder.contact.phones.mobile') next.holder.contact.phones.mobile = String(answer ?? '');
  if (questionId === 'step4.holder.legalAddress') {
    next.holder.legalAddress = answer as InvestorProfileStepFourFields['holder']['legalAddress'];
  }
  if (questionId === 'step4.holder.legalAddress.line1') next.holder.legalAddress.line1 = String(answer ?? '');
  if (questionId === 'step4.holder.legalAddress.city') next.holder.legalAddress.city = String(answer ?? '');
  if (questionId === 'step4.holder.legalAddress.stateProvince') next.holder.legalAddress.stateProvince = String(answer ?? '');
  if (questionId === 'step4.holder.legalAddress.postalCode') next.holder.legalAddress.postalCode = String(answer ?? '');
  if (questionId === 'step4.holder.mailingAddress') {
    next.holder.mailingAddress = answer as InvestorProfileStepFourFields['holder']['mailingAddress'];
  }
  if (questionId === 'step4.holder.mailingAddress.line1') next.holder.mailingAddress.line1 = String(answer ?? '');
  if (questionId === 'step4.holder.mailingAddress.city') next.holder.mailingAddress.city = String(answer ?? '');
  if (questionId === 'step4.holder.mailingAddress.stateProvince') next.holder.mailingAddress.stateProvince = String(answer ?? '');
  if (questionId === 'step4.holder.mailingAddress.postalCode') next.holder.mailingAddress.postalCode = String(answer ?? '');
  if (questionId === 'step4.holder.employment.occupation') next.holder.employment.occupation = String(answer ?? '');
  if (questionId === 'step4.holder.employment.yearsEmployed') {
    next.holder.employment.yearsEmployed = answer === '' || answer === null ? null : Number(answer);
  }
  if (questionId === 'step4.holder.employment.typeOfBusiness') next.holder.employment.typeOfBusiness = String(answer ?? '');
  if (questionId === 'step4.holder.employment.employerName') next.holder.employment.employerName = String(answer ?? '');
  if (questionId === 'step4.holder.employment.employerAddress.line1') next.holder.employment.employerAddress.line1 = String(answer ?? '');
  if (questionId === 'step4.holder.employment.employerAddress.city') next.holder.employment.employerAddress.city = String(answer ?? '');
  if (questionId === 'step4.holder.employment.employerAddress.stateProvince') next.holder.employment.employerAddress.stateProvince = String(answer ?? '');
  if (questionId === 'step4.holder.employment.employerAddress.postalCode') next.holder.employment.employerAddress.postalCode = String(answer ?? '');
  if (questionId === 'step4.investment.byType.other.label') next.investmentKnowledge.byType.other.label = String(answer ?? '');

  if (questionId === 'step4.holder.legalAddress.country') {
    const list = answer as string[];
    next.holder.legalAddress.country = list[0] ?? null;
  }
  if (questionId === 'step4.holder.mailingAddress.country') {
    const list = answer as string[];
    next.holder.mailingAddress.country = list[0] ?? null;
  }
  if (questionId === 'step4.holder.citizenship.primary') next.holder.citizenship.primary = answer as string[];
  if (questionId === 'step4.holder.citizenship.additional') next.holder.citizenship.additional = answer as string[];
  if (questionId === 'step4.holder.employment.employerAddress.country') {
    const list = answer as string[];
    next.holder.employment.employerAddress.country = list[0] ?? null;
  }

  if (questionId === 'step4.financial.annualIncomeRange') {
    next.financialInformation.annualIncomeRange = answer as InvestorProfileStepFourFields['financialInformation']['annualIncomeRange'];
  }
  if (questionId === 'step4.financial.netWorthExPrimaryResidenceRange') {
    next.financialInformation.netWorthExPrimaryResidenceRange = answer as InvestorProfileStepFourFields['financialInformation']['netWorthExPrimaryResidenceRange'];
  }
  if (questionId === 'step4.financial.liquidNetWorthRange') {
    next.financialInformation.liquidNetWorthRange = answer as InvestorProfileStepFourFields['financialInformation']['liquidNetWorthRange'];
  }
  if (questionId === 'step4.investment.knowledgeExperience') {
    next.investmentKnowledge = answer as InvestorProfileStepFourFields['investmentKnowledge'];
  }
  if (questionId === 'step4.govId.photoId1') {
    next.governmentIdentification.photoId1 = answer as InvestorProfileStepFourFields['governmentIdentification']['photoId1'];
  }
  if (questionId === 'step4.govId.photoId2') {
    next.governmentIdentification.photoId2 = answer as InvestorProfileStepFourFields['governmentIdentification']['photoId2'];
  }

  if (questionId === 'step4.disclosure.relatedAdvisorFirmEmployee') {
    const payload = answer as {
      selection: YesNoMap;
      advisorEmployeeName: string;
      advisorEmployeeRelationship: string;
    };

    next.affiliations.relatedAdvisorFirmEmployee = payload.selection;
    next.affiliations.advisorEmployeeName = payload.advisorEmployeeName;
    next.affiliations.advisorEmployeeRelationship = payload.advisorEmployeeRelationship;
  }

  if (questionId === 'step4.disclosure.employeeBrokerDealer') {
    const payload = answer as {
      selection: YesNoMap;
      brokerDealerName: string;
    };

    next.affiliations.employeeBrokerDealer = payload.selection;
    next.affiliations.brokerDealerName = payload.brokerDealerName;
  }

  if (questionId === 'step4.disclosure.relatedBrokerDealerEmployee') {
    const payload = answer as {
      selection: YesNoMap;
      relatedBrokerDealerName: string;
      relatedBrokerDealerEmployeeName: string;
      relatedBrokerDealerRelationship: string;
    };

    next.affiliations.relatedBrokerDealerEmployee = payload.selection;
    next.affiliations.relatedBrokerDealerName = payload.relatedBrokerDealerName;
    next.affiliations.relatedBrokerDealerEmployeeName = payload.relatedBrokerDealerEmployeeName;
    next.affiliations.relatedBrokerDealerRelationship = payload.relatedBrokerDealerRelationship;
  }

  if (questionId === 'step4.disclosure.maintainsOtherBrokerageAccounts') {
    const payload = answer as {
      selection: YesNoMap;
      otherBrokerageFirms: string;
      yearsOfInvestmentExperience: number | '';
    };

    next.affiliations.maintainsOtherBrokerageAccounts = payload.selection;
    next.affiliations.otherBrokerageFirms = payload.otherBrokerageFirms;
    next.affiliations.yearsOfInvestmentExperience =
      payload.yearsOfInvestmentExperience === '' ? null : Number(payload.yearsOfInvestmentExperience);
  }

  if (questionId === 'step4.disclosure.exchangeOrFinraAffiliation') {
    const payload = answer as {
      selection: YesNoMap;
      affiliationDetails: string;
    };

    next.affiliations.exchangeOrFinraAffiliation = payload.selection;
    next.affiliations.affiliationDetails = payload.affiliationDetails;
  }

  if (questionId === 'step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany') {
    const payload = answer as {
      selection: YesNoMap;
      publicCompanyNames: string;
    };

    next.affiliations.seniorOfficerDirectorTenPercentPublicCompany = payload.selection;
    next.affiliations.publicCompanyNames = payload.publicCompanyNames;
  }

  const investmentTypeKnowledge = getInvestmentTypeFromQuestionId(questionId, 'knowledge');
  if (investmentTypeKnowledge) {
    next.investmentKnowledge.byType[investmentTypeKnowledge].knowledge = answer as InvestorProfileStepFourFields['investmentKnowledge']['general'];
  }

  const investmentTypeYear = getInvestmentTypeFromQuestionId(questionId, 'sinceYear');
  if (investmentTypeYear) {
    next.investmentKnowledge.byType[investmentTypeYear].sinceYear =
      answer === '' || answer === null ? null : Number(answer);
  }

  return next;
}

export function InvestorProfileStep4Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<InvestorProfileStepFourFields>(createEmptyStep4Fields());
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<InvestorProfileStepFourQuestionId[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<InvestorProfileStepFourQuestionId | null>(null);
  const [countryQuery, setCountryQuery] = useState('');

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      setError('Invalid client identifier.');
      return;
    }

    const loadStep = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiRequest<InvestorProfileStepFourResponse>(
          `/api/clients/${clientId}/investor-profile/step-4`
        );
        setFields(response.onboarding.step.fields);
        setVisibleQuestionIds(response.onboarding.step.visibleQuestionIds);
        setCurrentQuestionId(response.onboarding.step.currentQuestionId);
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.statusCode === 401) {
          await signOut();
          navigate('/signin', { replace: true });
          return;
        }

        if (requestError instanceof ApiError && requestError.statusCode === 404) {
          setError('Client onboarding was not found.');
          return;
        }

        setError('Unable to load Step 4 right now. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    void loadStep();
  }, [clientId, navigate, signOut]);

  const activeQuestion = useMemo(
    () => (currentQuestionId ? QUESTION_CONFIG[currentQuestionId] ?? null : null),
    [currentQuestionId]
  );

  const currentQuestionIndex = useMemo(
    () => findQuestionIndex(currentQuestionId, visibleQuestionIds),
    [currentQuestionId, visibleQuestionIds]
  );

  const progressPercent = useMemo(() => {
    if (visibleQuestionIds.length === 0) {
      return 0;
    }
    return ((currentQuestionIndex + 1) / visibleQuestionIds.length) * 100;
  }, [currentQuestionIndex, visibleQuestionIds]);

  const questionError = useMemo(() => {
    if (!currentQuestionId) {
      return null;
    }
    return getErrorForQuestion(currentQuestionId, fieldErrors);
  }, [currentQuestionId, fieldErrors]);

  const isPersonHolder = fields.holder.kind.person;

  const onBack = () => {
    if (!currentQuestionId || saving) {
      return;
    }

    const index = visibleQuestionIds.indexOf(currentQuestionId);
    if (index <= 0) {
      return;
    }

    setFieldErrors({});
    setError(null);
    setCurrentQuestionId(visibleQuestionIds[index - 1]);
  };

  const currentAnswer = useMemo(() => {
    if (!currentQuestionId) {
      return null;
    }
    return getAnswer(fields, currentQuestionId);
  }, [fields, currentQuestionId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!clientId || !currentQuestionId) {
      setError('Invalid client identifier.');
      return;
    }

    const payload: InvestorProfileStepFourUpdateRequest = {
      questionId: currentQuestionId,
      answer: currentAnswer,
      clientCursor: {
        currentQuestionId
      }
    };

    setSaving(true);
    setFieldErrors({});
    setError(null);

    try {
      const response = await apiRequest<InvestorProfileStepFourResponse>(
        `/api/clients/${clientId}/investor-profile/step-4`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      setFields(response.onboarding.step.fields);
      setVisibleQuestionIds(response.onboarding.step.visibleQuestionIds);
      setCurrentQuestionId(response.onboarding.step.currentQuestionId);

      const responseIndex = response.onboarding.step.visibleQuestionIds.indexOf(
        response.onboarding.step.currentQuestionId
      );
      const isStillLastQuestion =
        responseIndex === response.onboarding.step.visibleQuestionIds.length - 1 &&
        response.onboarding.step.currentQuestionId === currentQuestionId;

      if (isStillLastQuestion) {
        pushToast('Step 4 saved.');
        navigate(`/clients/${clientId}/investor-profile/step-5`, { replace: true });
      }
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFieldErrors(requestError.fieldErrors ?? {});
        setError(requestError.message);
      } else {
        setError('Unable to save this answer right now.');
      }
    } finally {
      setSaving(false);
    }
  };

  const renderYesNoChoice = (
    value: YesNoMap,
    onChange: (selection: YesNoMap) => void
  ) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { key: 'yes', label: 'Yes' },
        { key: 'no', label: 'No' }
      ].map((option) => {
        const selected = value[option.key as keyof YesNoMap];

        return (
          <button
            key={option.key}
            className={`rounded-2xl border px-4 py-4 text-left text-sm transition ${
              selected
                ? 'border-accent bg-accentSoft text-ink'
                : 'border-line bg-paper text-ink hover:border-black/40'
            }`}
            type="button"
            onClick={() => {
              onChange({ yes: option.key === 'yes', no: option.key === 'no' });
              setFieldErrors({});
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const renderCountryPicker = () => {
    if (!currentQuestionId) {
      return null;
    }

    const selected = Array.isArray(currentAnswer)
      ? (currentAnswer as string[])
      : typeof currentAnswer === 'string' && currentAnswer
        ? [currentAnswer]
        : [];
    const filtered = COUNTRY_OPTIONS.filter((country) => {
      const search = countryQuery.trim().toLowerCase();
      if (!search) {
        return true;
      }

      return (
        country.code.toLowerCase().includes(search) || country.label.toLowerCase().includes(search)
      );
    });

    const singleCountry =
      currentQuestionId === 'step4.holder.legalAddress.country' ||
      currentQuestionId === 'step4.holder.mailingAddress.country' ||
      currentQuestionId === 'step4.holder.employment.employerAddress.country' ||
      (currentQuestionId === 'step4.holder.citizenship.primary' && !isPersonHolder);

    return (
      <div className="rounded-3xl border border-line bg-paper p-5 shadow-hairline">
        <input
          className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
          placeholder="Search country by name or code"
          value={countryQuery}
          onChange={(event) => setCountryQuery(event.target.value)}
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {selected.map((code) => (
            <span key={code} className="rounded-full border border-line bg-white px-3 py-1 text-xs text-ink">
              {code}
            </span>
          ))}
          {selected.length === 0 && <span className="text-xs text-mute">No country selected.</span>}
        </div>

        <div className="mt-4 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
          {filtered.map((country) => {
            const isSelected = selected.includes(country.code);

            return (
              <button
                key={country.code}
                className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  isSelected
                    ? 'border-accent bg-accentSoft text-ink'
                    : 'border-line bg-white text-ink hover:border-black/40'
                }`}
                type="button"
                onClick={() => {
                  const next = isSelected
                    ? selected.filter((code) => code !== country.code)
                    : singleCountry
                      ? [country.code]
                      : [...selected, country.code];

                  if (currentQuestionId) {
                    setFields((current) => applyAnswer(current, currentQuestionId, next));
                    setFieldErrors({});
                  }
                }}
              >
                {country.label} ({country.code})
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderRangeControl = () => {
    const answer = currentAnswer as {
      fromBracket: InvestorProfileFinancialRangeBracket | null;
      toBracket: InvestorProfileFinancialRangeBracket | null;
    };

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-mute">From</p>
          <select
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm"
            value={answer.fromBracket ?? ''}
            onChange={(event) => {
              if (!currentQuestionId) return;
              setFields((current) =>
                applyAnswer(current, currentQuestionId, {
                  ...answer,
                  fromBracket: event.target.value || null
                })
              );
            }}
          >
            <option value="">Select range</option>
            {RANGE_BRACKET_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-mute">To</p>
          <select
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm"
            value={answer.toBracket ?? ''}
            onChange={(event) => {
              if (!currentQuestionId) return;
              setFields((current) =>
                applyAnswer(current, currentQuestionId, {
                  ...answer,
                  toBracket: event.target.value || null
                })
              );
            }}
          >
            <option value="">Select range</option>
            {RANGE_BRACKET_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };

  const renderPhonesBlock = () => {
    const answer = currentAnswer as InvestorProfileStepFourFields['holder']['contact']['phones'];

    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-mute">Home</p>
          <input
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm"
            placeholder="Home phone"
            value={answer.home ?? ''}
            onChange={(event) => {
              if (!currentQuestionId) return;
              setFields((current) =>
                applyAnswer(current, currentQuestionId, {
                  ...answer,
                  home: event.target.value
                })
              );
            }}
          />
        </label>

        <label className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-mute">Business</p>
          <input
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm"
            placeholder="Business phone"
            value={answer.business ?? ''}
            onChange={(event) => {
              if (!currentQuestionId) return;
              setFields((current) =>
                applyAnswer(current, currentQuestionId, {
                  ...answer,
                  business: event.target.value
                })
              );
            }}
          />
        </label>

        <label className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-mute">Mobile</p>
          <input
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm"
            placeholder="Mobile phone"
            value={answer.mobile ?? ''}
            onChange={(event) => {
              if (!currentQuestionId) return;
              setFields((current) =>
                applyAnswer(current, currentQuestionId, {
                  ...answer,
                  mobile: event.target.value
                })
              );
            }}
          />
        </label>
      </div>
    );
  };

  const renderAddressBlock = () => {
    const answer = currentAnswer as InvestorProfileStepFourFields['holder']['legalAddress'];
    const isLegalAddress = currentQuestionId === 'step4.holder.legalAddress';

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="rounded-2xl border border-line bg-paper p-4 sm:col-span-2">
          <p className="text-xs uppercase tracking-[0.14em] text-mute">Street Address</p>
          <input
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm"
            placeholder={isLegalAddress ? 'Legal street address' : 'Mailing street address'}
            value={answer.line1 ?? ''}
            onChange={(event) => {
              if (!currentQuestionId) return;
              setFields((current) =>
                applyAnswer(current, currentQuestionId, {
                  ...answer,
                  line1: event.target.value
                })
              );
            }}
          />
        </label>

        <label className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-mute">City</p>
          <input
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm"
            placeholder="City"
            value={answer.city ?? ''}
            onChange={(event) => {
              if (!currentQuestionId) return;
              setFields((current) =>
                applyAnswer(current, currentQuestionId, {
                  ...answer,
                  city: event.target.value
                })
              );
            }}
          />
        </label>

        <label className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-mute">State/Province</p>
          <input
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm"
            placeholder="State/Province"
            value={answer.stateProvince ?? ''}
            onChange={(event) => {
              if (!currentQuestionId) return;
              setFields((current) =>
                applyAnswer(current, currentQuestionId, {
                  ...answer,
                  stateProvince: event.target.value
                })
              );
            }}
          />
        </label>

        <label className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-mute">ZIP/Postal Code</p>
          <input
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm"
            placeholder="ZIP/Postal code"
            value={answer.postalCode ?? ''}
            onChange={(event) => {
              if (!currentQuestionId) return;
              setFields((current) =>
                applyAnswer(current, currentQuestionId, {
                  ...answer,
                  postalCode: event.target.value
                })
              );
            }}
          />
        </label>

        <label className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-mute">Country</p>
          <select
            className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-3 text-sm"
            value={answer.country ?? ''}
            onChange={(event) => {
              if (!currentQuestionId) return;
              setFields((current) =>
                applyAnswer(current, currentQuestionId, {
                  ...answer,
                  country: event.target.value || null
                })
              );
            }}
          >
            <option value="">Select country</option>
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label} ({country.code})
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  };

  const renderInvestmentKnowledgeBlock = () => {
    const answer = currentAnswer as InvestorProfileStepFourFields['investmentKnowledge'];

    const getSelection = (map: InvestorProfileStepFourFields['investmentKnowledge']['general']) =>
      (Object.entries(map).find(([, selected]) => selected)?.[0] as keyof typeof map | undefined) ?? null;

    return (
      <div className="space-y-5 rounded-3xl border border-line bg-paper p-5 shadow-hairline">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mute">Overall Knowledge</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {KNOWLEDGE_OPTIONS.map((option) => {
              const selected = answer.general[option.key];
              return (
                <button
                  key={option.key}
                  className={`rounded-2xl border px-4 py-3 text-sm transition ${
                    selected
                      ? 'border-accent bg-accentSoft text-ink'
                      : 'border-line bg-white text-ink hover:border-black/40'
                  }`}
                  type="button"
                  onClick={() => {
                    if (!currentQuestionId) return;
                    setFields((current) => {
                      const payload = structuredClone(current.investmentKnowledge);
                      selectOne(payload.general, option.key);
                      return applyAnswer(current, currentQuestionId, payload);
                    });
                    setFieldErrors({});
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          {INVESTMENT_TYPES.map((type) => {
            const byType = answer.byType[type.key];
            const knowledgeSelection = getSelection(byType.knowledge);
            const showSinceYear = knowledgeSelection !== null && knowledgeSelection !== 'none';

            return (
              <div key={type.key} className="rounded-2xl border border-line bg-white p-4">
                <p className="text-sm font-medium text-ink">{type.label}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  {KNOWLEDGE_OPTIONS.map((option) => {
                    const selected = byType.knowledge[option.key];
                    return (
                      <button
                        key={option.key}
                        className={`rounded-xl border px-3 py-2 text-xs uppercase tracking-[0.12em] transition ${
                          selected
                            ? 'border-accent bg-accentSoft text-ink'
                            : 'border-line bg-paper text-mute hover:border-black/40'
                        }`}
                        type="button"
                        onClick={() => {
                          if (!currentQuestionId) return;
                          setFields((current) => {
                            const payload = structuredClone(current.investmentKnowledge);
                            selectOne(payload.byType[type.key].knowledge, option.key);
                            return applyAnswer(current, currentQuestionId, payload);
                          });
                          setFieldErrors({});
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {showSinceYear && (
                  <label className="mt-3 block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Since Year</span>
                    <input
                      className="w-full rounded-xl border border-line bg-paper px-3 py-3 text-sm"
                      min={1900}
                      type="number"
                      value={byType.sinceYear ?? ''}
                      onChange={(event) => {
                        if (!currentQuestionId) return;
                        const nextValue = event.target.value === '' ? null : Number(event.target.value);
                        setFields((current) => {
                          const payload = structuredClone(current.investmentKnowledge);
                          payload.byType[type.key].sinceYear = nextValue;
                          return applyAnswer(current, currentQuestionId, payload);
                        });
                      }}
                    />
                  </label>
                )}

                {type.key === 'other' && showSinceYear && (
                  <label className="mt-3 block">
                    <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Other Type</span>
                    <input
                      className="w-full rounded-xl border border-line bg-paper px-3 py-3 text-sm"
                      placeholder="Describe other investment type"
                      value={answer.byType.other.label ?? ''}
                      onChange={(event) => {
                        if (!currentQuestionId) return;
                        setFields((current) => {
                          const payload = structuredClone(current.investmentKnowledge);
                          payload.byType.other.label = event.target.value;
                          return applyAnswer(current, currentQuestionId, payload);
                        });
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPhotoIdBlock = () => {
    const answer = currentAnswer as {
      type: string | null;
      idNumber: string | null;
      countryOfIssue: string | null;
      dateOfIssue: string | null;
      dateOfExpiration: string | null;
    };

    const context = fields.governmentIdentification.requirementContext;
    const requiresDocumentaryId =
      context.requiresDocumentaryId === true || context.isNonResidentAlien === true;
    const hasUnknownVerificationFlags =
      context.requiresDocumentaryId === null && context.isNonResidentAlien === null;

    return (
      <div className="space-y-4 rounded-3xl border border-line bg-paper p-5">
        {hasUnknownVerificationFlags && (
          <p className="rounded-xl border border-black/15 bg-white px-3 py-2 text-xs text-mute">
            Documentary ID requiredness flags are not available yet. You can continue, but we still recommend providing ID details now.
          </p>
        )}
        {requiresDocumentaryId && (
          <p className="rounded-xl border border-black/15 bg-white px-3 py-2 text-xs text-mute">
            At least one complete, unexpired government photo ID is required for this account.
          </p>
        )}

        <input
          className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm"
          placeholder="Type of unexpired photo ID"
          value={answer.type ?? ''}
          onChange={(event) => {
            if (!currentQuestionId) return;
            setFields((current) => applyAnswer(current, currentQuestionId, { ...answer, type: event.target.value }));
          }}
        />

        <input
          className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm"
          placeholder="ID number"
          value={answer.idNumber ?? ''}
          onChange={(event) => {
            if (!currentQuestionId) return;
            setFields((current) => applyAnswer(current, currentQuestionId, { ...answer, idNumber: event.target.value }));
          }}
        />

        <select
          className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm"
          value={answer.countryOfIssue ?? ''}
          onChange={(event) => {
            if (!currentQuestionId) return;
            setFields((current) =>
              applyAnswer(current, currentQuestionId, {
                ...answer,
                countryOfIssue: event.target.value || null
              })
            );
          }}
        >
          <option value="">Country of issue</option>
          {COUNTRY_OPTIONS.map((country) => (
            <option key={country.code} value={country.code}>
              {country.label} ({country.code})
            </option>
          ))}
        </select>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-xs text-mute">Date of issue</p>
            <input
              className="mt-2 w-full text-sm"
              type="date"
              value={answer.dateOfIssue ?? ''}
              onChange={(event) => {
                if (!currentQuestionId) return;
                setFields((current) =>
                  applyAnswer(current, currentQuestionId, {
                    ...answer,
                    dateOfIssue: event.target.value || null
                  })
                );
              }}
            />
          </label>

          <label className="rounded-2xl border border-line bg-white px-4 py-3">
            <p className="text-xs text-mute">Date of expiration</p>
            <input
              className="mt-2 w-full text-sm"
              type="date"
              value={answer.dateOfExpiration ?? ''}
              onChange={(event) => {
                if (!currentQuestionId) return;
                setFields((current) =>
                  applyAnswer(current, currentQuestionId, {
                    ...answer,
                    dateOfExpiration: event.target.value || null
                  })
                );
              }}
            />
          </label>
        </div>
      </div>
    );
  };

  const renderActiveControl = () => {
    if (!activeQuestion || !currentQuestionId) {
      return null;
    }

    if (activeQuestion.type === 'single-choice-cards' && activeQuestion.options) {
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          {activeQuestion.options.map((option) => {
            const answer = currentAnswer as Record<string, boolean>;
            const selected = answer?.[option.key] ?? false;

            return (
              <button
                key={option.key}
                className={`rounded-3xl border px-6 py-6 text-left transition ${
                  selected
                    ? 'border-accent bg-accentSoft text-ink shadow-hairline'
                    : 'border-line bg-paper text-ink hover:border-black/40'
                }`}
                type="button"
                onClick={() => {
                  setFields((current) => setSingleChoice(current, currentQuestionId, option.key));
                  setFieldErrors({});
                }}
              >
                <p className="text-xs uppercase tracking-[0.16em] text-mute">Select One</p>
                <p className="mt-2 text-2xl font-light">{option.label}</p>
              </button>
            );
          })}
        </div>
      );
    }

    if (activeQuestion.type === 'phones-block') {
      return renderPhonesBlock();
    }

    if (activeQuestion.type === 'address-block') {
      return renderAddressBlock();
    }

    if (activeQuestion.type === 'investment-knowledge-block') {
      return renderInvestmentKnowledgeBlock();
    }

    if (activeQuestion.type === 'country-multi') {
      return renderCountryPicker();
    }

    if (activeQuestion.type === 'range-bracket') {
      return renderRangeControl();
    }

    if (activeQuestion.type === 'photo-id-block') {
      return renderPhotoIdBlock();
    }

    if (activeQuestion.type === 'date') {
      return (
        <input
          className="w-full rounded-3xl border border-line bg-paper px-6 py-5 text-2xl font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
          type="date"
          value={typeof currentAnswer === 'string' ? currentAnswer : ''}
          onChange={(event) => {
            setFields((current) => applyAnswer(current, currentQuestionId, event.target.value));
          }}
        />
      );
    }

    if (activeQuestion.type === 'number') {
      return (
        <input
          className="w-full rounded-3xl border border-line bg-paper px-6 py-5 text-2xl font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
          min={0}
          type="number"
          value={
            typeof currentAnswer === 'number'
              ? currentAnswer
              : currentAnswer === ''
                ? ''
                : String(currentAnswer)
          }
          onChange={(event) => {
            const raw = event.target.value;
            setFields((current) => applyAnswer(current, currentQuestionId, raw === '' ? '' : Number(raw)));
          }}
        />
      );
    }

    if (activeQuestion.type === 'disclosure-related-advisor') {
      const answer = currentAnswer as {
        selection: YesNoMap;
        advisorEmployeeName: string;
        advisorEmployeeRelationship: string;
      };

      return (
        <div className="space-y-4">
          {renderYesNoChoice(answer.selection, (selection) => {
            setFields((current) => applyAnswer(current, currentQuestionId, { ...answer, selection }));
          })}
          {answer.selection.yes && (
            <>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
                placeholder="Employee name"
                value={answer.advisorEmployeeName}
                onChange={(event) =>
                  setFields((current) =>
                    applyAnswer(current, currentQuestionId, { ...answer, advisorEmployeeName: event.target.value })
                  )
                }
              />
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
                placeholder="Relationship"
                value={answer.advisorEmployeeRelationship}
                onChange={(event) =>
                  setFields((current) =>
                    applyAnswer(current, currentQuestionId, {
                      ...answer,
                      advisorEmployeeRelationship: event.target.value
                    })
                  )
                }
              />
            </>
          )}
        </div>
      );
    }

    if (activeQuestion.type === 'disclosure-employee-broker') {
      const answer = currentAnswer as { selection: YesNoMap; brokerDealerName: string };
      return (
        <div className="space-y-4">
          {renderYesNoChoice(answer.selection, (selection) => {
            setFields((current) => applyAnswer(current, currentQuestionId, { ...answer, selection }));
          })}
          {answer.selection.yes && (
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
              placeholder="Broker dealer name"
              value={answer.brokerDealerName}
              onChange={(event) =>
                setFields((current) =>
                  applyAnswer(current, currentQuestionId, { ...answer, brokerDealerName: event.target.value })
                )
              }
            />
          )}
        </div>
      );
    }

    if (activeQuestion.type === 'disclosure-related-broker') {
      const answer = currentAnswer as {
        selection: YesNoMap;
        relatedBrokerDealerName: string;
        relatedBrokerDealerEmployeeName: string;
        relatedBrokerDealerRelationship: string;
      };
      return (
        <div className="space-y-4">
          {renderYesNoChoice(answer.selection, (selection) => {
            setFields((current) => applyAnswer(current, currentQuestionId, { ...answer, selection }));
          })}
          {answer.selection.yes && (
            <>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
                placeholder="Broker dealer name"
                value={answer.relatedBrokerDealerName}
                onChange={(event) =>
                  setFields((current) =>
                    applyAnswer(current, currentQuestionId, { ...answer, relatedBrokerDealerName: event.target.value })
                  )
                }
              />
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
                placeholder="Employee name"
                value={answer.relatedBrokerDealerEmployeeName}
                onChange={(event) =>
                  setFields((current) =>
                    applyAnswer(current, currentQuestionId, {
                      ...answer,
                      relatedBrokerDealerEmployeeName: event.target.value
                    })
                  )
                }
              />
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
                placeholder="Relationship"
                value={answer.relatedBrokerDealerRelationship}
                onChange={(event) =>
                  setFields((current) =>
                    applyAnswer(current, currentQuestionId, {
                      ...answer,
                      relatedBrokerDealerRelationship: event.target.value
                    })
                  )
                }
              />
            </>
          )}
        </div>
      );
    }

    if (activeQuestion.type === 'disclosure-other-brokerage') {
      const answer = currentAnswer as {
        selection: YesNoMap;
        otherBrokerageFirms: string;
        yearsOfInvestmentExperience: number | '';
      };
      return (
        <div className="space-y-4">
          {renderYesNoChoice(answer.selection, (selection) => {
            setFields((current) => applyAnswer(current, currentQuestionId, { ...answer, selection }));
          })}
          {answer.selection.yes && (
            <>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
                placeholder="Other brokerage firm(s)"
                value={answer.otherBrokerageFirms}
                onChange={(event) =>
                  setFields((current) =>
                    applyAnswer(current, currentQuestionId, { ...answer, otherBrokerageFirms: event.target.value })
                  )
                }
              />
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
                min={0}
                placeholder="Years of investment experience"
                type="number"
                value={answer.yearsOfInvestmentExperience}
                onChange={(event) =>
                  setFields((current) =>
                    applyAnswer(current, currentQuestionId, {
                      ...answer,
                      yearsOfInvestmentExperience:
                        event.target.value === '' ? '' : Number(event.target.value)
                    })
                  )
                }
              />
            </>
          )}
        </div>
      );
    }

    if (activeQuestion.type === 'disclosure-exchange-finra') {
      const answer = currentAnswer as { selection: YesNoMap; affiliationDetails: string };
      return (
        <div className="space-y-4">
          {renderYesNoChoice(answer.selection, (selection) => {
            setFields((current) => applyAnswer(current, currentQuestionId, { ...answer, selection }));
          })}
          {answer.selection.yes && (
            <textarea
              className="h-32 w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
              placeholder="Affiliation details"
              value={answer.affiliationDetails}
              onChange={(event) =>
                setFields((current) =>
                  applyAnswer(current, currentQuestionId, { ...answer, affiliationDetails: event.target.value })
                )
              }
            />
          )}
        </div>
      );
    }

    if (activeQuestion.type === 'disclosure-public-company') {
      const answer = currentAnswer as { selection: YesNoMap; publicCompanyNames: string };
      return (
        <div className="space-y-4">
          {renderYesNoChoice(answer.selection, (selection) => {
            setFields((current) => applyAnswer(current, currentQuestionId, { ...answer, selection }));
          })}
          {answer.selection.yes && (
            <textarea
              className="h-32 w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm"
              placeholder="Company name(s)"
              value={answer.publicCompanyNames}
              onChange={(event) =>
                setFields((current) =>
                  applyAnswer(current, currentQuestionId, { ...answer, publicCompanyNames: event.target.value })
                )
              }
            />
          )}
        </div>
      );
    }

    return (
      <input
        className="w-full rounded-3xl border border-line bg-paper px-6 py-5 text-2xl font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
        placeholder={activeQuestion.placeholder}
        value={typeof currentAnswer === 'string' ? currentAnswer : ''}
        onChange={(event) => {
          setFields((current) => applyAnswer(current, currentQuestionId, event.target.value));
        }}
      />
    );
  };

  const dynamicTitle =
    currentQuestionId === 'step4.holder.citizenship.primary'
      ? isPersonHolder
        ? 'Primary citizenship(s)?'
        : 'Primary country of formation?'
      : currentQuestionId === 'step4.holder.citizenship.additional'
        ? isPersonHolder
          ? 'Any additional citizenships?'
          : 'Any additional jurisdictions?'
        : activeQuestion?.title ?? 'Loading question...';

  return (
    <main className="min-h-screen bg-fog text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-10 pt-8 sm:px-12 sm:pt-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.16em] text-mute transition hover:border-black hover:text-ink"
              type="button"
              onClick={() => navigate(clientId ? `/clients/${clientId}/investor-profile/step-3` : '/dashboard')}
            >
              Back to Step 3
            </button>
            <button
              className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.16em] text-mute transition hover:border-black hover:text-ink"
              type="button"
              onClick={() => navigate('/dashboard')}
            >
              Dashboard
            </button>
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-mute">
            {visibleQuestionIds.length > 0
              ? `Question ${currentQuestionIndex + 1} / ${visibleQuestionIds.length}`
              : 'Question 0 / 0'}
          </p>
        </header>

        <div className="mt-6 h-[3px] w-full rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <section className="flex flex-1 flex-col justify-center py-10 sm:py-14">
          <p className="text-xs uppercase tracking-[0.22em] text-accent">
            STEP 4. SECONDARY ACCOUNT HOLDER INFORMATION (Joint Holder #2, Trustee #1, Entity Manager)
          </p>
          <h1 className="mt-5 max-w-5xl text-4xl font-light tracking-tight sm:text-6xl lg:text-7xl">
            {dynamicTitle}
          </h1>
          <p className="mt-6 max-w-3xl text-base font-light leading-relaxed text-mute sm:text-lg">
            {activeQuestion?.helper ?? 'Please wait while we load your onboarding flow.'}
          </p>

          <form className="mt-10 max-w-5xl" onSubmit={handleSubmit}>
            {renderActiveControl()}

            {questionError && <p className="mt-3 text-sm text-black">{questionError}</p>}

            {error && (
              <p className="mt-5 rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">{error}</p>
            )}

            <div className="mt-8 flex items-center gap-3">
              <button
                className="rounded-full border border-line px-5 py-3 text-sm text-ink transition hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentQuestionIndex === 0 || saving || loading}
                type="button"
                onClick={onBack}
              >
                Back
              </button>

              <button
                className="rounded-full bg-accent px-6 py-3 text-sm uppercase tracking-[0.14em] text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
                disabled={saving || loading || !activeQuestion}
                type="submit"
              >
                {saving
                  ? 'Saving...'
                  : currentQuestionIndex === visibleQuestionIds.length - 1
                    ? 'Continue to Step 5'
                    : 'Continue'}
              </button>

              {loading && <span className="text-sm text-mute">Loading current progress...</span>}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

