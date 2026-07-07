/**
 * Seed one realistic, internally consistent dummy client across the full
 * five-form package:
 * - INVESTOR_PROFILE
 * - SFC
 * - BAIODF
 * - BAIV_506C
 * - REG_D_506C_SUBSCRIPTION
 *
 * Usage:
 *   pnpm --dir backend exec tsx src/scripts/seed-accurate-dummy-five-form-client.ts
 *   pnpm --dir backend exec tsx src/scripts/seed-accurate-dummy-five-form-client.ts --owner-email admin@taxalpha.test
 */
import 'dotenv/config';

import {
  BrokerKind,
  BrokerageAccreditedInvestorVerificationOnboardingStatus,
  BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus,
  ClientBrokerRole,
  InvestorProfileOnboardingStatus,
  Prisma,
  StatementOfFinancialConditionOnboardingStatus
} from '@prisma/client';

import {
  defaultStep1Fields,
  serializeStep1Fields,
  validateStep1Completion
} from '../lib/investor-profile-step1.js';
import {
  defaultStep2Fields,
  serializeStep2Fields,
  validateStep2Completion
} from '../lib/investor-profile-step2.js';
import {
  defaultStep3Fields,
  serializeStep3Fields,
  validateStep3Completion,
  type Step3Fields
} from '../lib/investor-profile-step3.js';
import {
  defaultStep4Fields,
  serializeStep4Fields,
  validateStep4Completion,
  type Step4Fields
} from '../lib/investor-profile-step4.js';
import {
  defaultStep5Fields,
  serializeStep5Fields,
  validateStep5Completion
} from '../lib/investor-profile-step5.js';
import {
  defaultStep6Fields,
  serializeStep6Fields,
  validateStep6Completion
} from '../lib/investor-profile-step6.js';
import {
  defaultStep7Fields,
  serializeStep7Fields,
  validateStep7Completion
} from '../lib/investor-profile-step7.js';
import {
  defaultSfcStep1Fields,
  getSfcStep1Totals,
  serializeSfcStep1Fields,
  validateSfcStep1Completion
} from '../lib/statement-of-financial-condition-step1.js';
import {
  defaultSfcStep2Fields,
  serializeSfcStep2Fields,
  validateSfcStep2Completion
} from '../lib/statement-of-financial-condition-step2.js';
import {
  defaultBaiodfStep1Fields,
  serializeBaiodfStep1Fields,
  validateBaiodfStep1Completion
} from '../lib/baiodf-step1.js';
import {
  defaultBaiodfStep2Fields,
  getBaiodfStep2Concentrations,
  serializeBaiodfStep2Fields,
  validateBaiodfStep2Completion
} from '../lib/baiodf-step2.js';
import {
  defaultBaiodfStep3Fields,
  serializeBaiodfStep3Fields,
  validateBaiodfStep3Completion
} from '../lib/baiodf-step3.js';
import {
  defaultBaiv506cStep1Fields,
  serializeBaiv506cStep1Fields,
  validateBaiv506cStep1Completion
} from '../lib/baiv-506c-step1.js';
import {
  defaultBaiv506cStep2Fields,
  serializeBaiv506cStep2Fields,
  validateBaiv506cStep2Completion
} from '../lib/baiv-506c-step2.js';
import {
  deriveContext,
  deriveDynamicFormStatus,
  mergeStepData,
  resolveFieldValuesV2,
  type Fields
} from '../lib/dynamic-step-engine.js';
import { FormSchemaV2, migrateV1ToV2, type FormSchemaV2 as FormSchemaV2Type } from '../lib/ingestion/schema-v2.js';
import { prisma } from '../lib/prisma.js';

const OWNER_EMAIL = 'anishsuman2305@gmail.com';
const CLIENT_EMAIL = 'blue-oak-growth.client@example.com';
const CLIENT_NAME = 'Blue Oak Growth LLC';
const CLIENT_PHONE = '(512) 555-0148';
const REG_D_FORM_CODE = 'REG_D_506C_SUBSCRIPTION';
const SIGN_DATE = '2026-06-30';
const RR_NAME = 'Anish Suman';
const RR_NO = 'RR-10482';
const ACCOUNT_NO = 'BOG-2026-001';
const BROKER_FIRM = 'Ridgeway Advisory Partners, LLC';
const SUPERVISOR_NAME = 'Morgan Lee';
const PRIMARY_SIGNER = 'Priya Shah, Managing Member';

