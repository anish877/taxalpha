import type { Prisma } from '@prisma/client';

export const SFC_STEP_1_LABEL = 'STEP 1. STATEMENT OF FINANCIAL CONDITION';

const ACCOUNT_REGISTRATION_FIELDS = ['rrName', 'rrNo', 'customerNames'] as const;
const LIQUID_NON_QUALIFIED_ASSET_FIELDS = [
  'cashMoneyMarketsCds',
  'brokerageNonManaged',
  'managedAccounts',
  'mutualFundsDirect',
  'annuitiesLessSurrenderCharges',
  'cashValueLifeInsurance',
  'otherBusinessAssetsCollectibles'
] as const;
const LIABILITY_FIELDS = [
  'mortgagePrimaryResidence',
  'mortgagesSecondaryInvestment',
  'homeEquityLoans',
  'creditCards',
  'otherLiabilities'
] as const;
const ILLIQUID_NON_QUALIFIED_ASSET_FIELDS = [
  'primaryResidence',
  'investmentRealEstate',
  'privateBusiness'
] as const;
const LIQUID_QUALIFIED_ASSET_FIELDS = [
  'cashMoneyMarketsCds',
  'retirementPlans',
  'brokerageNonManaged',
  'managedAccounts',
  'mutualFundsDirect',
  'annuities'
] as const;
const INCOME_SUMMARY_FIELDS = [
  'salaryCommissions',
  'investmentIncome',
  'pension',
  'socialSecurity',
  'netRentalIncome',
  'other'
] as const;
const ILLIQUID_QUALIFIED_ASSET_FIELDS = ['purchaseAmountValue'] as const;

const SFC_STEP_1_QUESTION_IDS = [
  'step1.accountRegistration',
  'step1.liquidNonQualifiedAssets',
  'step1.liabilities',
  'step1.illiquidNonQualifiedAssets',
  'step1.liquidQualifiedAssets',
  'step1.incomeSummary',
  'step1.illiquidQualifiedAssets'
] as const;
const SFC_STEP_1_QUESTION_ID_SET = new Set<string>(SFC_STEP_1_QUESTION_IDS);

type AccountRegistrationKey = (typeof ACCOUNT_REGISTRATION_FIELDS)[number];
type LiquidNonQualifiedAssetKey = (typeof LIQUID_NON_QUALIFIED_ASSET_FIELDS)[number];
type LiabilityKey = (typeof LIABILITY_FIELDS)[number];
type IlliquidNonQualifiedAssetKey = (typeof ILLIQUID_NON_QUALIFIED_ASSET_FIELDS)[number];
type LiquidQualifiedAssetKey = (typeof LIQUID_QUALIFIED_ASSET_FIELDS)[number];
type IncomeSummaryKey = (typeof INCOME_SUMMARY_FIELDS)[number];
type IlliquidQualifiedAssetKey = (typeof ILLIQUID_QUALIFIED_ASSET_FIELDS)[number];

export type SfcStep1QuestionId = (typeof SFC_STEP_1_QUESTION_IDS)[number];

interface ValidationSuccess<T> {
  success: true;
  value: T;
}

interface ValidationFailure {
  success: false;
  fieldErrors: Record<string, string>;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export interface SfcStep1Fields {
  accountRegistration: {
    rrName: string;
    rrNo: string;
    customerNames: string;
  };
  liquidNonQualifiedAssets: Record<LiquidNonQualifiedAssetKey, number>;
  liabilities: Record<LiabilityKey, number>;
  illiquidNonQualifiedAssets: Record<IlliquidNonQualifiedAssetKey, number>;
  liquidQualifiedAssets: Record<LiquidQualifiedAssetKey, number>;
  incomeSummary: Record<IncomeSummaryKey, number>;
  illiquidQualifiedAssets: Record<IlliquidQualifiedAssetKey, number>;
}

export interface SfcStep1Totals {
  totalLiabilities: number;
  totalLiquidAssets: number;
  totalLiquidQualifiedAssets: number;
  totalAnnualIncome: number;
  totalIlliquidAssetsEquity: number;
  totalAssetsLessPrimaryResidence: number;
  totalNetWorthAssetsLessPrimaryResidenceLiabilities: number;
  totalIlliquidSecurities: number;
  totalNetWorth: number;
  totalPotentialLiquidity: number;
  totalIlliquidQualifiedAssets: number;
}

export interface SfcStep1PrefillContext {
  rrName?: string | null;
  rrNo?: string | null;
  customerNames?: string | null;
}

function toRecord(value: Prisma.JsonValue | unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
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

function normalizeAmount(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 0 ? value : 0;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return 0;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed >= 0 ? parsed : 0;
    }
  }

