import type { Prisma } from '@prisma/client';

export const BAIODF_STEP_2_LABEL = 'STEP 2. CUSTOMER ORDER INFORMATION';

const CUSTODIAN_KEYS = ['firstClearing', 'direct', 'mainStar', 'cnb', 'kingdomTrust', 'other'] as const;

const BAIODF_STEP_2_QUESTION_IDS = [
  'step2.custodianAndProduct',
  'step2.existingAltPositions',
  'step2.netWorthAndConcentration'
] as const;
const BAIODF_STEP_2_QUESTION_ID_SET = new Set<string>(BAIODF_STEP_2_QUESTION_IDS);

type CustodianKey = (typeof CUSTODIAN_KEYS)[number];
type CustodianMap = Record<CustodianKey, boolean>;

export type BaiodfStep2QuestionId = (typeof BAIODF_STEP_2_QUESTION_IDS)[number];

interface ValidationSuccess<T> {
  success: true;
  value: T;
}

interface ValidationFailure {
  success: false;
  fieldErrors: Record<string, string>;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export interface BaiodfStep2Fields {
  custodianAndProduct: {
    custodian: CustodianMap;
    custodianOther: string | null;
    nameOfProduct: string;
    sponsorIssuer: string;
    dateOfPpm: string | null;
    datePpmSent: string | null;
  };
  existingAltPositions: {
    existingIlliquidAltPositions: number;
    existingSemiLiquidAltPositions: number;
    existingTaxAdvantageAltPositions: number;
  };
  netWorthAndConcentration: {
    totalNetWorth: number;
    liquidNetWorth: number;
  };
}

export interface BaiodfStep2Concentrations {
  existingIlliquidAltConcentrationPercent: number;
  existingSemiLiquidAltConcentrationPercent: number;
  existingTaxAdvantageAltConcentrationPercent: number;
  totalConcentrationPercent: number;
}

export interface BaiodfStep2PrefillContext {
  totalNetWorth?: number | null;
  liquidNetWorth?: number | null;
}

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

function countTrueFlags(value: Record<string, boolean>): number {
  return Object.values(value).filter(Boolean).length;
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

function isValidDateInput(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().startsWith(trimmed);
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function computePercent(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return roundPercent((numerator / denominator) * 100);
}

function sanitizeStep2Fields(fields: BaiodfStep2Fields): BaiodfStep2Fields {
  const next = structuredClone(fields);

  next.custodianAndProduct.custodian = createBooleanMap(CUSTODIAN_KEYS, next.custodianAndProduct.custodian);
  next.custodianAndProduct.custodianOther = normalizeNullableString(next.custodianAndProduct.custodianOther);
  next.custodianAndProduct.nameOfProduct = normalizeRequiredString(next.custodianAndProduct.nameOfProduct);
  next.custodianAndProduct.sponsorIssuer = normalizeRequiredString(next.custodianAndProduct.sponsorIssuer);
  next.custodianAndProduct.dateOfPpm = normalizeNullableString(next.custodianAndProduct.dateOfPpm);
  next.custodianAndProduct.datePpmSent = normalizeNullableString(next.custodianAndProduct.datePpmSent);

  if (!next.custodianAndProduct.custodian.other) {
    next.custodianAndProduct.custodianOther = null;
  }

  next.existingAltPositions.existingIlliquidAltPositions = normalizeAmount(
    next.existingAltPositions.existingIlliquidAltPositions
  );
  next.existingAltPositions.existingSemiLiquidAltPositions = normalizeAmount(
    next.existingAltPositions.existingSemiLiquidAltPositions
  );
  next.existingAltPositions.existingTaxAdvantageAltPositions = normalizeAmount(
    next.existingAltPositions.existingTaxAdvantageAltPositions
  );

  next.netWorthAndConcentration.totalNetWorth = normalizeAmount(next.netWorthAndConcentration.totalNetWorth);
  next.netWorthAndConcentration.liquidNetWorth = normalizeAmount(next.netWorthAndConcentration.liquidNetWorth);

  return next;
}

function validateCustodianAndProduct(
  answer: unknown
): ValidationResult<BaiodfStep2Fields['custodianAndProduct']> {
  const record = toRecord(answer);
  const custodian = createBooleanMap(CUSTODIAN_KEYS, record.custodian);
  const custodianOther = normalizeNullableString(record.custodianOther);
  const nameOfProduct = normalizeRequiredString(record.nameOfProduct);
  const sponsorIssuer = normalizeRequiredString(record.sponsorIssuer);
  const dateOfPpm = normalizeNullableString(record.dateOfPpm);
  const datePpmSent = normalizeNullableString(record.datePpmSent);
  const fieldErrors: Record<string, string> = {};

  if (countTrueFlags(custodian) !== 1) {
    fieldErrors['step2.custodianAndProduct.custodian'] = 'Select exactly one custodian option.';
  }

  if (custodian.other && !custodianOther) {
    fieldErrors['step2.custodianAndProduct.custodianOther'] = 'Specify the custodian when Other is selected.';
  }

  if (!nameOfProduct) {
    fieldErrors['step2.custodianAndProduct.nameOfProduct'] = 'Product name is required.';
  }

  if (!sponsorIssuer) {
    fieldErrors['step2.custodianAndProduct.sponsorIssuer'] = 'Sponsor / Issuer is required.';
  }

  if (!dateOfPpm) {
    fieldErrors['step2.custodianAndProduct.dateOfPpm'] = 'Date of PPM is required.';
  } else if (!isValidDateInput(dateOfPpm)) {
    fieldErrors['step2.custodianAndProduct.dateOfPpm'] = 'Enter a valid date in YYYY-MM-DD format.';
  }

  if (!datePpmSent) {
    fieldErrors['step2.custodianAndProduct.datePpmSent'] = 'Date PPM Sent is required.';
  } else if (!isValidDateInput(datePpmSent)) {
    fieldErrors['step2.custodianAndProduct.datePpmSent'] = 'Enter a valid date in YYYY-MM-DD format.';
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
      custodian,
      custodianOther: custodian.other ? custodianOther : null,
      nameOfProduct,
      sponsorIssuer,
      dateOfPpm,
      datePpmSent
    }
  };
}

function validateExistingAltPositions(
  answer: unknown
): ValidationResult<BaiodfStep2Fields['existingAltPositions']> {
  const record = toRecord(answer);
  const existingIlliquidAltPositions = normalizeAmount(record.existingIlliquidAltPositions);
  const existingSemiLiquidAltPositions = normalizeAmount(record.existingSemiLiquidAltPositions);
  const existingTaxAdvantageAltPositions = normalizeAmount(record.existingTaxAdvantageAltPositions);
  const fieldErrors: Record<string, string> = {};

  if (hasInvalidAmountInput(record.existingIlliquidAltPositions)) {
    fieldErrors['step2.existingAltPositions.existingIlliquidAltPositions'] =
      'Enter a valid non-negative amount.';
  }

  if (hasInvalidAmountInput(record.existingSemiLiquidAltPositions)) {
    fieldErrors['step2.existingAltPositions.existingSemiLiquidAltPositions'] =
      'Enter a valid non-negative amount.';
  }

  if (hasInvalidAmountInput(record.existingTaxAdvantageAltPositions)) {
    fieldErrors['step2.existingAltPositions.existingTaxAdvantageAltPositions'] =
      'Enter a valid non-negative amount.';
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
      existingIlliquidAltPositions,
      existingSemiLiquidAltPositions,
      existingTaxAdvantageAltPositions
    }
  };
}

function validateNetWorthAndConcentration(
  answer: unknown
): ValidationResult<BaiodfStep2Fields['netWorthAndConcentration']> {
  const record = toRecord(answer);
  const totalNetWorth = normalizeAmount(record.totalNetWorth);
  const liquidNetWorth = normalizeAmount(record.liquidNetWorth);
  const fieldErrors: Record<string, string> = {};

  if (hasInvalidAmountInput(record.totalNetWorth)) {
    fieldErrors['step2.netWorthAndConcentration.totalNetWorth'] = 'Enter a valid non-negative amount.';
  } else if (totalNetWorth <= 0) {
    fieldErrors['step2.netWorthAndConcentration.totalNetWorth'] = 'Total Net Worth must be greater than 0.';
  }

  if (hasInvalidAmountInput(record.liquidNetWorth)) {
    fieldErrors['step2.netWorthAndConcentration.liquidNetWorth'] = 'Enter a valid non-negative amount.';
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
      totalNetWorth,
      liquidNetWorth
    }
  };
}