const FORM_CODES = ['INVESTOR_PROFILE', 'SFC', 'BAIODF', 'BAIV_506C', REG_D_FORM_CODE] as const;

type OneHot = Record<string, boolean>;
type SignatureBlock = {
  typedSignature: string | null;
  printedName: string | null;
  date: string | null;
};
type DynamicSeed = {
  stepData: Record<number, Fields>;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  values: Record<string, unknown>;
};

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function one(map: OneHot, key: string): void {
  for (const current of Object.keys(map)) map[current] = current === key;
}

function many(map: OneHot, keys: string[]): void {
  const selected = new Set(keys);
  for (const current of Object.keys(map)) map[current] = selected.has(current);
}

function allTrue(map: OneHot): void {
  for (const current of Object.keys(map)) map[current] = true;
}

function signature(printedName: string, typedSignature = printedName, date = SIGN_DATE): SignatureBlock {
  return { typedSignature, printedName, date };
}

function assertNoErrors(label: string, errors: Record<string, string>): void {
  if (Object.keys(errors).length === 0) return;
  throw new Error(`${label} validation failed:\n${JSON.stringify(errors, null, 2)}`);
}

function setPath(obj: Fields, dotted: string, value: unknown): void {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    if (!cur[part] || typeof cur[part] !== 'object' || Array.isArray(cur[part])) cur[part] = {};
    cur = cur[part] as Fields;
  }
  cur[parts[parts.length - 1]!] = value;
}

function oneHot(keys: readonly string[], selected: string): Record<string, boolean> {
  return Object.fromEntries(keys.map((key) => [key, key === selected]));
}

function fillInvestmentKnowledge(
  fields: Pick<Step3Fields | Step4Fields, 'investmentKnowledge'>,
  overrides: Record<string, { level: 'limited' | 'moderate' | 'extensive' | 'none'; sinceYear?: number; label?: string }>
): void {
  one(fields.investmentKnowledge.general, 'extensive');
  for (const [typeKey, experience] of Object.entries(fields.investmentKnowledge.byType)) {
    const override = overrides[typeKey] ?? { level: 'none' as const };
    one(experience.knowledge, override.level);
    experience.sinceYear = override.level === 'none' ? null : (override.sinceYear ?? 2015);
    if ('label' in experience) {
      experience.label = override.level === 'none' ? null : (override.label ?? null);
    }
  }
}

function fillNoAffiliations(
  affiliations: Step3Fields['affiliations'] | Step4Fields['affiliations']
): void {
  one(affiliations.employeeAdvisorFirm, 'no');
  one(affiliations.relatedAdvisorFirmEmployee, 'no');
  one(affiliations.employeeBrokerDealer, 'no');
  one(affiliations.relatedBrokerDealerEmployee, 'no');
  one(affiliations.maintainsOtherBrokerageAccounts, 'no');
  one(affiliations.exchangeOrFinraAffiliation, 'no');
  one(affiliations.seniorOfficerDirectorTenPercentPublicCompany, 'no');
}

