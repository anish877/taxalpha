
import type { Prisma } from '@prisma/client';

export const STEP_4_LABEL = 'STEP 4. SECONDARY ACCOUNT HOLDER INFORMATION (Joint Holder #2, Trustee #1, Entity Manager)';

const HOLDER_KIND_KEYS = ['person', 'entity'] as const;
const YES_NO_KEYS = ['yes', 'no'] as const;
const GENDER_KEYS = ['male', 'female'] as const;
const MARITAL_STATUS_KEYS = ['single', 'married', 'divorced', 'domesticPartner', 'widower'] as const;
const EMPLOYMENT_STATUS_KEYS = ['employed', 'selfEmployed', 'retired', 'unemployed', 'homemaker', 'student'] as const;
const KNOWLEDGE_LEVEL_KEYS = ['limited', 'moderate', 'extensive', 'none'] as const;
const TAX_BRACKET_KEYS = ['bracket_0_15', 'bracket_15_1_32', 'bracket_32_1_50', 'bracket_50_1_plus'] as const;
const RANGE_BUCKET_KEYS = [
  'under_50k',
  '50k_100k',
  '100k_250k',
  '250k_500k',
  '500k_1m',
  '1m_5m',
  '5m_plus'
] as const;
const INVESTMENT_TYPE_KEYS = [
  'commoditiesFutures',
  'equities',
  'exchangeTradedFunds',
  'fixedAnnuities',
  'fixedInsurance',
  'mutualFunds',
  'options',
  'preciousMetals',
  'realEstate',
  'unitInvestmentTrusts',
  'variableAnnuities',
  'leveragedInverseEtfs',
  'complexProducts',
  'alternativeInvestments',
  'other'
] as const;

const HOLDER_QUESTION_IDS = [
  'step4.holder.kind',
  'step4.holder.name',
  'step4.holder.taxId.ssn',
  'step4.holder.taxId.hasEin',
  'step4.holder.taxId.ein',
  'step4.holder.contact.email',
  'step4.holder.contact.dateOfBirth',
  'step4.holder.contact.specifiedAdult',
  'step4.holder.contact.phones.home',
  'step4.holder.contact.phones.business',
  'step4.holder.contact.phones.mobile',
  'step4.holder.legalAddress.line1',
  'step4.holder.legalAddress.city',
  'step4.holder.legalAddress.stateProvince',
  'step4.holder.legalAddress.postalCode',
  'step4.holder.legalAddress.country',
  'step4.holder.mailingDifferent',
  'step4.holder.mailingAddress.line1',
  'step4.holder.mailingAddress.city',
  'step4.holder.mailingAddress.stateProvince',
  'step4.holder.mailingAddress.postalCode',
  'step4.holder.mailingAddress.country',
  'step4.holder.citizenship.primary',
  'step4.holder.citizenship.additional',
  'step4.holder.gender',
  'step4.holder.maritalStatus',
  'step4.holder.employment.status',
  'step4.holder.employment.occupation',
  'step4.holder.employment.yearsEmployed',
  'step4.holder.employment.typeOfBusiness',
  'step4.holder.employment.employerName',
  'step4.holder.employment.employerAddress.line1',
  'step4.holder.employment.employerAddress.city',
  'step4.holder.employment.employerAddress.stateProvince',
  'step4.holder.employment.employerAddress.postalCode',
  'step4.holder.employment.employerAddress.country'
] as const;

type HolderQuestionId = (typeof HOLDER_QUESTION_IDS)[number];
type HolderKindKey = (typeof HOLDER_KIND_KEYS)[number];
type YesNoKey = (typeof YES_NO_KEYS)[number];
type GenderKey = (typeof GENDER_KEYS)[number];
type MaritalStatusKey = (typeof MARITAL_STATUS_KEYS)[number];
type EmploymentStatusKey = (typeof EMPLOYMENT_STATUS_KEYS)[number];
type KnowledgeLevelKey = (typeof KNOWLEDGE_LEVEL_KEYS)[number];
type TaxBracketKey = (typeof TAX_BRACKET_KEYS)[number];
type RangeBucketKey = (typeof RANGE_BUCKET_KEYS)[number];
type InvestmentTypeKey = (typeof INVESTMENT_TYPE_KEYS)[number];

type InvestmentKnowledgeQuestionId = `step4.investment.byType.${InvestmentTypeKey}.knowledge`;
type InvestmentSinceYearQuestionId = `step4.investment.byType.${InvestmentTypeKey}.sinceYear`;
type Step4GroupedQuestionId =
  | 'step4.holder.contact.phones'
  | 'step4.holder.legalAddress'
  | 'step4.holder.mailingAddress'
  | 'step4.investment.knowledgeExperience';

export type Step4QuestionId =
  | HolderQuestionId
  | Step4GroupedQuestionId
  | 'step4.investment.generalKnowledge'
  | InvestmentKnowledgeQuestionId
  | InvestmentSinceYearQuestionId
  | 'step4.investment.byType.other.label'
  | 'step4.financial.annualIncomeRange'
  | 'step4.financial.netWorthExPrimaryResidenceRange'
  | 'step4.financial.liquidNetWorthRange'
  | 'step4.financial.taxBracket'
  | 'step4.govId.photoId1'
  | 'step4.govId.photoId2'
  | 'step4.disclosure.employeeAdvisorFirm'
  | 'step4.disclosure.relatedAdvisorFirmEmployee'
  | 'step4.disclosure.employeeBrokerDealer'
  | 'step4.disclosure.relatedBrokerDealerEmployee'
  | 'step4.disclosure.maintainsOtherBrokerageAccounts'
  | 'step4.disclosure.exchangeOrFinraAffiliation'
  | 'step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany';

const INVESTMENT_KNOWLEDGE_QUESTION_IDS = INVESTMENT_TYPE_KEYS.map(
  (typeKey) => `step4.investment.byType.${typeKey}.knowledge` as InvestmentKnowledgeQuestionId
);
const INVESTMENT_SINCE_YEAR_QUESTION_IDS = INVESTMENT_TYPE_KEYS.map(
  (typeKey) => `step4.investment.byType.${typeKey}.sinceYear` as InvestmentSinceYearQuestionId
);
const GROUPED_STEP_4_QUESTION_IDS: Step4GroupedQuestionId[] = [
  'step4.holder.contact.phones',
  'step4.holder.legalAddress',
  'step4.holder.mailingAddress',
  'step4.investment.knowledgeExperience'
];

const STEP_4_QUESTION_IDS: Step4QuestionId[] = [
  ...HOLDER_QUESTION_IDS,
  ...GROUPED_STEP_4_QUESTION_IDS,
  'step4.investment.generalKnowledge',
  ...INVESTMENT_KNOWLEDGE_QUESTION_IDS,
  ...INVESTMENT_SINCE_YEAR_QUESTION_IDS,
  'step4.investment.byType.other.label',
  'step4.financial.annualIncomeRange',
  'step4.financial.netWorthExPrimaryResidenceRange',
  'step4.financial.liquidNetWorthRange',
  'step4.financial.taxBracket',
  'step4.govId.photoId1',
  'step4.govId.photoId2',
  'step4.disclosure.employeeAdvisorFirm',
  'step4.disclosure.relatedAdvisorFirmEmployee',
  'step4.disclosure.employeeBrokerDealer',
  'step4.disclosure.relatedBrokerDealerEmployee',
  'step4.disclosure.maintainsOtherBrokerageAccounts',
  'step4.disclosure.exchangeOrFinraAffiliation',
  'step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany'
];

const STEP_4_QUESTION_ID_SET = new Set<string>(STEP_4_QUESTION_IDS);
const RANGE_BUCKET_INDEX = new Map<RangeBucketKey, number>(
  RANGE_BUCKET_KEYS.map((key, index) => [key, index])
);
const INVESTMENT_TYPE_KEY_SET = new Set<string>(INVESTMENT_TYPE_KEYS);

interface Step4Address {
  line1: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
}

type HolderKindMap = Record<HolderKindKey, boolean>;
type YesNoMap = Record<YesNoKey, boolean>;
type GenderMap = Record<GenderKey, boolean>;
type MaritalStatusMap = Record<MaritalStatusKey, boolean>;
type EmploymentStatusMap = Record<EmploymentStatusKey, boolean>;
type KnowledgeLevelMap = Record<KnowledgeLevelKey, boolean>;
type TaxBracketMap = Record<TaxBracketKey, boolean>;

interface Step4InvestmentTypeExperience {
  knowledge: KnowledgeLevelMap;
  sinceYear: number | null;
}

type Step4InvestmentKnowledgeByType = Record<InvestmentTypeKey, Step4InvestmentTypeExperience> & {
  other: Step4InvestmentTypeExperience & {
    label: string | null;
  };
};

interface Step4Range {
  fromBracket: RangeBucketKey | null;
  toBracket: RangeBucketKey | null;
}

interface Step4PhotoId {
  type: string | null;
  idNumber: string | null;
  countryOfIssue: string | null;
  dateOfIssue: string | null;
  dateOfExpiration: string | null;
}

export interface Step4Fields {
  holder: {
    kind: HolderKindMap;
    name: string;
    taxId: {
      ssn: string | null;
      hasEin: YesNoMap;
      ein: string | null;
    };
    contact: {
      email: string;
      dateOfBirth: string | null;
      specifiedAdult: string | null;
      phones: {
        home: string | null;
        business: string | null;
        mobile: string | null;
      };
    };
    legalAddress: Step4Address;
    mailingDifferent: YesNoMap;
    mailingAddress: Step4Address;
    citizenship: {
      primary: string[];
      additional: string[];
    };
    gender: GenderMap;
    maritalStatus: MaritalStatusMap;
    employment: {
      status: EmploymentStatusMap;
      occupation: string | null;
      yearsEmployed: number | null;
      typeOfBusiness: string | null;
      employerName: string | null;
      employerAddress: Step4Address;
    };
  };
  investmentKnowledge: {
    general: KnowledgeLevelMap;
    byType: Step4InvestmentKnowledgeByType;
  };
  financialInformation: {
    annualIncomeRange: Step4Range;
    netWorthExPrimaryResidenceRange: Step4Range;
    liquidNetWorthRange: Step4Range;
    taxBracket: TaxBracketMap;
  };
  governmentIdentification: {
    photoId1: Step4PhotoId;
    photoId2: Step4PhotoId;
    requirementContext: {
      requiresDocumentaryId: boolean | null;
      isNonResidentAlien: boolean | null;
    };
  };
  affiliations: {
    employeeAdvisorFirm: YesNoMap;
    relatedAdvisorFirmEmployee: YesNoMap;
    advisorEmployeeName: string | null;
    advisorEmployeeRelationship: string | null;
    employeeBrokerDealer: YesNoMap;
    brokerDealerName: string | null;
    relatedBrokerDealerEmployee: YesNoMap;
    relatedBrokerDealerName: string | null;
    relatedBrokerDealerEmployeeName: string | null;
    relatedBrokerDealerRelationship: string | null;
    maintainsOtherBrokerageAccounts: YesNoMap;
    otherBrokerageFirms: string | null;
    yearsOfInvestmentExperience: number | null;
    exchangeOrFinraAffiliation: YesNoMap;
    affiliationDetails: string | null;
    seniorOfficerDirectorTenPercentPublicCompany: YesNoMap;
    publicCompanyNames: string | null;
  };
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

function toRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

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

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numberValue = Number(value);
    if (Number.isInteger(numberValue) && numberValue >= 0) {
      return numberValue;
    }
  }

  return null;
}

function normalizeBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function countTrueFlags(value: Record<string, boolean>): number {
  return Object.values(value).filter(Boolean).length;
}

