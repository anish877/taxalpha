import type { Prisma } from '@prisma/client';

export const SFC_STEP_2_LABEL = 'STEP 2. STATEMENT OF FINANCIAL CONDITION';

const SFC_STEP_2_QUESTION_IDS = [
  'step2.notes',
  'step2.acknowledgements',
  'step2.signatures.accountOwners',
  'step2.signatures.firm'
] as const;
const SFC_STEP_2_QUESTION_ID_SET = new Set<string>(SFC_STEP_2_QUESTION_IDS);

const ACKNOWLEDGEMENT_KEYS = [
  'attestDataAccurateComplete',
  'agreeReportMaterialChanges',
  'understandMayNeedRecertification',
  'understandMayNeedSupportingDocumentation',
  'understandInfoUsedForBestInterestRecommendations'
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
export type SfcStep2QuestionId = (typeof SFC_STEP_2_QUESTION_IDS)[number];

export interface SfcStep2Fields {
  notes: {
    notes: string | null;
    additionalNotes: string | null;
  };
  acknowledgements: Record<AcknowledgementKey, boolean>;
  signatures: {
    accountOwner: SignatureBlock;
    jointAccountOwner: SignatureBlock;
    financialProfessional: SignatureBlock;
    registeredPrincipal: SignatureBlock;
  };
}

export interface SfcStep2ValidationContext {
  requiresJointOwnerSignature: boolean;
}

export interface SfcStep2PrefillContext {
  requiresJointOwnerSignature: boolean;
  accountOwner?: SignatureBlock | null;
  jointAccountOwner?: SignatureBlock | null;
  financialProfessional?: SignatureBlock | null;
  registeredPrincipal?: SignatureBlock | null;
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

function createSignatureBlock(source: unknown): SignatureBlock {
  const record = toRecord(source);
  return {
    typedSignature: normalizeNullableString(record.typedSignature),
    printedName: normalizeNullableString(record.printedName),
    date: normalizeNullableString(record.date)
  };
}

function isSignatureBlockEmpty(block: SignatureBlock): boolean {
  return !block.typedSignature && !block.printedName && !block.date;
}

function sanitizeStep2Fields(fields: SfcStep2Fields): SfcStep2Fields {
  const next = structuredClone(fields);
  next.notes.notes = normalizeNullableString(next.notes.notes);
  next.notes.additionalNotes = normalizeNullableString(next.notes.additionalNotes);
  next.signatures.accountOwner = createSignatureBlock(next.signatures.accountOwner);
  next.signatures.jointAccountOwner = createSignatureBlock(next.signatures.jointAccountOwner);
  next.signatures.financialProfessional = createSignatureBlock(next.signatures.financialProfessional);
  next.signatures.registeredPrincipal = createSignatureBlock(next.signatures.registeredPrincipal);
  return next;
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

function validateNotes(answer: unknown): ValidationResult<SfcStep2Fields['notes']> {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return {
      success: false,
      fieldErrors: {
        'step2.notes': 'Please provide notes.'
      }
    };
  }

  const record = answer as Record<string, unknown>;
  return {
    success: true,
    value: {
      notes: normalizeNullableString(record.notes),
      additionalNotes: normalizeNullableString(record.additionalNotes)
    }
  };
}

function validateAcknowledgements(
  answer: unknown
): ValidationResult<SfcStep2Fields['acknowledgements']> {
  const acknowledgements = createBooleanMap(ACKNOWLEDGEMENT_KEYS, answer);

  if (countTrueFlags(acknowledgements) !== ACKNOWLEDGEMENT_KEYS.length) {
    return {
      success: false,
      fieldErrors: {
        'step2.acknowledgements': 'All acknowledgements must be accepted.'
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
  context: SfcStep2ValidationContext
): ValidationResult<{
  accountOwner: SignatureBlock;
  jointAccountOwner: SignatureBlock;
}> {
  const record = toRecord(answer);
  const accountOwner = createSignatureBlock(record.accountOwner);
  const jointAccountOwner = createSignatureBlock(record.jointAccountOwner);
  const errors: Record<string, string> = {
    ...validateRequiredSignatureBlock(
      accountOwner,
      'step2.signatures.accountOwners.accountOwner',
      'Account Owner'
    )
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

function validateFirmSignatures(answer: unknown): ValidationResult<{
  financialProfessional: SignatureBlock;
  registeredPrincipal: SignatureBlock;
}> {
  const record = toRecord(answer);
  const financialProfessional = createSignatureBlock(record.financialProfessional);
  const registeredPrincipal = createSignatureBlock(record.registeredPrincipal);
  const errors: Record<string, string> = {
    ...validateRequiredSignatureBlock(
      financialProfessional,
      'step2.signatures.firm.financialProfessional',
      'Financial Professional'
    ),
    ...validateOptionalAllOrNoneSignatureBlock(
      registeredPrincipal,
      'step2.signatures.firm.registeredPrincipal',
      'Registered Principal'
    )
  };

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      fieldErrors: errors
    };
  }

  return {
    success: true,
    value: {
      financialProfessional,
      registeredPrincipal
    }
  };
}

export function getSfcStep2QuestionIds(): readonly SfcStep2QuestionId[] {
  return SFC_STEP_2_QUESTION_IDS;
}

export function isSfcStep2QuestionId(value: string): value is SfcStep2QuestionId {
  return SFC_STEP_2_QUESTION_ID_SET.has(value);
}

export function defaultSfcStep2Fields(): SfcStep2Fields {
  return {
    notes: {
      notes: null,
      additionalNotes: null
    },
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
      },
      registeredPrincipal: {
        typedSignature: null,
        printedName: null,
        date: null
      }
    }
  };
}

export function normalizeSfcStep2Fields(step2Data: Prisma.JsonValue | null | undefined): SfcStep2Fields {
  const root = toRecord(step2Data);
  const notes = toRecord(root.notes);
  const signatures = toRecord(root.signatures);

  return sanitizeStep2Fields({
    notes: {
      notes: normalizeNullableString(notes.notes),
      additionalNotes: normalizeNullableString(notes.additionalNotes)
    },
    acknowledgements: createBooleanMap(ACKNOWLEDGEMENT_KEYS, root.acknowledgements),
    signatures: {
      accountOwner: createSignatureBlock(signatures.accountOwner),
      jointAccountOwner: createSignatureBlock(signatures.jointAccountOwner),
      financialProfessional: createSignatureBlock(signatures.financialProfessional),
      registeredPrincipal: createSignatureBlock(signatures.registeredPrincipal)
    }
  });
}

export function applySfcStep2Prefill(
  fields: SfcStep2Fields,
  context: SfcStep2PrefillContext
): SfcStep2Fields {
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
  next.signatures.registeredPrincipal = mergePrefillBlock(
    next.signatures.registeredPrincipal,
    context.registeredPrincipal
  );
  return sanitizeStep2Fields(next);
}

export function serializeSfcStep2Fields(fields: SfcStep2Fields): Prisma.InputJsonValue {
  return sanitizeStep2Fields(fields) as unknown as Prisma.InputJsonValue;
}

export function getVisibleSfcStep2QuestionIds(): SfcStep2QuestionId[] {
  return [...SFC_STEP_2_QUESTION_IDS];
}

export function clampSfcStep2QuestionIndex(
  index: number | null | undefined,
  visibleQuestionIds: SfcStep2QuestionId[]
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

export function validateSfcStep2Answer(
  questionId: SfcStep2QuestionId,
  answer: unknown,
  context: SfcStep2ValidationContext
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step2.notes':
      return validateNotes(answer);
    case 'step2.acknowledgements':
      return validateAcknowledgements(answer);
    case 'step2.signatures.accountOwners':
      return validateAccountOwners(answer, context);
    case 'step2.signatures.firm':
      return validateFirmSignatures(answer);
    default:
      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
  }
}

export function applySfcStep2Answer(
  fields: SfcStep2Fields,
  questionId: SfcStep2QuestionId,
  answer: unknown
): SfcStep2Fields {
  const next = sanitizeStep2Fields(fields);

  switch (questionId) {
    case 'step2.notes':
      next.notes = answer as SfcStep2Fields['notes'];
      break;
    case 'step2.acknowledgements':
      next.acknowledgements = answer as SfcStep2Fields['acknowledgements'];
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
    case 'step2.signatures.firm': {
      const payload = answer as {
        financialProfessional: SignatureBlock;
        registeredPrincipal: SignatureBlock;
      };
      next.signatures.financialProfessional = payload.financialProfessional;
      next.signatures.registeredPrincipal = payload.registeredPrincipal;
      break;
    }
  }

  return sanitizeStep2Fields(next);
}

export function validateSfcStep2Completion(
  fields: SfcStep2Fields,
  context: SfcStep2ValidationContext
): Record<string, string> {
  const normalized = sanitizeStep2Fields(fields);
  const errors: Record<string, string> = {};

  const acknowledgementValidation = validateAcknowledgements(normalized.acknowledgements);
  if (!acknowledgementValidation.success) {
    Object.assign(errors, acknowledgementValidation.fieldErrors);
  }

  const accountOwnerValidation = validateAccountOwners(
    {
      accountOwner: normalized.signatures.accountOwner,
      jointAccountOwner: normalized.signatures.jointAccountOwner
    },
    context
  );
  if (!accountOwnerValidation.success) {
    Object.assign(errors, accountOwnerValidation.fieldErrors);
  }

  const firmValidation = validateFirmSignatures({
    financialProfessional: normalized.signatures.financialProfessional,
    registeredPrincipal: normalized.signatures.registeredPrincipal
  });
  if (!firmValidation.success) {
    Object.assign(errors, firmValidation.fieldErrors);
  }

  return errors;
}
