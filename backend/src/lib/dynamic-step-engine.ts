/**
 * Generic step-wise runtime engine (spec Part 5.1) — pure functions, no IO.
 * Replicates the gold step-lib function family, parameterized by a v2 schema.
 *
 * Fields model: a nested object addressed by each question's dotted `id`
 * (e.g. id "entity.taxForm" -> fields.entity.taxForm). Choice questions store a
 * one-hot {key:boolean} map; composites store {subKey:value}; repeat blocks
 * store an array of per-instance objects.
 */
import { remapEnumOneHot } from './profile/canonical-dictionary.js';
import {
  FormSchemaV2,
  isRepeatBlock,
  type ChoiceOptionV2,
  type FormQuestionV2,
  type FormStep,
  type RepeatBlockV2
} from './ingestion/schema-v2.js';
import { evaluateShowIf, type EvalContext } from './showif/eval.js';
import { runRule, type RuleName } from './validators.js';

export type Fields = Record<string, unknown>;
export type ProfileLookup = Record<string, { value: unknown; sourceFormCode: string }>;

// ---- dotted-path helpers ---------------------------------------------------
function getPath(obj: Fields, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Fields)) cur = (cur as Fields)[seg];
    else return undefined;
  }
  return cur;
}
function setPath(obj: Fields, path: string, value: unknown): void {
  const segs = path.split('.');
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i]!;
    if (!cur[s] || typeof cur[s] !== 'object') cur[s] = {};
    cur = cur[s] as Fields;
  }
  cur[segs[segs.length - 1]!] = value;
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '' ||
  (typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every((x) => x === false || x === '' || x == null)) ||
  (Array.isArray(v) && v.length === 0);

// ---- item access -----------------------------------------------------------
const CHOICE_TYPES = new Set(['single-choice-cards', 'multi-select', 'certification-checklist']);

function questionsInStep(schema: FormSchemaV2, step: number): Array<FormQuestionV2 | RepeatBlockV2> {
  return schema.items
    .filter((it) => it.step === step)
    .sort((a, b) => a.order - b.order);
}

/** All question ids for a step in order; repeat blocks expand to instance ids. */
export function getDynamicStepQuestionIds(schema: FormSchemaV2, step: number, fields: Fields = {}): string[] {
  const ids: string[] = [];
  for (const it of questionsInStep(schema, step)) {
    if (isRepeatBlock(it)) {
      const arr = getPath(fields, it.id);
      const count = Array.isArray(arr) && arr.length > 0 ? arr.length : it.minItems;
      for (let i = 0; i < count; i++) for (const f of it.fields) ids.push(`${it.id}.${i}.${f.id}`);
    } else {
      ids.push(it.id);
    }
  }
  return ids;
}

export function isDynamicQuestionId(schema: FormSchemaV2, step: number, id: string, fields: Fields = {}): boolean {
  return getDynamicStepQuestionIds(schema, step, fields).includes(id);
}

/** Resolve a (possibly repeat-instance) question id to its template question. */
export function resolveQuestion(schema: FormSchemaV2, id: string): FormQuestionV2 | null {
  for (const it of schema.items) {
    if (!isRepeatBlock(it)) {
      if (it.id === id) return it;
    } else {
      const m = id.match(new RegExp(`^${it.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)\\.(.+)$`));
      if (m) {
        const f = it.fields.find((x) => x.id === m[2]);
        if (f) return f;
      }
    }
  }
  return null;
}

// ---- defaults / normalize --------------------------------------------------
function defaultForQuestion(q: FormQuestionV2): unknown {
  if (CHOICE_TYPES.has(q.type) && q.options) {
    const m: Record<string, boolean> = {};
    for (const o of q.options) m[o.value] = false;
    return m;
  }
  if (q.type === 'checkbox') return false;
  if (q.subFields && q.subFields.length > 0) {
    const o: Record<string, unknown> = {};
    for (const s of q.subFields) o[s.key] = '';
    return o;
  }
  return '';
}

export function defaultDynamicFields(schema: FormSchemaV2, step?: number): Fields {
  const fields: Fields = {};
  const items = step ? questionsInStep(schema, step) : schema.items;
  for (const it of items) {
    if (isRepeatBlock(it)) setPath(fields, it.id, []);
    else setPath(fields, it.id, defaultForQuestion(it));
  }
  return fields;
}

