import type { Prisma } from '@prisma/client';

export const STEP_1_LABEL = 'STEP 1. ACCOUNT REGISTRATION';

const PRIMARY_TYPE_KEYS = [
  'individual',
  'corporation',
  'corporatePensionProfitSharing',
  'custodial',
  'estate',
  'jointTenant',
  'limitedLiabilityCompany',
  'individualSingleMemberLlc',
  'soleProprietorship',
  'transferOnDeathIndividual',
  'transferOnDeathJoint',
  'trust',
  'nonprofitOrganization',
  'partnership',
  'exemptOrganization',
  'other'
] as const;

const RETAIL_RETIREMENT_KEYS = ['retail', 'retirement'] as const;
const CORPORATION_DESIGNATION_KEYS = ['cCorp', 'sCorp'] as const;
const LLC_DESIGNATION_KEYS = ['cCorp', 'sCorp', 'partnership'] as const;
const TRUST_TYPE_KEYS = [
  'charitable',
  'living',
  'irrevocableLiving',
  'family',
  'revocable',
  'irrevocable',
  'testamentary'
] as const;
const CUSTODIAL_TYPE_KEYS = ['ugma', 'utma'] as const;
const MARRIED_TO_EACH_OTHER_KEYS = ['yes', 'no'] as const;
const TENANCY_CLAUSE_KEYS = [
  'communityProperty',
  'tenantsByEntirety',
  'communityPropertyWithRightsOfSurvivorship',
  'jointTenantsWithRightsOfSurvivorship',
  'tenantsInCommon'
] as const;

const STEP_1_QUESTION_IDS = [
  'rrName',
  'rrNo',
  'customerNames',
  'accountNo',
  'accountRegistration.retailRetirement',
  'typeOfAccount.primaryType',
  'typeOfAccount.corporationDesignation',
  'typeOfAccount.llcDesignation',
  'typeOfAccount.trust.establishmentDate',
  'typeOfAccount.trust.trustType',
  'typeOfAccount.custodial.custodialType',
  'typeOfAccount.custodial.gifts',
  'typeOfAccount.joint.marriedToEachOther',
  'typeOfAccount.joint.tenancyState',
  'typeOfAccount.joint.numberOfTenants',
  'typeOfAccount.joint.tenancyClause',
  'typeOfAccount.transferOnDeath.individualAgreementDate',
  'typeOfAccount.transferOnDeath.jointAgreementDate',
  'typeOfAccount.otherDescription'
] as const;

const STEP_1_QUESTION_ID_SET = new Set<string>(STEP_1_QUESTION_IDS);

export type Step1QuestionId = (typeof STEP_1_QUESTION_IDS)[number];
export type PrimaryTypeKey = (typeof PRIMARY_TYPE_KEYS)[number];

type RetailRetirementValue = Record<(typeof RETAIL_RETIREMENT_KEYS)[number], boolean>;
type CorporationDesignationValue = Record<(typeof CORPORATION_DESIGNATION_KEYS)[number], boolean>;
type LlcDesignationValue = Record<(typeof LLC_DESIGNATION_KEYS)[number], boolean>;
type TrustTypeValue = Record<(typeof TRUST_TYPE_KEYS)[number], boolean>;
type CustodialTypeValue = Record<(typeof CUSTODIAL_TYPE_KEYS)[number], boolean>;
type MarriedValue = Record<(typeof MARRIED_TO_EACH_OTHER_KEYS)[number], boolean>;
type TenancyClauseValue = Record<(typeof TENANCY_CLAUSE_KEYS)[number], boolean>;

type PrimaryTypeValue = Record<PrimaryTypeKey, boolean>;

export interface Step1CustodialGift {
  state: string;
  dateGiftWasGiven: string;
}

export interface Step1Fields {
  accountRegistration: {
    rrName: string;
    rrNo: string;
    customerNames: string;
    accountNo: string;
    retailRetirement: RetailRetirementValue;
  };
  typeOfAccount: {
    primaryType: PrimaryTypeValue;
    corporationDesignation: CorporationDesignationValue;
    llcDesignation: LlcDesignationValue;
    trust: {
      establishmentDate: string | null;
      trustType: TrustTypeValue;
    };
    custodial: {
      custodialType: CustodialTypeValue;
      gifts: Step1CustodialGift[];
    };
    joint: {
      marriedToEachOther: MarriedValue;
      tenancyState: string | null;
      numberOfTenants: number | null;
      tenancyClause: TenancyClauseValue;
    };
    transferOnDeath: {
      individualAgreementDate: string | null;
      jointAgreementDate: string | null;
    };
    otherDescription: string | null;
  };
}

