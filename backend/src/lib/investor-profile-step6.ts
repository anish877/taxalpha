import type { Prisma } from '@prisma/client';

export const STEP_6_LABEL = 'STEP 6. TRUSTED CONTACT';

const YES_NO_KEYS = ['yes', 'no'] as const;
const PHONE_KEYS = ['home', 'business', 'mobile'] as const;
const phonePattern = /^[+\d()\-.\s]{7,20}$/;

type YesNoKey = (typeof YES_NO_KEYS)[number];
type PhoneKey = (typeof PHONE_KEYS)[number];
type YesNoMap = Record<YesNoKey, boolean>;
type PhoneMap = Record<PhoneKey, string | null>;

export type Step6QuestionId =
  | 'step6.trustedContact.decline'
  | 'step6.trustedContact.contactInfo'
  | 'step6.trustedContact.mailingAddress';

const STEP_6_QUESTION_IDS: Step6QuestionId[] = [
  'step6.trustedContact.decline',
  'step6.trustedContact.contactInfo',
  'step6.trustedContact.mailingAddress'
];
const STEP_6_QUESTION_ID_SET = new Set<string>(STEP_6_QUESTION_IDS);

interface Step6Address {
  line1: string | null;
  city: string | null;
  stateProvince: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface Step6Fields {
  trustedContact: {
    decline: YesNoMap;
    contactInfo: {
      name: string | null;
      email: string | null;
      phones: PhoneMap;
    };
    mailingAddress: Step6Address;
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

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePhone(value: unknown): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) {
    return null;
  }

  return normalized;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeAddress(source: unknown): Step6Address {
  const record = toRecord(source);
  return {
    line1: normalizeNullableString(record.line1),
    city: normalizeNullableString(record.city),
    stateProvince: normalizeNullableString(record.stateProvince),
    postalCode: normalizeNullableString(record.postalCode),
    country: normalizeNullableString(record.country)?.toUpperCase() ?? null
  };
}

function sanitizeStep6Fields(fields: Step6Fields): Step6Fields {
  const next = structuredClone(fields);
  const contactInfo = next.trustedContact.contactInfo;
  const mailingAddress = next.trustedContact.mailingAddress;

  contactInfo.name = normalizeNullableString(contactInfo.name);
  contactInfo.email = normalizeNullableString(contactInfo.email);
  contactInfo.phones.home = normalizePhone(contactInfo.phones.home);
  contactInfo.phones.business = normalizePhone(contactInfo.phones.business);
  contactInfo.phones.mobile = normalizePhone(contactInfo.phones.mobile);

  mailingAddress.line1 = normalizeNullableString(mailingAddress.line1);
  mailingAddress.city = normalizeNullableString(mailingAddress.city);
  mailingAddress.stateProvince = normalizeNullableString(mailingAddress.stateProvince);
  mailingAddress.postalCode = normalizeNullableString(mailingAddress.postalCode);
  mailingAddress.country = normalizeNullableString(mailingAddress.country)?.toUpperCase() ?? null;

  return next;
}

function validateDeclineAnswer(answer: unknown): ValidationResult<YesNoMap> {
  const normalized = createBooleanMap(YES_NO_KEYS, answer);

  if (countTrueFlags(normalized) !== 1) {
    return {
      success: false,
      fieldErrors: {
        'step6.trustedContact.decline': 'Select exactly one option.'
      }
    };
  }

  return {
    success: true,
    value: normalized
  };
}

function validateContactInfoAnswer(
  answer: unknown
): ValidationResult<Step6Fields['trustedContact']['contactInfo']> {
  const record = toRecord(answer);
  const name = normalizeRequiredString(record.name);
  const email = normalizeRequiredString(record.email);
  const home = normalizePhone(record.phones && toRecord(record.phones).home);
  const business = normalizePhone(record.phones && toRecord(record.phones).business);
  const mobile = normalizePhone(record.phones && toRecord(record.phones).mobile);
  const fieldErrors: Record<string, string> = {};

  if (!name) {
    fieldErrors['step6.trustedContact.contactInfo.name'] = 'Trusted contact name is required.';
  }

  if (!email) {
    fieldErrors['step6.trustedContact.contactInfo.email'] = 'Trusted contact email is required.';
  } else if (!isValidEmail(email)) {
    fieldErrors['step6.trustedContact.contactInfo.email'] = 'Enter a valid trusted contact email.';
  }

  if (home && !phonePattern.test(home)) {
    fieldErrors['step6.trustedContact.contactInfo.phones.home'] = 'Enter a valid phone number.';
  }

  if (business && !phonePattern.test(business)) {
    fieldErrors['step6.trustedContact.contactInfo.phones.business'] = 'Enter a valid phone number.';
  }

  if (mobile && !phonePattern.test(mobile)) {
    fieldErrors['step6.trustedContact.contactInfo.phones.mobile'] = 'Enter a valid phone number.';
  }

  if (!home && !business && !mobile) {
    fieldErrors['step6.trustedContact.contactInfo.phones.mobile'] =
      'Enter at least one phone number (home, business, or mobile).';
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
      name,
      email,
      phones: {
        home,
        business,
        mobile
      }
    }
  };
}

function validateMailingAddressAnswer(
  answer: unknown
): ValidationResult<Step6Fields['trustedContact']['mailingAddress']> {
  const record = toRecord(answer);
  const line1 = normalizeRequiredString(record.line1);
  const city = normalizeRequiredString(record.city);
  const stateProvince = normalizeRequiredString(record.stateProvince);
  const postalCode = normalizeRequiredString(record.postalCode);
  const country = normalizeRequiredString(record.country).toUpperCase();
  const fieldErrors: Record<string, string> = {};

  if (!line1) {
    fieldErrors['step6.trustedContact.mailingAddress.line1'] = 'Mailing address is required.';
  }
  if (!city) {
    fieldErrors['step6.trustedContact.mailingAddress.city'] = 'City is required.';
  }
  if (!stateProvince) {
    fieldErrors['step6.trustedContact.mailingAddress.stateProvince'] = 'State/Province is required.';
  }
  if (!postalCode) {
    fieldErrors['step6.trustedContact.mailingAddress.postalCode'] = 'ZIP/Postal code is required.';
  }
  if (!country) {
    fieldErrors['step6.trustedContact.mailingAddress.country'] = 'Country is required.';
  } else if (!/^[A-Z]{2}$/.test(country)) {
    fieldErrors['step6.trustedContact.mailingAddress.country'] = 'Enter a valid country code.';
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
      line1,
      city,
      stateProvince,
      postalCode,
      country
    }
  };
}