  return 0;
}

function hasInvalidAmountInput(value: unknown): boolean {
  if (value === null || value === undefined || value === '') {
    return false;
  }

  if (typeof value === 'number') {
    return !Number.isFinite(value) || value < 0;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }

    const parsed = Number(trimmed);
    return !Number.isFinite(parsed) || parsed < 0;
  }

  return true;
}

function normalizeAmountMap<K extends string>(keys: readonly K[], source: unknown): Record<K, number> {
  const record = toRecord(source);
  const output = {} as Record<K, number>;

  for (const key of keys) {
    output[key] = normalizeAmount(record[key]);
  }

  return output;
}

function sumValues(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + value, 0);
}

function validateAmountMap<K extends string>(
  answer: unknown,
  keys: readonly K[],
  fieldPrefix: string
): ValidationResult<Record<K, number>> {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return {
      success: false,
      fieldErrors: {
        [fieldPrefix]: 'Please provide values for this section.'
      }
    };
  }

  const record = answer as Record<string, unknown>;
  const fieldErrors: Record<string, string> = {};

  for (const key of keys) {
    if (hasInvalidAmountInput(record[key])) {
      fieldErrors[`${fieldPrefix}.${key}`] = 'Enter a valid non-negative amount.';
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
    value: normalizeAmountMap(keys, record)
  };
}

function validateAccountRegistration(
  answer: unknown
): ValidationResult<SfcStep1Fields['accountRegistration']> {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return {
      success: false,
      fieldErrors: {
        'step1.accountRegistration': 'Please provide account registration details.'
      }
    };
  }

  const record = answer as Record<string, unknown>;
  const rrName = normalizeRequiredString(record.rrName);
  const rrNo = normalizeRequiredString(record.rrNo);
  const customerNames = normalizeRequiredString(record.customerNames);
  const fieldErrors: Record<string, string> = {};

  if (!rrName) {
    fieldErrors['step1.accountRegistration.rrName'] = 'RR Name is required.';
  }

  if (!rrNo) {
    fieldErrors['step1.accountRegistration.rrNo'] = 'RR No. is required.';
  }

  if (!customerNames) {
    fieldErrors['step1.accountRegistration.customerNames'] = 'Customer name(s) are required.';
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
      rrName,
      rrNo,
      customerNames
    }
  };
}

export function getSfcStep1QuestionIds(): readonly SfcStep1QuestionId[] {
  return SFC_STEP_1_QUESTION_IDS;
}

export function isSfcStep1QuestionId(value: string): value is SfcStep1QuestionId {
  return SFC_STEP_1_QUESTION_ID_SET.has(value);
}

export function defaultSfcStep1Fields(): SfcStep1Fields {
  return {
    accountRegistration: {
      rrName: '',
      rrNo: '',
      customerNames: ''
    },
    liquidNonQualifiedAssets: normalizeAmountMap(
      LIQUID_NON_QUALIFIED_ASSET_FIELDS,
      {}
    ) as SfcStep1Fields['liquidNonQualifiedAssets'],
    liabilities: normalizeAmountMap(LIABILITY_FIELDS, {}) as SfcStep1Fields['liabilities'],
    illiquidNonQualifiedAssets: normalizeAmountMap(
      ILLIQUID_NON_QUALIFIED_ASSET_FIELDS,
      {}
    ) as SfcStep1Fields['illiquidNonQualifiedAssets'],
    liquidQualifiedAssets: normalizeAmountMap(
      LIQUID_QUALIFIED_ASSET_FIELDS,
      {}
    ) as SfcStep1Fields['liquidQualifiedAssets'],
    incomeSummary: normalizeAmountMap(
      INCOME_SUMMARY_FIELDS,
      {}
    ) as SfcStep1Fields['incomeSummary'],
    illiquidQualifiedAssets: normalizeAmountMap(
      ILLIQUID_QUALIFIED_ASSET_FIELDS,
      {}
    ) as SfcStep1Fields['illiquidQualifiedAssets']
  };
}

