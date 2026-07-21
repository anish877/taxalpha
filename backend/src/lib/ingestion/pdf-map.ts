import { CANONICAL_DICTIONARY } from '../profile/canonical-dictionary.js';
import type { Fields, ProfileLookup } from '../dynamic-step-engine.js';
import { getVisibleDynamicQuestionIds, resolveQuestion } from '../dynamic-step-engine.js';
import type { EvalContext } from '../showif/eval.js';
import { factDefinitions, isFactKey, resolveFact, type FactResolution } from '../profile/facts.js';
import type { ExtractedField, WidgetType } from './schema.js';
import {
  isRepeatBlock,
  type FormQuestionV2,
  type FormSchemaV2,
  type PdfMappingLayout,
  type PdfMappingTarget
} from './schema-v2.js';

export interface PdfMapVariable {
  key: string;
  label: string;
  group: string;
  source: 'schema' | 'canonical' | 'fact';
  format?: PdfMappingTarget['format'];
  description?: string;
  ruleSummary?: string;
  sourceForms?: string[];
  reviewSensitive?: boolean;
}

export interface SkippedSignatureField {
  id: string;
  page: number;
  fieldName: string | null;
  rect: PdfMappingTarget['rect'];
  label: string;
  ignoredReason: 'signature_skipped';
}

export interface TextOverlayValue {
  page: number;
  rect: PdfMappingTarget['rect'];
  text: string;
  format?: PdfMappingTarget['format'];
}

export interface PdfMappingWarning {
  targetId: string;
  variableKey: string;
  pdfField?: string | null;
  reason: string;
  missingInputs?: string[];
  needsReview?: boolean;
  sourceFields?: string[];
}

interface SchemaBinding {
  variableKey: string;
  optionValue?: string;
  format?: PdfMappingTarget['format'];
  required?: boolean;
  confidence?: number | null;
}

const DATE_TYPES = new Set(['date']);
const MONEY_TYPES = new Set(['currency', 'number']);
const PHONE_TYPES = new Set(['phone']);

function getPath(obj: Fields, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Fields)) cur = (cur as Fields)[seg];
    else return undefined;
  }
  return cur;
}

function isEmpty(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    v === '' ||
    (typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.values(v as object).every((x) => x === false || x === '' || x == null)) ||
    (Array.isArray(v) && v.length === 0)
  );
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90) || 'field';
}

function fieldRect(rect: [number, number, number, number]): PdfMappingTarget['rect'] {
  const [x1, y1, x2, y2] = rect;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(1, Math.abs(x2 - x1)),
    height: Math.max(1, Math.abs(y2 - y1))
  };
}

function targetGeometryKey(fieldName: string, page: number, rect: PdfMappingTarget['rect']): string {
  return [
    fieldName,
    page,
    Math.round(rect.x * 10) / 10,
    Math.round(rect.y * 10) / 10,
    Math.round(rect.width * 10) / 10,
    Math.round(rect.height * 10) / 10
  ].join('|');
}

function widgetType(type: WidgetType): PdfMappingTarget['widgetType'] {
  if (type === 'checkbox' || type === 'radio') return 'checkbox';
  if (type === 'choice') return 'choice';
  return 'text';
}

function formatFor(type: string, canonicalField?: string | null): PdfMappingTarget['format'] {
  if (DATE_TYPES.has(type)) return 'date';
  if (MONEY_TYPES.has(type)) return 'currency';
  if (PHONE_TYPES.has(type)) return 'phone';
  if (type === 'ssn-ein') return canonicalField?.includes('ein') ? 'tin' : 'ssn';
  if (canonicalField?.includes('ssn')) return 'ssn';
  if (canonicalField?.includes('ein')) return 'tin';
  if (canonicalField?.includes('phone')) return 'phone';
  return 'text';
}

function groupForCanonical(key: string): string {
  if (key.startsWith('person') || key.startsWith('advisor') || key.startsWith('account')) return 'Investor';
  if (key.startsWith('entity')) return 'Entity';
  if (key.startsWith('address')) return 'Client';
  if (key.startsWith('investment')) return 'Subscription';
  if (key.startsWith('financial')) return 'Accreditation';
  if (key.includes('ssn') || key.includes('ein') || key.includes('tax')) return 'Tax';
  return 'Computed';
}