export function getStep6QuestionIds(): readonly Step6QuestionId[] {
  return STEP_6_QUESTION_IDS;
}

export function isStep6QuestionId(value: string): value is Step6QuestionId {
  return STEP_6_QUESTION_ID_SET.has(value);
}

export function defaultStep6Fields(): Step6Fields {
  return {
    trustedContact: {
      decline: createBooleanMap(YES_NO_KEYS),
      contactInfo: {
        name: null,
        email: null,
        phones: {
          home: null,
          business: null,
          mobile: null
        }
      },
      mailingAddress: {
        line1: null,
        city: null,
        stateProvince: null,
        postalCode: null,
        country: null
      }
    }
  };
}

export function normalizeStep6Fields(step6Data: Prisma.JsonValue | null | undefined): Step6Fields {
  const defaults = defaultStep6Fields();
  const root = toRecord(step6Data);
  const trustedContact = toRecord(root.trustedContact);
  const contactInfo = toRecord(trustedContact.contactInfo);
  const phones = toRecord(contactInfo.phones);

  const normalized: Step6Fields = {
    trustedContact: {
      decline: createBooleanMap(YES_NO_KEYS, trustedContact.decline),
      contactInfo: {
        name: normalizeNullableString(contactInfo.name),
        email: normalizeNullableString(contactInfo.email),
        phones: {
          home: normalizePhone(phones.home),
          business: normalizePhone(phones.business),
          mobile: normalizePhone(phones.mobile)
        }
      },
      mailingAddress: normalizeAddress(trustedContact.mailingAddress)
    }
  };

  return sanitizeStep6Fields({
    ...defaults,
    ...normalized
  });
}

export function serializeStep6Fields(fields: Step6Fields): Prisma.InputJsonValue {
  return sanitizeStep6Fields(fields) as unknown as Prisma.InputJsonValue;
}

export function getVisibleStep6QuestionIds(fields: Step6Fields): Step6QuestionId[] {
  const visible: Step6QuestionId[] = ['step6.trustedContact.decline'];
  const selection = getSingleSelection(fields.trustedContact.decline, YES_NO_KEYS);

  if (selection === 'no') {
    visible.push('step6.trustedContact.contactInfo');
    visible.push('step6.trustedContact.mailingAddress');
  }

  return visible;
}

export function clampStep6QuestionIndex(index: number | null | undefined, visibleQuestionIds: Step6QuestionId[]): number {
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

export function validateStep6Answer(
  questionId: Step6QuestionId,
  answer: unknown
): ValidationResult<unknown> {
  switch (questionId) {
    case 'step6.trustedContact.decline':
      return validateDeclineAnswer(answer);
    case 'step6.trustedContact.contactInfo':
      return validateContactInfoAnswer(answer);
    case 'step6.trustedContact.mailingAddress':
      return validateMailingAddressAnswer(answer);
    default:
      return {
        success: false,
        fieldErrors: {
          questionId: 'Unsupported onboarding question.'
        }
      };
  }
}

export function applyStep6Answer(fields: Step6Fields, questionId: Step6QuestionId, answer: unknown): Step6Fields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step6.trustedContact.decline':
      next.trustedContact.decline = answer as YesNoMap;
      break;
    case 'step6.trustedContact.contactInfo':
      next.trustedContact.contactInfo = answer as Step6Fields['trustedContact']['contactInfo'];
      break;
    case 'step6.trustedContact.mailingAddress':
      next.trustedContact.mailingAddress = answer as Step6Fields['trustedContact']['mailingAddress'];
      break;
  }

  return sanitizeStep6Fields(next);
}

export function validateStep6Completion(fields: Step6Fields): Record<string, string> {
  const errors: Record<string, string> = {};
  const normalized = sanitizeStep6Fields(fields);
  const selection = getSingleSelection(normalized.trustedContact.decline, YES_NO_KEYS);

  if (!selection) {
    errors['step6.trustedContact.decline'] = 'Select whether to provide a trusted contact.';
    return errors;
  }

  if (selection === 'yes') {
    return errors;
  }

  const contactValidation = validateContactInfoAnswer(normalized.trustedContact.contactInfo);
  if (!contactValidation.success) {
    Object.assign(errors, contactValidation.fieldErrors);
  }

  const addressValidation = validateMailingAddressAnswer(normalized.trustedContact.mailingAddress);
  if (!addressValidation.success) {
    Object.assign(errors, addressValidation.fieldErrors);
  }

  return errors;
}
