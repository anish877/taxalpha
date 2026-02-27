import type { Prisma } from '@prisma/client';

export const STEP_7_LABEL = 'STEP 7. SIGNATURES';

export type Step7QuestionId =
  | 'step7.certifications.acceptances'
  | 'step7.signatures.accountOwners'
  | 'step7.signatures.firm';

const STEP_7_QUESTION_IDS: Step7QuestionId[] = [
  'step7.certifications.acceptances',
  'step7.signatures.accountOwners',
  'step7.signatures.firm'
];
const STEP_7_QUESTION_ID_SET = new Set<string>(STEP_7_QUESTION_IDS);

interface SignatureBlock {
  typedSignature: string | null;
  printedName: string | null;
  date: string | null;
}

export interface Step7Fields {
  certifications: {
    acceptances: {
      attestationsAccepted: boolean;
      taxpayerCertificationAccepted: boolean;
      usPersonDefinitionAcknowledged: boolean;
    };
  };
  signatures: {
    accountOwner: SignatureBlock;
    jointAccountOwner: SignatureBlock;
    financialProfessional: SignatureBlock;
    supervisorPrincipal: SignatureBlock;
  };
}

export interface Step7ValidationContext {
  requiresJointOwnerSignature: boolean;
}

export interface Step7PrefillContext {
  accountOwnerPrintedName?: string | null;
  jointAccountOwnerPrintedName?: string | null;
  financialProfessionalPrintedName?: string | null;
  requiresJointOwnerSignature: boolean;
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

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function sanitizeStep7Fields(fields: Step7Fields): Step7Fields {
  const next = structuredClone(fields);
  next.signatures.accountOwner = createSignatureBlock(next.signatures.accountOwner);
  next.signatures.jointAccountOwner = createSignatureBlock(next.signatures.jointAccountOwner);
  next.signatures.financialProfessional = createSignatureBlock(next.signatures.financialProfessional);
  next.signatures.supervisorPrincipal = createSignatureBlock(next.signatures.supervisorPrincipal);
  return next;
}

function validateAcceptancesAnswer(
  answer: unknown
): ValidationResult<Step7Fields['certifications']['acceptances']> {
  const record = toRecord(answer);
  const acceptances = {
    attestationsAccepted: record.attestationsAccepted === true,
    taxpayerCertificationAccepted: record.taxpayerCertificationAccepted === true,
    usPersonDefinitionAcknowledged: record.usPersonDefinitionAcknowledged === true
  };

  if (
    !acceptances.attestationsAccepted ||
    !acceptances.taxpayerCertificationAccepted ||
    !acceptances.usPersonDefinitionAcknowledged
  ) {
    return {
      success: false,
      fieldErrors: {
        'step7.certifications.acceptances': 'All required attestations and certifications must be accepted.'
      }
    };
  }

  return {
    success: true,
    value: acceptances
  };
}

function validateAccountOwnerSignaturesAnswer(
  answer: unknown,
  context: Step7ValidationContext
): ValidationResult<{
  accountOwner: SignatureBlock;
  jointAccountOwner: SignatureBlock;
}> {
  const record = toRecord(answer);
  const accountOwner = createSignatureBlock(record.accountOwner);
  const jointAccountOwner = createSignatureBlock(record.jointAccountOwner);
  const errors: Record<string, string> = {
    ...validateRequiredSignatureBlock(accountOwner, 'step7.signatures.accountOwners.accountOwner', 'Account Owner')
  };

  if (context.requiresJointOwnerSignature) {
    Object.assign(
      errors,
      validateRequiredSignatureBlock(
        jointAccountOwner,
        'step7.signatures.accountOwners.jointAccountOwner',
        'Joint Account Owner'
      )
    );
  } else {
    Object.assign(
      errors,
      validateOptionalAllOrNoneSignatureBlock(
        jointAccountOwner,
        'step7.signatures.accountOwners.jointAccountOwner',
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

function validateFirmSignaturesAnswer(
  answer: unknown
): ValidationResult<{
  financialProfessional: SignatureBlock;
  supervisorPrincipal: SignatureBlock;
}> {
  const record = toRecord(answer);
  const financialProfessional = createSignatureBlock(record.financialProfessional);
  const supervisorPrincipal = createSignatureBlock(record.supervisorPrincipal);
  const errors: Record<string, string> = {
    ...validateRequiredSignatureBlock(
      financialProfessional,
      'step7.signatures.firm.financialProfessional',
      'Financial Professional'
    ),
    ...validateOptionalAllOrNoneSignatureBlock(
      supervisorPrincipal,
      'step7.signatures.firm.supervisorPrincipal',
      'Supervisor / Principal'
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
      supervisorPrincipal
    }
  };
}

export function getStep7QuestionIds(): readonly Step7QuestionId[] {
  return STEP_7_QUESTION_IDS;
}

export function isStep7QuestionId(value: string): value is Step7QuestionId {
  return STEP_7_QUESTION_ID_SET.has(value);
}

export function defaultStep7Fields(): Step7Fields {
  return {
    certifications: {
      acceptances: {
        attestationsAccepted: false,
        taxpayerCertificationAccepted: false,
        usPersonDefinitionAcknowledged: false
      }
    },
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
      supervisorPrincipal: {
        typedSignature: null,
        printedName: null,
        date: null
      }
    }
  };
}

export function normalizeStep7Fields(step7Data: Prisma.JsonValue | null | undefined): Step7Fields {
  const defaults = defaultStep7Fields();
  const root = toRecord(step7Data);
  const certifications = toRecord(root.certifications);
  const acceptances = toRecord(certifications.acceptances);
  const signatures = toRecord(root.signatures);

  const normalized: Step7Fields = {
    certifications: {
      acceptances: {
        attestationsAccepted: acceptances.attestationsAccepted === true,
        taxpayerCertificationAccepted: acceptances.taxpayerCertificationAccepted === true,
        usPersonDefinitionAcknowledged: acceptances.usPersonDefinitionAcknowledged === true
      }
    },
    signatures: {
      accountOwner: createSignatureBlock(signatures.accountOwner),
      jointAccountOwner: createSignatureBlock(signatures.jointAccountOwner),
      financialProfessional: createSignatureBlock(signatures.financialProfessional),
      supervisorPrincipal: createSignatureBlock(signatures.supervisorPrincipal)
    }
  };

  return sanitizeStep7Fields({
    ...defaults,
    ...normalized
  });
}

export function serializeStep7Fields(fields: Step7Fields): Prisma.InputJsonValue {
  return sanitizeStep7Fields(fields) as unknown as Prisma.InputJsonValue;
}

export function applyStep7Prefill(fields: Step7Fields, context: Step7PrefillContext): Step7Fields {
  const next = sanitizeStep7Fields(fields);

  if (!next.signatures.accountOwner.printedName && context.accountOwnerPrintedName) {
    next.signatures.accountOwner.printedName = context.accountOwnerPrintedName.trim();
  }

  if (
    context.requiresJointOwnerSignature &&
    !next.signatures.jointAccountOwner.printedName &&
    context.jointAccountOwnerPrintedName
  ) {
    next.signatures.jointAccountOwner.printedName = context.jointAccountOwnerPrintedName.trim();
  }

  if (
    !next.signatures.financialProfessional.printedName &&
    context.financialProfessionalPrintedName
  ) {
    next.signatures.financialProfessional.printedName = context.financialProfessionalPrintedName.trim();
  }

  return next;
}

export function getVisibleStep7QuestionIds(): Step7QuestionId[] {
  return [...STEP_7_QUESTION_IDS];
}

export function clampStep7QuestionIndex(index: number | null | undefined, visibleQuestionIds: Step7QuestionId[]): number {
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

export function validateStep7Answer(
  questionId: Step7QuestionId,
  answer: unknown,
  context: Step7ValidationContext
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step7.certifications.acceptances':
      return validateAcceptancesAnswer(answer);
    case 'step7.signatures.accountOwners':
      return validateAccountOwnerSignaturesAnswer(answer, context);
    case 'step7.signatures.firm':
      return validateFirmSignaturesAnswer(answer);
    default:
      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
  }
}

export function applyStep7Answer(fields: Step7Fields, questionId: Step7QuestionId, answer: unknown): Step7Fields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step7.certifications.acceptances':
      next.certifications.acceptances = answer as Step7Fields['certifications']['acceptances'];
      break;
    case 'step7.signatures.accountOwners': {
      const payload = answer as {
        accountOwner: SignatureBlock;
        jointAccountOwner: SignatureBlock;
      };
      next.signatures.accountOwner = payload.accountOwner;
      next.signatures.jointAccountOwner = payload.jointAccountOwner;
      break;
    }
    case 'step7.signatures.firm': {
      const payload = answer as {
        financialProfessional: SignatureBlock;
        supervisorPrincipal: SignatureBlock;
      };
      next.signatures.financialProfessional = payload.financialProfessional;
      next.signatures.supervisorPrincipal = payload.supervisorPrincipal;
      break;
    }
  }

  return sanitizeStep7Fields(next);
}

export function validateStep7Completion(
  fields: Step7Fields,
  context: Step7ValidationContext
): Record<string, string> {
  const errors: Record<string, string> = {};
  const normalized = sanitizeStep7Fields(fields);

  const acceptancesValidation = validateAcceptancesAnswer(normalized.certifications.acceptances);
  if (!acceptancesValidation.success) {
    Object.assign(errors, acceptancesValidation.fieldErrors);
  }

  const accountOwnersValidation = validateAccountOwnerSignaturesAnswer(
    {
      accountOwner: normalized.signatures.accountOwner,
      jointAccountOwner: normalized.signatures.jointAccountOwner
    },
    context
  );
  if (!accountOwnersValidation.success) {
    Object.assign(errors, accountOwnersValidation.fieldErrors);
  }

  const firmValidation = validateFirmSignaturesAnswer({
    financialProfessional: normalized.signatures.financialProfessional,
    supervisorPrincipal: normalized.signatures.supervisorPrincipal
  });
  if (!firmValidation.success) {
    Object.assign(errors, firmValidation.fieldErrors);
  }

  return errors;
}