export function normalizeSfcStep1Fields(step1Data: Prisma.JsonValue | null | undefined): SfcStep1Fields {
  const defaults = defaultSfcStep1Fields();
  const root = toRecord(step1Data);
  const accountRegistration = toRecord(root.accountRegistration);

  return {
    ...defaults,
    accountRegistration: {
      rrName: normalizeRequiredString(accountRegistration.rrName),
      rrNo: normalizeRequiredString(accountRegistration.rrNo),
      customerNames: normalizeRequiredString(accountRegistration.customerNames)
    },
    liquidNonQualifiedAssets: normalizeAmountMap(
      LIQUID_NON_QUALIFIED_ASSET_FIELDS,
      root.liquidNonQualifiedAssets
    ) as SfcStep1Fields['liquidNonQualifiedAssets'],
    liabilities: normalizeAmountMap(LIABILITY_FIELDS, root.liabilities) as SfcStep1Fields['liabilities'],
    illiquidNonQualifiedAssets: normalizeAmountMap(
      ILLIQUID_NON_QUALIFIED_ASSET_FIELDS,
      root.illiquidNonQualifiedAssets
    ) as SfcStep1Fields['illiquidNonQualifiedAssets'],
    liquidQualifiedAssets: normalizeAmountMap(
      LIQUID_QUALIFIED_ASSET_FIELDS,
      root.liquidQualifiedAssets
    ) as SfcStep1Fields['liquidQualifiedAssets'],
    incomeSummary: normalizeAmountMap(
      INCOME_SUMMARY_FIELDS,
      root.incomeSummary
    ) as SfcStep1Fields['incomeSummary'],
    illiquidQualifiedAssets: normalizeAmountMap(
      ILLIQUID_QUALIFIED_ASSET_FIELDS,
      root.illiquidQualifiedAssets
    ) as SfcStep1Fields['illiquidQualifiedAssets']
  };
}

export function applySfcStep1Prefill(
  fields: SfcStep1Fields,
  context: SfcStep1PrefillContext
): SfcStep1Fields {
  const next = structuredClone(fields);

  if (!next.accountRegistration.rrName && normalizeNullableString(context.rrName)) {
    next.accountRegistration.rrName = context.rrName!.trim();
  }

  if (!next.accountRegistration.rrNo && normalizeNullableString(context.rrNo)) {
    next.accountRegistration.rrNo = context.rrNo!.trim();
  }

  if (!next.accountRegistration.customerNames && normalizeNullableString(context.customerNames)) {
    next.accountRegistration.customerNames = context.customerNames!.trim();
  }

  return next;
}

export function serializeSfcStep1Fields(fields: SfcStep1Fields): Prisma.InputJsonValue {
  return fields as unknown as Prisma.InputJsonValue;
}

export function getSfcStep1Totals(fields: SfcStep1Fields): SfcStep1Totals {
  const totalLiabilities = sumValues(fields.liabilities);
  const totalLiquidAssets = sumValues(fields.liquidNonQualifiedAssets);
  const totalLiquidQualifiedAssets = sumValues(fields.liquidQualifiedAssets);
  const totalAnnualIncome = sumValues(fields.incomeSummary);
  const totalIlliquidAssetsEquity = sumValues(fields.illiquidNonQualifiedAssets);
  const totalAssetsLessPrimaryResidence =
    totalLiquidAssets +
    fields.illiquidNonQualifiedAssets.investmentRealEstate +
    fields.illiquidNonQualifiedAssets.privateBusiness;
  const totalNetWorthAssetsLessPrimaryResidenceLiabilities =
    totalAssetsLessPrimaryResidence - totalLiabilities;
  const totalIlliquidSecurities =
    fields.illiquidNonQualifiedAssets.investmentRealEstate +
    fields.illiquidNonQualifiedAssets.privateBusiness;
  const totalNetWorth = totalLiquidAssets + totalIlliquidAssetsEquity - totalLiabilities;
  const totalPotentialLiquidity = totalLiquidAssets + totalLiquidQualifiedAssets;
  const totalIlliquidQualifiedAssets = sumValues(fields.illiquidQualifiedAssets);
  
  return {
    totalLiabilities,
    totalLiquidAssets,
    totalLiquidQualifiedAssets,
    totalAnnualIncome,
    totalIlliquidAssetsEquity,
    totalAssetsLessPrimaryResidence,
    totalNetWorthAssetsLessPrimaryResidenceLiabilities,
    totalIlliquidSecurities,
    totalNetWorth,
    totalPotentialLiquidity,
    totalIlliquidQualifiedAssets
  };
}