function getSingleSelection<K extends string>(value: Record<K, boolean>, keys: readonly K[]): K | null {
  const selected = keys.filter((key) => value[key]);
  return selected.length === 1 ? selected[0] : null;
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

function getUtcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isPastDate(value: string): boolean {
  if (!isValidDateInput(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return parsed.getTime() < getUtcToday().getTime();
}

function isPastOrToday(value: string): boolean {
  if (!isValidDateInput(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return parsed.getTime() <= getUtcToday().getTime();
}

function isTodayOrFuture(value: string): boolean {
  if (!isValidDateInput(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return parsed.getTime() >= getUtcToday().getTime();
}

function isMinorDate(value: string | null): boolean {
  if (!value || !isValidDateInput(value)) {
    return false;
  }

  const dob = new Date(`${value}T00:00:00.000Z`);
  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth();
  const currentDay = today.getUTCDate();

  let age = currentYear - dob.getUTCFullYear();
  const hasBirthdayPassed =
    currentMonth > dob.getUTCMonth() ||
    (currentMonth === dob.getUTCMonth() && currentDay >= dob.getUTCDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return age < 18;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizeSsn(value: unknown): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  const digits = normalizeDigits(normalized);
  return digits.length > 0 ? digits : null;
}

function normalizeEin(value: unknown): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  const digits = normalizeDigits(normalized);
  return digits.length > 0 ? digits : null;
}

function isValidSsn(value: string): boolean {
  return /^\d{9}$/.test(value);
}

function isValidEin(value: string): boolean {
  return /^\d{9}$/.test(value);
}

function normalizeCountryCodes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const normalized = entry.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(normalized)) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function normalizeAddress(source: unknown): Step4Address {
  const record = toRecord(source);

  return {
    line1: normalizeNullableString(record.line1),
    city: normalizeNullableString(record.city),
    stateProvince: normalizeNullableString(record.stateProvince),
    postalCode: normalizeNullableString(record.postalCode),
    country: normalizeNullableString(record.country)?.toUpperCase() ?? null
  };
}

function emptyAddress(): Step4Address {
  return {
    line1: null,
    city: null,
    stateProvince: null,
    postalCode: null,
    country: null
  };
}

function normalizeRangeBucket(value: unknown): RangeBucketKey | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim() as RangeBucketKey;
  return RANGE_BUCKET_INDEX.has(normalized) ? normalized : null;
}

function normalizeRange(source: unknown): Step4Range {
  const record = toRecord(source);

  return {
    fromBracket: normalizeRangeBucket(record.fromBracket),
    toBracket: normalizeRangeBucket(record.toBracket)
  };
}

function emptyRange(): Step4Range {
  return {
    fromBracket: null,
    toBracket: null
  };
}

function normalizePhotoId(source: unknown): Step4PhotoId {
  const record = toRecord(source);

  return {
    type: normalizeNullableString(record.type),
    idNumber: normalizeNullableString(record.idNumber),
    countryOfIssue: normalizeNullableString(record.countryOfIssue)?.toUpperCase() ?? null,
    dateOfIssue: normalizeNullableString(record.dateOfIssue),
    dateOfExpiration: normalizeNullableString(record.dateOfExpiration)
  };
}

function emptyPhotoId(): Step4PhotoId {
  return {
    type: null,
    idNumber: null,
    countryOfIssue: null,
    dateOfIssue: null,
    dateOfExpiration: null
  };
}

function emptyInvestmentTypeExperience(): Step4InvestmentTypeExperience {
  return {
    knowledge: createBooleanMap(KNOWLEDGE_LEVEL_KEYS),
    sinceYear: null
  };
}

function emptyInvestmentKnowledgeByType(): Step4InvestmentKnowledgeByType {
  const byType = Object.fromEntries(
    INVESTMENT_TYPE_KEYS.map((key) => [key, emptyInvestmentTypeExperience()])
  ) as Record<InvestmentTypeKey, Step4InvestmentTypeExperience>;

  return {
    ...(byType as Step4InvestmentKnowledgeByType),
    other: {
      ...byType.other,
      label: null
    }
  };
}

function hasAnyPhone(fields: Step4Fields): boolean {
  return Boolean(
    fields.holder.contact.phones.home ||
      fields.holder.contact.phones.business ||
      fields.holder.contact.phones.mobile
  );
}

function isEmploymentActive(fields: Step4Fields): boolean {
  const selected = getSingleSelection(fields.holder.employment.status, EMPLOYMENT_STATUS_KEYS);
  return selected === 'employed' || selected === 'selfEmployed';
}

function clearEmploymentDetails(fields: Step4Fields): void {
  fields.holder.employment.occupation = null;
  fields.holder.employment.yearsEmployed = null;
  fields.holder.employment.typeOfBusiness = null;
  fields.holder.employment.employerName = null;
  fields.holder.employment.employerAddress = emptyAddress();
}

function clearPersonOnlyFields(fields: Step4Fields): void {
  fields.holder.taxId.ssn = null;
  fields.holder.contact.dateOfBirth = null;
  fields.holder.contact.specifiedAdult = null;
  fields.holder.gender = createBooleanMap(GENDER_KEYS);
  fields.holder.maritalStatus = createBooleanMap(MARITAL_STATUS_KEYS);
  fields.holder.employment.status = createBooleanMap(EMPLOYMENT_STATUS_KEYS);
  clearEmploymentDetails(fields);
}

function getKnowledgeSelectionForType(fields: Step4Fields, typeKey: InvestmentTypeKey): KnowledgeLevelKey | null {
  return getSingleSelection(fields.investmentKnowledge.byType[typeKey].knowledge, KNOWLEDGE_LEVEL_KEYS);
}

function getRangeOrderError(fromBracket: RangeBucketKey, toBracket: RangeBucketKey): string | null {
  const fromIndex = RANGE_BUCKET_INDEX.get(fromBracket);
  const toIndex = RANGE_BUCKET_INDEX.get(toBracket);

  if (fromIndex === undefined || toIndex === undefined) {
    return 'Select valid range options.';
  }

  return fromIndex <= toIndex ? null : 'The From range must be less than or equal to the To range.';
}

function isPhotoIdEmpty(block: Step4PhotoId): boolean {
  return !block.type && !block.idNumber && !block.countryOfIssue && !block.dateOfIssue && !block.dateOfExpiration;
}

function isPhotoIdComplete(block: Step4PhotoId): boolean {
  return Boolean(block.type && block.idNumber && block.countryOfIssue && block.dateOfIssue && block.dateOfExpiration);
}

function getInvestmentTypeFromQuestionId(
  questionId: Step4QuestionId,
  suffix: 'knowledge' | 'sinceYear'
): InvestmentTypeKey | null {
  const prefix = 'step4.investment.byType.';
  const expectedSuffix = `.${suffix}`;

  if (!questionId.startsWith(prefix) || !questionId.endsWith(expectedSuffix)) {
    return null;
  }

  const rawType = questionId.slice(prefix.length, questionId.length - expectedSuffix.length);
  return INVESTMENT_TYPE_KEY_SET.has(rawType) ? (rawType as InvestmentTypeKey) : null;
}

function sanitizeStep4Fields(fields: Step4Fields): Step4Fields {
  const next: Step4Fields = structuredClone(fields);
  const kind = getSingleSelection(next.holder.kind, HOLDER_KIND_KEYS);
  const hasEin = getSingleSelection(next.holder.taxId.hasEin, YES_NO_KEYS);
  const mailingDifferent = getSingleSelection(next.holder.mailingDifferent, YES_NO_KEYS);

  if (kind === 'entity') {
    clearPersonOnlyFields(next);
  } else if (kind === 'person' && !isMinorDate(next.holder.contact.dateOfBirth)) {
    next.holder.contact.specifiedAdult = null;
  }

  if (hasEin !== 'yes') {
    next.holder.taxId.ein = null;
  }

  if (mailingDifferent !== 'yes') {
    next.holder.mailingAddress = emptyAddress();
  }

  if (!isEmploymentActive(next)) {
    clearEmploymentDetails(next);
  }

  next.holder.citizenship.additional = next.holder.citizenship.additional.filter(
    (code) => !next.holder.citizenship.primary.includes(code)
  );

  for (const typeKey of INVESTMENT_TYPE_KEYS) {
    const knowledgeSelection = getKnowledgeSelectionForType(next, typeKey);

    if (knowledgeSelection === 'none') {
      next.investmentKnowledge.byType[typeKey].sinceYear = null;
      if (typeKey === 'other') {
        next.investmentKnowledge.byType.other.label = null;
      }
    }
  }

  if (getSingleSelection(next.affiliations.relatedAdvisorFirmEmployee, YES_NO_KEYS) !== 'yes') {
    next.affiliations.advisorEmployeeName = null;
    next.affiliations.advisorEmployeeRelationship = null;
  }

  if (getSingleSelection(next.affiliations.employeeBrokerDealer, YES_NO_KEYS) !== 'yes') {
    next.affiliations.brokerDealerName = null;
  }

  if (getSingleSelection(next.affiliations.relatedBrokerDealerEmployee, YES_NO_KEYS) !== 'yes') {
    next.affiliations.relatedBrokerDealerName = null;
    next.affiliations.relatedBrokerDealerEmployeeName = null;
    next.affiliations.relatedBrokerDealerRelationship = null;
  }

  if (getSingleSelection(next.affiliations.maintainsOtherBrokerageAccounts, YES_NO_KEYS) !== 'yes') {
    next.affiliations.otherBrokerageFirms = null;
    next.affiliations.yearsOfInvestmentExperience = null;
  }

  if (getSingleSelection(next.affiliations.exchangeOrFinraAffiliation, YES_NO_KEYS) !== 'yes') {
    next.affiliations.affiliationDetails = null;
  }

  if (
    getSingleSelection(next.affiliations.seniorOfficerDirectorTenPercentPublicCompany, YES_NO_KEYS) !==
    'yes'
  ) {
    next.affiliations.publicCompanyNames = null;
  }

  return next;
}

function validateSingleChoiceMap<K extends string>(
  answer: unknown,
  keys: readonly K[],
  fieldPath: string,
  label: string
): ValidationResult<Record<K, boolean>> {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `Please choose one ${label}.`
      }
    };
  }

  const normalized = createBooleanMap(keys, answer);

  if (countTrueFlags(normalized) !== 1) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `Please choose exactly one ${label}.`
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateRequiredString(answer: unknown, fieldPath: string, label: string): ValidationResult<string> {
  const normalized = normalizeRequiredString(answer);

  if (!normalized) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `${label} is required.`
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateOptionalPhone(answer: unknown, fieldPath: string): ValidationResult<string | null> {
  const normalized = normalizeNullableString(answer);

  if (!normalized) {
    return {
      success: true,
      value: null
    };
  }

  if (!/^[+\d()\-.\s]{7,20}$/.test(normalized)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: 'Enter a valid phone number.'
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateRequiredCountryCode(answer: unknown, fieldPath: string, label: string): ValidationResult<string> {
  const normalized = normalizeNullableString(answer)?.toUpperCase() ?? null;

  if (!normalized) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `${label} is required.`
      }
    };
  }

  if (!/^[A-Z]{2}$/.test(normalized)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `Enter a valid ${label.toLowerCase()}.`
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validatePoBoxFreeLine1(answer: unknown, fieldPath: string): ValidationResult<string> {
  const base = validateRequiredString(answer, fieldPath, 'Legal address');

  if (!base.success) {
    return base;
  }

  if (/p\.?\s*o\.?\s*box/i.test(base.value)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: 'P.O. Box is not allowed for legal address.'
      }
    };
  }

  return base;
}

function validatePhonesBlockAnswer(
  answer: unknown
): ValidationResult<Step4Fields['holder']['contact']['phones']> {
  const record = toRecord(answer);
  const fieldErrors: Record<string, string> = {};

  const homeValidation = validateOptionalPhone(record.home, 'step4.holder.contact.phones.home');
  if (!homeValidation.success) {
    Object.assign(fieldErrors, homeValidation.fieldErrors);
  }

  const businessValidation = validateOptionalPhone(record.business, 'step4.holder.contact.phones.business');
  if (!businessValidation.success) {
    Object.assign(fieldErrors, businessValidation.fieldErrors);
  }

  const mobileValidation = validateOptionalPhone(record.mobile, 'step4.holder.contact.phones.mobile');
  if (!mobileValidation.success) {
    Object.assign(fieldErrors, mobileValidation.fieldErrors);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      fieldErrors
    };
  }

  const phones = {
    home: homeValidation.success ? homeValidation.value : null,
    business: businessValidation.success ? businessValidation.value : null,
    mobile: mobileValidation.success ? mobileValidation.value : null
  };

  if (!phones.home && !phones.business && !phones.mobile) {
    return {
      success: false,
      fieldErrors: {
        'step4.holder.contact.phones.mobile':
          'Enter at least one phone number (home, business, or mobile).'
      }
    };
  }

  return {
    success: true,
    value: phones
  };
}

function validateAddressBlockAnswer(
  answer: unknown,
  addressType: 'legal' | 'mailing'
): ValidationResult<Step4Address> {
  const record = toRecord(answer);
  const fieldErrors: Record<string, string> = {};
  const prefix = addressType === 'legal' ? 'step4.holder.legalAddress' : 'step4.holder.mailingAddress';

  const line1Validation =
    addressType === 'legal'
      ? validatePoBoxFreeLine1(record.line1, `${prefix}.line1`)
      : validateRequiredString(record.line1, `${prefix}.line1`, 'Mailing address');
  if (!line1Validation.success) {
    Object.assign(fieldErrors, line1Validation.fieldErrors);
  }

  const cityValidation = validateRequiredString(
    record.city,
    `${prefix}.city`,
    addressType === 'legal' ? 'City' : 'Mailing city'
  );
  if (!cityValidation.success) {
    Object.assign(fieldErrors, cityValidation.fieldErrors);
  }

  const stateProvinceValidation = validateRequiredString(
    record.stateProvince,
    `${prefix}.stateProvince`,
    addressType === 'legal' ? 'State/Province' : 'Mailing state/province'
  );
  if (!stateProvinceValidation.success) {
    Object.assign(fieldErrors, stateProvinceValidation.fieldErrors);
  }

  const postalCodeValidation = validateRequiredString(
    record.postalCode,
    `${prefix}.postalCode`,
    addressType === 'legal' ? 'ZIP/Postal code' : 'Mailing ZIP/Postal code'
  );
  if (!postalCodeValidation.success) {
    Object.assign(fieldErrors, postalCodeValidation.fieldErrors);
  }

  const countryValidation = validateRequiredCountryCode(
    record.country,
    `${prefix}.country`,
    addressType === 'legal' ? 'Country' : 'Mailing country'
  );
  if (!countryValidation.success) {
    Object.assign(fieldErrors, countryValidation.fieldErrors);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      fieldErrors
    };
  }

  return {
    success: true,
    value: {
      line1: line1Validation.success ? line1Validation.value : null,
      city: cityValidation.success ? cityValidation.value : null,
      stateProvince: stateProvinceValidation.success ? stateProvinceValidation.value : null,
      postalCode: postalCodeValidation.success ? postalCodeValidation.value : null,
      country: countryValidation.success ? countryValidation.value : null
    }
  };
}

function validateInvestmentKnowledgeExperienceAnswer(
  answer: unknown
): ValidationResult<Step4Fields['investmentKnowledge']> {
  const record = toRecord(answer);
  const fieldErrors: Record<string, string> = {};

  const generalValidation = validateSingleChoiceMap(
    record.general,
    KNOWLEDGE_LEVEL_KEYS,
    'step4.investment.generalKnowledge',
    'knowledge level'
  );
  if (!generalValidation.success) {
    Object.assign(fieldErrors, generalValidation.fieldErrors);
  }

  const byTypeRecord = toRecord(record.byType);
  const byType = emptyInvestmentKnowledgeByType();

  for (const typeKey of INVESTMENT_TYPE_KEYS) {
    const typeQuestionPrefix = `step4.investment.byType.${typeKey}`;
    const typeRecord = toRecord(byTypeRecord[typeKey]);
    const knowledgeValidation = validateSingleChoiceMap(
      typeRecord.knowledge,
      KNOWLEDGE_LEVEL_KEYS,
      `${typeQuestionPrefix}.knowledge`,
      'knowledge level'
    );

    if (!knowledgeValidation.success) {
      Object.assign(fieldErrors, knowledgeValidation.fieldErrors);
      continue;
    }

    byType[typeKey].knowledge = knowledgeValidation.value;
    const selection = getSingleSelection(knowledgeValidation.value, KNOWLEDGE_LEVEL_KEYS);

    if (selection && selection !== 'none') {
      const sinceYearValidation = validateRequiredYear(
        typeRecord.sinceYear,
        `${typeQuestionPrefix}.sinceYear`,
        'Since year'
      );

      if (!sinceYearValidation.success) {
        Object.assign(fieldErrors, sinceYearValidation.fieldErrors);
      } else {
        byType[typeKey].sinceYear = sinceYearValidation.value;
      }

      if (typeKey === 'other') {
        const labelValidation = validateRequiredString(
          typeRecord.label,
          'step4.investment.byType.other.label',
          'Other investment type'
        );

        if (!labelValidation.success) {
          Object.assign(fieldErrors, labelValidation.fieldErrors);
        } else {
          byType.other.label = labelValidation.value;
        }
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      fieldErrors
    };
  }

  return {
    success: true,
    value: {
      general: generalValidation.success ? generalValidation.value : createBooleanMap(KNOWLEDGE_LEVEL_KEYS),
      byType
    }
  };
}

function validateRequiredPastDate(answer: unknown, fieldPath: string, label: string): ValidationResult<string> {
  const normalized = normalizeNullableString(answer);

  if (!normalized) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `${label} is required.`
      }
    };
  }

  if (!isValidDateInput(normalized)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `Enter a valid ${label.toLowerCase()} in YYYY-MM-DD format.`
      }
    };
  }

  if (!isPastDate(normalized)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `${label} must be in the past.`
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateCountryArray(answer: unknown, fieldPath: string, minCount: number): ValidationResult<string[]> {
  const normalized = normalizeCountryCodes(answer);

  if (normalized.length < minCount) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]:
          minCount === 1 ? 'Select at least one country.' : `Select at least ${minCount} countries.`
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateRequiredYear(answer: unknown, fieldPath: string, label: string): ValidationResult<number> {
  if (answer === '' || answer === null || answer === undefined) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `${label} is required.`
      }
    };
  }

  const numberValue = typeof answer === 'number' ? answer : Number(answer);
  const currentYear = getUtcToday().getUTCFullYear();

  if (!Number.isInteger(numberValue) || numberValue < 1900 || numberValue > currentYear) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: `Enter a valid ${label.toLowerCase()} between 1900 and ${currentYear}.`
      }
    };
  }

  return {
    success: true,
    value: numberValue
  };
}