export function getBaiodfStep2QuestionIds(): readonly BaiodfStep2QuestionId[] {
  return BAIODF_STEP_2_QUESTION_IDS;
}

export function isBaiodfStep2QuestionId(value: string): value is BaiodfStep2QuestionId {
  return BAIODF_STEP_2_QUESTION_ID_SET.has(value);
}

export function defaultBaiodfStep2Fields(): BaiodfStep2Fields {
  return {
    custodianAndProduct: {
      custodian: createBooleanMap(CUSTODIAN_KEYS),
      custodianOther: null,
      nameOfProduct: '',
      sponsorIssuer: '',
      dateOfPpm: null,
      datePpmSent: null
    },
    existingAltPositions: {
      existingIlliquidAltPositions: 0,
      existingSemiLiquidAltPositions: 0,
      existingTaxAdvantageAltPositions: 0
    },
    netWorthAndConcentration: {
      totalNetWorth: 0,
      liquidNetWorth: 0
    }
  };
}

export function normalizeBaiodfStep2Fields(step2Data: Prisma.JsonValue | null | undefined): BaiodfStep2Fields {
  const defaults = defaultBaiodfStep2Fields();
  const root = toRecord(step2Data);
  const custodianAndProduct = toRecord(root.custodianAndProduct);
  const existingAltPositions = toRecord(root.existingAltPositions);
  const netWorthAndConcentration = toRecord(root.netWorthAndConcentration);

  const normalized: BaiodfStep2Fields = {
    custodianAndProduct: {
      custodian: createBooleanMap(CUSTODIAN_KEYS, custodianAndProduct.custodian),
      custodianOther: normalizeNullableString(custodianAndProduct.custodianOther),
      nameOfProduct: normalizeRequiredString(custodianAndProduct.nameOfProduct),
      sponsorIssuer: normalizeRequiredString(custodianAndProduct.sponsorIssuer),
      dateOfPpm: normalizeNullableString(custodianAndProduct.dateOfPpm),
      datePpmSent: normalizeNullableString(custodianAndProduct.datePpmSent)
    },
    existingAltPositions: {
      existingIlliquidAltPositions: normalizeAmount(existingAltPositions.existingIlliquidAltPositions),
      existingSemiLiquidAltPositions: normalizeAmount(existingAltPositions.existingSemiLiquidAltPositions),
      existingTaxAdvantageAltPositions: normalizeAmount(existingAltPositions.existingTaxAdvantageAltPositions)
    },
    netWorthAndConcentration: {
      totalNetWorth: normalizeAmount(netWorthAndConcentration.totalNetWorth),
      liquidNetWorth: normalizeAmount(netWorthAndConcentration.liquidNetWorth)
    }
  };

  return sanitizeStep2Fields({
    ...defaults,
    ...normalized
  });
}

