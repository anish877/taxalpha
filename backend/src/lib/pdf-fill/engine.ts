import { createHash, randomUUID } from 'node:crypto';

import type { ProfileLookup } from '../dynamic-step-engine.js';
import { fillPdf, drawPdfTextOverlays } from '../ingestion/fill.js';
import { shouldSkipPdfMappingField, type TextOverlayValue } from '../ingestion/pdf-map.js';
import type { PdfPageGeometry, PdfStructure } from '../ingestion/extract.js';
import type { ExtractedField } from '../ingestion/schema.js';
import { PdfMappingLayout, type PdfMappingRect, type PdfMappingTarget } from '../ingestion/schema-v2.js';
import { resolveFact, type FactResolution } from '../profile/facts.js';
import {
  destinationProfileForFingerprint,
  sourceFormTitle,
  type DestinationProfile,
  type PdfFieldIntent
} from './form-intelligence.js';

export type PdfFillConfidence = 'high' | 'medium' | 'low';
export type PdfFillTargetStatus = 'filled' | 'needs_review' | 'empty' | 'skipped';

export interface PdfFillWarning {
  targetId: string;
  label: string;
  reason: string;
  missingInputs?: string[];
}

export interface PublicPdfFillTarget {
  id: string;
  page: number;
  rect: PdfMappingRect;
  widgetType: PdfMappingTarget['widgetType'];
  label: string;
  value: string | boolean | null;
  displayValue: string;
  status: PdfFillTargetStatus;
  sourceLabel?: string;
  explanation?: string;
  confidence: PdfFillConfidence;
  editable: boolean;
  warning?: string;
  pdfField?: string | null;
}

export interface PublicPdfFillLayout {
  pages: PdfPageGeometry[];
  targets: PublicPdfFillTarget[];
}

export interface PdfFillOverride {
  value?: string | boolean | null;
  ignored?: boolean;
}

export type PdfFillOverrides = Record<string, PdfFillOverride>;

interface InternalResolution {
  rawValue: unknown;
  value: string | boolean | null;
  displayValue: string;
  sourceLabel?: string;
  explanation?: string;
  warning?: PdfFillWarning;
  missing: boolean;
}

export interface BuiltPdfFill {
  id: string;
  fingerprint: string;
  profileTitle: string | null;
  mappingLayout: PdfMappingLayout;
  resolvedLayout: PublicPdfFillLayout;
  warnings: PdfFillWarning[];
}

export interface GeneratedPdfFillValues {
  fieldValues: Record<string, string | boolean>;
  overlays: TextOverlayValue[];
  resolvedLayout: PublicPdfFillLayout;
  warnings: PdfFillWarning[];
}

function fieldRect(rect: [number, number, number, number]): PdfMappingRect {
  const [x1, y1, x2, y2] = rect;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(1, Math.abs(x2 - x1)),
    height: Math.max(1, Math.abs(y2 - y1))
  };
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90) || 'field';
}

function widgetType(field: ExtractedField): PdfMappingTarget['widgetType'] {
  if (field.type === 'checkbox' || field.type === 'radio') return 'checkbox';
  if (field.type === 'choice') return 'choice';
  return 'text';
}

function fingerprintPdf(pdf: Uint8Array): string {
  return createHash('sha256').update(pdf).digest('hex');
}