export interface Step1LegacyColumns {
  step1RrName?: string | null;
  step1RrNo?: string | null;
  step1CustomerNames?: string | null;
  step1AccountNo?: string | null;
  step1AccountType?: Prisma.JsonValue | null;
}

interface ValidationSuccess<T> {
  success: true;
  value: T;
}

interface ValidationFailure {
  success: false;
  fieldErrors: Record<string, string>;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function createBooleanMap<K extends string>(keys: readonly K[], source?: unknown): Record<K, boolean> {
  const base = Object.fromEntries(keys.map((key) => [key, false])) as Record<K, boolean>;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return base;
  }

  const sourceRecord = source as Record<string, unknown>;

  for (const key of keys) {
    if (typeof sourceRecord[key] === 'boolean') {
      base[key] = sourceRecord[key] as boolean;
    }
  }

  return base;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeGifts(source: unknown): Step1CustodialGift[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => {
      const record = entry as Record<string, unknown>;
      return {
        state: typeof record.state === 'string' ? record.state.trim() : '',
        dateGiftWasGiven: typeof record.dateGiftWasGiven === 'string' ? record.dateGiftWasGiven.trim() : ''
      };
    });
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  return null;
}

function countTrueFlags(value: Record<string, boolean>): number {
  return Object.values(value).filter(Boolean).length;
}

function toRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function isValidDateInput(value: string): boolean {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().startsWith(trimmed);
}

export function getStep1QuestionIds(): readonly Step1QuestionId[] {
  return STEP_1_QUESTION_IDS;
}

export function isStep1QuestionId(value: string): value is Step1QuestionId {
  return STEP_1_QUESTION_ID_SET.has(value);
}

export function defaultStep1Fields(): Step1Fields {
  return {
    accountRegistration: {
      rrName: '',
      rrNo: '',
      customerNames: '',
      accountNo: '',
      retailRetirement: createBooleanMap(RETAIL_RETIREMENT_KEYS)
    },
    typeOfAccount: {
      primaryType: createBooleanMap(PRIMARY_TYPE_KEYS),
      corporationDesignation: createBooleanMap(CORPORATION_DESIGNATION_KEYS),
      llcDesignation: createBooleanMap(LLC_DESIGNATION_KEYS),
      trust: {
        establishmentDate: null,
        trustType: createBooleanMap(TRUST_TYPE_KEYS)
      },
      custodial: {
        custodialType: createBooleanMap(CUSTODIAL_TYPE_KEYS),
        gifts: []
      },
      joint: {
        marriedToEachOther: createBooleanMap(MARRIED_TO_EACH_OTHER_KEYS),
        tenancyState: null,
        numberOfTenants: null,
        tenancyClause: createBooleanMap(TENANCY_CLAUSE_KEYS)
      },
      transferOnDeath: {
        individualAgreementDate: null,
        jointAgreementDate: null
      },
      otherDescription: null
    }
  };
}

function getPrimaryTypeSelection(primaryType: PrimaryTypeValue): PrimaryTypeKey | null {
  const selected = PRIMARY_TYPE_KEYS.filter((key) => primaryType[key]);

  if (selected.length !== 1) {
    return null;
  }

  return selected[0];
}