function buildInvestorProfile() {
  const step1 = defaultStep1Fields();
  step1.accountRegistration.rrName = RR_NAME;
  step1.accountRegistration.rrNo = RR_NO;
  step1.accountRegistration.customerNames = CLIENT_NAME;
  step1.accountRegistration.accountNo = ACCOUNT_NO;
  one(step1.accountRegistration.retailRetirement, 'retail');
  one(step1.typeOfAccount.primaryType, 'limitedLiabilityCompany');
  one(step1.typeOfAccount.llcDesignation, 'partnership');

  const step2 = defaultStep2Fields();
  many(step2.initialSourceOfFunds as unknown as OneHot, ['accumulatedSavings', 'investmentProceeds', 'saleOfBusiness']);

  const step3 = defaultStep3Fields();
  one(step3.holder.kind, 'entity');
  step3.holder.name = CLIENT_NAME;
  one(step3.holder.taxId.hasEin, 'yes');
  step3.holder.taxId.ein = '876543210';
  step3.holder.contact.email = CLIENT_EMAIL;
  step3.holder.contact.phones.business = '(512) 555-0148';
  step3.holder.legalAddress = {
    line1: '2100 South Congress Ave, Suite 305',
    city: 'Austin',
    stateProvince: 'TX',
    postalCode: '78704',
    country: 'US'
  };
  one(step3.holder.mailingDifferent, 'no');
  step3.holder.citizenship.primary = ['US'];
  fillInvestmentKnowledge(step3, {
    equities: { level: 'extensive', sinceYear: 2012 },
    fixedIncome: { level: 'moderate', sinceYear: 2016 },
    exchangeTradedFunds: { level: 'extensive', sinceYear: 2013 },
    mutualFunds: { level: 'extensive', sinceYear: 2011 },
    realEstate: { level: 'moderate', sinceYear: 2017 },
    alternativeInvestments: { level: 'extensive', sinceYear: 2018 },
    complexProducts: { level: 'moderate', sinceYear: 2019 }
  });
  step3.financialInformation.annualIncomeRange = { fromBracket: 500000, toBracket: 750000 };
  step3.financialInformation.netWorthExPrimaryResidenceRange = { fromBracket: 5000000, toBracket: 7500000 };
  step3.financialInformation.liquidNetWorthRange = { fromBracket: 3000000, toBracket: 5000000 };
  one(step3.financialInformation.taxBracket, 'bracket_32_1_50');
  step3.governmentIdentification.requirementContext = {
    requiresDocumentaryId: false,
    isNonResidentAlien: false
  };
  fillNoAffiliations(step3.affiliations);

  const step4 = defaultStep4Fields();
  one(step4.holder.kind, 'person');
  step4.holder.name = 'Priya Shah';
  step4.holder.taxId.ssn = '321549876';
  one(step4.holder.taxId.hasEin, 'no');
  step4.holder.contact.email = 'priya.shah@example.com';
  step4.holder.contact.dateOfBirth = '1982-11-14';
  step4.holder.contact.phones.mobile = '(512) 555-0199';
  step4.holder.legalAddress = {
    line1: '1846 Oakmont Drive',
    city: 'Austin',
    stateProvince: 'TX',
    postalCode: '78703',
    country: 'US'
  };
  one(step4.holder.mailingDifferent, 'no');
  step4.holder.citizenship.primary = ['US'];
  one(step4.holder.gender, 'female');
  one(step4.holder.maritalStatus, 'married');
  one(step4.holder.employment.status, 'selfEmployed');
  step4.holder.employment.occupation = 'Managing Member';
  step4.holder.employment.yearsEmployed = 11;
  step4.holder.employment.typeOfBusiness = 'Private investment holding company';
  step4.holder.employment.employerName = CLIENT_NAME;
  step4.holder.employment.employerAddress = step3.holder.legalAddress;
  fillInvestmentKnowledge(step4, {
    equities: { level: 'extensive', sinceYear: 2012 },
    fixedIncome: { level: 'moderate', sinceYear: 2016 },
    exchangeTradedFunds: { level: 'extensive', sinceYear: 2013 },
    mutualFunds: { level: 'extensive', sinceYear: 2011 },
    realEstate: { level: 'moderate', sinceYear: 2017 },
    alternativeInvestments: { level: 'extensive', sinceYear: 2018 },
    complexProducts: { level: 'moderate', sinceYear: 2019 }
  });
  step4.financialInformation.annualIncomeRange = { fromBracket: 400000, toBracket: 500000 };
  step4.financialInformation.netWorthExPrimaryResidenceRange = { fromBracket: 2500000, toBracket: 3000000 };
  step4.financialInformation.liquidNetWorthRange = { fromBracket: 1500000, toBracket: 2000000 };
  one(step4.financialInformation.taxBracket, 'bracket_32_1_50');
  step4.governmentIdentification.requirementContext = {
    requiresDocumentaryId: false,
    isNonResidentAlien: false
  };
  fillNoAffiliations(step4.affiliations);

  const step5 = defaultStep5Fields();
  one(step5.profile.riskExposure, 'speculation');
  many(step5.profile.accountObjectives, ['income', 'longTermGrowth']);
  step5.investments.fixedValues.marketIncome = {
    equities: 1750000,
    options: 0,
    fixedIncome: 950000,
    mutualFunds: 300000,
    unitInvestmentTrusts: 0,
    exchangeTradedFunds: 420000
  };
  step5.investments.fixedValues.alternativesInsurance = {
    realEstate: 1400000,
    insurance: 150000,
    variableAnnuities: 0,
    fixedAnnuities: 0,
    preciousMetals: 0,
    commoditiesFutures: 0
  };
  one(step5.investments.hasOther, 'yes');
  step5.investments.otherEntries.entries = [
    { label: 'Private credit funds', value: 400000 },
    { label: 'Private operating company interests', value: 2300000 }
  ];
  step5.horizonAndLiquidity.timeHorizon = { fromYear: 2026, toYear: 2036 };
  one(step5.horizonAndLiquidity.liquidityNeeds, 'low');

  const step6 = defaultStep6Fields();
  one(step6.trustedContact.decline, 'no');
  step6.trustedContact.contactInfo = {
    name: 'Daniel Rivera',
    email: 'daniel.rivera@example.com',
    phones: {
      home: null,
      business: null,
      mobile: '(512) 555-0137'
    }
  };
  step6.trustedContact.mailingAddress = {
    line1: '901 East 5th Street',
    city: 'Austin',
    stateProvince: 'TX',
    postalCode: '78702',
    country: 'US'
  };

  const step7 = defaultStep7Fields();
  step7.certifications.acceptances = {
    attestationsAccepted: true,
    taxpayerCertificationAccepted: true,
    usPersonDefinitionAcknowledged: true
  };
  step7.signatures.accountOwner = signature(PRIMARY_SIGNER, 'Priya Shah');
  step7.signatures.financialProfessional = signature(RR_NAME);
  step7.signatures.supervisorPrincipal = signature(SUPERVISOR_NAME);

  assertNoErrors('Investor Profile step 1', validateStep1Completion(step1));
  assertNoErrors('Investor Profile step 2', validateStep2Completion(step2));
  assertNoErrors('Investor Profile step 3', validateStep3Completion(step3));
  assertNoErrors('Investor Profile step 4', validateStep4Completion(step4));
  assertNoErrors('Investor Profile step 5', validateStep5Completion(step5));
  assertNoErrors('Investor Profile step 6', validateStep6Completion(step6));
  assertNoErrors('Investor Profile step 7', validateStep7Completion(step7, { requiresJointOwnerSignature: false }));

  return { step1, step2, step3, step4, step5, step6, step7 };
}

