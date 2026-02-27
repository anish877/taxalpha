import type { Prisma } from '@prisma/client';

export const STEP_2_LABEL = 'STEP 2. USA PATRIOT ACT INFORMATION';

const SOURCE_OF_FUNDS_KEYS = [
  'accountsReceivable',
  'incomeFromEarnings',
  'legalSettlement',
  'spouseParent',
  'accumulatedSavings',
  'inheritance',
  'lotteryGaming',
  'rentalIncome',
  'alimony',
  'insuranceProceeds',
  'pensionIraRetirementSavings',
  'saleOfBusiness',
  'gift',
  'investmentProceeds',
  'saleOfRealEstate',
  'other'
] as const;

const STEP_2_QUESTION_IDS = ['step2.initialSourceOfFunds'] as const;
const STEP_2_QUESTION_ID_SET = new Set<string>(STEP_2_QUESTION_IDS);

export type Step2QuestionId = (typeof STEP_2_QUESTION_IDS)[number];

type SourceOfFundsBooleans = Record<(typeof SOURCE_OF_FUNDS_KEYS)[number], boolean>;

export interface Step2Fields {
  initialSourceOfFunds: SourceOfFundsBooleans & {
    otherDetails: string | null;
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

function countTrueFlags(value: Record<string, boolean>): number {
  return Object.values(value).filter(Boolean).length;
}

function stripOtherDetails(value: Step2Fields['initialSourceOfFunds']) {
  if (!value.other) {
    return {
      ...value,
      otherDetails: null
    };
  }

  return value;
}

export function getStep2QuestionIds(): readonly Step2QuestionId[] {
  return STEP_2_QUESTION_IDS;
}

export function isStep2QuestionId(value: string): value is Step2QuestionId {
  return STEP_2_QUESTION_ID_SET.has(value);
}

export function defaultStep2Fields(): Step2Fields {
  return {
    initialSourceOfFunds: {
      ...createBooleanMap(SOURCE_OF_FUNDS_KEYS),
      otherDetails: null
    }
  };
}

export function normalizeStep2Fields(step2Data: Prisma.JsonValue | null | undefined): Step2Fields {
  const root = toRecord(step2Data);
  const source = toRecord(root.initialSourceOfFunds);
  const booleans = createBooleanMap(SOURCE_OF_FUNDS_KEYS, source);

  return {
    initialSourceOfFunds: stripOtherDetails({
      ...booleans,
      otherDetails: normalizeNullableString(source.otherDetails)
    })
  };
}

export function serializeStep2Fields(fields: Step2Fields): Prisma.InputJsonValue {
  return {
    initialSourceOfFunds: stripOtherDetails(fields.initialSourceOfFunds)
  } as unknown as Prisma.InputJsonValue;
}

export function clampStep2QuestionIndex(index: number | null | undefined): number {
  if (typeof index !== 'number' || Number.isNaN(index) || index < 0) {
    return 0;
  }

  if (index >= STEP_2_QUESTION_IDS.length) {
    return STEP_2_QUESTION_IDS.length - 1;
  }

  return index;
}

function validateInitialSourceOfFunds(answer: unknown): ValidationResult<Step2Fields['initialSourceOfFunds']> {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return {
      success: false,
      fieldErrors: {
        'initialSourceOfFunds': 'Please select at least one source of funds.'
      }
    };
  }

  const record = answer as Record<string, unknown>;
  const booleans = createBooleanMap(SOURCE_OF_FUNDS_KEYS, record);
  const otherDetails = normalizeNullableString(record.otherDetails);

  if (countTrueFlags(booleans) === 0) {
    return {
      success: false,
      fieldErrors: {
        'initialSourceOfFunds': 'Please select at least one source of funds.'
      }
    };
  }

  if (booleans.other && !otherDetails) {
    return {
      success: false,
      fieldErrors: {
        'initialSourceOfFunds.otherDetails': 'Please add details for Other.'
      }
    };
  }

  return {
    success: true,
    value: stripOtherDetails({
      ...booleans,
      otherDetails
    })
  };
}

export function validateStep2Answer(
  questionId: Step2QuestionId,
  answer: unknown
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step2.initialSourceOfFunds':
      return validateInitialSourceOfFunds(answer);
    default:
      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
  }
}

export function applyStep2Answer(fields: Step2Fields, questionId: Step2QuestionId, answer: unknown): Step2Fields {
  const next: Step2Fields = {
    initialSourceOfFunds: {
      ...fields.initialSourceOfFunds
    }
  };

  switch (questionId) {
    case 'step2.initialSourceOfFunds':
      next.initialSourceOfFunds = stripOtherDetails(answer as Step2Fields['initialSourceOfFunds']);
      break;
  }

  return next;
}

export function validateStep2Completion(fields: Step2Fields): Record<string, string> {
  const errors: Record<string, string> = {};
  const normalized = stripOtherDetails(fields.initialSourceOfFunds);
  const booleans = createBooleanMap(SOURCE_OF_FUNDS_KEYS, normalized);

  if (countTrueFlags(booleans) === 0) {
    errors['initialSourceOfFunds'] = 'Please select at least one source of funds.';
  }

  if (booleans.other && !normalized.otherDetails) {
    errors['initialSourceOfFunds.otherDetails'] = 'Please add details for Other.';
  }

  return errors;
}