function validateRangeAnswer(answer: unknown, questionId: string): ValidationResult<Step4Range> {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return {
      success: false,
      fieldErrors: {
        [`${questionId}.fromBracket`]: 'Choose a From range.',
        [`${questionId}.toBracket`]: 'Choose a To range.'
      }
    };
  }

  const range = normalizeRange(answer);
  const fieldErrors: Record<string, string> = {};

  if (!range.fromBracket) {
    fieldErrors[`${questionId}.fromBracket`] = 'Choose a From range.';
  }

  if (!range.toBracket) {
    fieldErrors[`${questionId}.toBracket`] = 'Choose a To range.';
  }

  if (range.fromBracket && range.toBracket) {
    const rangeOrderError = getRangeOrderError(range.fromBracket, range.toBracket);
    if (rangeOrderError) {
      fieldErrors[`${questionId}.toBracket`] = rangeOrderError;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      fieldErrors
    };
  }

  return {
    success: true,
    value: range
  };
}

function validatePhotoIdBlock(block: Step4PhotoId, questionId: string): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  const empty = isPhotoIdEmpty(block);

  if (empty) {
    return fieldErrors;
  }

  if (!block.type) {
    fieldErrors[`${questionId}.type`] = 'Photo ID type is required.';
  }

  if (!block.idNumber) {
    fieldErrors[`${questionId}.idNumber`] = 'ID number is required.';
  }

  if (!block.countryOfIssue) {
    fieldErrors[`${questionId}.countryOfIssue`] = 'Country of issue is required.';
  } else if (!/^[A-Z]{2}$/.test(block.countryOfIssue)) {
    fieldErrors[`${questionId}.countryOfIssue`] = 'Enter a valid country of issue.';
  }

  if (!block.dateOfIssue) {
    fieldErrors[`${questionId}.dateOfIssue`] = 'Date of issue is required.';
  } else if (!isValidDateInput(block.dateOfIssue)) {
    fieldErrors[`${questionId}.dateOfIssue`] = 'Use YYYY-MM-DD format for date of issue.';
  } else if (!isPastOrToday(block.dateOfIssue)) {
    fieldErrors[`${questionId}.dateOfIssue`] = 'Date of issue cannot be in the future.';
  }

  if (!block.dateOfExpiration) {
    fieldErrors[`${questionId}.dateOfExpiration`] = 'Date of expiration is required.';
  } else if (!isValidDateInput(block.dateOfExpiration)) {
    fieldErrors[`${questionId}.dateOfExpiration`] = 'Use YYYY-MM-DD format for date of expiration.';
  } else if (!isTodayOrFuture(block.dateOfExpiration)) {
    fieldErrors[`${questionId}.dateOfExpiration`] = 'Photo ID is expired. Enter an unexpired ID.';
  }

  if (
    block.dateOfIssue &&
    block.dateOfExpiration &&
    isValidDateInput(block.dateOfIssue) &&
    isValidDateInput(block.dateOfExpiration)
  ) {
    const issue = new Date(`${block.dateOfIssue}T00:00:00.000Z`);
    const expiration = new Date(`${block.dateOfExpiration}T00:00:00.000Z`);

    if (expiration.getTime() < issue.getTime()) {
      fieldErrors[`${questionId}.dateOfExpiration`] =
        'Date of expiration must be on or after date of issue.';
    }
  }

  return fieldErrors;
}

function validateDisclosureObject(answer: unknown): Record<string, unknown> {
  return toRecord(answer);
}

function validateRequiredWhenYes(
  yesNoSelection: YesNoMap,
  fieldValue: unknown,
  label: string
): string | null {
  const selection = getSingleSelection(yesNoSelection, YES_NO_KEYS);

  if (selection !== 'yes') {
    return null;
  }

  const normalized = normalizeNullableString(fieldValue);
  if (!normalized) {
    return `${label} is required.`;
  }

  return null;
}

function validateStep4RangesForCompletion(
  errors: Record<string, string>,
  range: Step4Range,
  questionId:
    | 'step4.financial.annualIncomeRange'
    | 'step4.financial.netWorthExPrimaryResidenceRange'
    | 'step4.financial.liquidNetWorthRange',
  label: string
): void {
  if (!range.fromBracket) {
    errors[`${questionId}.fromBracket`] = `${label} from range is required.`;
  }

  if (!range.toBracket) {
    errors[`${questionId}.toBracket`] = `${label} to range is required.`;
  }

  if (range.fromBracket && range.toBracket) {
    const orderError = getRangeOrderError(range.fromBracket, range.toBracket);
    if (orderError) {
      errors[`${questionId}.toBracket`] = orderError;
    }
  }
}