export function getVisibleSfcStep1QuestionIds(): SfcStep1QuestionId[] {
  return [...SFC_STEP_1_QUESTION_IDS];
}

export function clampSfcStep1QuestionIndex(
  index: number | null | undefined,
  visibleQuestionIds: SfcStep1QuestionId[]
): number {
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

export function validateSfcStep1Answer(
  questionId: SfcStep1QuestionId,
  answer: unknown
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step1.accountRegistration':
      return validateAccountRegistration(answer);
    case 'step1.liquidNonQualifiedAssets':
      return validateAmountMap(
        answer,
        LIQUID_NON_QUALIFIED_ASSET_FIELDS,
        'step1.liquidNonQualifiedAssets'
      );
    case 'step1.liabilities':
      return validateAmountMap(answer, LIABILITY_FIELDS, 'step1.liabilities');
    case 'step1.illiquidNonQualifiedAssets':
      return validateAmountMap(
        answer,
        ILLIQUID_NON_QUALIFIED_ASSET_FIELDS,
        'step1.illiquidNonQualifiedAssets'
      );
    case 'step1.liquidQualifiedAssets':
      return validateAmountMap(
        answer,
        LIQUID_QUALIFIED_ASSET_FIELDS,
        'step1.liquidQualifiedAssets'
      );
    case 'step1.incomeSummary':
      return validateAmountMap(answer, INCOME_SUMMARY_FIELDS, 'step1.incomeSummary');
    case 'step1.illiquidQualifiedAssets':
      return validateAmountMap(
        answer,
        ILLIQUID_QUALIFIED_ASSET_FIELDS,
        'step1.illiquidQualifiedAssets'
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

export function applySfcStep1Answer(
  fields: SfcStep1Fields,
  questionId: SfcStep1QuestionId,
  answer: unknown
): SfcStep1Fields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step1.accountRegistration':
      next.accountRegistration = answer as SfcStep1Fields['accountRegistration'];
      break;
    case 'step1.liquidNonQualifiedAssets':
      next.liquidNonQualifiedAssets = answer as SfcStep1Fields['liquidNonQualifiedAssets'];
      break;
    case 'step1.liabilities':
      next.liabilities = answer as SfcStep1Fields['liabilities'];
      break;
    case 'step1.illiquidNonQualifiedAssets':
      next.illiquidNonQualifiedAssets = answer as SfcStep1Fields['illiquidNonQualifiedAssets'];
      break;
    case 'step1.liquidQualifiedAssets':
      next.liquidQualifiedAssets = answer as SfcStep1Fields['liquidQualifiedAssets'];
      break;
    case 'step1.incomeSummary':
      next.incomeSummary = answer as SfcStep1Fields['incomeSummary'];
      break;
    case 'step1.illiquidQualifiedAssets':
      next.illiquidQualifiedAssets = answer as SfcStep1Fields['illiquidQualifiedAssets'];
      break;
  }

  return next;
}

export function validateSfcStep1Completion(fields: SfcStep1Fields): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const key of ACCOUNT_REGISTRATION_FIELDS) {
    if (!fields.accountRegistration[key as AccountRegistrationKey].trim()) {
      const label =
        key === 'rrName'
          ? 'RR Name'
          : key === 'rrNo'
            ? 'RR No.'
            : 'Customer name(s)';
      errors[`step1.accountRegistration.${key}`] = `${label} is required.`;
    }
  }

  const amountSections: Array<{ prefix: string; values: Record<string, number> }> = [
    { prefix: 'step1.liquidNonQualifiedAssets', values: fields.liquidNonQualifiedAssets },
    { prefix: 'step1.liabilities', values: fields.liabilities },
    { prefix: 'step1.illiquidNonQualifiedAssets', values: fields.illiquidNonQualifiedAssets },
    { prefix: 'step1.liquidQualifiedAssets', values: fields.liquidQualifiedAssets },
    { prefix: 'step1.incomeSummary', values: fields.incomeSummary },
    { prefix: 'step1.illiquidQualifiedAssets', values: fields.illiquidQualifiedAssets }
  ];

  for (const section of amountSections) {
    for (const [key, value] of Object.entries(section.values)) {
      if (!Number.isFinite(value) || value < 0) {
        errors[`${section.prefix}.${key}`] = 'Enter a valid non-negative amount.';
      }
    }
  }

  return errors;
}