function humanLabel(key: string): string {
  const leaf = key.split('.').at(-1) ?? key;
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function variableKeyForQuestion(q: FormQuestionV2): string | null {
  if (q.canonicalField) return `canonical:${q.canonicalField}`;
  return null;
}

function collectBindings(schema: FormSchemaV2): Map<string, SchemaBinding> {
  const byPdfField = new Map<string, SchemaBinding>();

  const visitQuestion = (q: FormQuestionV2, path = q.id) => {
    const base: Omit<SchemaBinding, 'variableKey'> = {
      format: formatFor(q.type, q.canonicalField),
      required: q.required,
      confidence: q.mapping?.confidence ?? null
    };
    if (q.pdfField && q.type !== 'signature') {
      const variableKey = variableKeyForQuestion(q);
      if (variableKey) byPdfField.set(q.pdfField, { ...base, variableKey });
    }
    for (const option of q.options ?? []) {
      if (!option.pdfField) continue;
      const variableKey = q.canonicalField ? `canonical:${q.canonicalField}` : null;
      if (!variableKey) continue;
      byPdfField.set(option.pdfField, {
        ...base,
        variableKey,
        optionValue: option.value,
        required: option.required ?? q.required,
        confidence: option.mapping?.confidence ?? q.mapping?.confidence ?? null
      });
    }
    for (const subField of q.subFields ?? []) {
      if (!subField.pdfField || subField.type === 'signature') continue;
      if (!subField.canonicalField) continue;
      byPdfField.set(subField.pdfField, {
        variableKey: `canonical:${subField.canonicalField}`,
        format: formatFor(subField.type, subField.canonicalField),
        required: subField.required,
        confidence: subField.mapping?.confidence ?? null
      });
    }
  };

  for (const item of schema.items) {
    if (isRepeatBlock(item)) {
      for (const field of item.fields) visitQuestion(field, `${item.id}.0.${field.id}`);
      continue;
    }
    visitQuestion(item);
  }
  return byPdfField;
}

export function buildAvailableVariables(schema: FormSchemaV2): PdfMapVariable[] {
  const seen = new Set<string>();
  const out: PdfMapVariable[] = [];
  const push = (variable: PdfMapVariable) => {
    if (seen.has(variable.key)) return;
    seen.add(variable.key);
    out.push(variable);
  };

  for (const key of Object.keys(CANONICAL_DICTIONARY)) {
    if (key.startsWith('signature.')) continue;
    push({
      key: `canonical:${key}`,
      label: humanLabel(key),
      group: groupForCanonical(key),
      source: 'canonical',
      format: formatFor('', key),
      description: key
    });
  }

  for (const fact of factDefinitions()) {
    push({
      key: `fact:${fact.key}`,
      label: fact.label,
      group: fact.group,
      source: 'fact',
      format: fact.format ?? (fact.valueShape === 'date' ? 'date' : fact.valueShape === 'number' ? 'currency' : 'text'),
      description: fact.ruleSummary,
      ruleSummary: fact.ruleSummary,
      sourceForms: fact.sourceForms,
      reviewSensitive: fact.reviewSensitive
    });
  }

  return out.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
}

function fieldText(field: ExtractedField): string {
  return [field.fieldName, field.inferredLabel, field.tooltip, ...(field.nearbyText ?? [])]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function suggestFactBinding(field: ExtractedField): SchemaBinding | null {
  const text = fieldText(field);
  if (!text) return null;

  if (field.type === 'checkbox' || field.type === 'radio') {
    if (text.includes('net worth') && text.includes('1,000,000')) {
      return { variableKey: 'fact:accreditation.naturalPersonNetWorthQualified', confidence: 0.86 };
    }
    if (text.includes('income') && (text.includes('200,000') || text.includes('300,000'))) {
      return { variableKey: 'fact:accreditation.naturalPersonIncomeQualified', confidence: 0.72 };
    }
    if (text.includes('accredited investor') && (text.includes('entity') || text.includes('subscriber'))) {
      return { variableKey: 'fact:accreditation.entityAccreditationCandidate', confidence: 0.68 };
    }
    if (text.includes('documentation') || text.includes('bank statements') || text.includes('brokerage statements')) {
      return { variableKey: 'fact:accreditation.documentationAcknowledged', confidence: 0.78 };
    }
  }

  if (field.type === 'text') {
    if (text.includes('registered representative') && text.includes('crd')) return { variableKey: 'canonical:broker.representativeCrdNumber', format: 'text', confidence: 0.92 };
    if (text.includes('broker-dealer firm')) return { variableKey: 'canonical:broker.firmName', format: 'text', confidence: 0.94 };
    if (text.includes('broker-dealer') && text.includes('crd')) return { variableKey: 'canonical:broker.brokerDealerCrdNumber', format: 'text', confidence: 0.9 };
    if (text.includes('branch address') && text.includes('city')) return { variableKey: 'canonical:broker.branchFullAddress', format: 'text', confidence: 0.9 };
    if (text.includes('branch address')) return { variableKey: 'canonical:broker.branchAddressLine1', format: 'text', confidence: 0.86 };
    if (text.includes('branch phone')) return { variableKey: 'canonical:broker.branchPhone', format: 'phone', confidence: 0.9 };
    if (text.includes('rr name')) return { variableKey: 'fact:advisor.rrName', format: 'text', confidence: 0.88 };
    if (text.includes('rr no')) return { variableKey: 'fact:advisor.rrNumber', format: 'text', confidence: 0.88 };
    if (text.includes('customer name')) return { variableKey: 'fact:client.customerNames', format: 'text', confidence: 0.84 };
  }

  return null;
}

export function shouldSkipPdfMappingField(field: ExtractedField): boolean {
  const text = fieldText(field);
  if (field.type === 'signature') return true;
  if (field.type !== 'text') return false;
  const signatureText = text.includes('signature') || text.includes('signed') || text.includes('printed name');
  const dateText = text === 'date' || text.includes(' date ') || text.endsWith(' date') || text.includes('dated this');
  return signatureText || (dateText && (text.includes('signature') || text.includes('owner') || text.includes('representative') || text.includes('principal')));
}

export function buildMappingLayoutFromFields(
  schema: FormSchemaV2,
  fields: ExtractedField[],
  existing?: PdfMappingLayout | null
): PdfMappingLayout {
  const bindings = collectBindings(schema);
  const targets: PdfMappingTarget[] = [];
  const existingTargets = existing?.targets.filter((target) => target.kind === 'overlay') ?? [];
  const existingByGeometry = new Map(
    (existing?.targets ?? [])
      .filter((target) => target.kind === 'acrofield' && target.pdfField)
      .map((target) => [targetGeometryKey(target.pdfField!, target.page, target.rect), target])
  );

  fields.forEach((field, index) => {
    if (!field.fieldName || shouldSkipPdfMappingField(field)) return;
    const rect = fieldRect(field.rect);
    const saved = existingByGeometry.get(targetGeometryKey(field.fieldName, field.page, rect));
    if (saved) {
      targets.push(saved);
      return;
    }
    const binding = bindings.get(field.fieldName) ?? suggestFactBinding(field);
    targets.push({
      id: `field:${slug(field.fieldName)}:${field.page}:${index}`,
      kind: 'acrofield',
      page: field.page,
      rect,
      pdfField: field.fieldName,
      widgetType: widgetType(field.type),
      variableKey: binding?.variableKey ?? null,
      optionValue: binding?.optionValue ?? null,
      format: binding?.format ?? (field.type === 'checkbox' ? 'text' : undefined),
      required: field.flags?.required ?? binding?.required,
      source: 'ai',
      confidence: binding?.confidence ?? null
    });
  });

  return { version: 1, targets: [...targets, ...existingTargets] };
}

export function skippedSignatureFields(fields: ExtractedField[]): SkippedSignatureField[] {
  return fields
    .filter(shouldSkipPdfMappingField)
    .map((field, index) => ({
      id: `signature:${field.page}:${index}:${slug(field.fieldName ?? 'unnamed')}`,
      page: field.page,
      fieldName: field.fieldName,
      rect: fieldRect(field.rect),
      label: field.inferredLabel ?? field.tooltip ?? field.fieldName ?? 'Signature field',
      ignoredReason: 'signature_skipped'
    }));
}

export function validateMappingLayout(schema: FormSchemaV2, layout?: PdfMappingLayout): string[] {
  if (!layout) return [];
  const variables = new Set(buildAvailableVariables(schema).map((variable) => variable.key));
  const errors: string[] = [];
  for (const target of layout.targets) {
    if (target.ignoredReason === 'admin_ignored') continue;
    if (target.kind === 'acrofield' && !target.pdfField) {
      errors.push(`${target.id}: PDF field target is missing pdfField.`);
    }
    if (target.kind === 'overlay') {
      if (!target.variableKey) errors.push(`${target.id}: overlay target must have a variable.`);
      if (target.widgetType !== 'text') errors.push(`${target.id}: overlay target must be a text target.`);
    }
  if (target.variableKey && !variables.has(target.variableKey)) {
      errors.push(`${target.id}: unknown variable ${target.variableKey}.`);
    }
  }
  return errors;
}

function formatValue(value: unknown, format?: PdfMappingTarget['format']): string {
  if (value === undefined || value === null) return '';
  const raw = typeof value === 'string' ? value : String(value);
  const digits = raw.replace(/\D/g, '');
  if (format === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-');
    return `${month}/${day}/${year}`;
  }
  if (format === 'currency') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  }
  if (format === 'phone' && digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (format === 'ssn' && digits.length === 9) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (format === 'tin' && digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return raw;
}

function resolveCanonicalFromSchema(schema: FormSchemaV2, canonicalKey: string, mergedFields: Fields): unknown {
  for (const item of schema.items) {
    if (isRepeatBlock(item)) continue;
    if (item.canonicalField === canonicalKey) return getPath(mergedFields, item.id);
    for (const subField of item.subFields ?? []) {
      if (subField.canonicalField === canonicalKey) return getPath(mergedFields, `${item.id}.${subField.key}`);
    }
  }
  return undefined;
}

function visibleVariable(schema: FormSchemaV2, variableKey: string, mergedFields: Fields, ctx: EvalContext): boolean {
  if (!variableKey.startsWith('question:')) return true;
  const path = variableKey.slice('question:'.length);
  const question = resolveQuestion(schema, path);
  if (!question) return true;
  const visible = new Set(getVisibleDynamicQuestionIds(schema, question.step, mergedFields, ctx));
  if (visible.has(path)) return true;
  const parent = path.split('.').slice(0, -1).join('.');
  return visible.has(parent);
}

function resolveVariable(schema: FormSchemaV2, variableKey: string, mergedFields: Fields, lookup: ProfileLookup): unknown {
  if (variableKey.startsWith('question:')) return getPath(mergedFields, variableKey.slice('question:'.length));
  if (variableKey.startsWith('canonical:')) {
    const key = variableKey.slice('canonical:'.length);
    return lookup[key]?.value ?? resolveCanonicalFromSchema(schema, key, mergedFields);
  }
  if (variableKey.startsWith('fact:')) {
    const key = variableKey.slice('fact:'.length);
    const fact = resolveFact(key, lookup);
    return fact?.value;
  }
  return getPath(mergedFields, variableKey);
}

function resolveFactWarning(target: PdfMappingTarget, fact: FactResolution | null): PdfMappingWarning | null {
  if (!target.variableKey?.startsWith('fact:')) return null;
  if (!fact) {
    return {
      targetId: target.id,
      variableKey: target.variableKey,
      pdfField: target.pdfField,
      reason: 'Unknown smart fact.'
    };
  }
  if (fact.value !== undefined && fact.value !== null && fact.value !== '') return null;
  return {
    targetId: target.id,
    variableKey: target.variableKey,
    pdfField: target.pdfField,
    reason: fact.explanation,
    missingInputs: fact.missingInputs,
    needsReview: fact.needsReview,
    sourceFields: fact.sourceFields
  };
}

export function resolveMappedPdfValues(
  schema: FormSchemaV2,
  layout: PdfMappingLayout,
  mergedFields: Fields,
  lookup: ProfileLookup = {},
  ctx: EvalContext = {}
): { fieldValues: Record<string, string | boolean>; overlays: TextOverlayValue[]; warnings: PdfMappingWarning[] } {
  const fieldValues: Record<string, string | boolean> = {};
  const overlays: TextOverlayValue[] = [];
  const warnings: PdfMappingWarning[] = [];

  for (const target of layout.targets) {
    if (target.ignoredReason || !target.variableKey) continue;
    if (!visibleVariable(schema, target.variableKey, mergedFields, ctx)) continue;
    if (target.variableKey.startsWith('fact:')) {
      const fact = resolveFact(target.variableKey.slice('fact:'.length), lookup);
      const warning = resolveFactWarning(target, fact);
      if (warning) warnings.push(warning);
    }
    const value = resolveVariable(schema, target.variableKey, mergedFields, lookup);
    if (isEmpty(value)) continue;

    let resolved: string | boolean;
    if (target.widgetType === 'checkbox') {
      if (target.optionValue && value && typeof value === 'object') {
        resolved = (value as Record<string, unknown>)[target.optionValue] === true;
      } else if (target.optionValue && typeof value === 'string') {
        resolved = value === target.optionValue;
      } else {
        resolved = value === true || value === 'true' || value === 'yes' || value === '1';
      }
    } else {
      resolved = formatValue(value, target.format);
    }

    if (target.kind === 'acrofield' && target.pdfField) {
      fieldValues[target.pdfField] = resolved;
    } else if (target.kind === 'overlay' && typeof resolved === 'string' && resolved.trim()) {
      overlays.push({ page: target.page, rect: target.rect, text: resolved, format: target.format });
    }
  }

  return { fieldValues, overlays, warnings };
}