function validateAffiliationCompletion(
  errors: Record<string, string>,
  fields: Step4Fields['affiliations']
): void {
  if (countTrueFlags(fields.employeeAdvisorFirm) !== 1) {
    errors['step4.disclosure.employeeAdvisorFirm'] = 'Select Yes or No.';
  }

  if (countTrueFlags(fields.relatedAdvisorFirmEmployee) !== 1) {
    errors['step4.disclosure.relatedAdvisorFirmEmployee'] = 'Select Yes or No.';
  } else if (getSingleSelection(fields.relatedAdvisorFirmEmployee, YES_NO_KEYS) === 'yes') {
    if (!fields.advisorEmployeeName?.trim()) {
      errors['step4.disclosure.relatedAdvisorFirmEmployee.advisorEmployeeName'] =
        'Employee name is required.';
    }

    if (!fields.advisorEmployeeRelationship?.trim()) {
      errors['step4.disclosure.relatedAdvisorFirmEmployee.advisorEmployeeRelationship'] =
        'Relationship is required.';
    }
  }

  if (countTrueFlags(fields.employeeBrokerDealer) !== 1) {
    errors['step4.disclosure.employeeBrokerDealer'] = 'Select Yes or No.';
  } else if (getSingleSelection(fields.employeeBrokerDealer, YES_NO_KEYS) === 'yes') {
    if (!fields.brokerDealerName?.trim()) {
      errors['step4.disclosure.employeeBrokerDealer.brokerDealerName'] =
        'Broker-dealer name is required.';
    }
  }

  if (countTrueFlags(fields.relatedBrokerDealerEmployee) !== 1) {
    errors['step4.disclosure.relatedBrokerDealerEmployee'] = 'Select Yes or No.';
  } else if (getSingleSelection(fields.relatedBrokerDealerEmployee, YES_NO_KEYS) === 'yes') {
    if (!fields.relatedBrokerDealerName?.trim()) {
      errors['step4.disclosure.relatedBrokerDealerEmployee.relatedBrokerDealerName'] =
        'Broker-dealer name is required.';
    }

    if (!fields.relatedBrokerDealerEmployeeName?.trim()) {
      errors['step4.disclosure.relatedBrokerDealerEmployee.relatedBrokerDealerEmployeeName'] =
        'Employee name is required.';
    }

    if (!fields.relatedBrokerDealerRelationship?.trim()) {
      errors['step4.disclosure.relatedBrokerDealerEmployee.relatedBrokerDealerRelationship'] =
        'Relationship is required.';
    }
  }

  if (countTrueFlags(fields.maintainsOtherBrokerageAccounts) !== 1) {
    errors['step4.disclosure.maintainsOtherBrokerageAccounts'] = 'Select Yes or No.';
  } else if (getSingleSelection(fields.maintainsOtherBrokerageAccounts, YES_NO_KEYS) === 'yes') {
    if (!fields.otherBrokerageFirms?.trim()) {
      errors['step4.disclosure.maintainsOtherBrokerageAccounts.otherBrokerageFirms'] =
        'Firm name is required.';
    }

    if (
      typeof fields.yearsOfInvestmentExperience !== 'number' ||
      !Number.isInteger(fields.yearsOfInvestmentExperience) ||
      fields.yearsOfInvestmentExperience < 0
    ) {
      errors['step4.disclosure.maintainsOtherBrokerageAccounts.yearsOfInvestmentExperience'] =
        'Years of investment experience is required.';
    }
  }

  if (countTrueFlags(fields.exchangeOrFinraAffiliation) !== 1) {
    errors['step4.disclosure.exchangeOrFinraAffiliation'] = 'Select Yes or No.';
  } else if (getSingleSelection(fields.exchangeOrFinraAffiliation, YES_NO_KEYS) === 'yes') {
    if (!fields.affiliationDetails?.trim()) {
      errors['step4.disclosure.exchangeOrFinraAffiliation.affiliationDetails'] =
        'Affiliation details are required.';
    }
  }

  if (countTrueFlags(fields.seniorOfficerDirectorTenPercentPublicCompany) !== 1) {
    errors['step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany'] = 'Select Yes or No.';
  } else if (
    getSingleSelection(fields.seniorOfficerDirectorTenPercentPublicCompany, YES_NO_KEYS) === 'yes'
  ) {
    if (!fields.publicCompanyNames?.trim()) {
      errors['step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany.publicCompanyNames'] =
        'Company name(s) are required.';
    }
  }
}

export function getStep4QuestionIds(): readonly Step4QuestionId[] {
  return STEP_4_QUESTION_IDS;
}

export function isStep4QuestionId(value: string): value is Step4QuestionId {
  return STEP_4_QUESTION_ID_SET.has(value);
}