function textFor(field: ExtractedField): string {
  return [field.fieldName, field.inferredLabel, field.tooltip, ...(field.nearbyText ?? [])]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

function rectsIntersect(a: PdfMappingRect, b: PdfMappingRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function inSignatureZone(field: ExtractedField, profile: DestinationProfile | null): boolean {
  if (!profile) return false;
  const rect = fieldRect(field.rect);
  return profile.signatureZones.some((zone) => zone.page === field.page && rectsIntersect(rect, zone.rect));
}

function isSignatureAdjacent(field: ExtractedField, profile: DestinationProfile | null): boolean {
  if (shouldSkipPdfMappingField(field)) return true;
  if (!inSignatureZone(field, profile)) return false;
  const text = textFor(field);
  return (
    field.type === 'signature' ||
    text.includes('signature') ||
    text.includes('signed') ||
    text.includes('printed name') ||
    /\bdate\b/.test(text) ||
    text.includes('executed this') ||
    text.includes('dated this')
  );
}

function heuristicIntent(field: ExtractedField): PdfFieldIntent | null {
  const text = textFor(field);
  const name = (field.fieldName ?? '').toLowerCase();

  if (field.type === 'text') {
    if (text.includes('registered representative') && text.includes('crd')) return { variableKey: 'canonical:broker.representativeCrdNumber', format: 'text', confidence: 0.92 };
    if (text.includes('broker-dealer firm')) return { variableKey: 'canonical:broker.firmName', format: 'text', confidence: 0.94 };
    if (text.includes('broker-dealer') && text.includes('crd')) return { variableKey: 'canonical:broker.brokerDealerCrdNumber', format: 'text', confidence: 0.9 };
    if (text.includes('branch address') && text.includes('city')) return { variableKey: 'canonical:broker.branchFullAddress', format: 'text', confidence: 0.9 };
    if (text.includes('branch address')) return { variableKey: 'canonical:broker.branchAddressLine1', format: 'text', confidence: 0.86 };
    if (text.includes('branch phone')) return { variableKey: 'canonical:broker.branchPhone', format: 'phone', confidence: 0.9 };
    if (name === 'email address_8') return { variableKey: 'canonical:broker.email', format: 'text', confidence: 0.96 };
    if (text.includes('rr name')) return { variableKey: 'fact:advisor.rrName', format: 'text', confidence: 0.86 };
    if (text.includes('rr no') || text.includes('crd no')) return { variableKey: 'fact:advisor.rrNumber', format: 'text', confidence: 0.82 };
    if (text.includes('customer name')) return { variableKey: 'fact:client.customerNames', format: 'text', confidence: 0.84 };
    if (text.includes('total purchase price') || name === 'investment') return { variableKey: 'fact:investment.subscriptionAmount', format: 'currency', confidence: 0.9 };
    if (text.includes('date of birth')) return { variableKey: name.endsWith('_2') ? 'canonical:person2.dateOfBirth' : 'canonical:person.dateOfBirth', format: 'date', confidence: 0.76 };
    if (text.includes('e-mail address') || text.includes('email address')) return { variableKey: name.endsWith('_2') ? 'canonical:person2.email' : 'canonical:person.email', format: 'text', confidence: 0.76 };
    if (text.includes('social security') || text.includes('tax id')) return { variableKey: name.endsWith('_2') ? 'canonical:person2.ssn' : 'canonical:person.ssn', format: 'ssn', confidence: 0.7 };
    if (text.includes('primary state of residence')) return { variableKey: name.endsWith('_2') ? 'canonical:person2.address.legal.stateProvince' : 'canonical:address.legal.stateProvince', format: 'text', confidence: 0.72 };
    if (text.includes('registered representative name')) return { variableKey: 'fact:advisor.rrName', format: 'text', confidence: 0.84 };
  }

  if (field.type === 'checkbox' || field.type === 'radio') {
    if (text.includes('net worth') && text.includes('1,000,000')) {
      return { variableKey: 'fact:accreditation.naturalPersonNetWorthQualified', confidence: 0.82 };
    }
    if (text.includes('income') && (text.includes('200,000') || text.includes('300,000'))) {
      return { variableKey: 'fact:accreditation.naturalPersonIncomeQualified', confidence: 0.7 };
    }
    if (text.includes('documentation') || text.includes('bank statements') || text.includes('brokerage statements')) {
      return { variableKey: 'fact:accreditation.documentationAcknowledged', confidence: 0.72 };
    }
  }

  return null;
}

function labelForTarget(field: ExtractedField, intent: PdfFieldIntent | null): string {
  return intent?.label ?? field.inferredLabel ?? field.tooltip ?? field.fieldName ?? 'PDF field';
}

function buildTarget(field: ExtractedField, index: number, intent: PdfFieldIntent | null, skipped: boolean): PdfMappingTarget {
  const safeName = field.fieldName ?? `unnamed_${index}`;
  const target: PdfMappingTarget = {
    id: `${skipped ? 'skipped' : 'field'}:${slug(safeName)}:${field.page}:${index}`,
    kind: 'acrofield',
    page: field.page,
    rect: fieldRect(field.rect),
    pdfField: field.fieldName,
    widgetType: widgetType(field),
    variableKey: skipped ? null : intent?.variableKey ?? null,
    optionValue: skipped ? null : intent?.optionValue ?? null,
    format: skipped ? undefined : intent?.format ?? (field.type === 'text' ? 'text' : undefined),
    required: field.flags?.required,
    source: 'ai',
    confidence: skipped ? null : intent?.confidence ?? null,
    ignoredReason: skipped ? 'signature_skipped' : undefined
  };
  return target;
}

export function buildPdfFillMapping(structure: PdfStructure, fingerprint: string): PdfMappingLayout {
  const profile = destinationProfileForFingerprint(fingerprint);
  const targets = structure.fields.map((field, index) => {
    const known = field.fieldName ? profile?.knownFieldIntents[field.fieldName] ?? null : null;
    const skipped = known?.skip === true || isSignatureAdjacent(field, profile);
    const intent = skipped ? null : known ?? heuristicIntent(field);
    return buildTarget(field, index, intent, skipped);
  });
  return { version: 1, targets };
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.values(value as Record<string, unknown>).every((item) => item === false || item === '' || item === null || item === undefined))
  );
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
    const amount = Number(raw);
    if (Number.isFinite(amount)) {
      return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
    }
  }
  if (format === 'phone' && digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (format === 'ssn' && digits.length === 9) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (format === 'tin' && digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return raw;
}

function confidence(confidence?: number | null): PdfFillConfidence {
  if (typeof confidence !== 'number') return 'low';
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

function factWarning(target: PdfMappingTarget, label: string, fact: FactResolution | null): PdfFillWarning | undefined {
  if (!target.variableKey?.startsWith('fact:')) return undefined;
  if (!fact) return { targetId: target.id, label, reason: 'Unknown smart fact.' };
  if (!isEmpty(fact.value)) return undefined;
  return {
    targetId: target.id,
    label,
    reason: fact.explanation,
    missingInputs: fact.missingInputs
  };
}

function resolveCanonical(variableKey: string, lookup: ProfileLookup): InternalResolution {
  const key = variableKey.slice('canonical:'.length);
  const found = lookup[key];
  if (!found || isEmpty(found.value)) {
    return {
      rawValue: undefined,
      value: null,
      displayValue: '',
      missing: true,
      explanation: `No completed source form value is available for ${key}.`
    };
  }
  return {
    rawValue: found.value,
    value: null,
    displayValue: '',
    sourceLabel: sourceFormTitle(found.sourceFormCode),
    explanation: `Filled from ${sourceFormTitle(found.sourceFormCode)}.`,
    missing: false
  };
}

function resolveVariable(target: PdfMappingTarget, label: string, lookup: ProfileLookup): InternalResolution {
  if (!target.variableKey) {
    return {
      rawValue: undefined,
      value: null,
      displayValue: '',
      missing: true,
      explanation: 'No confident source data match was found.'
    };
  }

  if (target.variableKey.startsWith('canonical:')) {
    return resolveCanonical(target.variableKey, lookup);
  }

  if (target.variableKey.startsWith('fact:')) {
    const fact = resolveFact(target.variableKey.slice('fact:'.length), lookup);
    if (!fact) {
      return {
        rawValue: undefined,
        value: null,
        displayValue: '',
        missing: true,
        warning: { targetId: target.id, label, reason: 'Unknown smart fact.' }
      };
    }
    return {
      rawValue: fact.value,
      value: null,
      displayValue: '',
      sourceLabel: fact.sourceFields.map((sourceField) => sourceFormTitle(sourceField.split(':')[0] ?? '')).filter(Boolean)[0],
      explanation: fact.explanation,
      missing: isEmpty(fact.value),
      warning: factWarning(target, label, fact)
    };
  }

  return {
    rawValue: undefined,
    value: null,
    displayValue: '',
    missing: true,
    explanation: 'Unsupported internal mapping.'
  };
}

function applyWidgetValue(target: PdfMappingTarget, resolution: InternalResolution): InternalResolution {
  if (resolution.missing) return resolution;

  if (target.widgetType === 'checkbox') {
    const value = resolution.rawValue;
    let checked = false;
    if (target.optionValue && value && typeof value === 'object') {
      checked = (value as Record<string, unknown>)[target.optionValue] === true;
    } else if (target.optionValue && typeof value === 'string') {
      checked = value === target.optionValue;
    } else {
      checked = value === true || value === 'true' || value === 'yes' || value === '1';
    }
    return { ...resolution, value: checked, displayValue: checked ? 'Checked' : 'Unchecked' };
  }

  const displayValue = formatValue(resolution.rawValue, target.format);
  return { ...resolution, value: displayValue, displayValue };
}

function overrideResolution(target: PdfMappingTarget, override: PdfFillOverride): InternalResolution | null {
  if (override.ignored) {
    return {
      rawValue: undefined,
      value: null,
      displayValue: '',
      missing: false,
      explanation: 'Ignored for this PDF.',
      sourceLabel: 'Manual edit'
    };
  }
  if (!('value' in override)) return null;
  const value = override.value ?? null;
  if (target.widgetType === 'checkbox') {
    const checked = value === true || value === 'true';
    return {
      rawValue: checked,
      value: checked,
      displayValue: checked ? 'Checked' : 'Unchecked',
      missing: false,
      explanation: 'Edited for this PDF only.',
      sourceLabel: 'Manual edit'
    };
  }
  const text = value === null ? '' : String(value);
  return {
    rawValue: text,
    value: text || null,
    displayValue: text,
    missing: text.trim().length === 0,
    explanation: 'Edited for this PDF only.',
    sourceLabel: 'Manual edit'
  };
}

function notApplicableReason(target: PdfMappingTarget, lookup: ProfileLookup): string | null {
  const variableKey = target.variableKey ?? '';
  const isAdditionalHolderField =
    variableKey.startsWith('canonical:person2.') ||
    variableKey.startsWith('canonical:person2.address.') ||
    variableKey.startsWith('fact:joint.');

  if (!isAdditionalHolderField) return null;

  const jointOwner = resolveFact('account.requiresJointOwner', lookup);
  const controlPerson = resolveFact('account.requiresControlPerson', lookup);
  if (jointOwner?.value === false && controlPerson?.value === false) {
    return 'Not applicable for the selected individual account registration.';
  }

  return null;
}

export function resolvePublicPdfFillLayout(
  pages: PdfPageGeometry[],
  layout: PdfMappingLayout,
  lookup: ProfileLookup,
  options: {
    fields?: ExtractedField[];
    overrides?: PdfFillOverrides;
    previous?: PublicPdfFillLayout | null;
  } = {}
): { resolvedLayout: PublicPdfFillLayout; warnings: PdfFillWarning[] } {
  const fieldsByName = new Map((options.fields ?? []).filter((field) => field.fieldName).map((field) => [field.fieldName!, field]));
  const previousById = new Map((options.previous?.targets ?? []).map((target) => [target.id, target]));
  const warnings: PdfFillWarning[] = [];

  const targets = layout.targets.map((target): PublicPdfFillTarget => {
    const field = target.pdfField ? fieldsByName.get(target.pdfField) : undefined;
    const label = previousById.get(target.id)?.label ?? field?.inferredLabel ?? field?.tooltip ?? target.pdfField ?? 'PDF field';
    const targetConfidence = confidence(target.confidence);
    const override = options.overrides?.[target.id];

    if (target.ignoredReason === 'signature_skipped' || override?.ignored) {
      return {
        id: target.id,
        page: target.page,
        rect: target.rect,
        widgetType: target.widgetType,
        label,
        value: null,
        displayValue: '',
        status: 'skipped',
        sourceLabel: 'Skipped',
        explanation: 'Signature fields are skipped in this version.',
        confidence: targetConfidence,
        editable: false,
        pdfField: target.pdfField
      };
    }

    const inapplicable = notApplicableReason(target, lookup);
    if (inapplicable) {
      return {
        id: target.id,
        page: target.page,
        rect: target.rect,
        widgetType: target.widgetType,
        label,
        value: null,
        displayValue: '',
        status: 'skipped',
        sourceLabel: 'Not applicable',
        explanation: inapplicable,
        confidence: targetConfidence,
        editable: false,
        pdfField: target.pdfField
      };
    }

    const overridden = override ? overrideResolution(target, override) : null;
    const resolution = overridden ?? applyWidgetValue(target, resolveVariable(target, label, lookup));
    if (resolution.warning) warnings.push(resolution.warning);
    const missing = resolution.missing || (typeof resolution.value === 'string' && resolution.value.trim() === '');
    const status: PdfFillTargetStatus = missing
      ? target.variableKey
        ? 'needs_review'
        : 'empty'
      : 'filled';

    return {
      id: target.id,
      page: target.page,
      rect: target.rect,
      widgetType: target.widgetType,
      label,
      value: resolution.value,
      displayValue: resolution.displayValue,
      status,
      sourceLabel: resolution.sourceLabel,
      explanation: resolution.explanation,
      confidence: targetConfidence,
      editable: true,
      warning: resolution.warning?.reason,
      pdfField: target.pdfField
    };
  });

  return { resolvedLayout: { pages, targets }, warnings };
}

export function parsePdfFillOverrides(value: unknown): PdfFillOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: PdfFillOverrides = {};
  for (const [targetId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const input = raw as Record<string, unknown>;
    const override: PdfFillOverride = {};
    if ('ignored' in input) override.ignored = input.ignored === true;
    if ('value' in input && (typeof input.value === 'string' || typeof input.value === 'boolean' || input.value === null)) {
      override.value = input.value;
    }
    out[targetId] = override;
  }
  return out;
}

export function mergePdfFillOverrides(existing: PdfFillOverrides, updates: PdfFillOverrides): PdfFillOverrides {
  const next = { ...existing };
  for (const [targetId, update] of Object.entries(updates)) {
    next[targetId] = { ...next[targetId], ...update };
  }
  return next;
}

export function buildInitialPdfFill(pdf: Uint8Array, structure: PdfStructure, lookup: ProfileLookup): BuiltPdfFill {
  const fingerprint = fingerprintPdf(pdf);
  const profile = destinationProfileForFingerprint(fingerprint);
  const mappingLayout = buildPdfFillMapping(structure, fingerprint);
  const { resolvedLayout, warnings } = resolvePublicPdfFillLayout(structure.pages, mappingLayout, lookup, {
    fields: structure.fields
  });
  return {
    id: randomUUID(),
    fingerprint,
    profileTitle: profile?.title ?? null,
    mappingLayout,
    resolvedLayout,
    warnings
  };
}

export function parseMappingLayout(value: unknown): PdfMappingLayout {
  return PdfMappingLayout.parse(value);
}

export async function generateFilledPdfFromSession(
  originalPdf: Uint8Array,
  pages: PdfPageGeometry[],
  layout: PdfMappingLayout,
  lookup: ProfileLookup,
  overrides: PdfFillOverrides,
  previous: PublicPdfFillLayout | null = null
): Promise<GeneratedPdfFillValues & { bytes: Uint8Array }> {
  const { resolvedLayout, warnings } = resolvePublicPdfFillLayout(pages, layout, lookup, { overrides, previous });
  const fieldValues: Record<string, string | boolean> = {};
  const overlays: TextOverlayValue[] = [];
  const byId = new Map(resolvedLayout.targets.map((target) => [target.id, target]));

  for (const target of layout.targets) {
    if (target.ignoredReason) continue;
    const resolved = byId.get(target.id);
    if (!resolved || resolved.status !== 'filled' || resolved.value === null) continue;

    if (target.kind === 'acrofield' && target.pdfField) {
      fieldValues[target.pdfField] = resolved.value;
    } else if (target.kind === 'overlay' && typeof resolved.value === 'string') {
      overlays.push({ page: target.page, rect: target.rect, text: resolved.value, format: target.format });
    }
  }

  const acroFilled = await fillPdf(originalPdf, fieldValues, { flatten: true });
  const bytes = await drawPdfTextOverlays(acroFilled, overlays);
  return { bytes, fieldValues, overlays, resolvedLayout, warnings };
}

export function publicPdfFillUrl(baseUrl: string | undefined, clientId: string, fillId: string, kind: 'original' | 'filled'): string {
  const suffix = kind === 'original' ? 'original.pdf' : 'filled.pdf';
  return `${baseUrl ?? ''}/api/clients/${clientId}/pdf-fills/${fillId}/${suffix}`;
}