export function normalizeStep1Fields(
  step1Data: Prisma.JsonValue | null | undefined,
  legacyColumns: Step1LegacyColumns = {}
): Step1Fields {
  const defaults = defaultStep1Fields();
  const root = toRecord(step1Data);

  const accountRegistration = toRecord(root.accountRegistration);
  const typeOfAccount = toRecord(root.typeOfAccount);
  const retailRetirementFromAccountRegistration = createBooleanMap(
    RETAIL_RETIREMENT_KEYS,
    accountRegistration.retailRetirement
  );
  const retailRetirementFromRoot = createBooleanMap(RETAIL_RETIREMENT_KEYS, root.accountType);

  const normalized: Step1Fields = {
    accountRegistration: {
      rrName:
        normalizeNullableString(accountRegistration.rrName) ??
        normalizeNullableString(root.rrName) ??
        normalizeNullableString(legacyColumns.step1RrName) ??
        defaults.accountRegistration.rrName,
      rrNo:
        normalizeNullableString(accountRegistration.rrNo) ??
        normalizeNullableString(root.rrNo) ??
        normalizeNullableString(legacyColumns.step1RrNo) ??
        defaults.accountRegistration.rrNo,
      customerNames:
        normalizeNullableString(accountRegistration.customerNames) ??
        normalizeNullableString(root.customerNames) ??
        normalizeNullableString(legacyColumns.step1CustomerNames) ??
        defaults.accountRegistration.customerNames,
      accountNo:
        normalizeNullableString(accountRegistration.accountNo) ??
        normalizeNullableString(root.accountNo) ??
        normalizeNullableString(legacyColumns.step1AccountNo) ??
        defaults.accountRegistration.accountNo,
      retailRetirement: retailRetirementFromAccountRegistration
    },
    typeOfAccount: {
      primaryType: createBooleanMap(PRIMARY_TYPE_KEYS, typeOfAccount.primaryType),
      corporationDesignation: createBooleanMap(
        CORPORATION_DESIGNATION_KEYS,
        typeOfAccount.corporationDesignation
      ),
      llcDesignation: createBooleanMap(LLC_DESIGNATION_KEYS, typeOfAccount.llcDesignation),
      trust: {
        establishmentDate: normalizeNullableString(toRecord(typeOfAccount.trust).establishmentDate),
        trustType: createBooleanMap(TRUST_TYPE_KEYS, toRecord(toRecord(typeOfAccount.trust).trustType))
      },
      custodial: {
        custodialType: createBooleanMap(
          CUSTODIAL_TYPE_KEYS,
          toRecord(typeOfAccount.custodial).custodialType
        ),
        gifts: normalizeGifts(toRecord(typeOfAccount.custodial).gifts)
      },
      joint: {
        marriedToEachOther: createBooleanMap(
          MARRIED_TO_EACH_OTHER_KEYS,
          toRecord(typeOfAccount.joint).marriedToEachOther
        ),
        tenancyState: normalizeNullableString(toRecord(typeOfAccount.joint).tenancyState),
        numberOfTenants: normalizePositiveInteger(toRecord(typeOfAccount.joint).numberOfTenants),
        tenancyClause: createBooleanMap(
          TENANCY_CLAUSE_KEYS,
          toRecord(typeOfAccount.joint).tenancyClause
        )
      },
      transferOnDeath: {
        individualAgreementDate: normalizeNullableString(
          toRecord(typeOfAccount.transferOnDeath).individualAgreementDate
        ),
        jointAgreementDate: normalizeNullableString(toRecord(typeOfAccount.transferOnDeath).jointAgreementDate)
      },
      otherDescription: normalizeNullableString(typeOfAccount.otherDescription)
    }
  };

  const retailRetirementFromLegacy = createBooleanMap(
    RETAIL_RETIREMENT_KEYS,
    legacyColumns.step1AccountType
  );

  if (countTrueFlags(normalized.accountRegistration.retailRetirement) === 0) {
    normalized.accountRegistration.retailRetirement =
      countTrueFlags(retailRetirementFromRoot) > 0
        ? retailRetirementFromRoot
        : retailRetirementFromLegacy;
  }

  return normalized;
}

export function serializeStep1Fields(fields: Step1Fields): Prisma.InputJsonValue {
  return fields as unknown as Prisma.InputJsonValue;
}