/** Merge stored values onto defaults; coerce legacy scalar choice -> one-hot. */
export function normalizeDynamicFields(schema: FormSchemaV2, step: number, stored: Fields | null | undefined): Fields {
  const fields = defaultDynamicFields(schema, step);
  if (!stored || typeof stored !== 'object') return fields;
  for (const it of questionsInStep(schema, step)) {
    if (isRepeatBlock(it)) {
      const v = getPath(stored, it.id);
      if (Array.isArray(v)) setPath(fields, it.id, v);
      continue;
    }
    const v = getPath(stored, it.id);
    if (v === undefined) continue;
    if (CHOICE_TYPES.has(it.type) && it.options) {
      // legacy: a bare string selection -> one-hot
      if (typeof v === 'string') {
        const m: Record<string, boolean> = {};
        for (const o of it.options) m[o.value] = o.value === v;
        setPath(fields, it.id, m);
      } else if (v && typeof v === 'object') {
        const m: Record<string, boolean> = {};
        for (const o of it.options) m[o.value] = (v as Record<string, unknown>)[o.value] === true;
        setPath(fields, it.id, m);
      }
    } else {
      setPath(fields, it.id, v);
    }
  }
  return fields;
}

export const serializeDynamicFields = (fields: Fields): Fields => clone(fields);

// ---- visibility ------------------------------------------------------------
export function getVisibleDynamicQuestionIds(
  schema: FormSchemaV2,
  step: number,
  fields: Fields,
  ctx: EvalContext = {}
): string[] {
  const visible: string[] = [];
  for (const it of questionsInStep(schema, step)) {
    if (isRepeatBlock(it)) {
      if (it.showIf && !evaluateShowIf(it.showIf, fields, ctx, true)) continue;
      const arr = getPath(fields, it.id);
      const count = Array.isArray(arr) && arr.length > 0 ? arr.length : it.minItems;
      for (let i = 0; i < count; i++) for (const f of it.fields) {
        if (f.showIf && !evaluateShowIf(f.showIf, fields, ctx, true)) continue;
        visible.push(`${it.id}.${i}.${f.id}`);
      }
    } else {
      if (it.showIf && !evaluateShowIf(it.showIf, fields, ctx, true)) continue;
      visible.push(it.id);
    }
  }
  return visible;
}

export function clampDynamicQuestionIndex(index: number | null | undefined, visibleIds: string[]): number {
  if (visibleIds.length === 0) return 0;
  if (typeof index !== 'number' || Number.isNaN(index) || index < 0) return 0;
  if (index >= visibleIds.length) return visibleIds.length - 1;
  return index;
}

// ---- validation ------------------------------------------------------------
function ruleOptsFor(q: FormQuestionV2): { rule?: RuleName; keys?: string[]; requiredKeys?: string[] } {
  const keys = q.options?.map((o: ChoiceOptionV2) => o.value);
  const requiredKeys = q.options?.filter((o) => o.required).map((o) => o.value);
  let rule = q.validation?.rule;
  if (!rule) {
    if (q.type === 'single-choice-cards') rule = 'singleChoiceExactlyOne';
    else if (q.type === 'multi-select') rule = 'multiSelectAtLeastOne';
    else if (q.type === 'certification-checklist') rule = 'allRequiredChecks';
    else if (q.required) rule = 'requiredString';
  }
  return { rule, keys, requiredKeys: requiredKeys && requiredKeys.length > 0 ? requiredKeys : keys };
}

export type AnswerValidation =
  | { success: true; value: unknown }
  | { success: false; fieldErrors: Record<string, string> };

