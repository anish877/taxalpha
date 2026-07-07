import { normalizeCanonicalKey } from '../profile/canonical-dictionary.js';
import { FormSchemaV2, QuestionTypeV2, type FormSchemaV2 as FormSchemaV2Type } from './schema-v2.js';

/** Coerce the LLM's free-form JSON into a valid FormSchemaV2 (tolerant of drift). */
type Any = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** Prefer a dictionary canonical key (alias-normalized); keep original otherwise. */
const canon = (v: unknown): string | null => { const raw = str(v); return raw ? normalizeCanonicalKey(raw) ?? raw : null; };
const slug = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'UPLOADED_FORM';
const TYPES = new Set(QuestionTypeV2.options as readonly string[]);
const RULES = new Set([
  'requiredString', 'requiredDate', 'pastDate', 'notFutureDate', 'email', 'phone', 'ssn', 'ein', 'ssnOrEin',
  'nonNegativeNumber', 'positiveNumber', 'integer', 'countryCode2', 'noPoBox',
  'singleChoiceExactlyOne', 'multiSelectAtLeastOne', 'allRequiredChecks'
]);

function num01(v: unknown): number | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  return Math.max(0, Math.min(1, v));
}

function normMapping(raw: unknown): Any | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Any;
  const out: Any = {};
  const reason = str(m.reason) ?? str(m.why) ?? str(m.explanation) ?? str(m.mappingReason);
  const evidence = str(m.evidence) ?? str(m.pdfEvidence);
  const source = str(m.source);
  const confidence = num01(m.confidence);
  if (reason) out.reason = reason;
  if (evidence) out.evidence = evidence;
  if (source) out.source = source;
  if (confidence !== null) out.confidence = confidence;
  return Object.keys(out).length ? out : undefined;
}

function normAutofill(raw: unknown, canonicalField: string | null): Any | null | undefined {
  if (!canonicalField) return null;
  const a = raw && typeof raw === 'object' ? (raw as Any) : {};
  return {
    canonicalField,
    reason:
      str(a.reason) ??
      `Tagged as canonical field "${canonicalField}", so the runtime can prefill this from a prior completed form without overwriting an existing answer.`,
    source: str(a.source) ?? 'ingestion'
  };
}

function normOptions(raw: unknown): Array<{ label: string; value: string; pdfField: string | null; required: boolean; description?: string | null; mapping?: Any }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((o: Any, i) => {
    const label = str(o.label) ?? str(o.title) ?? `Option ${i + 1}`;
    return {
      label,
      value: str(o.value) ?? str(o.optionId) ?? slug(label).toLowerCase(),
      pdfField: str(o.pdfField) ?? str((o.pdfMapping as Any)?.pdfField) ?? null,
      required: Boolean(o.required),
      description: str(o.description),
      mapping: normMapping(o.mapping ?? o.pdfMapping)
    };
  });
}

function normValidation(raw: unknown): Any | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Any;
  const out: Any = {};
  if (typeof v.rule === 'string' && RULES.has(v.rule)) out.rule = v.rule;
  for (const k of ['pattern', 'minLength', 'maxLength', 'min', 'max']) if (v[k] !== undefined) out[k] = v[k];
  return Object.keys(out).length ? out : undefined;
}