export function getVisibleStep1QuestionIds(fields: Step1Fields): Step1QuestionId[] {
  const visible: Step1QuestionId[] = [
    'rrName',
    'rrNo',
    'customerNames',
    'accountNo',
    'accountRegistration.retailRetirement',
    'typeOfAccount.primaryType'
  ];

  const selectedPrimaryType = getPrimaryTypeSelection(fields.typeOfAccount.primaryType);

  if (selectedPrimaryType === 'corporation') {
    visible.push('typeOfAccount.corporationDesignation');
  }

  if (selectedPrimaryType === 'limitedLiabilityCompany') {
    visible.push('typeOfAccount.llcDesignation');
  }

  if (selectedPrimaryType === 'trust') {
    visible.push('typeOfAccount.trust.establishmentDate');
    visible.push('typeOfAccount.trust.trustType');
  }

  if (selectedPrimaryType === 'custodial') {
    visible.push('typeOfAccount.custodial.custodialType');
    visible.push('typeOfAccount.custodial.gifts');
  }

  if (selectedPrimaryType === 'jointTenant') {
    visible.push('typeOfAccount.joint.marriedToEachOther');
    visible.push('typeOfAccount.joint.tenancyState');
    visible.push('typeOfAccount.joint.numberOfTenants');
    visible.push('typeOfAccount.joint.tenancyClause');
  }

  if (selectedPrimaryType === 'transferOnDeathIndividual') {
    visible.push('typeOfAccount.transferOnDeath.individualAgreementDate');
  }

  if (selectedPrimaryType === 'transferOnDeathJoint') {
    visible.push('typeOfAccount.transferOnDeath.jointAgreementDate');
  }

  if (selectedPrimaryType === 'other') {
    visible.push('typeOfAccount.otherDescription');
  }

  return visible;
}

export function clampStep1QuestionIndex(index: number | null | undefined, visibleQuestionIds: Step1QuestionId[]): number {
  if (visibleQuestionIds.length === 0) {
    return 0;
  }

  if (typeof index !== 'number' || Number.isNaN(index)) {
    return 0;
  }

  if (index < 0) {
    return 0;
  }

  if (index >= visibleQuestionIds.length) {
    return visibleQuestionIds.length - 1;
  }

  return index;
}

function validateSingleChoiceMap(answer: unknown, keys: readonly string[], fieldPath: string): ValidationResult<Record<string, boolean>> {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: 'Please choose one option.'
      }
    };
  }

  const normalized = createBooleanMap(keys, answer);

  if (countTrueFlags(normalized) !== 1) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: 'Please choose exactly one option.'
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateRequiredString(answer: unknown, fieldPath: string, label: string): ValidationResult<string> {
  if (!isNonEmptyString(answer)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `${label} is required.`
      }
    };
  }

  return {
    success: true,
    value: answer.trim()
  };
}

function validateRequiredDate(answer: unknown, fieldPath: string, label: string): ValidationResult<string> {
  if (!isNonEmptyString(answer)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `${label} is required.`
      }
    };
  }

  const trimmed = answer.trim();

  if (!isValidDateInput(trimmed)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `Enter a valid ${label.toLowerCase()} in YYYY-MM-DD format.`
      }
    };
  }

  return {
    success: true,
    value: trimmed
  };
}

function validateCustodialGifts(answer: unknown): ValidationResult<Step1CustodialGift[]> {
  if (!Array.isArray(answer)) {
    return {
      success: false,
      fieldErrors: {
        'typeOfAccount.custodial.gifts': 'Add at least one custodial gift entry.'
      }
    };
  }

  const gifts = answer
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => {
      const record = entry as Record<string, unknown>;
      return {
        state: typeof record.state === 'string' ? record.state.trim() : '',
        dateGiftWasGiven: typeof record.dateGiftWasGiven === 'string' ? record.dateGiftWasGiven.trim() : ''
      };
    })
    .filter((entry) => entry.state.length > 0 || entry.dateGiftWasGiven.length > 0);

  if (gifts.length === 0) {
    return {
      success: false,
      fieldErrors: {
        'typeOfAccount.custodial.gifts': 'Add at least one custodial gift entry.'
      }
    };
  }

  const errors: Record<string, string> = {};

  gifts.forEach((gift, index) => {
    if (!gift.state) {
      errors[`typeOfAccount.custodial.gifts.${index}.state`] = 'State is required.';
    }

    if (!gift.dateGiftWasGiven) {
      errors[`typeOfAccount.custodial.gifts.${index}.dateGiftWasGiven`] =
        'Date gift was given is required.';
    } else if (!isValidDateInput(gift.dateGiftWasGiven)) {
      errors[`typeOfAccount.custodial.gifts.${index}.dateGiftWasGiven`] =
        'Use YYYY-MM-DD format.';
    }
  });

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      fieldErrors: errors
    };
  }

  return {
    success: true,
    value: gifts
  };
}

function validateNumberOfTenants(answer: unknown): ValidationResult<number> {
  const numberValue = typeof answer === 'number' ? answer : Number(answer);

  if (!Number.isInteger(numberValue) || numberValue < 2) {
    return {
      success: false,
      fieldErrors: {
        'typeOfAccount.joint.numberOfTenants': 'Enter a valid number of tenants (2 or more).'
      }
    };
  }

  return {
    success: true,
    value: numberValue
  };
}

