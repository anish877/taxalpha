/**
 * Shared field validators, extracted so the gold step modules AND the generic
 * dynamic runtime dispatch through ONE implementation (spec Part 5.4).
 *
 * Behaviour matches the gold modules exactly:
 *   - date     /^\d{4}-\d{2}-\d{2}$/   (ISO yyyy-mm-dd)
 *   - ssn/ein  /^\d{9}$/               (9 digits, dashes stripped)
 *   - phone    /^[+\d()\-.\s]{7,20}$/
 *   - single-choice = exactly one true on a one-hot {key:boolean} map
 */

export type RuleName =
  | 'requiredString'
  | 'requiredDate'
  | 'pastDate'
  | 'notFutureDate'
  | 'email'
  | 'phone'
  | 'ssn'
  | 'ein'
  | 'ssnOrEin'
  | 'nonNegativeNumber'
  | 'positiveNumber'
  | 'integer'
  | 'countryCode2'
  | 'noPoBox'
  | 'singleChoiceExactlyOne'
  | 'multiSelectAtLeastOne'
  | 'allRequiredChecks';

export type ValidatorResult = { ok: true; value: unknown } | { ok: false; error: string };

export interface RuleOptions {
  /** Legal keys for choice/checkbox maps (from question.options[].value). */
  keys?: string[];
  /** Keys that MUST be true for allRequiredChecks (from options[].required). */
  requiredKeys?: string[];
  /** "today" override for deterministic tests (epoch ms). */
  nowMs?: number;
}

const ok = (value: unknown): ValidatorResult => ({ ok: true, value });
const err = (error: string): ValidatorResult => ({ ok: false, error });

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NINE_DIGITS = /^\d{9}$/;
const PHONE_RE = /^[+\d()\-.\s]{7,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY2_RE = /^[A-Za-z]{2}$/;
const PO_BOX_RE = /\b(p\.?\s*o\.?\s*box|post\s+office\s+box)\b/i;

function booleanMap(value: unknown, keys: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const src = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  for (const k of keys) out[k] = src[k] === true;
  return out;
}
const countTrue = (m: Record<string, boolean>): number => Object.values(m).filter(Boolean).length;

/** Dispatch a single validation rule. Pure. */
export function runRule(rule: RuleName, raw: unknown, opts: RuleOptions = {}): ValidatorResult {
  switch (rule) {
    case 'requiredString':
      return isNonEmptyString(raw) ? ok(raw.trim()) : err('This field is required.');

    case 'requiredDate':
    case 'pastDate':
    case 'notFutureDate': {
      if (!isNonEmptyString(raw)) return err('This date is required.');
      const t = raw.trim();
      if (!DATE_RE.test(t)) return err('Enter a valid date (YYYY-MM-DD).');
      const ms = Date.parse(`${t}T00:00:00Z`);
      if (Number.isNaN(ms)) return err('Enter a valid date.');
      const now = opts.nowMs ?? Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
      if (rule === 'pastDate' && ms >= now) return err('Date must be in the past.');
      if (rule === 'notFutureDate' && ms > now) return err('Date cannot be in the future.');
      return ok(t);
    }

    case 'email':
      return isNonEmptyString(raw) && EMAIL_RE.test(raw.trim()) ? ok(raw.trim()) : err('Enter a valid email address.');

    case 'phone':
      return isNonEmptyString(raw) && PHONE_RE.test(raw.trim()) ? ok(raw.trim()) : err('Enter a valid phone number.');

    case 'ssn':
    case 'ein':
    case 'ssnOrEin': {
      if (!isNonEmptyString(raw)) return err('This field is required.');
      const digits = raw.replace(/[\s-]/g, '');
      return NINE_DIGITS.test(digits) ? ok(digits) : err('Enter a valid 9-digit SSN or Tax ID.');
    }

    case 'nonNegativeNumber':
    case 'positiveNumber':
    case 'integer': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[$,\s]/g, ''));
      if (Number.isNaN(n)) return err('Enter a valid number.');
      if (rule === 'integer' && !Number.isInteger(n)) return err('Enter a whole number.');
      if (rule === 'nonNegativeNumber' && n < 0) return err('Value cannot be negative.');
      if (rule === 'positiveNumber' && n <= 0) return err('Enter a value greater than zero.');
      return ok(n);
    }

    case 'countryCode2':
      return isNonEmptyString(raw) && COUNTRY2_RE.test(raw.trim()) ? ok(raw.trim().toUpperCase()) : err('Enter a 2-letter country code.');

    case 'noPoBox':
      if (!isNonEmptyString(raw)) return err('This field is required.');
      return PO_BOX_RE.test(raw) ? err('A P.O. Box is not allowed here.') : ok(raw.trim());

    case 'singleChoiceExactlyOne': {
      const keys = opts.keys ?? [];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return err('Please choose one option.');
      const map = booleanMap(raw, keys);
      return countTrue(map) === 1 ? ok(map) : err('Please choose exactly one option.');
    }

    case 'multiSelectAtLeastOne': {
      const keys = opts.keys ?? [];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return err('Please choose at least one option.');
      const map = booleanMap(raw, keys);
      return countTrue(map) >= 1 ? ok(map) : err('Please choose at least one option.');
    }

    case 'allRequiredChecks': {
      const keys = opts.keys ?? [];
      const required = opts.requiredKeys ?? keys;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return err('Please confirm all required items.');
      const map = booleanMap(raw, keys);
      return required.every((k) => map[k] === true) ? ok(map) : err('Please confirm all required items.');
    }

    default:
      return ok(raw);
  }
}