export function defaultStep4Fields(): Step4Fields {
  return {
    holder: {
      kind: createBooleanMap(HOLDER_KIND_KEYS),
      name: '',
      taxId: {
        ssn: null,
        hasEin: createBooleanMap(YES_NO_KEYS),
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
      legalAddress: emptyAddress(),
      mailingDifferent: createBooleanMap(YES_NO_KEYS),
      mailingAddress: emptyAddress(),
      citizenship: {
        primary: [],
        additional: []
      },
      gender: createBooleanMap(GENDER_KEYS),
      maritalStatus: createBooleanMap(MARITAL_STATUS_KEYS),
      employment: {
        status: createBooleanMap(EMPLOYMENT_STATUS_KEYS),
        occupation: null,
        yearsEmployed: null,
        typeOfBusiness: null,
        employerName: null,
        employerAddress: emptyAddress()
      }
    },
    investmentKnowledge: {
      general: createBooleanMap(KNOWLEDGE_LEVEL_KEYS),
      byType: emptyInvestmentKnowledgeByType()
    },
    financialInformation: {
      annualIncomeRange: emptyRange(),
      netWorthExPrimaryResidenceRange: emptyRange(),
      liquidNetWorthRange: emptyRange(),
      taxBracket: createBooleanMap(TAX_BRACKET_KEYS)
    },
    governmentIdentification: {
      photoId1: emptyPhotoId(),
      photoId2: emptyPhotoId(),
      requirementContext: {
        requiresDocumentaryId: null,
        isNonResidentAlien: null
      }
    },
    affiliations: {
      employeeAdvisorFirm: createBooleanMap(YES_NO_KEYS),
      relatedAdvisorFirmEmployee: createBooleanMap(YES_NO_KEYS),
      advisorEmployeeName: null,
      advisorEmployeeRelationship: null,
      employeeBrokerDealer: createBooleanMap(YES_NO_KEYS),
      brokerDealerName: null,
      relatedBrokerDealerEmployee: createBooleanMap(YES_NO_KEYS),
      relatedBrokerDealerName: null,
      relatedBrokerDealerEmployeeName: null,
      relatedBrokerDealerRelationship: null,
      maintainsOtherBrokerageAccounts: createBooleanMap(YES_NO_KEYS),
      otherBrokerageFirms: null,
      yearsOfInvestmentExperience: null,
      exchangeOrFinraAffiliation: createBooleanMap(YES_NO_KEYS),
      affiliationDetails: null,
      seniorOfficerDirectorTenPercentPublicCompany: createBooleanMap(YES_NO_KEYS),
      publicCompanyNames: null
    }
  };
}

export function normalizeStep4Fields(Step4Data: Prisma.JsonValue | null | undefined): Step4Fields {
  const defaults = defaultStep4Fields();
  const root = toRecord(Step4Data);
  const holder = toRecord(root.holder);
  const taxId = toRecord(holder.taxId);
  const contact = toRecord(holder.contact);
  const phones = toRecord(contact.phones);
  const citizenship = toRecord(holder.citizenship);
  const employment = toRecord(holder.employment);
  const investmentKnowledge = toRecord(root.investmentKnowledge);
  const byType = toRecord(investmentKnowledge.byType);
  const financialInformation = toRecord(root.financialInformation);
  const governmentIdentification = toRecord(root.governmentIdentification);
  const requirementContext = toRecord(governmentIdentification.requirementContext);
  const affiliations = toRecord(root.affiliations);

  const normalizedByType = emptyInvestmentKnowledgeByType();

  for (const typeKey of INVESTMENT_TYPE_KEYS) {
    const typeRecord = toRecord(byType[typeKey]);

    if (typeKey === 'other') {
      normalizedByType.other = {
        knowledge: createBooleanMap(KNOWLEDGE_LEVEL_KEYS, typeRecord.knowledge),
        sinceYear: normalizeNonNegativeInteger(typeRecord.sinceYear),
        label: normalizeNullableString(typeRecord.label)
      };
      continue;
    }

    normalizedByType[typeKey] = {
      knowledge: createBooleanMap(KNOWLEDGE_LEVEL_KEYS, typeRecord.knowledge),
      sinceYear: normalizeNonNegativeInteger(typeRecord.sinceYear)
    };
  }

  const normalized: Step4Fields = {
    ...defaults,
    holder: {
      kind: createBooleanMap(HOLDER_KIND_KEYS, holder.kind),
      name: normalizeRequiredString(holder.name),
      taxId: {
        ssn: normalizeSsn(taxId.ssn),
        hasEin: createBooleanMap(YES_NO_KEYS, taxId.hasEin),
        ein: normalizeEin(taxId.ein)
      },
      contact: {
        email: normalizeRequiredString(contact.email),
        dateOfBirth: normalizeNullableString(contact.dateOfBirth),
        specifiedAdult: normalizeNullableString(contact.specifiedAdult),
        phones: {
          home: normalizeNullableString(phones.home),
          business: normalizeNullableString(phones.business),
          mobile: normalizeNullableString(phones.mobile)
        }
      },
      legalAddress: normalizeAddress(holder.legalAddress),
      mailingDifferent: createBooleanMap(YES_NO_KEYS, holder.mailingDifferent),
      mailingAddress: normalizeAddress(holder.mailingAddress),
      citizenship: {
        primary: normalizeCountryCodes(citizenship.primary),
        additional: normalizeCountryCodes(citizenship.additional)
      },
      gender: createBooleanMap(GENDER_KEYS, holder.gender),
      maritalStatus: createBooleanMap(MARITAL_STATUS_KEYS, holder.maritalStatus),
      employment: {
        status: createBooleanMap(EMPLOYMENT_STATUS_KEYS, employment.status),
        occupation: normalizeNullableString(employment.occupation),
        yearsEmployed: normalizeNonNegativeInteger(employment.yearsEmployed),
        typeOfBusiness: normalizeNullableString(employment.typeOfBusiness),
        employerName: normalizeNullableString(employment.employerName),
        employerAddress: normalizeAddress(employment.employerAddress)
      }
    },
    investmentKnowledge: {
      general: createBooleanMap(KNOWLEDGE_LEVEL_KEYS, investmentKnowledge.general),
      byType: normalizedByType
    },
    financialInformation: {
      annualIncomeRange: normalizeRange(financialInformation.annualIncomeRange),
      netWorthExPrimaryResidenceRange: normalizeRange(financialInformation.netWorthExPrimaryResidenceRange),
      liquidNetWorthRange: normalizeRange(financialInformation.liquidNetWorthRange),
      taxBracket: createBooleanMap(TAX_BRACKET_KEYS, financialInformation.taxBracket)
    },
    governmentIdentification: {
      photoId1: normalizePhotoId(governmentIdentification.photoId1),
      photoId2: normalizePhotoId(governmentIdentification.photoId2),
      requirementContext: {
        requiresDocumentaryId: normalizeBooleanOrNull(requirementContext.requiresDocumentaryId),
        isNonResidentAlien: normalizeBooleanOrNull(requirementContext.isNonResidentAlien)
      }
    },
    affiliations: {
      employeeAdvisorFirm: createBooleanMap(YES_NO_KEYS, affiliations.employeeAdvisorFirm),
      relatedAdvisorFirmEmployee: createBooleanMap(YES_NO_KEYS, affiliations.relatedAdvisorFirmEmployee),
      advisorEmployeeName: normalizeNullableString(affiliations.advisorEmployeeName),
      advisorEmployeeRelationship: normalizeNullableString(affiliations.advisorEmployeeRelationship),
      employeeBrokerDealer: createBooleanMap(YES_NO_KEYS, affiliations.employeeBrokerDealer),
      brokerDealerName: normalizeNullableString(affiliations.brokerDealerName),
      relatedBrokerDealerEmployee: createBooleanMap(YES_NO_KEYS, affiliations.relatedBrokerDealerEmployee),
      relatedBrokerDealerName: normalizeNullableString(affiliations.relatedBrokerDealerName),
      relatedBrokerDealerEmployeeName: normalizeNullableString(affiliations.relatedBrokerDealerEmployeeName),
      relatedBrokerDealerRelationship: normalizeNullableString(affiliations.relatedBrokerDealerRelationship),
      maintainsOtherBrokerageAccounts: createBooleanMap(YES_NO_KEYS, affiliations.maintainsOtherBrokerageAccounts),
      otherBrokerageFirms: normalizeNullableString(affiliations.otherBrokerageFirms),
      yearsOfInvestmentExperience: normalizeNonNegativeInteger(affiliations.yearsOfInvestmentExperience),
      exchangeOrFinraAffiliation: createBooleanMap(YES_NO_KEYS, affiliations.exchangeOrFinraAffiliation),
      affiliationDetails: normalizeNullableString(affiliations.affiliationDetails),
      seniorOfficerDirectorTenPercentPublicCompany: createBooleanMap(
        YES_NO_KEYS,
        affiliations.seniorOfficerDirectorTenPercentPublicCompany
      ),
      publicCompanyNames: normalizeNullableString(affiliations.publicCompanyNames)
    }
  };

  return sanitizeStep4Fields(normalized);
}

export function serializeStep4Fields(fields: Step4Fields): Prisma.InputJsonValue {
  return sanitizeStep4Fields(fields) as unknown as Prisma.InputJsonValue;
}

function isPerson(fields: Step4Fields): boolean {
  return getSingleSelection(fields.holder.kind, HOLDER_KIND_KEYS) === 'person';
}

function hasEin(fields: Step4Fields): boolean {
  return getSingleSelection(fields.holder.taxId.hasEin, YES_NO_KEYS) === 'yes';
}

function hasDifferentMailing(fields: Step4Fields): boolean {
  return getSingleSelection(fields.holder.mailingDifferent, YES_NO_KEYS) === 'yes';
}

export function getVisibleStep4QuestionIds(fields: Step4Fields): Step4QuestionId[] {
  const sanitized = sanitizeStep4Fields(fields);
  const person = isPerson(sanitized);
  const showEin = hasEin(sanitized);
  const showMailing = hasDifferentMailing(sanitized);
  const showSpecifiedAdult = person && isMinorDate(sanitized.holder.contact.dateOfBirth);
  const showEmploymentDetails = person && isEmploymentActive(sanitized);

  const visible: Step4QuestionId[] = ['step4.holder.kind', 'step4.holder.name'];

  if (person) {
    visible.push('step4.holder.taxId.ssn');
  }

  visible.push('step4.holder.taxId.hasEin');

  if (showEin) {
    visible.push('step4.holder.taxId.ein');
  }

  visible.push('step4.holder.contact.email');

  if (person) {
    visible.push('step4.holder.contact.dateOfBirth');
  }

  if (showSpecifiedAdult) {
    visible.push('step4.holder.contact.specifiedAdult');
  }

  visible.push('step4.holder.contact.phones');
  visible.push('step4.holder.legalAddress');
  visible.push('step4.holder.mailingDifferent');

  if (showMailing) {
    visible.push('step4.holder.mailingAddress');
  }

  visible.push('step4.holder.citizenship.primary');
  visible.push('step4.holder.citizenship.additional');

  if (person) {
    visible.push('step4.holder.gender');
    visible.push('step4.holder.maritalStatus');
    visible.push('step4.holder.employment.status');
  }

  if (showEmploymentDetails) {
    visible.push('step4.holder.employment.occupation');
    visible.push('step4.holder.employment.yearsEmployed');
    visible.push('step4.holder.employment.typeOfBusiness');
    visible.push('step4.holder.employment.employerName');
    visible.push('step4.holder.employment.employerAddress.line1');
    visible.push('step4.holder.employment.employerAddress.city');
    visible.push('step4.holder.employment.employerAddress.stateProvince');
    visible.push('step4.holder.employment.employerAddress.postalCode');
    visible.push('step4.holder.employment.employerAddress.country');
  }

  visible.push('step4.investment.knowledgeExperience');

  visible.push('step4.financial.annualIncomeRange');
  visible.push('step4.financial.netWorthExPrimaryResidenceRange');
  visible.push('step4.financial.liquidNetWorthRange');
  visible.push('step4.financial.taxBracket');

  visible.push('step4.govId.photoId1');
  visible.push('step4.govId.photoId2');

  visible.push('step4.disclosure.employeeAdvisorFirm');
  visible.push('step4.disclosure.relatedAdvisorFirmEmployee');
  visible.push('step4.disclosure.employeeBrokerDealer');
  visible.push('step4.disclosure.relatedBrokerDealerEmployee');
  visible.push('step4.disclosure.maintainsOtherBrokerageAccounts');
  visible.push('step4.disclosure.exchangeOrFinraAffiliation');
  visible.push('step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany');

  return visible;
}

export function clampStep4QuestionIndex(index: number | null | undefined, visibleQuestionIds: Step4QuestionId[]): number {
  if (visibleQuestionIds.length === 0) {
    return 0;
  }

  if (typeof index !== 'number' || Number.isNaN(index) || index < 0) {
    return 0;
  }

  if (index >= visibleQuestionIds.length) {
    return visibleQuestionIds.length - 1;
  }

  return index;
}

export function validateStep4Answer(
  questionId: Step4QuestionId,
  answer: unknown,
  currentFields?: Step4Fields
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step4.holder.kind':
      return validateSingleChoiceMap(answer, HOLDER_KIND_KEYS, 'step4.holder.kind', 'holder type');
    case 'step4.holder.name':
      return validateRequiredString(answer, 'step4.holder.name', 'Name');
    case 'step4.holder.taxId.ssn': {
      const normalized = normalizeSsn(answer);
      if (!normalized) {
        return {
          success: false,
          fieldErrors: {
            'step4.holder.taxId.ssn': 'SSN is required.'
          }
        };
      }

      if (!isValidSsn(normalized)) {
        return {
          success: false,
          fieldErrors: {
            'step4.holder.taxId.ssn': 'Enter a valid SSN.'
          }
        };
      }

      return { success: true, value: normalized };
    }
    case 'step4.holder.taxId.hasEin':
      return validateSingleChoiceMap(answer, YES_NO_KEYS, 'step4.holder.taxId.hasEin', 'EIN option');
    case 'step4.holder.taxId.ein': {
      const normalized = normalizeEin(answer);
      if (!normalized) {
        return {
          success: false,
          fieldErrors: {
            'step4.holder.taxId.ein': 'EIN is required.'
          }
        };
      }

      if (!isValidEin(normalized)) {
        return {
          success: false,
          fieldErrors: {
            'step4.holder.taxId.ein': 'Enter a valid EIN.'
          }
        };
      }

      return { success: true, value: normalized };
    }
    case 'step4.holder.contact.email': {
      const normalized = normalizeRequiredString(answer);
      if (!normalized) {
        return {
          success: false,
          fieldErrors: {
            'step4.holder.contact.email': 'Email is required.'
          }
        };
      }

      if (!isValidEmail(normalized)) {
        return {
          success: false,
          fieldErrors: {
            'step4.holder.contact.email': 'Enter a valid email.'
          }
        };
      }

      return {
        success: true,
        value: normalized
      };
    }
    case 'step4.holder.contact.dateOfBirth':
      return validateRequiredPastDate(answer, 'step4.holder.contact.dateOfBirth', 'Date of birth');
    case 'step4.holder.contact.specifiedAdult':
      return validateRequiredString(answer, 'step4.holder.contact.specifiedAdult', 'Specified adult');
    case 'step4.holder.contact.phones':
      return validatePhonesBlockAnswer(answer);
    case 'step4.holder.contact.phones.home':
      return validateOptionalPhone(answer, 'step4.holder.contact.phones.home');
    case 'step4.holder.contact.phones.business':
      return validateOptionalPhone(answer, 'step4.holder.contact.phones.business');
    case 'step4.holder.contact.phones.mobile': {
      const validation = validateOptionalPhone(answer, 'step4.holder.contact.phones.mobile');
      if (!validation.success) {
        return validation;
      }

      if (currentFields) {
        const checkFields = structuredClone(currentFields);
        checkFields.holder.contact.phones.mobile = validation.value;

        if (!hasAnyPhone(checkFields)) {
          return {
            success: false,
            fieldErrors: {
              'step4.holder.contact.phones.mobile':
                'Enter at least one phone number (home, business, or mobile).'
            }
          };
        }
      }

      return validation;
    }
    case 'step4.holder.legalAddress':
      return validateAddressBlockAnswer(answer, 'legal');
    case 'step4.holder.legalAddress.line1':
      return validatePoBoxFreeLine1(answer, 'step4.holder.legalAddress.line1');
    case 'step4.holder.legalAddress.city':
      return validateRequiredString(answer, 'step4.holder.legalAddress.city', 'City');
    case 'step4.holder.legalAddress.stateProvince':
      return validateRequiredString(answer, 'step4.holder.legalAddress.stateProvince', 'State/Province');
    case 'step4.holder.legalAddress.postalCode':
      return validateRequiredString(answer, 'step4.holder.legalAddress.postalCode', 'ZIP/Postal code');
    case 'step4.holder.legalAddress.country':
      return validateRequiredCountryCode(
        answer,
        'step4.holder.legalAddress.country',
        'Country'
      );
    case 'step4.holder.mailingDifferent':
      return validateSingleChoiceMap(
        answer,
        YES_NO_KEYS,
        'step4.holder.mailingDifferent',
        'mailing preference'
      );
    case 'step4.holder.mailingAddress':
      return validateAddressBlockAnswer(answer, 'mailing');
    case 'step4.holder.mailingAddress.line1':
      return validateRequiredString(answer, 'step4.holder.mailingAddress.line1', 'Mailing address');
    case 'step4.holder.mailingAddress.city':
      return validateRequiredString(answer, 'step4.holder.mailingAddress.city', 'Mailing city');
    case 'step4.holder.mailingAddress.stateProvince':
      return validateRequiredString(
        answer,
        'step4.holder.mailingAddress.stateProvince',
        'Mailing state/province'
      );
    case 'step4.holder.mailingAddress.postalCode':
      return validateRequiredString(
        answer,
        'step4.holder.mailingAddress.postalCode',
        'Mailing ZIP/Postal code'
      );
    case 'step4.holder.mailingAddress.country':
      return validateRequiredCountryCode(
        answer,
        'step4.holder.mailingAddress.country',
        'Mailing country'
      );
    case 'step4.holder.citizenship.primary': {
      if (currentFields && !isPerson(currentFields)) {
        const value = normalizeCountryCodes(answer);
        if (value.length !== 1) {
          return {
            success: false,
            fieldErrors: {
              'step4.holder.citizenship.primary': 'Select exactly one country.'
            }
          };
        }

        return { success: true, value };
      }

      return validateCountryArray(answer, 'step4.holder.citizenship.primary', 1);
    }
    case 'step4.holder.citizenship.additional': {
      const normalized = normalizeCountryCodes(answer);
      const primaryCountries = currentFields?.holder.citizenship.primary ?? [];

      if (normalized.some((country) => primaryCountries.includes(country))) {
        return {
          success: false,
          fieldErrors: {
            'step4.holder.citizenship.additional':
              'Additional citizenship cannot duplicate primary citizenship.'
          }
        };
      }

      return {
        success: true,
        value: normalized
      };
    }
    case 'step4.holder.gender':
      return validateSingleChoiceMap(answer, GENDER_KEYS, 'step4.holder.gender', 'gender');
    case 'step4.holder.maritalStatus':
      return validateSingleChoiceMap(
        answer,
        MARITAL_STATUS_KEYS,
        'step4.holder.maritalStatus',
        'marital status'
      );
    case 'step4.holder.employment.status':
      return validateSingleChoiceMap(
        answer,
        EMPLOYMENT_STATUS_KEYS,
        'step4.holder.employment.status',
        'employment status'
      );
    case 'step4.holder.employment.occupation':
      return validateRequiredString(answer, 'step4.holder.employment.occupation', 'Occupation');
    case 'step4.holder.employment.yearsEmployed':
      return validateRequiredYear(answer, 'step4.holder.employment.yearsEmployed', 'Years employed');
    case 'step4.holder.employment.typeOfBusiness':
      return validateRequiredString(
        answer,
        'step4.holder.employment.typeOfBusiness',
        'Type of business'
      );
    case 'step4.holder.employment.employerName':
      return validateRequiredString(answer, 'step4.holder.employment.employerName', 'Employer name');
    case 'step4.holder.employment.employerAddress.line1':
      return validateRequiredString(
        answer,
        'step4.holder.employment.employerAddress.line1',
        'Employer address'
      );
    case 'step4.holder.employment.employerAddress.city':
      return validateRequiredString(
        answer,
        'step4.holder.employment.employerAddress.city',
        'Employer city'
      );
    case 'step4.holder.employment.employerAddress.stateProvince':
      return validateRequiredString(
        answer,
        'step4.holder.employment.employerAddress.stateProvince',
        'Employer state/province'
      );
    case 'step4.holder.employment.employerAddress.postalCode':
      return validateRequiredString(
        answer,
        'step4.holder.employment.employerAddress.postalCode',
        'Employer ZIP/Postal code'
      );
    case 'step4.holder.employment.employerAddress.country':
      return validateRequiredCountryCode(
        answer,
        'step4.holder.employment.employerAddress.country',
        'Employer country'
      );
    case 'step4.investment.generalKnowledge':
      return validateSingleChoiceMap(
        answer,
        KNOWLEDGE_LEVEL_KEYS,
        'step4.investment.generalKnowledge',
        'knowledge level'
      );
    case 'step4.investment.knowledgeExperience':
      return validateInvestmentKnowledgeExperienceAnswer(answer);
    case 'step4.investment.byType.other.label':
      return validateRequiredString(
        answer,
        'step4.investment.byType.other.label',
        'Other investment type'
      );
    case 'step4.financial.annualIncomeRange':
    case 'step4.financial.netWorthExPrimaryResidenceRange':
    case 'step4.financial.liquidNetWorthRange': {
      const rangeValidation = validateRangeAnswer(answer, questionId);
      if (!rangeValidation.success) {
        return rangeValidation;
      }

      if (questionId === 'step4.financial.liquidNetWorthRange' && currentFields) {
        const netWorthRange = currentFields.financialInformation.netWorthExPrimaryResidenceRange;

        if (netWorthRange.toBracket && rangeValidation.value.toBracket) {
          const netWorthToIndex = RANGE_BUCKET_INDEX.get(netWorthRange.toBracket) ?? -1;
          const liquidToIndex = RANGE_BUCKET_INDEX.get(rangeValidation.value.toBracket) ?? -1;

          if (liquidToIndex > netWorthToIndex) {
            return {
              success: false,
              fieldErrors: {
                'step4.financial.liquidNetWorthRange.toBracket':
                  'Liquid net worth cannot exceed net worth (excluding primary residence).'
              }
            };
          }
        }
      }

      return rangeValidation;
    }
    case 'step4.financial.taxBracket':
      return validateSingleChoiceMap(answer, TAX_BRACKET_KEYS, 'step4.financial.taxBracket', 'tax bracket');
    case 'step4.govId.photoId1':
    case 'step4.govId.photoId2': {
      const block = normalizePhotoId(answer);
      const errors = validatePhotoIdBlock(block, questionId);

      if (Object.keys(errors).length > 0) {
        return {
          success: false,
          fieldErrors: errors
        };
      }

      return {
        success: true,
        value: block
      };
    }
    case 'step4.disclosure.employeeAdvisorFirm':
      return validateSingleChoiceMap(
        answer,
        YES_NO_KEYS,
        'step4.disclosure.employeeAdvisorFirm',
        'option'
      );
    case 'step4.disclosure.relatedAdvisorFirmEmployee': {
      const record = validateDisclosureObject(answer);
      const selectionValidation = validateSingleChoiceMap(
        record.selection,
        YES_NO_KEYS,
        'step4.disclosure.relatedAdvisorFirmEmployee',
        'option'
      );

      if (!selectionValidation.success) {
        return selectionValidation;
      }

      const fieldErrors: Record<string, string> = {};
      const advisorEmployeeNameError = validateRequiredWhenYes(
        selectionValidation.value,
        record.advisorEmployeeName,
        'Employee name'
      );
      if (advisorEmployeeNameError) {
        fieldErrors['step4.disclosure.relatedAdvisorFirmEmployee.advisorEmployeeName'] =
          advisorEmployeeNameError;
      }

      const advisorEmployeeRelationshipError = validateRequiredWhenYes(
        selectionValidation.value,
        record.advisorEmployeeRelationship,
        'Relationship'
      );
      if (advisorEmployeeRelationshipError) {
        fieldErrors['step4.disclosure.relatedAdvisorFirmEmployee.advisorEmployeeRelationship'] =
          advisorEmployeeRelationshipError;
      }

      if (Object.keys(fieldErrors).length > 0) {
        return {
          success: false,
          fieldErrors
        };
      }

      return {
        success: true,
        value: {
          selection: selectionValidation.value,
          advisorEmployeeName: normalizeNullableString(record.advisorEmployeeName),
          advisorEmployeeRelationship: normalizeNullableString(record.advisorEmployeeRelationship)
        }
      };
    }
    case 'step4.disclosure.employeeBrokerDealer': {
      const record = validateDisclosureObject(answer);
      const selectionValidation = validateSingleChoiceMap(
        record.selection,
        YES_NO_KEYS,
        'step4.disclosure.employeeBrokerDealer',
        'option'
      );

      if (!selectionValidation.success) {
        return selectionValidation;
      }

      const fieldErrors: Record<string, string> = {};
      const brokerDealerNameError = validateRequiredWhenYes(
        selectionValidation.value,
        record.brokerDealerName,
        'Broker dealer name'
      );
      if (brokerDealerNameError) {
        fieldErrors['step4.disclosure.employeeBrokerDealer.brokerDealerName'] = brokerDealerNameError;
      }

      if (Object.keys(fieldErrors).length > 0) {
        return {
          success: false,
          fieldErrors
        };
      }

      return {
        success: true,
        value: {
          selection: selectionValidation.value,
          brokerDealerName: normalizeNullableString(record.brokerDealerName)
        }
      };
    }
    case 'step4.disclosure.relatedBrokerDealerEmployee': {
      const record = validateDisclosureObject(answer);
      const selectionValidation = validateSingleChoiceMap(
        record.selection,
        YES_NO_KEYS,
        'step4.disclosure.relatedBrokerDealerEmployee',
        'option'
      );

      if (!selectionValidation.success) {
        return selectionValidation;
      }

      const fieldErrors: Record<string, string> = {};
      const relatedBrokerDealerNameError = validateRequiredWhenYes(
        selectionValidation.value,
        record.relatedBrokerDealerName,
        'Broker dealer name'
      );
      if (relatedBrokerDealerNameError) {
        fieldErrors['step4.disclosure.relatedBrokerDealerEmployee.relatedBrokerDealerName'] =
          relatedBrokerDealerNameError;
      }

      const relatedBrokerDealerEmployeeNameError = validateRequiredWhenYes(
        selectionValidation.value,
        record.relatedBrokerDealerEmployeeName,
        'Employee name'
      );
      if (relatedBrokerDealerEmployeeNameError) {
        fieldErrors['step4.disclosure.relatedBrokerDealerEmployee.relatedBrokerDealerEmployeeName'] =
          relatedBrokerDealerEmployeeNameError;
      }

      const relatedBrokerDealerRelationshipError = validateRequiredWhenYes(
        selectionValidation.value,
        record.relatedBrokerDealerRelationship,
        'Relationship'
      );
      if (relatedBrokerDealerRelationshipError) {
        fieldErrors['step4.disclosure.relatedBrokerDealerEmployee.relatedBrokerDealerRelationship'] =
          relatedBrokerDealerRelationshipError;
      }

      if (Object.keys(fieldErrors).length > 0) {
        return {
          success: false,
          fieldErrors
        };
      }

      return {
        success: true,
        value: {
          selection: selectionValidation.value,
          relatedBrokerDealerName: normalizeNullableString(record.relatedBrokerDealerName),
          relatedBrokerDealerEmployeeName: normalizeNullableString(record.relatedBrokerDealerEmployeeName),
          relatedBrokerDealerRelationship: normalizeNullableString(record.relatedBrokerDealerRelationship)
        }
      };
    }
    case 'step4.disclosure.maintainsOtherBrokerageAccounts': {
      const record = validateDisclosureObject(answer);
      const selectionValidation = validateSingleChoiceMap(
        record.selection,
        YES_NO_KEYS,
        'step4.disclosure.maintainsOtherBrokerageAccounts',
        'option'
      );

      if (!selectionValidation.success) {
        return selectionValidation;
      }

      const fieldErrors: Record<string, string> = {};
      const firmsError = validateRequiredWhenYes(
        selectionValidation.value,
        record.otherBrokerageFirms,
        'Brokerage firm(s)'
      );
      if (firmsError) {
        fieldErrors['step4.disclosure.maintainsOtherBrokerageAccounts.otherBrokerageFirms'] = firmsError;
      }

      const selection = getSingleSelection(selectionValidation.value, YES_NO_KEYS);
      let yearsOfInvestmentExperience: number | null = normalizeNonNegativeInteger(
        record.yearsOfInvestmentExperience
      );

      if (selection === 'yes' && yearsOfInvestmentExperience === null) {
        fieldErrors['step4.disclosure.maintainsOtherBrokerageAccounts.yearsOfInvestmentExperience'] =
          'Years of investment experience is required.';
      }

      if (Object.keys(fieldErrors).length > 0) {
        return {
          success: false,
          fieldErrors
        };
      }

      if (selection !== 'yes') {
        yearsOfInvestmentExperience = null;
      }

      return {
        success: true,
        value: {
          selection: selectionValidation.value,
          otherBrokerageFirms: normalizeNullableString(record.otherBrokerageFirms),
          yearsOfInvestmentExperience
        }
      };
    }
    case 'step4.disclosure.exchangeOrFinraAffiliation': {
      const record = validateDisclosureObject(answer);
      const selectionValidation = validateSingleChoiceMap(
        record.selection,
        YES_NO_KEYS,
        'step4.disclosure.exchangeOrFinraAffiliation',
        'option'
      );

      if (!selectionValidation.success) {
        return selectionValidation;
      }

      const fieldErrors: Record<string, string> = {};
      const affiliationDetailsError = validateRequiredWhenYes(
        selectionValidation.value,
        record.affiliationDetails,
        'Affiliation details'
      );
      if (affiliationDetailsError) {
        fieldErrors['step4.disclosure.exchangeOrFinraAffiliation.affiliationDetails'] =
          affiliationDetailsError;
      }

      if (Object.keys(fieldErrors).length > 0) {
        return {
          success: false,
          fieldErrors
        };
      }

      return {
        success: true,
        value: {
          selection: selectionValidation.value,
          affiliationDetails: normalizeNullableString(record.affiliationDetails)
        }
      };
    }
    case 'step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany': {
      const record = validateDisclosureObject(answer);
      const selectionValidation = validateSingleChoiceMap(
        record.selection,
        YES_NO_KEYS,
        'step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany',
        'option'
      );

      if (!selectionValidation.success) {
        return selectionValidation;
      }

      const fieldErrors: Record<string, string> = {};
      const publicCompanyNamesError = validateRequiredWhenYes(
        selectionValidation.value,
        record.publicCompanyNames,
        'Company name(s)'
      );
      if (publicCompanyNamesError) {
        fieldErrors['step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany.publicCompanyNames'] =
          publicCompanyNamesError;
      }

      if (Object.keys(fieldErrors).length > 0) {
        return {
          success: false,
          fieldErrors
        };
      }

      return {
        success: true,
        value: {
          selection: selectionValidation.value,
          publicCompanyNames: normalizeNullableString(record.publicCompanyNames)
        }
      };
    }
    default: {
      const investmentKnowledgeType = getInvestmentTypeFromQuestionId(questionId, 'knowledge');
      if (investmentKnowledgeType) {
        return validateSingleChoiceMap(
          answer,
          KNOWLEDGE_LEVEL_KEYS,
          `step4.investment.byType.${investmentKnowledgeType}.knowledge`,
          'knowledge level'
        );
      }

      const investmentSinceYearType = getInvestmentTypeFromQuestionId(questionId, 'sinceYear');
      if (investmentSinceYearType) {
        return validateRequiredYear(
          answer,
          `step4.investment.byType.${investmentSinceYearType}.sinceYear`,
          'Since year'
        );
      }

      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
    }
  }
}