export function validateStep1Answer(
  questionId: Step1QuestionId,
  answer: unknown
): ValidationResult<unknown> {
  switch (questionId) {
    case 'rrName':
      return validateRequiredString(answer, 'rrName', 'RR Name');
    case 'rrNo':
      return validateRequiredString(answer, 'rrNo', 'RR No.');
    case 'customerNames':
      return validateRequiredString(answer, 'customerNames', 'Customer Name(s)');
    case 'accountNo':
      return validateRequiredString(answer, 'accountNo', 'Account No.');
    case 'accountRegistration.retailRetirement':
      return validateSingleChoiceMap(
        answer,
        RETAIL_RETIREMENT_KEYS,
        'accountRegistration.retailRetirement'
      );
    case 'typeOfAccount.primaryType':
      return validateSingleChoiceMap(answer, PRIMARY_TYPE_KEYS, 'typeOfAccount.primaryType');
    case 'typeOfAccount.corporationDesignation':
      return validateSingleChoiceMap(
        answer,
        CORPORATION_DESIGNATION_KEYS,
        'typeOfAccount.corporationDesignation'
      );
    case 'typeOfAccount.llcDesignation':
      return validateSingleChoiceMap(answer, LLC_DESIGNATION_KEYS, 'typeOfAccount.llcDesignation');
    case 'typeOfAccount.trust.establishmentDate':
      return validateRequiredDate(
        answer,
        'typeOfAccount.trust.establishmentDate',
        'Trust establishment date'
      );
    case 'typeOfAccount.trust.trustType':
      return validateSingleChoiceMap(answer, TRUST_TYPE_KEYS, 'typeOfAccount.trust.trustType');
    case 'typeOfAccount.custodial.custodialType':
      return validateSingleChoiceMap(
        answer,
        CUSTODIAL_TYPE_KEYS,
        'typeOfAccount.custodial.custodialType'
      );
    case 'typeOfAccount.custodial.gifts':
      return validateCustodialGifts(answer);
    case 'typeOfAccount.joint.marriedToEachOther':
      return validateSingleChoiceMap(
        answer,
        MARRIED_TO_EACH_OTHER_KEYS,
        'typeOfAccount.joint.marriedToEachOther'
      );
    case 'typeOfAccount.joint.tenancyState':
      return validateRequiredString(
        answer,
        'typeOfAccount.joint.tenancyState',
        'Tenancy state'
      );
    case 'typeOfAccount.joint.numberOfTenants':
      return validateNumberOfTenants(answer);
    case 'typeOfAccount.joint.tenancyClause':
      return validateSingleChoiceMap(
        answer,
        TENANCY_CLAUSE_KEYS,
        'typeOfAccount.joint.tenancyClause'
      );
    case 'typeOfAccount.transferOnDeath.individualAgreementDate':
      return validateRequiredDate(
        answer,
        'typeOfAccount.transferOnDeath.individualAgreementDate',
        'Agreement date'
      );
    case 'typeOfAccount.transferOnDeath.jointAgreementDate':
      return validateRequiredDate(
        answer,
        'typeOfAccount.transferOnDeath.jointAgreementDate',
        'Agreement date'
      );
    case 'typeOfAccount.otherDescription':
      return validateRequiredString(
        answer,
        'typeOfAccount.otherDescription',
        'Other account type description'
      );
    default:
      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
  }
}