function buildSfc() {
  const step1 = defaultSfcStep1Fields();
  step1.accountRegistration = {
    rrName: RR_NAME,
    rrNo: RR_NO,
    customerNames: CLIENT_NAME
  };
  step1.liquidNonQualifiedAssets = {
    cashMoneyMarketsCds: 1200000,
    brokerageNonManaged: 1750000,
    managedAccounts: 1000000,
    mutualFundsDirect: 300000,
    annuitiesLessSurrenderCharges: 0,
    cashValueLifeInsurance: 150000,
    otherBusinessAssetsCollectibles: 250000
  };
  step1.liabilities = {
    mortgagePrimaryResidence: 600000,
    mortgagesSecondaryInvestment: 450000,
    homeEquityLoans: 0,
    creditCards: 20000,
    otherLiabilities: 80000
  };
  step1.illiquidNonQualifiedAssets = {
    primaryResidence: 1200000,
    investmentRealEstate: 1400000,
    privateBusiness: 2300000
  };
  step1.liquidQualifiedAssets = {
    cashMoneyMarketsCds: 150000,
    retirementPlans: 900000,
    brokerageNonManaged: 250000,
    managedAccounts: 300000,
    mutualFundsDirect: 200000,
    annuities: 0
  };
  step1.incomeSummary = {
    salaryCommissions: 0,
    investmentIncome: 425000,
    pension: 0,
    socialSecurity: 0,
    netRentalIncome: 180000,
    other: 95000
  };
  step1.illiquidQualifiedAssets = {
    purchaseAmountValue: 0
  };

  const step2 = defaultSfcStep2Fields();
  step2.notes = {
    notes: 'Dummy accredited entity profile. Figures are internally consistent for PDF and workflow testing only.',
    additionalNotes: 'Primary residence is included only where requested; accreditation/suitability references use net worth excluding primary residence.'
  };
  allTrue(step2.acknowledgements);
  step2.signatures.accountOwner = signature(PRIMARY_SIGNER, 'Priya Shah');
  step2.signatures.financialProfessional = signature(RR_NAME);
  step2.signatures.registeredPrincipal = signature(SUPERVISOR_NAME);

  assertNoErrors('SFC step 1', validateSfcStep1Completion(step1));
  assertNoErrors('SFC step 2', validateSfcStep2Completion(step2, { requiresJointOwnerSignature: false }));
  return { step1, step2, totals: getSfcStep1Totals(step1) };
}