export function applyBaiodfStep2Prefill(
  fields: BaiodfStep2Fields,
  context: BaiodfStep2PrefillContext
): BaiodfStep2Fields {
  const next = sanitizeStep2Fields(fields);

  if (
    (!next.netWorthAndConcentration.totalNetWorth || next.netWorthAndConcentration.totalNetWorth <= 0) &&
    typeof context.totalNetWorth === 'number' &&
    Number.isFinite(context.totalNetWorth) &&
    context.totalNetWorth > 0
  ) {
    next.netWorthAndConcentration.totalNetWorth = context.totalNetWorth;
  }

  if (
    (!next.netWorthAndConcentration.liquidNetWorth || next.netWorthAndConcentration.liquidNetWorth <= 0) &&
    typeof context.liquidNetWorth === 'number' &&
    Number.isFinite(context.liquidNetWorth) &&
    context.liquidNetWorth >= 0
  ) {
    next.netWorthAndConcentration.liquidNetWorth = context.liquidNetWorth;
  }

  return sanitizeStep2Fields(next);
}

export function serializeBaiodfStep2Fields(fields: BaiodfStep2Fields): Prisma.InputJsonValue {
  return sanitizeStep2Fields(fields) as unknown as Prisma.InputJsonValue;
}

export function getBaiodfStep2Concentrations(
  fields: BaiodfStep2Fields,
  proposedPrincipalAmount: number
): BaiodfStep2Concentrations {
  const normalized = sanitizeStep2Fields(fields);
  const totalNetWorth = normalized.netWorthAndConcentration.totalNetWorth;
  const existingIlliquidAltPositions = normalized.existingAltPositions.existingIlliquidAltPositions;
  const existingSemiLiquidAltPositions = normalized.existingAltPositions.existingSemiLiquidAltPositions;
  const existingTaxAdvantageAltPositions = normalized.existingAltPositions.existingTaxAdvantageAltPositions;

  return {
    existingIlliquidAltConcentrationPercent: computePercent(existingIlliquidAltPositions, totalNetWorth),
    existingSemiLiquidAltConcentrationPercent: computePercent(existingSemiLiquidAltPositions, totalNetWorth),
    existingTaxAdvantageAltConcentrationPercent: computePercent(existingTaxAdvantageAltPositions, totalNetWorth),
    totalConcentrationPercent: computePercent(
      normalizeAmount(proposedPrincipalAmount) + existingIlliquidAltPositions + existingSemiLiquidAltPositions,
      totalNetWorth
    )
  };
}