export function applyStep1Answer(fields: Step1Fields, questionId: Step1QuestionId, answer: unknown): Step1Fields {
  const next: Step1Fields = {
    accountRegistration: {
      rrName: fields.accountRegistration.rrName,
      rrNo: fields.accountRegistration.rrNo,
      customerNames: fields.accountRegistration.customerNames,
      accountNo: fields.accountRegistration.accountNo,
      retailRetirement: { ...fields.accountRegistration.retailRetirement }
    },
    typeOfAccount: {
      primaryType: { ...fields.typeOfAccount.primaryType },
      corporationDesignation: { ...fields.typeOfAccount.corporationDesignation },
      llcDesignation: { ...fields.typeOfAccount.llcDesignation },
      trust: {
        establishmentDate: fields.typeOfAccount.trust.establishmentDate,
        trustType: { ...fields.typeOfAccount.trust.trustType }
      },
      custodial: {
        custodialType: { ...fields.typeOfAccount.custodial.custodialType },
        gifts: fields.typeOfAccount.custodial.gifts.map((gift) => ({ ...gift }))
      },
      joint: {
        marriedToEachOther: { ...fields.typeOfAccount.joint.marriedToEachOther },
        tenancyState: fields.typeOfAccount.joint.tenancyState,
        numberOfTenants: fields.typeOfAccount.joint.numberOfTenants,
        tenancyClause: { ...fields.typeOfAccount.joint.tenancyClause }
      },
      transferOnDeath: {
        individualAgreementDate: fields.typeOfAccount.transferOnDeath.individualAgreementDate,
        jointAgreementDate: fields.typeOfAccount.transferOnDeath.jointAgreementDate
      },
      otherDescription: fields.typeOfAccount.otherDescription
    }
  };

  switch (questionId) {
    case 'rrName':
      next.accountRegistration.rrName = answer as string;
      break;
    case 'rrNo':
      next.accountRegistration.rrNo = answer as string;
      break;
    case 'customerNames':
      next.accountRegistration.customerNames = answer as string;
      break;
    case 'accountNo':
      next.accountRegistration.accountNo = answer as string;
      break;
    case 'accountRegistration.retailRetirement':
      next.accountRegistration.retailRetirement = answer as RetailRetirementValue;
      break;
    case 'typeOfAccount.primaryType':
      next.typeOfAccount.primaryType = answer as PrimaryTypeValue;
      break;
    case 'typeOfAccount.corporationDesignation':
      next.typeOfAccount.corporationDesignation = answer as CorporationDesignationValue;
      break;
    case 'typeOfAccount.llcDesignation':
      next.typeOfAccount.llcDesignation = answer as LlcDesignationValue;
      break;
    case 'typeOfAccount.trust.establishmentDate':
      next.typeOfAccount.trust.establishmentDate = answer as string;
      break;
    case 'typeOfAccount.trust.trustType':
      next.typeOfAccount.trust.trustType = answer as TrustTypeValue;
      break;
    case 'typeOfAccount.custodial.custodialType':
      next.typeOfAccount.custodial.custodialType = answer as CustodialTypeValue;
      break;
    case 'typeOfAccount.custodial.gifts':
      next.typeOfAccount.custodial.gifts = answer as Step1CustodialGift[];
      break;
    case 'typeOfAccount.joint.marriedToEachOther':
      next.typeOfAccount.joint.marriedToEachOther = answer as MarriedValue;
      break;
    case 'typeOfAccount.joint.tenancyState':
      next.typeOfAccount.joint.tenancyState = answer as string;
      break;
    case 'typeOfAccount.joint.numberOfTenants':
      next.typeOfAccount.joint.numberOfTenants = answer as number;
      break;
    case 'typeOfAccount.joint.tenancyClause':
      next.typeOfAccount.joint.tenancyClause = answer as TenancyClauseValue;
      break;
    case 'typeOfAccount.transferOnDeath.individualAgreementDate':
      next.typeOfAccount.transferOnDeath.individualAgreementDate = answer as string;
      break;
    case 'typeOfAccount.transferOnDeath.jointAgreementDate':
      next.typeOfAccount.transferOnDeath.jointAgreementDate = answer as string;
      break;
    case 'typeOfAccount.otherDescription':
      next.typeOfAccount.otherDescription = answer as string;
      break;
  }

  return next;
}