export function validateDynamicAnswer(schema: FormSchemaV2, questionId: string, answer: unknown): AnswerValidation {
  const q = resolveQuestion(schema, questionId);
  if (!q) return { success: false, fieldErrors: { [questionId]: 'Unknown question.' } };

  // Composite block: validate each sub-field; aggregate errors keyed by id.subKey.
  if (q.subFields && q.subFields.length > 0) {
    if (!q.required && isEmpty(answer)) return { success: true, value: answer };
    const obj = (answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {}) as Record<string, unknown>;
    const fieldErrors: Record<string, string> = {};
    const out: Record<string, unknown> = {};
    for (const sf of q.subFields) {
      const v = obj[sf.key];
      const rule = sf.validation?.rule ?? (sf.required ? 'requiredString' : undefined);
      if (!rule) { out[sf.key] = v ?? ''; continue; }
      if (!sf.required && isEmpty(v)) { out[sf.key] = v ?? ''; continue; }
      const r = runRule(rule, v, {});
      if (r.ok) out[sf.key] = r.value;
      else fieldErrors[`${questionId}.${sf.key}`] = r.error;
    }
    return Object.keys(fieldErrors).length === 0 ? { success: true, value: out } : { success: false, fieldErrors };
  }

  const errorKey = q.fieldErrorKey ?? questionId;

  if (q.type === 'checkbox' && q.required) {
    return answer === true
      ? { success: true, value: true }
      : { success: false, fieldErrors: { [errorKey]: 'Please confirm this item.' } };
  }

  if ((q.type === 'currency' || q.type === 'number') && q.required) {
    if (isEmpty(answer)) {
      return { success: false, fieldErrors: { [errorKey]: 'This field is required.' } };
    }
    const numeric = runRule(q.type === 'currency' ? 'positiveNumber' : 'nonNegativeNumber', answer, {});
    return numeric.ok
      ? { success: true, value: numeric.value }
      : { success: false, fieldErrors: { [errorKey]: numeric.error } };
  }

  const { rule, keys, requiredKeys } = ruleOptsFor(q);
  if (!rule) return { success: true, value: answer };
  if (!q.required && isEmpty(answer)) return { success: true, value: answer };
  const r = runRule(rule, answer, { keys, requiredKeys });
  return r.ok ? { success: true, value: r.value } : { success: false, fieldErrors: { [errorKey]: r.error } };
}

// ---- apply -----------------------------------------------------------------
export function applyDynamicAnswer(schema: FormSchemaV2, fields: Fields, questionId: string, value: unknown, ctx: EvalContext = {}): Fields {
  const next = clone(fields);
  setPath(next, questionId, value);
  // Clear now-hidden dependents in the SAME step, but keep canonical-backed
  // values (Phase 4 re-pulls them). We detect the step from the question.
  const q = resolveQuestion(schema, questionId);
  const stepNum = findStepOf(schema, questionId);
  if (q && stepNum) {
    for (const it of questionsInStep(schema, stepNum)) {
      if (isRepeatBlock(it)) continue;
      if (it.id === questionId) continue;
      if (it.showIf && !evaluateShowIf(it.showIf, next, ctx, true)) {
        if (!it.canonicalField) setPath(next, it.id, defaultForQuestion(it));
      }
    }
  }
  return next;
}

function findStepOf(schema: FormSchemaV2, questionId: string): number | null {
  for (const it of schema.items) {
    if (!isRepeatBlock(it) && it.id === questionId) return it.step;
    if (isRepeatBlock(it) && questionId.startsWith(`${it.id}.`)) return it.step;
  }
  return null;
}

// ---- step required / completion / status -----------------------------------
export function computeStepRequired(schema: FormSchemaV2, step: number, fields: Fields, ctx: EvalContext = {}): boolean {
  const s = schema.steps.find((x) => x.number === step);
  if (!s) return false;
  if (!s.requiredIf) return true;
  return evaluateShowIf(s.requiredIf, fields, ctx, true);
}

export function validateDynamicStepCompletion(
  schema: FormSchemaV2,
  step: number,
  fields: Fields,
  ctx: EvalContext = {}
): { complete: boolean; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const visible = getVisibleDynamicQuestionIds(schema, step, fields, ctx);
  for (const id of visible) {
    const q = resolveQuestion(schema, id);
    if (!q || !q.required) continue;
    const res = validateDynamicAnswer(schema, id, getPath(fields, id));
    if (!res.success) Object.assign(fieldErrors, res.fieldErrors);
  }
  return { complete: Object.keys(fieldErrors).length === 0, fieldErrors };
}

