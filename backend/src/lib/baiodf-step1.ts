import type { Prisma } from '@prisma/client';

export const BAIODF_STEP_1_LABEL = 'STEP 1. CUSTOMER / ACCOUNT INFORMATION';

const YES_NO_KEYS = ['yes', 'no'] as const;

const BAIODF_STEP_1_QUESTION_IDS = ['step1.accountRegistration', 'step1.orderBasics'] as const;
const BAIODF_STEP_1_QUESTION_ID_SET = new Set<string>(BAIODF_STEP_1_QUESTION_IDS);

type YesNoKey = (typeof YES_NO_KEYS)[number];
type YesNoMap = Record<YesNoKey, boolean>;

export type BaiodfStep1QuestionId = (typeof BAIODF_STEP_1_QUESTION_IDS)[number];

interface ValidationSuccess<T> {
  success: true;
  value: T;
}

interface ValidationFailure {
  success: false;
  fieldErrors: Record<string, string>;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export interface BaiodfStep1Fields {
  accountRegistration: {
    rrName: string;
    rrNo: string;
    customerNames: string;
  };
  orderBasics: {
    proposedPrincipalAmount: number;
    qualifiedAccount: YesNoMap;
    qualifiedAccountRmdCertification: boolean;
    solicitedTrade: YesNoMap;
    taxAdvantagePurchase: YesNoMap;
  };
}

export interface BaiodfStep1PrefillContext {
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

function sanitizeStep1Fields(fields: BaiodfStep1Fields): BaiodfStep1Fields {
  const next = structuredClone(fields);
  next.accountRegistration.rrName = normalizeRequiredString(next.accountRegistration.rrName);
  next.accountRegistration.rrNo = normalizeRequiredString(next.accountRegistration.rrNo);
  next.accountRegistration.customerNames = normalizeRequiredString(next.accountRegistration.customerNames);
  next.orderBasics.proposedPrincipalAmount = normalizeAmount(next.orderBasics.proposedPrincipalAmount);
  next.orderBasics.qualifiedAccount = createBooleanMap(YES_NO_KEYS, next.orderBasics.qualifiedAccount);
  next.orderBasics.solicitedTrade = createBooleanMap(YES_NO_KEYS, next.orderBasics.solicitedTrade);
  next.orderBasics.taxAdvantagePurchase = createBooleanMap(YES_NO_KEYS, next.orderBasics.taxAdvantagePurchase);
  next.orderBasics.qualifiedAccountRmdCertification = next.orderBasics.qualifiedAccountRmdCertification === true;

  if (!next.orderBasics.qualifiedAccount.yes) {
    next.orderBasics.qualifiedAccountRmdCertification = false;
  }

  return next;
}

function validateSingleYesNo(answer: unknown, fieldPath: string): ValidationResult<YesNoMap> {
  const normalized = createBooleanMap(YES_NO_KEYS, answer);

  if (countTrueFlags(normalized) !== 1) {
    return {
      success: false,
      fieldErrors: {
        [fieldPath]: 'Select exactly one option.'
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateAccountRegistration(answer: unknown): ValidationResult<BaiodfStep1Fields['accountRegistration']> {
  const record = toRecord(answer);
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

function validateOrderBasics(answer: unknown): ValidationResult<BaiodfStep1Fields['orderBasics']> {
  const record = toRecord(answer);
  const proposedPrincipalAmount = normalizeAmount(record.proposedPrincipalAmount);
  const qualifiedAccountValidation = validateSingleYesNo(record.qualifiedAccount, 'step1.orderBasics.qualifiedAccount');
  const solicitedTradeValidation = validateSingleYesNo(record.solicitedTrade, 'step1.orderBasics.solicitedTrade');
  const taxAdvantageValidation = validateSingleYesNo(
    record.taxAdvantagePurchase,
    'step1.orderBasics.taxAdvantagePurchase'
  );
  const fieldErrors: Record<string, string> = {};

  if (hasInvalidAmountInput(record.proposedPrincipalAmount)) {
    fieldErrors['step1.orderBasics.proposedPrincipalAmount'] = 'Enter a valid non-negative amount.';
  }

  if (!qualifiedAccountValidation.success) {
    Object.assign(fieldErrors, qualifiedAccountValidation.fieldErrors);
  }

  if (!solicitedTradeValidation.success) {
    Object.assign(fieldErrors, solicitedTradeValidation.fieldErrors);
  }

  if (!taxAdvantageValidation.success) {
    Object.assign(fieldErrors, taxAdvantageValidation.fieldErrors);
  }

  const qualifiedAccountRmdCertification = record.qualifiedAccountRmdCertification === true;
  if (qualifiedAccountValidation.success && qualifiedAccountValidation.value.yes && !qualifiedAccountRmdCertification) {
    fieldErrors['step1.orderBasics.qualifiedAccountRmdCertification'] =
      'Certification is required when Qualified Account is Yes.';
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
      proposedPrincipalAmount,
      qualifiedAccount: qualifiedAccountValidation.success
        ? qualifiedAccountValidation.value
        : createBooleanMap(YES_NO_KEYS),
      qualifiedAccountRmdCertification,
      solicitedTrade: solicitedTradeValidation.success
        ? solicitedTradeValidation.value
        : createBooleanMap(YES_NO_KEYS),
      taxAdvantagePurchase: taxAdvantageValidation.success
        ? taxAdvantageValidation.value
        : createBooleanMap(YES_NO_KEYS)
    }
  };
}

export function getBaiodfStep1QuestionIds(): readonly BaiodfStep1QuestionId[] {
  return BAIODF_STEP_1_QUESTION_IDS;
}

export function isBaiodfStep1QuestionId(value: string): value is BaiodfStep1QuestionId {
  return BAIODF_STEP_1_QUESTION_ID_SET.has(value);
}

export function defaultBaiodfStep1Fields(): BaiodfStep1Fields {
  return {
    accountRegistration: {
      rrName: '',
      rrNo: '',
      customerNames: ''
    },
    orderBasics: {
      proposedPrincipalAmount: 0,
      qualifiedAccount: createBooleanMap(YES_NO_KEYS),
      qualifiedAccountRmdCertification: false,
      solicitedTrade: createBooleanMap(YES_NO_KEYS),
      taxAdvantagePurchase: createBooleanMap(YES_NO_KEYS)
    }
  };
}

export function normalizeBaiodfStep1Fields(step1Data: Prisma.JsonValue | null | undefined): BaiodfStep1Fields {
  const defaults = defaultBaiodfStep1Fields();
  const root = toRecord(step1Data);
  const accountRegistration = toRecord(root.accountRegistration);
  const orderBasics = toRecord(root.orderBasics);

  const normalized: BaiodfStep1Fields = {
    accountRegistration: {
      rrName: normalizeRequiredString(accountRegistration.rrName),
      rrNo: normalizeRequiredString(accountRegistration.rrNo),
      customerNames: normalizeRequiredString(accountRegistration.customerNames)
    },
    orderBasics: {
      proposedPrincipalAmount: normalizeAmount(orderBasics.proposedPrincipalAmount),
      qualifiedAccount: createBooleanMap(YES_NO_KEYS, orderBasics.qualifiedAccount),
      qualifiedAccountRmdCertification: orderBasics.qualifiedAccountRmdCertification === true,
      solicitedTrade: createBooleanMap(YES_NO_KEYS, orderBasics.solicitedTrade),
      taxAdvantagePurchase: createBooleanMap(YES_NO_KEYS, orderBasics.taxAdvantagePurchase)
    }
  };

  return sanitizeStep1Fields({
    ...defaults,
    ...normalized
  });
}

export function applyBaiodfStep1Prefill(
  fields: BaiodfStep1Fields,
  context: BaiodfStep1PrefillContext
): BaiodfStep1Fields {
  const next = sanitizeStep1Fields(fields);

  if (!next.accountRegistration.rrName && normalizeNullableString(context.rrName)) {
    next.accountRegistration.rrName = context.rrName!.trim();
  }

  if (!next.accountRegistration.rrNo && normalizeNullableString(context.rrNo)) {
    next.accountRegistration.rrNo = context.rrNo!.trim();
  }

  if (!next.accountRegistration.customerNames && normalizeNullableString(context.customerNames)) {
    next.accountRegistration.customerNames = context.customerNames!.trim();
  }

  return sanitizeStep1Fields(next);
}

export function serializeBaiodfStep1Fields(fields: BaiodfStep1Fields): Prisma.InputJsonValue {
  return sanitizeStep1Fields(fields) as unknown as Prisma.InputJsonValue;
}

export function getVisibleBaiodfStep1QuestionIds(): BaiodfStep1QuestionId[] {
  return [...BAIODF_STEP_1_QUESTION_IDS];
}

export function clampBaiodfStep1QuestionIndex(
  index: number | null | undefined,
  visibleQuestionIds: BaiodfStep1QuestionId[]
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

export function validateBaiodfStep1Answer(
  questionId: BaiodfStep1QuestionId,
  answer: unknown
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step1.accountRegistration':
      return validateAccountRegistration(answer);
    case 'step1.orderBasics':
      return validateOrderBasics(answer);
    default:
      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
  }
}

export function applyBaiodfStep1Answer(
  fields: BaiodfStep1Fields,
  questionId: BaiodfStep1QuestionId,
  answer: unknown
): BaiodfStep1Fields {
  const next = sanitizeStep1Fields(fields);

  switch (questionId) {
    case 'step1.accountRegistration':
      next.accountRegistration = answer as BaiodfStep1Fields['accountRegistration'];
      break;
    case 'step1.orderBasics':
      next.orderBasics = answer as BaiodfStep1Fields['orderBasics'];
      break;
  }

  return sanitizeStep1Fields(next);
}

export function validateBaiodfStep1Completion(fields: BaiodfStep1Fields): Record<string, string> {
  const normalized = sanitizeStep1Fields(fields);
  const errors: Record<string, string> = {};

  if (!normalized.accountRegistration.rrName) {
    errors['step1.accountRegistration.rrName'] = 'RR Name is required.';
  }

  if (!normalized.accountRegistration.rrNo) {
    errors['step1.accountRegistration.rrNo'] = 'RR No. is required.';
  }

  if (!normalized.accountRegistration.customerNames) {
    errors['step1.accountRegistration.customerNames'] = 'Customer name(s) are required.';
  }

  if (!Number.isFinite(normalized.orderBasics.proposedPrincipalAmount) || normalized.orderBasics.proposedPrincipalAmount < 0) {
    errors['step1.orderBasics.proposedPrincipalAmount'] = 'Enter a valid non-negative amount.';
  }

  if (countTrueFlags(normalized.orderBasics.qualifiedAccount) !== 1) {
    errors['step1.orderBasics.qualifiedAccount'] = 'Select exactly one option.';
  }

  if (countTrueFlags(normalized.orderBasics.solicitedTrade) !== 1) {
    errors['step1.orderBasics.solicitedTrade'] = 'Select exactly one option.';
  }

  if (countTrueFlags(normalized.orderBasics.taxAdvantagePurchase) !== 1) {
    errors['step1.orderBasics.taxAdvantagePurchase'] = 'Select exactly one option.';
  }

  if (normalized.orderBasics.qualifiedAccount.yes && !normalized.orderBasics.qualifiedAccountRmdCertification) {
    errors['step1.orderBasics.qualifiedAccountRmdCertification'] =
      'Certification is required when Qualified Account is Yes.';
  }

  return errors;
}