function isYearsEmployedQuestion(raw: Any, title: string, id: string): boolean {
  const hint = [
    title,
    id,
    str(raw.label),
    str(raw.question),
    str(raw.profileKey),
    str(raw.canonicalKey),
    str(raw.canonicalField),
    str(raw.pdfField),
    str((raw.pdfMapping as Any)?.pdfField)
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();

  return /\byears?\s+(employed|employment)\b/.test(hint) || /\bemployment\s+years?\b/.test(hint);
}

function normalizeQuestionType(raw: Any, title: string, id: string): string {
  const type = TYPES.has(String(raw.type ?? raw.questionType)) ? String(raw.type ?? raw.questionType) : 'text';
  return isYearsEmployedQuestion(raw, title, id) ? 'number' : type;
}

function normSubFields(raw: unknown): Any[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((s: Any) => {
    const canonicalField = canon(s.canonicalField) ?? canon(s.profileKey);
    const label = str(s.label) ?? str(s.key) ?? 'Field';
    const key = str(s.key) ?? slug(label).toLowerCase();
    return {
      key,
      label,
      type: normalizeQuestionType(s, label, key),
      required: Boolean(s.required),
      pdfField: str(s.pdfField) ?? null,
      canonicalField,
      validation: normValidation(s.validation),
      mapping: normMapping(s.mapping ?? s.pdfMapping),
      autofill: normAutofill(s.autofill, canonicalField)
    };
  });
}

export function normalizeToV2(raw: unknown, allPdfFields: string[]): FormSchemaV2Type {
  const root = (raw ?? {}) as Any;
  const meta = (root.formMetadata ?? root.metadata ?? {}) as Any;
  const title = str(root.title) ?? str(meta.formTitle) ?? 'Untitled form';
  const code = slug(str(root.code) ?? str(meta.formCode) ?? title);

  // items first (so we can derive steps if needed)
  const rawItems = (root.items ?? root.questions ?? root.fields ?? []) as Any[];
  const perStepOrder = new Map<number, number>();
  const items = (Array.isArray(rawItems) ? rawItems : []).map((q: Any) => {
    const step = typeof q.step === 'number' && q.step > 0 ? q.step : typeof q.section === 'number' && q.section > 0 ? q.section : 1;
    const order = q.order !== undefined && Number.isInteger(q.order) ? (q.order as number) : (() => { const n = perStepOrder.get(step) ?? 0; perStepOrder.set(step, n + 1); return n; })();
    const title2 = str(q.title) ?? str(q.label) ?? 'Untitled question';
    if (q.kind === 'repeat-block') {
      return {
        id: str(q.id) ?? slug(title2).toLowerCase(), step, order, title: title2, kind: 'repeat-block' as const,
        minItems: typeof q.minItems === 'number' ? q.minItems : 1,
        maxItems: typeof q.maxItems === 'number' ? q.maxItems : 4,
        showIf: str(q.showIf), fields: (normSubFieldsToQuestions(q.fields, step) ?? []), canonicalField: str(q.canonicalField)
      };
    }
    const canonicalField = canon(q.canonicalField) ?? canon(q.profileKey);
    const id = str(q.id) ?? str(q.questionId) ?? slug(title2).toLowerCase();
    return {
      id,
      step, order, title: title2,
      helper: str(q.helper) ?? str(q.description),
      type: normalizeQuestionType(q, title2, id),
      required: Boolean(q.required),
      pdfField: str(q.pdfField) ?? str((q.pdfMapping as Any)?.pdfField),
      options: normOptions(q.options ?? q.choices),
      showIf: str(q.showIf) ?? str(q.visibleWhen),
      validation: normValidation(q.validation),
      canonicalField,
      subFields: normSubFields(q.subFields),
      mapping: normMapping(q.mapping ?? q.pdfMapping),
      autofill: normAutofill(q.autofill, canonicalField)
    };
  });

  // steps
  const stepNums = [...new Set(items.map((i) => i.step))].sort((a, b) => a - b);
  const rawSteps = (root.steps ?? []) as Any[];
  const stepByNum = new Map<number, Any>();
  if (Array.isArray(rawSteps)) for (const s of rawSteps) if (typeof s.number === 'number') stepByNum.set(s.number, s);
  const steps = (stepNums.length ? stepNums : [1]).map((number) => {
    const s = stepByNum.get(number) ?? {};
    const label = str(s.label) ?? str(s.title) ?? `Step ${number}`;
    const emits = Array.isArray(s.emits) ? (s.emits as string[]).filter((e) => ['requiresStep4', 'requiresJointOwnerSignature', 'nextRouteAfterCompletion'].includes(e)) : undefined;
    return { number, key: str(s.key) ?? `STEP_${number}`, label, requiredIf: str(s.requiredIf), emits, isTerminal: Boolean(s.isTerminal) };
  });

  // mapped fields → unmapped list
  const mapped = new Set<string>();
  for (const it of items) {
    const anyIt = it as Any;
    if (typeof anyIt.pdfField === 'string') mapped.add(anyIt.pdfField);
    for (const o of (anyIt.options as Any[] | undefined) ?? []) if (typeof o.pdfField === 'string') mapped.add(o.pdfField);
    for (const sf of (anyIt.subFields as Any[] | undefined) ?? []) if (typeof sf.pdfField === 'string') mapped.add(sf.pdfField);
  }

  const candidate = {
    version: 2 as const, code, title, description: str(root.description),
    steps, items, pdfFieldCount: allPdfFields.length,
    unmappedFields: allPdfFields.filter((f) => !mapped.has(f))
  };
  return FormSchemaV2.parse(candidate);
}

function normSubFieldsToQuestions(raw: unknown, step: number): Any[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((q: Any, i) => {
    const title = str(q.title) ?? str(q.label) ?? 'Field';
    const id = str(q.id) ?? slug(str(q.title) ?? str(q.label) ?? `f${i}`).toLowerCase();
    return {
      id,
      step, order: i, title,
      type: normalizeQuestionType(q, title, id),
      required: Boolean(q.required), pdfField: str(q.pdfField),
      options: normOptions(q.options), showIf: str(q.showIf),
      validation: normValidation(q.validation), canonicalField: canon(q.canonicalField),
      mapping: normMapping(q.mapping ?? q.pdfMapping),
      autofill: normAutofill(q.autofill, canon(q.canonicalField))
    };
  });
}