export function applyStep4Answer(fields: Step4Fields, questionId: Step4QuestionId, answer: unknown): Step4Fields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step4.holder.kind':
      next.holder.kind = answer as HolderKindMap;
      break;
    case 'step4.holder.name':
      next.holder.name = answer as string;
      break;
    case 'step4.holder.taxId.ssn':
      next.holder.taxId.ssn = answer as string;
      break;
    case 'step4.holder.taxId.hasEin':
      next.holder.taxId.hasEin = answer as YesNoMap;
      break;
    case 'step4.holder.taxId.ein':
      next.holder.taxId.ein = answer as string;
      break;
    case 'step4.holder.contact.email':
      next.holder.contact.email = answer as string;
      break;
    case 'step4.holder.contact.dateOfBirth':
      next.holder.contact.dateOfBirth = answer as string;
      break;
    case 'step4.holder.contact.specifiedAdult':
      next.holder.contact.specifiedAdult = answer as string;
      break;
    case 'step4.holder.contact.phones':
      next.holder.contact.phones = answer as Step4Fields['holder']['contact']['phones'];
      break;
    case 'step4.holder.contact.phones.home':
      next.holder.contact.phones.home = answer as string | null;
      break;
    case 'step4.holder.contact.phones.business':
      next.holder.contact.phones.business = answer as string | null;
      break;
    case 'step4.holder.contact.phones.mobile':
      next.holder.contact.phones.mobile = answer as string | null;
      break;
    case 'step4.holder.legalAddress':
      next.holder.legalAddress = answer as Step4Address;
      break;
    case 'step4.holder.legalAddress.line1':
      next.holder.legalAddress.line1 = answer as string;
      break;
    case 'step4.holder.legalAddress.city':
      next.holder.legalAddress.city = answer as string;
      break;
    case 'step4.holder.legalAddress.stateProvince':
      next.holder.legalAddress.stateProvince = answer as string;
      break;
    case 'step4.holder.legalAddress.postalCode':
      next.holder.legalAddress.postalCode = answer as string;
      break;
    case 'step4.holder.legalAddress.country':
      next.holder.legalAddress.country = answer as string;
      break;
    case 'step4.holder.mailingDifferent':
      next.holder.mailingDifferent = answer as YesNoMap;
      break;
    case 'step4.holder.mailingAddress':
      next.holder.mailingAddress = answer as Step4Address;
      break;
    case 'step4.holder.mailingAddress.line1':
      next.holder.mailingAddress.line1 = answer as string;
      break;
    case 'step4.holder.mailingAddress.city':
      next.holder.mailingAddress.city = answer as string;
      break;
    case 'step4.holder.mailingAddress.stateProvince':
      next.holder.mailingAddress.stateProvince = answer as string;
      break;
    case 'step4.holder.mailingAddress.postalCode':
      next.holder.mailingAddress.postalCode = answer as string;
      break;
    case 'step4.holder.mailingAddress.country':
      next.holder.mailingAddress.country = answer as string;
      break;
    case 'step4.holder.citizenship.primary':
      next.holder.citizenship.primary = answer as string[];
      break;
    case 'step4.holder.citizenship.additional':
      next.holder.citizenship.additional = answer as string[];
      break;
    case 'step4.holder.gender':
      next.holder.gender = answer as GenderMap;
      break;
    case 'step4.holder.maritalStatus':
      next.holder.maritalStatus = answer as MaritalStatusMap;
      break;
    case 'step4.holder.employment.status':
      next.holder.employment.status = answer as EmploymentStatusMap;
      break;
    case 'step4.holder.employment.occupation':
      next.holder.employment.occupation = answer as string;
      break;
    case 'step4.holder.employment.yearsEmployed':
      next.holder.employment.yearsEmployed = answer as number;
      break;
    case 'step4.holder.employment.typeOfBusiness':
      next.holder.employment.typeOfBusiness = answer as string;
      break;
    case 'step4.holder.employment.employerName':
      next.holder.employment.employerName = answer as string;
      break;
    case 'step4.holder.employment.employerAddress.line1':
      next.holder.employment.employerAddress.line1 = answer as string;
      break;
    case 'step4.holder.employment.employerAddress.city':
      next.holder.employment.employerAddress.city = answer as string;
      break;
    case 'step4.holder.employment.employerAddress.stateProvince':
      next.holder.employment.employerAddress.stateProvince = answer as string;
      break;
    case 'step4.holder.employment.employerAddress.postalCode':
      next.holder.employment.employerAddress.postalCode = answer as string;
      break;
    case 'step4.holder.employment.employerAddress.country':
      next.holder.employment.employerAddress.country = answer as string;
      break;
    case 'step4.investment.generalKnowledge':
      next.investmentKnowledge.general = answer as KnowledgeLevelMap;
      break;
    case 'step4.investment.knowledgeExperience':
      next.investmentKnowledge = answer as Step4Fields['investmentKnowledge'];
      break;
    case 'step4.investment.byType.other.label':
      next.investmentKnowledge.byType.other.label = answer as string;
      break;
    case 'step4.financial.annualIncomeRange':
      next.financialInformation.annualIncomeRange = answer as Step4Range;
      break;
    case 'step4.financial.netWorthExPrimaryResidenceRange':
      next.financialInformation.netWorthExPrimaryResidenceRange = answer as Step4Range;
      break;
    case 'step4.financial.liquidNetWorthRange':
      next.financialInformation.liquidNetWorthRange = answer as Step4Range;
      break;
    case 'step4.financial.taxBracket':
      next.financialInformation.taxBracket = answer as TaxBracketMap;
      break;
    case 'step4.govId.photoId1':
      next.governmentIdentification.photoId1 = answer as Step4PhotoId;
      break;
    case 'step4.govId.photoId2':
      next.governmentIdentification.photoId2 = answer as Step4PhotoId;
      break;
    case 'step4.disclosure.employeeAdvisorFirm':
      next.affiliations.employeeAdvisorFirm = answer as YesNoMap;
      break;
    case 'step4.disclosure.relatedAdvisorFirmEmployee': {
      const payload = answer as {
        selection: YesNoMap;
        advisorEmployeeName: string | null;
        advisorEmployeeRelationship: string | null;
      };

      next.affiliations.relatedAdvisorFirmEmployee = payload.selection;
      next.affiliations.advisorEmployeeName = payload.advisorEmployeeName;
      next.affiliations.advisorEmployeeRelationship = payload.advisorEmployeeRelationship;
      break;
    }
    case 'step4.disclosure.employeeBrokerDealer': {
      const payload = answer as {
        selection: YesNoMap;
        brokerDealerName: string | null;
      };

      next.affiliations.employeeBrokerDealer = payload.selection;
      next.affiliations.brokerDealerName = payload.brokerDealerName;
      break;
    }
    case 'step4.disclosure.relatedBrokerDealerEmployee': {
      const payload = answer as {
        selection: YesNoMap;
        relatedBrokerDealerName: string | null;
        relatedBrokerDealerEmployeeName: string | null;
        relatedBrokerDealerRelationship: string | null;
      };

      next.affiliations.relatedBrokerDealerEmployee = payload.selection;
      next.affiliations.relatedBrokerDealerName = payload.relatedBrokerDealerName;
      next.affiliations.relatedBrokerDealerEmployeeName = payload.relatedBrokerDealerEmployeeName;
      next.affiliations.relatedBrokerDealerRelationship = payload.relatedBrokerDealerRelationship;
      break;
    }
    case 'step4.disclosure.maintainsOtherBrokerageAccounts': {
      const payload = answer as {
        selection: YesNoMap;
        otherBrokerageFirms: string | null;
        yearsOfInvestmentExperience: number | null;
      };

      next.affiliations.maintainsOtherBrokerageAccounts = payload.selection;
      next.affiliations.otherBrokerageFirms = payload.otherBrokerageFirms;
      next.affiliations.yearsOfInvestmentExperience = payload.yearsOfInvestmentExperience;
      break;
    }
    case 'step4.disclosure.exchangeOrFinraAffiliation': {
      const payload = answer as {
        selection: YesNoMap;
        affiliationDetails: string | null;
      };

      next.affiliations.exchangeOrFinraAffiliation = payload.selection;
      next.affiliations.affiliationDetails = payload.affiliationDetails;
      break;
    }
    case 'step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany': {
      const payload = answer as {
        selection: YesNoMap;
        publicCompanyNames: string | null;
      };

      next.affiliations.seniorOfficerDirectorTenPercentPublicCompany = payload.selection;
      next.affiliations.publicCompanyNames = payload.publicCompanyNames;
      break;
    }
    default: {
      const investmentKnowledgeType = getInvestmentTypeFromQuestionId(questionId, 'knowledge');
      if (investmentKnowledgeType) {
        next.investmentKnowledge.byType[investmentKnowledgeType].knowledge = answer as KnowledgeLevelMap;
        break;
      }

      const investmentSinceYearType = getInvestmentTypeFromQuestionId(questionId, 'sinceYear');
      if (investmentSinceYearType) {
        next.investmentKnowledge.byType[investmentSinceYearType].sinceYear = answer as number;
      }
    }
  }

  return sanitizeStep4Fields(next);
}