export function getVisibleBaiodfStep2QuestionIds(): BaiodfStep2QuestionId[] {
  return [...BAIODF_STEP_2_QUESTION_IDS];
}

export function clampBaiodfStep2QuestionIndex(
  index: number | null | undefined,
  visibleQuestionIds: BaiodfStep2QuestionId[]
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

export function validateBaiodfStep2Answer(
  questionId: BaiodfStep2QuestionId,
  answer: unknown
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step2.custodianAndProduct':
      return validateCustodianAndProduct(answer);
    case 'step2.existingAltPositions':
      return validateExistingAltPositions(answer);
    case 'step2.netWorthAndConcentration':
      return validateNetWorthAndConcentration(answer);
    default:
      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
  }
}

export function applyBaiodfStep2Answer(
  fields: BaiodfStep2Fields,
  questionId: BaiodfStep2QuestionId,
  answer: unknown
): BaiodfStep2Fields {
  const next = sanitizeStep2Fields(fields);

  switch (questionId) {
    case 'step2.custodianAndProduct':
      next.custodianAndProduct = answer as BaiodfStep2Fields['custodianAndProduct'];
      break;
    case 'step2.existingAltPositions':
      next.existingAltPositions = answer as BaiodfStep2Fields['existingAltPositions'];
      break;
    case 'step2.netWorthAndConcentration':
      next.netWorthAndConcentration = answer as BaiodfStep2Fields['netWorthAndConcentration'];
      break;
  }

  return sanitizeStep2Fields(next);
}

export function validateBaiodfStep2Completion(fields: BaiodfStep2Fields): Record<string, string> {
  const normalized = sanitizeStep2Fields(fields);
  const errors: Record<string, string> = {};

  if (countTrueFlags(normalized.custodianAndProduct.custodian) !== 1) {
    errors['step2.custodianAndProduct.custodian'] = 'Select exactly one custodian option.';
  }

  if (normalized.custodianAndProduct.custodian.other && !normalized.custodianAndProduct.custodianOther) {
    errors['step2.custodianAndProduct.custodianOther'] = 'Specify the custodian when Other is selected.';
  }

  if (!normalized.custodianAndProduct.nameOfProduct) {
    errors['step2.custodianAndProduct.nameOfProduct'] = 'Product name is required.';
  }

  if (!normalized.custodianAndProduct.sponsorIssuer) {
    errors['step2.custodianAndProduct.sponsorIssuer'] = 'Sponsor / Issuer is required.';
  }

  if (!normalized.custodianAndProduct.dateOfPpm) {
    errors['step2.custodianAndProduct.dateOfPpm'] = 'Date of PPM is required.';
  } else if (!isValidDateInput(normalized.custodianAndProduct.dateOfPpm)) {
    errors['step2.custodianAndProduct.dateOfPpm'] = 'Enter a valid date in YYYY-MM-DD format.';
  }

  if (!normalized.custodianAndProduct.datePpmSent) {
    errors['step2.custodianAndProduct.datePpmSent'] = 'Date PPM Sent is required.';
  } else if (!isValidDateInput(normalized.custodianAndProduct.datePpmSent)) {
    errors['step2.custodianAndProduct.datePpmSent'] = 'Enter a valid date in YYYY-MM-DD format.';
  }

  const altPositionFields: Array<[string, number]> = [
    ['step2.existingAltPositions.existingIlliquidAltPositions', normalized.existingAltPositions.existingIlliquidAltPositions],
    ['step2.existingAltPositions.existingSemiLiquidAltPositions', normalized.existingAltPositions.existingSemiLiquidAltPositions],
    [
      'step2.existingAltPositions.existingTaxAdvantageAltPositions',
      normalized.existingAltPositions.existingTaxAdvantageAltPositions
    ]
  ];

  for (const [fieldPath, value] of altPositionFields) {
    if (!Number.isFinite(value) || value < 0) {
      errors[fieldPath] = 'Enter a valid non-negative amount.';
    }
  }

  if (!Number.isFinite(normalized.netWorthAndConcentration.totalNetWorth)) {
    errors['step2.netWorthAndConcentration.totalNetWorth'] = 'Enter a valid non-negative amount.';
  } else if (normalized.netWorthAndConcentration.totalNetWorth <= 0) {
    errors['step2.netWorthAndConcentration.totalNetWorth'] = 'Total Net Worth must be greater than 0.';
  }

  if (
    !Number.isFinite(normalized.netWorthAndConcentration.liquidNetWorth) ||
    normalized.netWorthAndConcentration.liquidNetWorth < 0
  ) {
    errors['step2.netWorthAndConcentration.liquidNetWorth'] = 'Enter a valid non-negative amount.';
  }

  return errors;
}