function buildBaiodf(totalNetWorth: number, liquidNetWorth: number) {
  const step1 = defaultBaiodfStep1Fields();
  step1.accountRegistration = {
    rrName: RR_NAME,
    rrNo: RR_NO,
    customerNames: CLIENT_NAME
  };
  step1.orderBasics.proposedPrincipalAmount = 250000;
  one(step1.orderBasics.qualifiedAccount, 'no');
  one(step1.orderBasics.solicitedTrade, 'yes');
  one(step1.orderBasics.taxAdvantagePurchase, 'no');

  const step2 = defaultBaiodfStep2Fields();
  one(step2.custodianAndProduct.custodian, 'direct');
  step2.custodianAndProduct.nameOfProduct = 'RGP Income Fund II, LP';
  step2.custodianAndProduct.sponsorIssuer = 'RGP Income Fund II, LP';
  step2.custodianAndProduct.dateOfPpm = '2025-05-05';
  step2.custodianAndProduct.datePpmSent = '2026-06-20';
  step2.existingAltPositions = {
    existingIlliquidAltPositions: 400000,
    existingSemiLiquidAltPositions: 150000,
    existingTaxAdvantageAltPositions: 0
  };
  step2.netWorthAndConcentration = {
    totalNetWorth,
    liquidNetWorth
  };

  const step3 = defaultBaiodfStep3Fields();
  allTrue(step3.acknowledgements);
  step3.signatures.accountOwner = signature(PRIMARY_SIGNER, 'Priya Shah');
  step3.signatures.financialProfessional = signature(RR_NAME);

  assertNoErrors('BAIODF step 1', validateBaiodfStep1Completion(step1));
  assertNoErrors('BAIODF step 2', validateBaiodfStep2Completion(step2));
  assertNoErrors('BAIODF step 3', validateBaiodfStep3Completion(step3, { requiresJointOwnerSignature: false }));
  return {
    step1,
    step2,
    step3,
    concentrations: getBaiodfStep2Concentrations(step2, step1.orderBasics.proposedPrincipalAmount)
  };
}

function buildBaiv506c() {
  const step1 = defaultBaiv506cStep1Fields();
  step1.accountRegistration = {
    rrName: RR_NAME,
    rrNo: RR_NO,
    customerNames: CLIENT_NAME
  };

  const step2 = defaultBaiv506cStep2Fields();
  allTrue(step2.acknowledgements);
  step2.signatures.accountOwner = signature(PRIMARY_SIGNER, 'Priya Shah');
  step2.signatures.financialProfessional = signature(RR_NAME);

  assertNoErrors('BAIV 506(c) step 1', validateBaiv506cStep1Completion(step1));
  assertNoErrors('BAIV 506(c) step 2', validateBaiv506cStep2Completion(step2, { requiresJointOwnerSignature: false }));
  return { step1, step2 };
}