export function deriveDynamicFormStatus(
  schema: FormSchemaV2,
  stepData: Record<number, Fields>,
  ctx: EvalContext = {}
): 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' {
  const hasAny = Object.values(stepData).some((d) => d && Object.keys(d).length > 0);
  if (!hasAny) return 'NOT_STARTED';
  const merged = mergeStepData(schema, stepData);
  // Completion is evaluated against MERGED fields so cross-step showIf/requiredIf
  // (e.g. step-3 visibility gated by step-2's investmentType) resolves correctly.
  for (const s of schema.steps) {
    if (!computeStepRequired(schema, s.number, merged, ctx)) continue;
    if (!validateDynamicStepCompletion(schema, s.number, merged, ctx).complete) return 'IN_PROGRESS';
  }
  return 'COMPLETED';
}

export function mergeStepData(schema: FormSchemaV2, stepData: Record<number, Fields>): Fields {
  const merged: Fields = {};
  for (const s of schema.steps) {
    const f = normalizeDynamicFields(schema, s.number, stepData[s.number]);
    deepAssign(merged, f);
  }
  return merged;
}
function deepAssign(target: Fields, src: Fields): void {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) {
      deepAssign(target[k] as Fields, v as Fields);
    } else {
      target[k] = v;
    }
  }
}

export function getDynamicResumeRoute(
  schema: FormSchemaV2,
  clientId: string,
  code: string,
  stepData: Record<number, Fields>,
  ctx: EvalContext = {}
): string | null {
  const merged = mergeStepData(schema, stepData);
  for (const s of schema.steps) {
    if (!computeStepRequired(schema, s.number, merged, ctx)) continue;
    if (!validateDynamicStepCompletion(schema, s.number, merged, ctx).complete) {
      return `/clients/${clientId}/forms/${code}/step-${s.number}`;
    }
  }
  return null;
}

// ---- prefill (Phase 4 wires profileLookup; Phase 1 = no-op when empty) ------
export function applyDynamicPrefill(
  schema: FormSchemaV2,
  step: number,
  fields: Fields,
  profileLookup: ProfileLookup = {},
  formCode = ''
): { fields: Fields; autoFilled: string[] } {
  const next = clone(fields);
  const autoFilled: string[] = [];
  if (Object.keys(profileLookup).length === 0) return { fields: next, autoFilled };

  const fill = (canonicalField: string | null | undefined, path: string, rule?: RuleName) => {
    if (!canonicalField) return;
    const hit = profileLookup[canonicalField];
    if (!hit) return;
    if (!isEmpty(getPath(next, path))) return; // never clobber
    let value = hit.value;
    // enum remap for one-hot canonical fields
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const remapped = remapEnumOneHot(canonicalField, formCode, value as Record<string, boolean>);
      if (remapped === null) return; // unmapped -> leave empty
      value = remapped;
    }
    // over-fill guard: stored value must satisfy the question's rule
    if (rule) {
      const probe = runRule(rule, typeof value === 'object' ? value : value, {});
      if (!probe.ok) return;
    }
    setPath(next, path, value);
    autoFilled.push(path);
  };

  for (const it of questionsInStep(schema, step)) {
    if (isRepeatBlock(it)) continue;
    fill(it.canonicalField, it.id, it.validation?.rule);
    for (const sf of it.subFields ?? []) fill(sf.canonicalField, `${it.id}.${sf.key}`, sf.validation?.rule);
  }
  return { fields: next, autoFilled };
}

// ---- envelope --------------------------------------------------------------
export interface StepEnvelope {
  key: string;
  label: string;
  currentQuestionId: string | null;
  currentQuestionIndex: number;
  visibleQuestionIds: string[];
  fields: Fields;
  autoFilled: string[];
  requiresStep4?: boolean;
  requiresJointOwnerSignature?: boolean;
  nextRouteAfterCompletion?: string | null;
}

