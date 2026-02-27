import type { Prisma } from '@prisma/client';

export const STEP_5_LABEL = 'STEP 5. OBJECTIVES AND INVESTMENT DETAIL';

const RISK_EXPOSURE_KEYS = ['low', 'moderate', 'speculation', 'highRisk'] as const;
const ACCOUNT_OBJECTIVE_KEYS = ['income', 'longTermGrowth', 'shortTermGrowth'] as const;
const YES_NO_KEYS = ['yes', 'no'] as const;
const LIQUIDITY_NEEDS_KEYS = ['high', 'medium', 'low'] as const;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

const MARKET_INCOME_VALUE_KEYS = [
  'equities',
  'options',
  'fixedIncome',
  'mutualFunds',
  'unitInvestmentTrusts',
  'exchangeTradedFunds'
] as const;
const ALTERNATIVES_INSURANCE_VALUE_KEYS = [
  'realEstate',
  'insurance',
  'variableAnnuities',
  'fixedAnnuities',
  'preciousMetals',
  'commoditiesFutures'
] as const;

type RiskExposureKey = (typeof RISK_EXPOSURE_KEYS)[number];
type AccountObjectiveKey = (typeof ACCOUNT_OBJECTIVE_KEYS)[number];
type YesNoKey = (typeof YES_NO_KEYS)[number];
type LiquidityNeedsKey = (typeof LIQUIDITY_NEEDS_KEYS)[number];
type MarketIncomeValueKey = (typeof MARKET_INCOME_VALUE_KEYS)[number];
type AlternativesInsuranceValueKey = (typeof ALTERNATIVES_INSURANCE_VALUE_KEYS)[number];

export type Step5QuestionId =
  | 'step5.profile.riskExposure'
  | 'step5.profile.accountObjectives'
  | 'step5.investments.fixedValues.marketIncome'
  | 'step5.investments.fixedValues.alternativesInsurance'
  | 'step5.investments.hasOther'
  | 'step5.investments.otherEntries'
  | 'step5.horizonAndLiquidity';

const STEP_5_QUESTION_IDS: Step5QuestionId[] = [
  'step5.profile.riskExposure',
  'step5.profile.accountObjectives',
  'step5.investments.fixedValues.marketIncome',
  'step5.investments.fixedValues.alternativesInsurance',
  'step5.investments.hasOther',
  'step5.investments.otherEntries',
  'step5.horizonAndLiquidity'
];
const STEP_5_QUESTION_ID_SET = new Set<string>(STEP_5_QUESTION_IDS);

type RiskExposureMap = Record<RiskExposureKey, boolean>;
type AccountObjectivesMap = Record<AccountObjectiveKey, boolean>;
type YesNoMap = Record<YesNoKey, boolean>;
type LiquidityNeedsMap = Record<LiquidityNeedsKey, boolean>;
type MarketIncomeValues = Record<MarketIncomeValueKey, number | null>;
type AlternativesInsuranceValues = Record<AlternativesInsuranceValueKey, number | null>;

export interface Step5Fields {
  profile: {
    riskExposure: RiskExposureMap;
    accountObjectives: AccountObjectivesMap;
  };
  investments: {
    fixedValues: {
      marketIncome: MarketIncomeValues;
      alternativesInsurance: AlternativesInsuranceValues;
    };
    hasOther: YesNoMap;
    otherEntries: {
      entries: Array<{
        label: string | null;
        value: number | null;
      }>;
    };
  };
  horizonAndLiquidity: {
    timeHorizon: {
      fromYear: number | null;
      toYear: number | null;
    };
    liquidityNeeds: LiquidityNeedsMap;
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

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

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

function getSingleSelection<K extends string>(map: Record<K, boolean>, keys: readonly K[]): K | null {
  const selected = keys.filter((key) => map[key]);
  return selected.length === 1 ? selected[0] : null;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(numeric) || numeric < 0) {
      return null;
    }

    return numeric;
  }

  return null;
}