function buildRegDStepData(schema: FormSchemaV2Type): DynamicSeed {
  const stepData: Record<number, Fields> = {};
  const put = (step: number, id: string, value: unknown) => {
    stepData[step] ??= {};
    setPath(stepData[step]!, id, value);
  };

  put(1, 'investment.amount', 250000);
  put(1, 'investment.partnerType', oneHot(['limited', 'general'], 'limited'));

  put(2, 'investmentType', oneHot(['individual', 'community', 'joint_survivorship', 'tenants_common', 'trust', 'partnership', 'llc', 'corporation'], 'llc'));
  put(2, 'entity.taxForm', oneHot(['1065', '1120', '1120s', '1040'], '1065'));
  put(2, 'entity.clarification', CLIENT_NAME);

  put(4, 'person.fullName', 'Priya Shah');
  put(4, 'person.address.line1', '1846 Oakmont Drive');
  put(4, 'person.address.cityStateZip', 'Austin, TX 78703');
  put(4, 'person.phone.home', '(512) 555-0199');
  put(4, 'person.state', 'TX');
  put(4, 'person.dob', '1982-11-14');
  put(4, 'person.tin', '321-54-9876');
  put(4, 'person.email', 'priya.shah@example.com');

  put(6, 'controlPerson.fullName', 'Priya Shah');
  put(6, 'controlPerson.address.line1', '1846 Oakmont Drive');
  put(6, 'controlPerson.address.cityStateZip', 'Austin, TX 78703');
  put(6, 'controlPerson.phone.home', '(512) 555-0199');
  put(6, 'controlPerson.state', 'TX');
  put(6, 'controlPerson.dob', '1982-11-14');
  put(6, 'controlPerson.tin', '321-54-9876');
  put(6, 'beneficialOwner1.fullName', 'Daniel Rivera');
  put(6, 'beneficialOwner1.address.line1', '901 East 5th Street');
  put(6, 'beneficialOwner1.address.cityStateZip', 'Austin, TX 78702');
  put(6, 'beneficialOwner1.phone.home', '(512) 555-0137');
  put(6, 'beneficialOwner1.state', 'TX');
  put(6, 'beneficialOwner1.dob', '1978-04-22');
  put(6, 'beneficialOwner1.tin', '212-34-6789');
  put(6, 'beneficialOwner1.email', 'daniel.rivera@example.com');
  put(6, 'beneficialOwner1.ownershipPct', 70);
  put(6, 'beneficialOwner1.ownershipType', oneHot(['direct', 'indirect'], 'direct'));
  put(6, 'beneficialOwner2.fullName', 'Priya Shah');
  put(6, 'beneficialOwner2.address.line1', '1846 Oakmont Drive');
  put(6, 'beneficialOwner2.address.cityStateZip', 'Austin, TX 78703');
  put(6, 'beneficialOwner2.phone.home', '(512) 555-0199');
  put(6, 'beneficialOwner2.state', 'TX');
  put(6, 'beneficialOwner2.dob', '1982-11-14');
  put(6, 'beneficialOwner2.tin', '321-54-9876');
  put(6, 'beneficialOwner2.email', 'priya.shah@example.com');
  put(6, 'beneficialOwner2.ownershipPct', 30);
  put(6, 'beneficialOwner2.ownershipType', oneHot(['direct', 'indirect'], 'direct'));

  put(7, 'distribution.method', oneHot(['ach', 'check'], 'ach'));
  put(7, 'distribution.accountType', oneHot(['checking', 'savings', 'brokerage'], 'checking'));
  put(7, 'distribution.bankName', 'Frost Bank');
  put(7, 'distribution.accountNumber', '0004829137');
  put(7, 'distribution.routingNumber', '114000093');

  put(8, 'suitability.netWorth', true);
  put(8, 'suitability.income', true);

  put(9, 'representations.accreditedInvestor', true);
  put(9, 'representations.qualifiedCategories', true);
  put(9, 'representations.preExistingRelationship', true);
  put(9, 'representations.knowledgeExperience', true);
  put(9, 'representations.experienceDescription', 'Blue Oak Growth LLC is an investment holding company with multi-year experience in private credit, real estate, ETFs, and alternative investment funds.');
  put(9, 'representations.additionalInfo', 'Entity is treated as an accredited investor for test purposes based on assets above $5,000,000 and beneficial owners who are also accredited investors.');
  put(9, 'representations.finraAssociated', false);
  put(9, 'representations.bankHoldingCompany', false);

  put(10, 'signature.investorName', PRIMARY_SIGNER);
  put(10, 'signature.investor', 'Priya Shah');
  put(10, 'signature.date', SIGN_DATE);
  put(10, 'signature.dateDay', '30');
  put(10, 'signature.dateMonth', 'June');
  put(10, 'signature.authorizedSignature', 'Priya Shah');
  put(10, 'signature.electronicConsent', true);
  put(10, 'signature.electronicSignature', 'Priya Shah');

  put(11, 'broker.firmName', BROKER_FIRM);
  put(12, 'broker.repName', RR_NAME);
  put(12, 'broker.bdCrd', '289741');
  put(12, 'broker.repCrd', '7429136');
  put(12, 'broker.crdNumbers', 'BD CRD 289741 / Rep CRD 7429136');
  put(12, 'broker.branchPhone', '(512) 555-0104');
  put(12, 'broker.email', 'anishsuman2305@gmail.com');
  put(12, 'broker.branchAddress', '600 Congress Ave, Austin, TX 78701');
  put(12, 'broker.branchEmail', 'ops@ridgeway-advisory.example.com');
  put(12, 'ria.registeredWith', oneHot(['sec', 'state'], 'sec'));
  put(12, 'ria.finraMember', false);
  put(12, 'ria.finraAffiliated', false);
  put(12, 'acceptance.date', '30');
  put(12, 'acceptance.dateDay', 'June');
  put(12, 'acceptance.dateYear', '2026');
  put(12, 'acceptance.byName', 'RGP Income Fund II, LP');

  const status = deriveDynamicFormStatus(schema, stepData, deriveContext());
  const merged = mergeStepData(schema, stepData);
  const values = resolveFieldValuesV2(schema, merged, deriveContext());
  return { stepData, status, values };
}