export function validateStep4Completion(fields: Step4Fields): Record<string, string> {
  const errors: Record<string, string> = {};
  const normalized = sanitizeStep4Fields(fields);
  const kind = getSingleSelection(normalized.holder.kind, HOLDER_KIND_KEYS);
  const hasEinSelection = getSingleSelection(normalized.holder.taxId.hasEin, YES_NO_KEYS);
  const mailingDifferent = getSingleSelection(normalized.holder.mailingDifferent, YES_NO_KEYS);

  if (!kind) {
    errors['step4.holder.kind'] = 'Choose Person or Entity.';
  }

  if (!normalized.holder.name.trim()) {
    errors['step4.holder.name'] = 'Name is required.';
  }

  if (kind === 'person') {
    if (!normalized.holder.taxId.ssn) {
      errors['step4.holder.taxId.ssn'] = 'SSN is required.';
    } else if (!isValidSsn(normalized.holder.taxId.ssn)) {
      errors['step4.holder.taxId.ssn'] = 'Enter a valid SSN.';
    }
  }

  if (!hasEinSelection) {
    errors['step4.holder.taxId.hasEin'] = 'Select Yes or No for EIN.';
  }

  if (hasEinSelection === 'yes') {
    if (!normalized.holder.taxId.ein) {
      errors['step4.holder.taxId.ein'] = 'EIN is required.';
    } else if (!isValidEin(normalized.holder.taxId.ein)) {
      errors['step4.holder.taxId.ein'] = 'Enter a valid EIN.';
    }
  }

  if (!normalized.holder.contact.email.trim()) {
    errors['step4.holder.contact.email'] = 'Email is required.';
  } else if (!isValidEmail(normalized.holder.contact.email)) {
    errors['step4.holder.contact.email'] = 'Enter a valid email.';
  }

  if (kind === 'person') {
    const dob = normalized.holder.contact.dateOfBirth;

    if (!dob) {
      errors['step4.holder.contact.dateOfBirth'] = 'Date of birth is required.';
    } else if (!isValidDateInput(dob)) {
      errors['step4.holder.contact.dateOfBirth'] = 'Use YYYY-MM-DD format.';
    } else if (!isPastDate(dob)) {
      errors['step4.holder.contact.dateOfBirth'] = 'Date of birth must be in the past.';
    }

    if (isMinorDate(dob) && !normalized.holder.contact.specifiedAdult?.trim()) {
      errors['step4.holder.contact.specifiedAdult'] = 'Specified adult is required for minors.';
    }
  }

  if (!hasAnyPhone(normalized)) {
    errors['step4.holder.contact.phones.mobile'] = 'Enter at least one phone number.';
  }

  if (!normalized.holder.legalAddress.line1?.trim()) {
    errors['step4.holder.legalAddress.line1'] = 'Legal address is required.';
  } else if (/p\.?\s*o\.?\s*box/i.test(normalized.holder.legalAddress.line1)) {
    errors['step4.holder.legalAddress.line1'] = 'P.O. Box is not allowed for legal address.';
  }

  if (!normalized.holder.legalAddress.city?.trim()) {
    errors['step4.holder.legalAddress.city'] = 'City is required.';
  }

  if (!normalized.holder.legalAddress.stateProvince?.trim()) {
    errors['step4.holder.legalAddress.stateProvince'] = 'State/Province is required.';
  }

  if (!normalized.holder.legalAddress.postalCode?.trim()) {
    errors['step4.holder.legalAddress.postalCode'] = 'ZIP/Postal code is required.';
  }

  if (!normalized.holder.legalAddress.country?.trim()) {
    errors['step4.holder.legalAddress.country'] = 'Country is required.';
  } else if (!/^[A-Z]{2}$/.test(normalized.holder.legalAddress.country)) {
    errors['step4.holder.legalAddress.country'] = 'Enter a valid country.';
  }

  if (!mailingDifferent) {
    errors['step4.holder.mailingDifferent'] = 'Select whether mailing address is different.';
  } else if (mailingDifferent === 'yes') {
    if (!normalized.holder.mailingAddress.line1?.trim()) {
      errors['step4.holder.mailingAddress.line1'] = 'Mailing address is required.';
    }

    if (!normalized.holder.mailingAddress.city?.trim()) {
      errors['step4.holder.mailingAddress.city'] = 'Mailing city is required.';
    }

    if (!normalized.holder.mailingAddress.stateProvince?.trim()) {
      errors['step4.holder.mailingAddress.stateProvince'] = 'Mailing state/province is required.';
    }

    if (!normalized.holder.mailingAddress.postalCode?.trim()) {
      errors['step4.holder.mailingAddress.postalCode'] = 'Mailing ZIP/Postal code is required.';
    }

    if (!normalized.holder.mailingAddress.country?.trim()) {
      errors['step4.holder.mailingAddress.country'] = 'Mailing country is required.';
    } else if (!/^[A-Z]{2}$/.test(normalized.holder.mailingAddress.country)) {
      errors['step4.holder.mailingAddress.country'] = 'Enter a valid mailing country.';
    }
  }

  if (normalized.holder.citizenship.primary.length === 0) {
    errors['step4.holder.citizenship.primary'] = 'Select at least one primary citizenship.';
  }

  if (kind === 'entity' && normalized.holder.citizenship.primary.length !== 1) {
    errors['step4.holder.citizenship.primary'] = 'Entity must have exactly one primary country.';
  }

  const duplicateAdditional = normalized.holder.citizenship.additional.find((country) =>
    normalized.holder.citizenship.primary.includes(country)
  );

  if (duplicateAdditional) {
    errors['step4.holder.citizenship.additional'] =
      'Additional citizenship cannot duplicate primary citizenship.';
  }

  if (kind === 'person') {
    if (countTrueFlags(normalized.holder.gender) !== 1) {
      errors['step4.holder.gender'] = 'Select gender.';
    }

    if (countTrueFlags(normalized.holder.maritalStatus) !== 1) {
      errors['step4.holder.maritalStatus'] = 'Select marital status.';
    }

    if (countTrueFlags(normalized.holder.employment.status) !== 1) {
      errors['step4.holder.employment.status'] = 'Select employment status.';
    }

    if (isEmploymentActive(normalized)) {
      if (!normalized.holder.employment.occupation?.trim()) {
        errors['step4.holder.employment.occupation'] = 'Occupation is required.';
      }

      if (
        typeof normalized.holder.employment.yearsEmployed !== 'number' ||
        !Number.isInteger(normalized.holder.employment.yearsEmployed) ||
        normalized.holder.employment.yearsEmployed < 0
      ) {
        errors['step4.holder.employment.yearsEmployed'] = 'Enter years employed (0 or more).';
      }

      if (!normalized.holder.employment.typeOfBusiness?.trim()) {
        errors['step4.holder.employment.typeOfBusiness'] = 'Type of business is required.';
      }

      if (!normalized.holder.employment.employerName?.trim()) {
        errors['step4.holder.employment.employerName'] = 'Employer name is required.';
      }

      if (!normalized.holder.employment.employerAddress.line1?.trim()) {
        errors['step4.holder.employment.employerAddress.line1'] = 'Employer address is required.';
      }

      if (!normalized.holder.employment.employerAddress.city?.trim()) {
        errors['step4.holder.employment.employerAddress.city'] = 'Employer city is required.';
      }

      if (!normalized.holder.employment.employerAddress.stateProvince?.trim()) {
        errors['step4.holder.employment.employerAddress.stateProvince'] =
          'Employer state/province is required.';
      }

      if (!normalized.holder.employment.employerAddress.postalCode?.trim()) {
        errors['step4.holder.employment.employerAddress.postalCode'] =
          'Employer ZIP/Postal code is required.';
      }

      if (!normalized.holder.employment.employerAddress.country?.trim()) {
        errors['step4.holder.employment.employerAddress.country'] = 'Employer country is required.';
      } else if (!/^[A-Z]{2}$/.test(normalized.holder.employment.employerAddress.country)) {
        errors['step4.holder.employment.employerAddress.country'] = 'Enter a valid employer country.';
      }
    }
  }

  if (countTrueFlags(normalized.investmentKnowledge.general) !== 1) {
    errors['step4.investment.generalKnowledge'] = 'Select one overall investment knowledge option.';
  }

  for (const typeKey of INVESTMENT_TYPE_KEYS) {
    const knowledgeQuestionId = `step4.investment.byType.${typeKey}.knowledge`;
    const sinceYearQuestionId = `step4.investment.byType.${typeKey}.sinceYear`;
    const selection = getKnowledgeSelectionForType(normalized, typeKey);

    if (countTrueFlags(normalized.investmentKnowledge.byType[typeKey].knowledge) !== 1) {
      errors[knowledgeQuestionId] = 'Select one knowledge option.';
    }

    if (selection && selection !== 'none') {
      const sinceYear = normalized.investmentKnowledge.byType[typeKey].sinceYear;
      const currentYear = getUtcToday().getUTCFullYear();

      if (
        typeof sinceYear !== 'number' ||
        !Number.isInteger(sinceYear) ||
        sinceYear < 1900 ||
        sinceYear > currentYear
      ) {
        errors[sinceYearQuestionId] = `Enter a valid Since Year between 1900 and ${currentYear}.`;
      }

      if (typeKey === 'other' && !normalized.investmentKnowledge.byType.other.label?.trim()) {
        errors['step4.investment.byType.other.label'] = 'Other investment type is required.';
      }
    }
  }

  validateStep4RangesForCompletion(
    errors,
    normalized.financialInformation.annualIncomeRange,
    'step4.financial.annualIncomeRange',
    'Annual income'
  );
  validateStep4RangesForCompletion(
    errors,
    normalized.financialInformation.netWorthExPrimaryResidenceRange,
    'step4.financial.netWorthExPrimaryResidenceRange',
    'Net worth (excluding primary residence)'
  );
  validateStep4RangesForCompletion(
    errors,
    normalized.financialInformation.liquidNetWorthRange,
    'step4.financial.liquidNetWorthRange',
    'Liquid net worth'
  );

  const netWorthTo = normalized.financialInformation.netWorthExPrimaryResidenceRange.toBracket;
  const liquidTo = normalized.financialInformation.liquidNetWorthRange.toBracket;

  if (netWorthTo && liquidTo) {
    const netWorthToIndex = RANGE_BUCKET_INDEX.get(netWorthTo) ?? -1;
    const liquidToIndex = RANGE_BUCKET_INDEX.get(liquidTo) ?? -1;

    if (liquidToIndex > netWorthToIndex) {
      errors['step4.financial.liquidNetWorthRange.toBracket'] =
        'Liquid net worth cannot exceed net worth (excluding primary residence).';
    }
  }

  if (countTrueFlags(normalized.financialInformation.taxBracket) !== 1) {
    errors['step4.financial.taxBracket'] = 'Select one tax bracket.';
  }

  const photoId1Errors = validatePhotoIdBlock(normalized.governmentIdentification.photoId1, 'step4.govId.photoId1');
  const photoId2Errors = validatePhotoIdBlock(normalized.governmentIdentification.photoId2, 'step4.govId.photoId2');

  Object.assign(errors, photoId1Errors);
  Object.assign(errors, photoId2Errors);

  const requiresDocumentaryId =
    normalized.governmentIdentification.requirementContext.requiresDocumentaryId === true ||
    normalized.governmentIdentification.requirementContext.isNonResidentAlien === true;

  if (requiresDocumentaryId) {
    const hasCompletePhotoId =
      isPhotoIdComplete(normalized.governmentIdentification.photoId1) ||
      isPhotoIdComplete(normalized.governmentIdentification.photoId2);

    if (!hasCompletePhotoId) {
      errors['step4.govId.photoId1'] = 'At least one complete, unexpired government photo ID is required.';
    }
  }

  validateAffiliationCompletion(errors, normalized.affiliations);

  return errors;
}