function normalizeYear(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function normalizeMarketIncomeValues(source: unknown): MarketIncomeValues {
  const record = toRecord(source);
  return {
    equities: normalizeNonNegativeNumber(record.equities),
    options: normalizeNonNegativeNumber(record.options),
    fixedIncome: normalizeNonNegativeNumber(record.fixedIncome),
    mutualFunds: normalizeNonNegativeNumber(record.mutualFunds),
    unitInvestmentTrusts: normalizeNonNegativeNumber(record.unitInvestmentTrusts),
    exchangeTradedFunds: normalizeNonNegativeNumber(record.exchangeTradedFunds)
  };
}

function normalizeAlternativesInsuranceValues(source: unknown): AlternativesInsuranceValues {
  const record = toRecord(source);
  return {
    realEstate: normalizeNonNegativeNumber(record.realEstate),
    insurance: normalizeNonNegativeNumber(record.insurance),
    variableAnnuities: normalizeNonNegativeNumber(record.variableAnnuities),
    fixedAnnuities: normalizeNonNegativeNumber(record.fixedAnnuities),
    preciousMetals: normalizeNonNegativeNumber(record.preciousMetals),
    commoditiesFutures: normalizeNonNegativeNumber(record.commoditiesFutures)
  };
}

function normalizeOtherEntries(source: unknown): Step5Fields['investments']['otherEntries']['entries'] {
  if (!Array.isArray(source)) {
    return [];
  }

  const entries: Step5Fields['investments']['otherEntries']['entries'] = [];
  for (const item of source) {
    const record = toRecord(item);
    const entry = {
      label: normalizeNullableString(record.label),
      value: normalizeNonNegativeNumber(record.value)
    };

    if (entry.label === null && entry.value === null) {
      continue;
    }

    entries.push(entry);
  }

  return entries;
}

function sanitizeStep5Fields(fields: Step5Fields): Step5Fields {
  const next = structuredClone(fields);
  const hasOtherSelection = getSingleSelection(next.investments.hasOther, YES_NO_KEYS);

  next.investments.otherEntries.entries = normalizeOtherEntries(next.investments.otherEntries.entries);

  if (hasOtherSelection !== 'yes') {
    next.investments.otherEntries.entries = [];
  }

  return next;
}

function validateSingleChoiceMap<K extends string>(
  answer: unknown,
  keys: readonly K[],
  questionId: string,
  label: string
): ValidationResult<Record<K, boolean>> {
  const normalized = createBooleanMap(keys, answer);

  if (countTrueFlags(normalized) !== 1) {
    return {
      success: false,
      fieldErrors: {
        [questionId]: `Select exactly one ${label}.`
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateAtLeastOneChoiceMap<K extends string>(
  answer: unknown,
  keys: readonly K[],
  questionId: string,
  label: string
): ValidationResult<Record<K, boolean>> {
  const normalized = createBooleanMap(keys, answer);

  if (countTrueFlags(normalized) === 0) {
    return {
      success: false,
      fieldErrors: {
        [questionId]: `Select at least one ${label}.`
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateMarketIncomeBlock(answer: unknown): ValidationResult<MarketIncomeValues> {
  const normalized = normalizeMarketIncomeValues(answer);
  const errors: Record<string, string> = {};
  const labels: Record<MarketIncomeValueKey, string> = {
    equities: 'Equities',
    options: 'Options',
    fixedIncome: 'Fixed Income',
    mutualFunds: 'Mutual Funds',
    unitInvestmentTrusts: 'Unit Investment Trusts',
    exchangeTradedFunds: 'Exchange-Traded Funds'
  };

  for (const key of MARKET_INCOME_VALUE_KEYS) {
    if (normalized[key] === null) {
      errors[`step5.investments.fixedValues.marketIncome.${key}`] = `${labels[key]} value is required.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      fieldErrors: errors
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateAlternativesInsuranceBlock(answer: unknown): ValidationResult<AlternativesInsuranceValues> {
  const normalized = normalizeAlternativesInsuranceValues(answer);
  const errors: Record<string, string> = {};
  const labels: Record<AlternativesInsuranceValueKey, string> = {
    realEstate: 'Real Estate',
    insurance: 'Insurance',
    variableAnnuities: 'Variable Annuities',
    fixedAnnuities: 'Fixed Annuities',
    preciousMetals: 'Precious Metals',
    commoditiesFutures: 'Commodities/Futures'
  };

  for (const key of ALTERNATIVES_INSURANCE_VALUE_KEYS) {
    if (normalized[key] === null) {
      errors[`step5.investments.fixedValues.alternativesInsurance.${key}`] = `${labels[key]} value is required.`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      fieldErrors: errors
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateOtherEntriesBlock(
  answer: unknown
): ValidationResult<Step5Fields['investments']['otherEntries']> {
  const record = toRecord(answer);
  const entries = normalizeOtherEntries(record.entries);
  const errors: Record<string, string> = {};

  if (entries.length === 0) {
    errors['step5.investments.otherEntries.entries'] =
      'Add at least one other investment category and value.';
  }

  entries.forEach((entry, index) => {
    if (!entry.label) {
      errors[`step5.investments.otherEntries.entries.${index}.label`] = 'Other investment label is required.';
    }

    if (entry.value === null) {
      errors[`step5.investments.otherEntries.entries.${index}.value`] =
        'Other investment value must be a number greater than or equal to 0.';
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
    value: { entries }
  };
}

function validateHorizonAndLiquidityBlock(
  answer: unknown
): ValidationResult<Step5Fields['horizonAndLiquidity']> {
  const record = toRecord(answer);
  const timeHorizonRecord = toRecord(record.timeHorizon);
  const liquidity = createBooleanMap(LIQUIDITY_NEEDS_KEYS, record.liquidityNeeds);
  const fromYear = normalizeYear(timeHorizonRecord.fromYear);
  const toYear = normalizeYear(timeHorizonRecord.toYear);
  const errors: Record<string, string> = {};

  if (fromYear === null || fromYear < MIN_YEAR || fromYear > MAX_YEAR) {
    errors['step5.horizonAndLiquidity.timeHorizon.fromYear'] =
      `Enter a valid From Year between ${MIN_YEAR} and ${MAX_YEAR}.`;
  }

  if (toYear === null || toYear < MIN_YEAR || toYear > MAX_YEAR) {
    errors['step5.horizonAndLiquidity.timeHorizon.toYear'] =
      `Enter a valid To Year between ${MIN_YEAR} and ${MAX_YEAR}.`;
  }

  if (fromYear !== null && toYear !== null && fromYear > toYear) {
    errors['step5.horizonAndLiquidity.timeHorizon.toYear'] = 'To Year must be greater than or equal to From Year.';
  }

  if (countTrueFlags(liquidity) !== 1) {
    errors['step5.horizonAndLiquidity.liquidityNeeds'] = 'Select exactly one liquidity need.';
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
      timeHorizon: {
        fromYear,
        toYear
      },
      liquidityNeeds: liquidity
    }
  };
}

export function getStep5QuestionIds(): readonly Step5QuestionId[] {
  return STEP_5_QUESTION_IDS;
}

export function isStep5QuestionId(value: string): value is Step5QuestionId {
  return STEP_5_QUESTION_ID_SET.has(value);
}

export function defaultStep5Fields(): Step5Fields {
  return {
    profile: {
      riskExposure: createBooleanMap(RISK_EXPOSURE_KEYS),
      accountObjectives: createBooleanMap(ACCOUNT_OBJECTIVE_KEYS)
    },
    investments: {
      fixedValues: {
        marketIncome: {
          equities: null,
          options: null,
          fixedIncome: null,
          mutualFunds: null,
          unitInvestmentTrusts: null,
          exchangeTradedFunds: null
        },
        alternativesInsurance: {
          realEstate: null,
          insurance: null,
          variableAnnuities: null,
          fixedAnnuities: null,
          preciousMetals: null,
          commoditiesFutures: null
        }
      },
      hasOther: createBooleanMap(YES_NO_KEYS),
      otherEntries: {
        entries: []
      }
    },
    horizonAndLiquidity: {
      timeHorizon: {
        fromYear: null,
        toYear: null
      },
      liquidityNeeds: createBooleanMap(LIQUIDITY_NEEDS_KEYS)
    }
  };
}

export function normalizeStep5Fields(step5Data: Prisma.JsonValue | null | undefined): Step5Fields {
  const defaults = defaultStep5Fields();
  const root = toRecord(step5Data);
  const profile = toRecord(root.profile);
  const investments = toRecord(root.investments);
  const fixedValues = toRecord(investments.fixedValues);
  const otherEntries = toRecord(investments.otherEntries);
  const horizonAndLiquidity = toRecord(root.horizonAndLiquidity);
  const timeHorizon = toRecord(horizonAndLiquidity.timeHorizon);

  const normalized: Step5Fields = {
    profile: {
      riskExposure: createBooleanMap(RISK_EXPOSURE_KEYS, profile.riskExposure),
      accountObjectives: createBooleanMap(ACCOUNT_OBJECTIVE_KEYS, profile.accountObjectives)
    },
    investments: {
      fixedValues: {
        marketIncome: normalizeMarketIncomeValues(fixedValues.marketIncome),
        alternativesInsurance: normalizeAlternativesInsuranceValues(fixedValues.alternativesInsurance)
      },
      hasOther: createBooleanMap(YES_NO_KEYS, investments.hasOther),
      otherEntries: {
        entries: normalizeOtherEntries(otherEntries.entries)
      }
    },
    horizonAndLiquidity: {
      timeHorizon: {
        fromYear: normalizeYear(timeHorizon.fromYear),
        toYear: normalizeYear(timeHorizon.toYear)
      },
      liquidityNeeds: createBooleanMap(LIQUIDITY_NEEDS_KEYS, horizonAndLiquidity.liquidityNeeds)
    }
  };

  return sanitizeStep5Fields({
    ...defaults,
    ...normalized
  });
}

export function serializeStep5Fields(fields: Step5Fields): Prisma.InputJsonValue {
  return sanitizeStep5Fields(fields) as unknown as Prisma.InputJsonValue;
}

function hasOtherInvestments(fields: Step5Fields): boolean {
  return getSingleSelection(fields.investments.hasOther, YES_NO_KEYS) === 'yes';
}

export function getVisibleStep5QuestionIds(fields: Step5Fields): Step5QuestionId[] {
  const sanitized = sanitizeStep5Fields(fields);
  const visible: Step5QuestionId[] = [
    'step5.profile.riskExposure',
    'step5.profile.accountObjectives',
    'step5.investments.fixedValues.marketIncome',
    'step5.investments.fixedValues.alternativesInsurance',
    'step5.investments.hasOther'
  ];

  if (hasOtherInvestments(sanitized)) {
    visible.push('step5.investments.otherEntries');
  }

  visible.push('step5.horizonAndLiquidity');
  return visible;
}

export function clampStep5QuestionIndex(index: number | null | undefined, visibleQuestionIds: Step5QuestionId[]): number {
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

export function validateStep5Answer(
  questionId: Step5QuestionId,
  answer: unknown
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step5.profile.riskExposure':
      return validateSingleChoiceMap(answer, RISK_EXPOSURE_KEYS, questionId, 'risk exposure option');
    case 'step5.profile.accountObjectives':
      return validateAtLeastOneChoiceMap(answer, ACCOUNT_OBJECTIVE_KEYS, questionId, 'investment objective');
    case 'step5.investments.fixedValues.marketIncome':
      return validateMarketIncomeBlock(answer);
    case 'step5.investments.fixedValues.alternativesInsurance':
      return validateAlternativesInsuranceBlock(answer);
    case 'step5.investments.hasOther':
      return validateSingleChoiceMap(answer, YES_NO_KEYS, questionId, 'option');
    case 'step5.investments.otherEntries':
      return validateOtherEntriesBlock(answer);
    case 'step5.horizonAndLiquidity':
      return validateHorizonAndLiquidityBlock(answer);
    default:
      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
  }
}

export function applyStep5Answer(fields: Step5Fields, questionId: Step5QuestionId, answer: unknown): Step5Fields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step5.profile.riskExposure':
      next.profile.riskExposure = answer as RiskExposureMap;
      break;
    case 'step5.profile.accountObjectives':
      next.profile.accountObjectives = answer as AccountObjectivesMap;
      break;
    case 'step5.investments.fixedValues.marketIncome':
      next.investments.fixedValues.marketIncome = answer as MarketIncomeValues;
      break;
    case 'step5.investments.fixedValues.alternativesInsurance':
      next.investments.fixedValues.alternativesInsurance = answer as AlternativesInsuranceValues;
      break;
    case 'step5.investments.hasOther':
      next.investments.hasOther = answer as YesNoMap;
      break;
    case 'step5.investments.otherEntries':
      next.investments.otherEntries = answer as Step5Fields['investments']['otherEntries'];
      break;
    case 'step5.horizonAndLiquidity':
      next.horizonAndLiquidity = answer as Step5Fields['horizonAndLiquidity'];
      break;
  }

  return sanitizeStep5Fields(next);
}

export function validateStep5Completion(fields: Step5Fields): Record<string, string> {
  const errors: Record<string, string> = {};
  const normalized = sanitizeStep5Fields(fields);

  if (countTrueFlags(normalized.profile.riskExposure) !== 1) {
    errors['step5.profile.riskExposure'] = 'Select exactly one risk exposure option.';
  }

  if (countTrueFlags(normalized.profile.accountObjectives) === 0) {
    errors['step5.profile.accountObjectives'] = 'Select at least one account investment objective.';
  }

  const marketValidation = validateMarketIncomeBlock(normalized.investments.fixedValues.marketIncome);
  if (!marketValidation.success) {
    Object.assign(errors, marketValidation.fieldErrors);
  }

  const alternativesValidation = validateAlternativesInsuranceBlock(
    normalized.investments.fixedValues.alternativesInsurance
  );
  if (!alternativesValidation.success) {
    Object.assign(errors, alternativesValidation.fieldErrors);
  }

  const hasOtherSelection = getSingleSelection(normalized.investments.hasOther, YES_NO_KEYS);
  if (!hasOtherSelection) {
    errors['step5.investments.hasOther'] = 'Select whether to add other investment categories.';
  }

  if (hasOtherSelection === 'yes') {
    const otherValidation = validateOtherEntriesBlock(normalized.investments.otherEntries);
    if (!otherValidation.success) {
      Object.assign(errors, otherValidation.fieldErrors);
    }
  }

  const horizonValidation = validateHorizonAndLiquidityBlock(normalized.horizonAndLiquidity);
  if (!horizonValidation.success) {
    Object.assign(errors, horizonValidation.fieldErrors);
  }

  return errors;
}
