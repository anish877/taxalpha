import type { Prisma } from '@prisma/client';

export const BAIV_506C_STEP_1_LABEL = 'STEP 1. CLIENT / ACCOUNT INFORMATION';

const BAIV_506C_STEP_1_QUESTION_IDS = ['step1.accountRegistration'] as const;
const BAIV_506C_STEP_1_QUESTION_ID_SET = new Set<string>(BAIV_506C_STEP_1_QUESTION_IDS);

export type Baiv506cStep1QuestionId = (typeof BAIV_506C_STEP_1_QUESTION_IDS)[number];

interface ValidationSuccess<T> {
  success: true;
  value: T;
}

interface ValidationFailure {
  success: false;
  fieldErrors: Record<string, string>;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export interface Baiv506cStep1Fields {
  accountRegistration: {
    rrName: string;
    rrNo: string;
    customerNames: string;
  };
}

export interface Baiv506cStep1PrefillContext {
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

function sanitizeStep1Fields(fields: Baiv506cStep1Fields): Baiv506cStep1Fields {
  const next = structuredClone(fields);
  next.accountRegistration.rrName = normalizeRequiredString(next.accountRegistration.rrName);
  next.accountRegistration.rrNo = normalizeRequiredString(next.accountRegistration.rrNo);
  next.accountRegistration.customerNames = normalizeRequiredString(next.accountRegistration.customerNames);
  return next;
}

function validateAccountRegistration(
  answer: unknown
): ValidationResult<Baiv506cStep1Fields['accountRegistration']> {
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

export function getBaiv506cStep1QuestionIds(): readonly Baiv506cStep1QuestionId[] {
  return BAIV_506C_STEP_1_QUESTION_IDS;
}

export function isBaiv506cStep1QuestionId(value: string): value is Baiv506cStep1QuestionId {
  return BAIV_506C_STEP_1_QUESTION_ID_SET.has(value);
}

export function defaultBaiv506cStep1Fields(): Baiv506cStep1Fields {
  return {
    accountRegistration: {
      rrName: '',
      rrNo: '',
      customerNames: ''
    }
  };
}

export function normalizeBaiv506cStep1Fields(
  step1Data: Prisma.JsonValue | null | undefined
): Baiv506cStep1Fields {
  const defaults = defaultBaiv506cStep1Fields();
  const root = toRecord(step1Data);
  const accountRegistration = toRecord(root.accountRegistration);

  return sanitizeStep1Fields({
    ...defaults,
    accountRegistration: {
      rrName: normalizeRequiredString(accountRegistration.rrName),
      rrNo: normalizeRequiredString(accountRegistration.rrNo),
      customerNames: normalizeRequiredString(accountRegistration.customerNames)
    }
  });
}

export function applyBaiv506cStep1Prefill(
  fields: Baiv506cStep1Fields,
  context: Baiv506cStep1PrefillContext
): Baiv506cStep1Fields {
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

export function serializeBaiv506cStep1Fields(fields: Baiv506cStep1Fields): Prisma.InputJsonValue {
  return sanitizeStep1Fields(fields) as unknown as Prisma.InputJsonValue;
}

export function getVisibleBaiv506cStep1QuestionIds(): Baiv506cStep1QuestionId[] {
  return [...BAIV_506C_STEP_1_QUESTION_IDS];
}

export function clampBaiv506cStep1QuestionIndex(
  index: number | null | undefined,
  visibleQuestionIds: Baiv506cStep1QuestionId[]
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

export function validateBaiv506cStep1Answer(
  questionId: Baiv506cStep1QuestionId,
  answer: unknown
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step1.accountRegistration':
      return validateAccountRegistration(answer);
    default:
      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
  }
}

export function applyBaiv506cStep1Answer(
  fields: Baiv506cStep1Fields,
  questionId: Baiv506cStep1QuestionId,
  answer: unknown
): Baiv506cStep1Fields {
  const next = sanitizeStep1Fields(fields);

  if (questionId === 'step1.accountRegistration') {
    next.accountRegistration = answer as Baiv506cStep1Fields['accountRegistration'];
  }

  return sanitizeStep1Fields(next);
}

export function validateBaiv506cStep1Completion(fields: Baiv506cStep1Fields): Record<string, string> {
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

  return errors;
}