export function buildDynamicEnvelope(
  schema: FormSchemaV2,
  step: number,
  fields: Fields,
  cursor: number,
  autoFilled: string[],
  ctx: EvalContext & { nextRouteAfterCompletion?: string | null } = {},
  /** Cross-step merged fields for showIf evaluation; defaults to step-local `fields`. */
  evalFields?: Fields
): StepEnvelope {
  const s = schema.steps.find((x) => x.number === step)!;
  const visible = getVisibleDynamicQuestionIds(schema, step, evalFields ?? fields, ctx);
  const idx = clampDynamicQuestionIndex(cursor, visible);
  const env: StepEnvelope = {
    key: s.key,
    label: s.label,
    currentQuestionId: visible[idx] ?? null,
    currentQuestionIndex: idx,
    visibleQuestionIds: visible,
    fields,
    autoFilled
  };
  const emits = new Set(s.emits ?? []);
  if (emits.has('requiresStep4')) env.requiresStep4 = Boolean(ctx.requiresStep4);
  if (emits.has('requiresJointOwnerSignature')) env.requiresJointOwnerSignature = Boolean(ctx.requiresJointOwnerSignature);
  if (emits.has('nextRouteAfterCompletion')) env.nextRouteAfterCompletion = ctx.nextRouteAfterCompletion ?? null;
  return env;
}

// ---- context derivation ----------------------------------------------------
export function deriveContext(nowMs?: number): EvalContext & { requiresStep4?: boolean } {
  const now = nowMs ?? Date.now();
  return {
    isMinor: (dateStr: unknown) => {
      if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
      const dob = Date.parse(`${dateStr}T00:00:00Z`);
      if (Number.isNaN(dob)) return false;
      return now - dob < 18 * 365.25 * 24 * 3600 * 1000;
    }
  };
}

// ---- PDF resolution (v2) ---------------------------------------------------
/**
 * Project merged answers onto AcroForm field values for PDF fill (spec 1.4/5.3).
 * Only VISIBLE questions are written (hidden/stale values are never emitted).
 *   - choice/multi/checklist: each chosen option's pdfField -> true
 *   - checkbox: boolean
 *   - composite: each sub-field's pdfField
 *   - repeat block: instancePdfFieldMap[fieldId][instanceIndex]
 *   - scalar: pdfField -> string
 */
export function resolveFieldValuesV2(
  schema: FormSchemaV2,
  mergedFields: Fields,
  ctx: EvalContext = {}
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};

  const visibleByStep = new Map<number, Set<string>>();
  for (const s of schema.steps) {
    visibleByStep.set(s.number, new Set(getVisibleDynamicQuestionIds(schema, s.number, mergedFields, ctx)));
  }
  const isVisible = (step: number, id: string) => visibleByStep.get(step)?.has(id) ?? false;

  const writeScalar = (q: FormQuestionV2, value: unknown) => {
    if (q.options && q.options.length > 0) {
      const map = (value && typeof value === 'object' ? value : {}) as Record<string, boolean>;
      for (const o of q.options) if (o.pdfField && map[o.value] === true) out[o.pdfField] = true;
      return;
    }
    if (q.subFields && q.subFields.length > 0) {
      const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
      for (const sf of q.subFields) if (sf.pdfField && !isEmpty(obj[sf.key])) out[sf.pdfField] = String(obj[sf.key]);
      return;
    }
    if (q.type === 'checkbox') { if (q.pdfField) out[q.pdfField] = Boolean(value) && value !== 'false'; return; }
    if (q.pdfField && !isEmpty(value)) out[q.pdfField] = String(value);
  };

  for (const it of schema.items) {
    if (isRepeatBlock(it)) {
      const arr = getPath(mergedFields, it.id);
      if (!Array.isArray(arr)) continue;
      arr.forEach((instance, i) => {
        for (const f of it.fields) {
          const instId = `${it.id}.${i}.${f.id}`;
          if (!isVisible(it.step, instId)) continue;
          const val = (instance as Record<string, unknown>)?.[f.id];
          const mapped = it.instancePdfFieldMap?.[f.id]?.[i];
          if (mapped && !isEmpty(val)) out[mapped] = String(val);
          else if (f.pdfField && !isEmpty(val)) out[f.pdfField] = String(val);
        }
      });
      continue;
    }
    if (!isVisible(it.step, it.id)) continue;
    writeScalar(it, getPath(mergedFields, it.id));
  }
  return out;
}

export { FormSchemaV2 };