async function loadRegDSchema(): Promise<FormSchemaV2Type> {
  const form = await prisma.formCatalog.findUnique({
    where: { code: REG_D_FORM_CODE },
    select: { schema: true }
  });
  if (!form?.schema) throw new Error(`${REG_D_FORM_CODE} does not have a stored schema.`);
  const parsed = FormSchemaV2.safeParse(form.schema);
  return parsed.success ? parsed.data : migrateV1ToV2(form.schema as never);
}

async function main(): Promise<void> {
  const ownerEmail = getArg('--owner-email') ?? OWNER_EMAIL;
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) throw new Error(`No owner user found for ${ownerEmail}.`);

  const selfBroker = await prisma.broker.upsert({
    where: { ownerUserId_email: { ownerUserId: owner.id, email: owner.email } },
    update: { name: owner.name, kind: BrokerKind.SELF },
    create: {
      ownerUserId: owner.id,
      name: owner.name,
      email: owner.email,
      kind: BrokerKind.SELF
    }
  });

  const forms = await prisma.formCatalog.findMany({
    where: { code: { in: [...FORM_CODES] } },
    select: { id: true, code: true }
  });
  const formIdsByCode = new Map(forms.map((form) => [form.code, form.id]));
  for (const code of FORM_CODES) {
    if (!formIdsByCode.has(code)) throw new Error(`Missing FormCatalog row for ${code}.`);
  }

  const investorProfile = buildInvestorProfile();
  const sfc = buildSfc();
  const baiodf = buildBaiodf(sfc.totals.totalNetWorth, sfc.totals.totalPotentialLiquidity);
  const baiv506c = buildBaiv506c();
  const regDSchema = await loadRegDSchema();
  const regD = buildRegDStepData(regDSchema);

  const client = await prisma.client.upsert({
    where: {
      ownerUserId_email: {
        ownerUserId: owner.id,
        email: CLIENT_EMAIL
      }
    },
    update: {
      name: CLIENT_NAME,
      phone: CLIENT_PHONE,
      isPreview: true
    },
    create: {
      ownerUserId: owner.id,
      name: CLIENT_NAME,
      email: CLIENT_EMAIL,
      phone: CLIENT_PHONE,
      isPreview: true
    }
  });

  await prisma.$transaction([
    prisma.clientBroker.upsert({
      where: { clientId_brokerId: { clientId: client.id, brokerId: selfBroker.id } },
      update: { role: ClientBrokerRole.PRIMARY },
      create: { clientId: client.id, brokerId: selfBroker.id, role: ClientBrokerRole.PRIMARY }
    }),
    ...FORM_CODES.map((code) =>
      prisma.clientFormSelection.upsert({
        where: { clientId_formId: { clientId: client.id, formId: formIdsByCode.get(code)! } },
        update: {},
        create: { clientId: client.id, formId: formIdsByCode.get(code)! }
      })
    ),
    prisma.investorProfileOnboarding.upsert({
      where: { clientId: client.id },
      update: {
        status: InvestorProfileOnboardingStatus.COMPLETED,
        step1RrName: RR_NAME,
        step1RrNo: RR_NO,
        step1CustomerNames: CLIENT_NAME,
        step1AccountNo: ACCOUNT_NO,
        step1AccountType: investorProfile.step1.accountRegistration.retailRetirement,
        step1CurrentQuestionIndex: 0,
        step1Data: serializeStep1Fields(investorProfile.step1),
        step2CurrentQuestionIndex: 0,
        step2Data: serializeStep2Fields(investorProfile.step2),
        step3CurrentQuestionIndex: 0,
        step3Data: serializeStep3Fields(investorProfile.step3),
        step4CurrentQuestionIndex: 0,
        step4Data: serializeStep4Fields(investorProfile.step4),
        step5CurrentQuestionIndex: 0,
        step5Data: serializeStep5Fields(investorProfile.step5),
        step6CurrentQuestionIndex: 0,
        step6Data: serializeStep6Fields(investorProfile.step6),
        step7CurrentQuestionIndex: 0,
        step7Data: serializeStep7Fields(investorProfile.step7)
      },
      create: {
        clientId: client.id,
        status: InvestorProfileOnboardingStatus.COMPLETED,
        step1RrName: RR_NAME,
        step1RrNo: RR_NO,
        step1CustomerNames: CLIENT_NAME,
        step1AccountNo: ACCOUNT_NO,
        step1AccountType: investorProfile.step1.accountRegistration.retailRetirement,
        step1Data: serializeStep1Fields(investorProfile.step1),
        step2Data: serializeStep2Fields(investorProfile.step2),
        step3Data: serializeStep3Fields(investorProfile.step3),
        step4Data: serializeStep4Fields(investorProfile.step4),
        step5Data: serializeStep5Fields(investorProfile.step5),
        step6Data: serializeStep6Fields(investorProfile.step6),
        step7Data: serializeStep7Fields(investorProfile.step7)
      }
    }),
    prisma.statementOfFinancialConditionOnboarding.upsert({
      where: { clientId: client.id },
      update: {
        status: StatementOfFinancialConditionOnboardingStatus.COMPLETED,
        step1CurrentQuestionIndex: 0,
        step1Data: serializeSfcStep1Fields(sfc.step1),
        step2CurrentQuestionIndex: 0,
        step2Data: serializeSfcStep2Fields(sfc.step2)
      },
      create: {
        clientId: client.id,
        status: StatementOfFinancialConditionOnboardingStatus.COMPLETED,
        step1Data: serializeSfcStep1Fields(sfc.step1),
        step2Data: serializeSfcStep2Fields(sfc.step2)
      }
    }),
    prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert({
      where: { clientId: client.id },
      update: {
        status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.COMPLETED,
        step1CurrentQuestionIndex: 0,
        step1Data: serializeBaiodfStep1Fields(baiodf.step1),
        step2CurrentQuestionIndex: 0,
        step2Data: serializeBaiodfStep2Fields(baiodf.step2),
        step3CurrentQuestionIndex: 0,
        step3Data: serializeBaiodfStep3Fields(baiodf.step3)
      },
      create: {
        clientId: client.id,
        status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.COMPLETED,
        step1Data: serializeBaiodfStep1Fields(baiodf.step1),
        step2Data: serializeBaiodfStep2Fields(baiodf.step2),
        step3Data: serializeBaiodfStep3Fields(baiodf.step3)
      }
    }),
    prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert({
      where: { clientId: client.id },
      update: {
        status: BrokerageAccreditedInvestorVerificationOnboardingStatus.COMPLETED,
        step1CurrentQuestionIndex: 0,
        step1Data: serializeBaiv506cStep1Fields(baiv506c.step1),
        step2CurrentQuestionIndex: 0,
        step2Data: serializeBaiv506cStep2Fields(baiv506c.step2)
      },
      create: {
        clientId: client.id,
        status: BrokerageAccreditedInvestorVerificationOnboardingStatus.COMPLETED,
        step1Data: serializeBaiv506cStep1Fields(baiv506c.step1),
        step2Data: serializeBaiv506cStep2Fields(baiv506c.step2)
      }
    }),
    prisma.dynamicFormResponse.upsert({
      where: { clientId_formCode: { clientId: client.id, formCode: REG_D_FORM_CODE } },
      update: {
        status: regD.status,
        stepData: regD.stepData as unknown as Prisma.InputJsonValue,
        answers: {},
        stepCursors: {}
      },
      create: {
        clientId: client.id,
        formCode: REG_D_FORM_CODE,
        status: regD.status,
        stepData: regD.stepData as unknown as Prisma.InputJsonValue,
        answers: {},
        stepCursors: {}
      }
    })
  ]);

  console.log(JSON.stringify({
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      ownerEmail
    },
    forms: [...FORM_CODES],
    financials: {
      totalNetWorth: sfc.totals.totalNetWorth,
      totalPotentialLiquidity: sfc.totals.totalPotentialLiquidity,
      subscriptionAmount: baiodf.step1.orderBasics.proposedPrincipalAmount,
      baiodfConcentrations: baiodf.concentrations
    },
    dynamicSubscription: {
      formCode: REG_D_FORM_CODE,
      status: regD.status,
      resolvedPdfValues: Object.keys(regD.values).length
    }
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
