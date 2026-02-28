import type { Prisma } from '@prisma/client';

export const BAIV_506C_STEP_2_LABEL = 'STEP 2. ACKNOWLEDGEMENTS AND SIGNATURES';

const BAIV_506C_STEP_2_QUESTION_IDS = [
  'step2.acknowledgements',
  'step2.signatures.accountOwners',
  'step2.signatures.financialProfessional'
] as const;
const BAIV_506C_STEP_2_QUESTION_ID_SET = new Set<string>(BAIV_506C_STEP_2_QUESTION_IDS);

const ACKNOWLEDGEMENT_KEYS = [
  'rule506cGuidelineAcknowledged',
  'secRuleReviewedAndUnderstood',
  'incomeOrNetWorthVerified',
  'documentationReviewed'
] as const;

type AcknowledgementKey = (typeof ACKNOWLEDGEMENT_KEYS)[number];

interface SignatureBlock {
  typedSignature: string | null;
  printedName: string | null;
  date: string | null;
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
export type Baiv506cStep2QuestionId = (typeof BAIV_506C_STEP_2_QUESTION_IDS)[number];

export interface Baiv506cStep2Fields {
  acknowledgements: Record<AcknowledgementKey, boolean>;
  signatures: {
    accountOwner: SignatureBlock;
    jointAccountOwner: SignatureBlock;
    financialProfessional: SignatureBlock;
  };
}

export interface Baiv506cStep2ValidationContext {
  requiresJointOwnerSignature: boolean;
}

export interface Baiv506cStep2PrefillContext {
  requiresJointOwnerSignature: boolean;
  accountOwner?: SignatureBlock | null;
  jointAccountOwner?: SignatureBlock | null;
  financialProfessional?: SignatureBlock | null;
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

function createSignatureBlock(source: unknown): SignatureBlock {
  const record = toRecord(source);
  return {
    typedSignature: normalizeNullableString(record.typedSignature),
    printedName: normalizeNullableString(record.printedName),
    date: normalizeNullableString(record.date)
  };
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

function getUtcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isPastOrToday(value: string): boolean {
  if (!isValidDateInput(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return parsed.getTime() <= getUtcToday().getTime();
}

function isSignatureBlockEmpty(block: SignatureBlock): boolean {
  return !block.typedSignature && !block.printedName && !block.date;
}

function validateRequiredSignatureBlock(
  block: SignatureBlock,
  prefix: string,
  label: string
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!block.typedSignature) {
    errors[`${prefix}.typedSignature`] = `${label} typed signature is required.`;
  }

  if (!block.printedName) {
    errors[`${prefix}.printedName`] = `${label} printed name is required.`;
  }

  if (!block.date) {
    errors[`${prefix}.date`] = `${label} signature date is required.`;
  } else if (!isValidDateInput(block.date)) {
    errors[`${prefix}.date`] = 'Enter a valid date in YYYY-MM-DD format.';
  } else if (!isPastOrToday(block.date)) {
    errors[`${prefix}.date`] = 'Signature date cannot be in the future.';
  }

  return errors;
}

function validateOptionalAllOrNoneSignatureBlock(
  block: SignatureBlock,
  prefix: string,
  label: string
): Record<string, string> {
  if (isSignatureBlockEmpty(block)) {
    return {};
  }

  return validateRequiredSignatureBlock(block, prefix, label);
}

function mergePrefillBlock(existing: SignatureBlock, prefill: SignatureBlock | null | undefined): SignatureBlock {
  if (!prefill) {
    return existing;
  }

  return {
    typedSignature: existing.typedSignature ?? prefill.typedSignature ?? null,
    printedName: existing.printedName ?? prefill.printedName ?? null,
    date: existing.date ?? prefill.date ?? null
  };
}

function sanitizeStep2Fields(fields: Baiv506cStep2Fields): Baiv506cStep2Fields {
  const next = structuredClone(fields);
  next.acknowledgements = createBooleanMap(ACKNOWLEDGEMENT_KEYS, next.acknowledgements);
  next.signatures.accountOwner = createSignatureBlock(next.signatures.accountOwner);
  next.signatures.jointAccountOwner = createSignatureBlock(next.signatures.jointAccountOwner);
  next.signatures.financialProfessional = createSignatureBlock(next.signatures.financialProfessional);
  return next;
}

function validateAcknowledgements(answer: unknown): ValidationResult<Baiv506cStep2Fields['acknowledgements']> {
  const acknowledgements = createBooleanMap(ACKNOWLEDGEMENT_KEYS, answer);

  if (countTrueFlags(acknowledgements) !== ACKNOWLEDGEMENT_KEYS.length) {
    return {
      success: false,
      fieldErrors: {
        'step2.acknowledgements': 'All required acknowledgements must be accepted.'
      }
    };
  }

  return {
    success: true,
    value: acknowledgements
  };
}

function validateAccountOwners(
  answer: unknown,
  context: Baiv506cStep2ValidationContext
): ValidationResult<{ accountOwner: SignatureBlock; jointAccountOwner: SignatureBlock }> {
  const record = toRecord(answer);
  const accountOwner = createSignatureBlock(record.accountOwner);
  const jointAccountOwner = createSignatureBlock(record.jointAccountOwner);
  const errors: Record<string, string> = {
    ...validateRequiredSignatureBlock(accountOwner, 'step2.signatures.accountOwners.accountOwner', 'Account Owner')
  };

  if (context.requiresJointOwnerSignature) {
    Object.assign(
      errors,
      validateRequiredSignatureBlock(
        jointAccountOwner,
        'step2.signatures.accountOwners.jointAccountOwner',
        'Joint Account Owner'
      )
    );
  } else {
    Object.assign(
      errors,
      validateOptionalAllOrNoneSignatureBlock(
        jointAccountOwner,
        'step2.signatures.accountOwners.jointAccountOwner',
        'Joint Account Owner'
      )
    );
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      fieldErrors: errors
    };
  }

  return {
    success: true,
    value: {
      accountOwner,
      jointAccountOwner
    }
  };
}

function validateFinancialProfessional(answer: unknown): ValidationResult<{ financialProfessional: SignatureBlock }> {
  const record = toRecord(answer);
  const financialProfessional = createSignatureBlock(record.financialProfessional);
  const errors = validateRequiredSignatureBlock(
    financialProfessional,
    'step2.signatures.financialProfessional.financialProfessional',
    'Financial Professional'
  );

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      fieldErrors: errors
    };
  }