export function validateStep1Completion(fields: Step1Fields): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!fields.accountRegistration.rrName.trim()) {
    errors.rrName = 'RR Name is required.';
  }

  if (!fields.accountRegistration.rrNo.trim()) {
    errors.rrNo = 'RR No. is required.';
  }

  if (!fields.accountRegistration.customerNames.trim()) {
    errors.customerNames = 'Customer Name(s) is required.';
  }

  if (!fields.accountRegistration.accountNo.trim()) {
    errors.accountNo = 'Account No. is required.';
  }

  if (countTrueFlags(fields.accountRegistration.retailRetirement) !== 1) {
    errors['accountRegistration.retailRetirement'] = 'Choose Retirement or Retail.';
  }

  const primaryType = getPrimaryTypeSelection(fields.typeOfAccount.primaryType);

  if (!primaryType) {
    errors['typeOfAccount.primaryType'] = 'Select one account type.';
    return errors;
  }

  if (
    primaryType === 'corporation' &&
    countTrueFlags(fields.typeOfAccount.corporationDesignation) !== 1
  ) {
    errors['typeOfAccount.corporationDesignation'] = 'Select one corporation designation.';
  }

  if (
    primaryType === 'limitedLiabilityCompany' &&
    countTrueFlags(fields.typeOfAccount.llcDesignation) !== 1
  ) {
    errors['typeOfAccount.llcDesignation'] = 'Select one LLC designation.';
  }

  if (primaryType === 'trust') {
    const trustDate = fields.typeOfAccount.trust.establishmentDate;

    if (!trustDate) {
      errors['typeOfAccount.trust.establishmentDate'] = 'Trust establishment date is required.';
    } else if (!isValidDateInput(trustDate)) {
      errors['typeOfAccount.trust.establishmentDate'] = 'Use YYYY-MM-DD format.';
    }

    if (countTrueFlags(fields.typeOfAccount.trust.trustType) !== 1) {
      errors['typeOfAccount.trust.trustType'] = 'Select one trust type.';
    }
  }

  if (primaryType === 'custodial') {
    if (countTrueFlags(fields.typeOfAccount.custodial.custodialType) !== 1) {
      errors['typeOfAccount.custodial.custodialType'] = 'Select UGMA or UTMA.';
    }

    if (fields.typeOfAccount.custodial.gifts.length === 0) {
      errors['typeOfAccount.custodial.gifts'] = 'Add at least one custodial gift entry.';
    }

    fields.typeOfAccount.custodial.gifts.forEach((gift, index) => {
      if (!gift.state.trim()) {
        errors[`typeOfAccount.custodial.gifts.${index}.state`] = 'State is required.';
      }

      if (!gift.dateGiftWasGiven.trim()) {
        errors[`typeOfAccount.custodial.gifts.${index}.dateGiftWasGiven`] = 'Date is required.';
      } else if (!isValidDateInput(gift.dateGiftWasGiven)) {
        errors[`typeOfAccount.custodial.gifts.${index}.dateGiftWasGiven`] =
          'Use YYYY-MM-DD format.';
      }
    });
  }

  if (primaryType === 'jointTenant') {
    if (countTrueFlags(fields.typeOfAccount.joint.marriedToEachOther) !== 1) {
      errors['typeOfAccount.joint.marriedToEachOther'] = 'Choose Yes or No.';
    }

    if (!fields.typeOfAccount.joint.tenancyState?.trim()) {
      errors['typeOfAccount.joint.tenancyState'] = 'Tenancy state is required.';
    }

    if (
      typeof fields.typeOfAccount.joint.numberOfTenants !== 'number' ||
      !Number.isInteger(fields.typeOfAccount.joint.numberOfTenants) ||
      fields.typeOfAccount.joint.numberOfTenants < 2
    ) {
      errors['typeOfAccount.joint.numberOfTenants'] =
        'Enter number of tenants (2 or more).';
    }

    if (countTrueFlags(fields.typeOfAccount.joint.tenancyClause) !== 1) {
      errors['typeOfAccount.joint.tenancyClause'] = 'Select one tenancy clause.';
    }
  }

  if (primaryType === 'transferOnDeathIndividual') {
    const date = fields.typeOfAccount.transferOnDeath.individualAgreementDate;

    if (!date) {
      errors['typeOfAccount.transferOnDeath.individualAgreementDate'] = 'Agreement date is required.';
    } else if (!isValidDateInput(date)) {
      errors['typeOfAccount.transferOnDeath.individualAgreementDate'] =
        'Use YYYY-MM-DD format.';
    }
  }

  if (primaryType === 'transferOnDeathJoint') {
    const date = fields.typeOfAccount.transferOnDeath.jointAgreementDate;

    if (!date) {
      errors['typeOfAccount.transferOnDeath.jointAgreementDate'] = 'Agreement date is required.';
    } else if (!isValidDateInput(date)) {
      errors['typeOfAccount.transferOnDeath.jointAgreementDate'] = 'Use YYYY-MM-DD format.';
    }
  }

  if (primaryType === 'other' && !fields.typeOfAccount.otherDescription?.trim()) {
    errors['typeOfAccount.otherDescription'] = 'Please describe this account type.';
  }

  return errors;
}