  return {
    success: true,
    value: {
      financialProfessional
    }
  };
}

export function getBaiv506cStep2QuestionIds(): readonly Baiv506cStep2QuestionId[] {
  return BAIV_506C_STEP_2_QUESTION_IDS;
}

export function isBaiv506cStep2QuestionId(value: string): value is Baiv506cStep2QuestionId {
  return BAIV_506C_STEP_2_QUESTION_ID_SET.has(value);
}

export function defaultBaiv506cStep2Fields(): Baiv506cStep2Fields {
  return {
    acknowledgements: createBooleanMap(ACKNOWLEDGEMENT_KEYS),
    signatures: {
      accountOwner: {
        typedSignature: null,
        printedName: null,
        date: null
      },
      jointAccountOwner: {
        typedSignature: null,
        printedName: null,
        date: null
      },
      financialProfessional: {
        typedSignature: null,
        printedName: null,
        date: null
      }
    }
  };
}

export function normalizeBaiv506cStep2Fields(step2Data: Prisma.JsonValue | null | undefined): Baiv506cStep2Fields {
  const defaults = defaultBaiv506cStep2Fields();
  const root = toRecord(step2Data);
  const signatures = toRecord(root.signatures);

  const normalized: Baiv506cStep2Fields = {
    acknowledgements: createBooleanMap(ACKNOWLEDGEMENT_KEYS, root.acknowledgements),
    signatures: {
      accountOwner: createSignatureBlock(signatures.accountOwner),
      jointAccountOwner: createSignatureBlock(signatures.jointAccountOwner),
      financialProfessional: createSignatureBlock(signatures.financialProfessional)
    }
  };

  return sanitizeStep2Fields({
    ...defaults,
    ...normalized
  });
}

export function applyBaiv506cStep2Prefill(
  fields: Baiv506cStep2Fields,
  context: Baiv506cStep2PrefillContext
): Baiv506cStep2Fields {
  const next = sanitizeStep2Fields(fields);
  next.signatures.accountOwner = mergePrefillBlock(next.signatures.accountOwner, context.accountOwner);

  if (context.requiresJointOwnerSignature) {
    next.signatures.jointAccountOwner = mergePrefillBlock(
      next.signatures.jointAccountOwner,
      context.jointAccountOwner
    );
  }

  next.signatures.financialProfessional = mergePrefillBlock(
    next.signatures.financialProfessional,
    context.financialProfessional
  );

  return sanitizeStep2Fields(next);
}

export function serializeBaiv506cStep2Fields(fields: Baiv506cStep2Fields): Prisma.InputJsonValue {
  return sanitizeStep2Fields(fields) as unknown as Prisma.InputJsonValue;
}

export function getVisibleBaiv506cStep2QuestionIds(): Baiv506cStep2QuestionId[] {
  return [...BAIV_506C_STEP_2_QUESTION_IDS];
}

export function clampBaiv506cStep2QuestionIndex(
  index: number | null | undefined,
  visibleQuestionIds: Baiv506cStep2QuestionId[]
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

export function validateBaiv506cStep2Answer(
  questionId: Baiv506cStep2QuestionId,
  answer: unknown,
  context: Baiv506cStep2ValidationContext
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step2.acknowledgements':
      return validateAcknowledgements(answer);
    case 'step2.signatures.accountOwners':
      return validateAccountOwners(answer, context);
    case 'step2.signatures.financialProfessional':
      return validateFinancialProfessional(answer);
    default:
      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
  }
}

export function applyBaiv506cStep2Answer(
  fields: Baiv506cStep2Fields,
  questionId: Baiv506cStep2QuestionId,
  answer: unknown
): Baiv506cStep2Fields {
  const next = sanitizeStep2Fields(fields);

  switch (questionId) {
    case 'step2.acknowledgements':
      next.acknowledgements = answer as Baiv506cStep2Fields['acknowledgements'];
      break;
    case 'step2.signatures.accountOwners': {
      const payload = answer as {
        accountOwner: SignatureBlock;
        jointAccountOwner: SignatureBlock;
      };
      next.signatures.accountOwner = payload.accountOwner;
      next.signatures.jointAccountOwner = payload.jointAccountOwner;
      break;
    }
    case 'step2.signatures.financialProfessional': {
      const payload = answer as {
        financialProfessional: SignatureBlock;
      };
      next.signatures.financialProfessional = payload.financialProfessional;
      break;
    }
  }

  return sanitizeStep2Fields(next);
}

export function validateBaiv506cStep2Completion(
  fields: Baiv506cStep2Fields,
  context: Baiv506cStep2ValidationContext
): Record<string, string> {
  const normalized = sanitizeStep2Fields(fields);
  const errors: Record<string, string> = {};

  const acknowledgementsValidation = validateAcknowledgements(normalized.acknowledgements);
  if (!acknowledgementsValidation.success) {
    Object.assign(errors, acknowledgementsValidation.fieldErrors);
  }

  const accountOwnersValidation = validateAccountOwners(
    {
      accountOwner: normalized.signatures.accountOwner,
      jointAccountOwner: normalized.signatures.jointAccountOwner
    },
    context
  );
  if (!accountOwnersValidation.success) {
    Object.assign(errors, accountOwnersValidation.fieldErrors);
  }

  const financialProfessionalValidation = validateFinancialProfessional({
    financialProfessional: normalized.signatures.financialProfessional
  });
  if (!financialProfessionalValidation.success) {
    Object.assign(errors, financialProfessionalValidation.fieldErrors);
  }

  return errors;
}
