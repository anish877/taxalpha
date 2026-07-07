import { createHash, randomUUID } from 'node:crypto';

import type { ProfileLookup } from '../dynamic-step-engine.js';
import type { PdfPageGeometry, PdfStructure } from '../ingestion/extract.js';
import { chatCompletion, type OpenRouterOptions } from '../ingestion/openrouter.js';
import type { ExtractedField } from '../ingestion/schema.js';
import { PdfMappingLayout, type PdfMappingRect, type PdfMappingTarget } from '../ingestion/schema-v2.js';
import { CANONICAL_DICTIONARY } from '../profile/canonical-dictionary.js';
import { factDefinitions } from '../profile/facts.js';
import { FORM_INTELLIGENCE_CORPUS, destinationProfileForFingerprint } from './form-intelligence.js';
import { resolvePublicPdfFillLayout, type BuiltPdfFill } from './engine.js';

type AiFormat = 'text' | 'date' | 'currency' | 'phone' | 'tin' | 'ssn';

interface AiFieldDecision {
  fieldIndex: number;
  label: string;
  variableKey: string | null;
  optionValue?: string | null;
  format?: AiFormat | null;
  confidence: number;
  ignoredReason?: 'signature_skipped' | null;
}

interface AiPdfMappingResponse {
  decisions: AiFieldDecision[];
}

function fingerprintPdf(pdf: Uint8Array): string {
  return createHash('sha256').update(pdf).digest('hex');
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

function stripFences(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (match ? match[1]! : trimmed).trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

function allowedVariableKeys(): Set<string> {
  const keys = new Set<string>();
  for (const key of Object.keys(CANONICAL_DICTIONARY)) {
    if (!key.startsWith('signature.')) keys.add(`canonical:${key}`);
  }
  for (const fact of factDefinitions()) keys.add(`fact:${fact.key}`);
  return keys;
}

function lookupSummary(lookup: ProfileLookup): Array<{ key: string; source: string; valueType: string; hasValue: boolean }> {
  return Object.entries(lookup)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => ({
      key,
      source: entry.sourceFormCode,
      valueType: Array.isArray(entry.value) ? 'array' : typeof entry.value,
      hasValue: entry.value !== undefined && entry.value !== null && entry.value !== ''
    }));
}

function buildPrompt(structure: PdfStructure, fingerprint: string, lookup: ProfileLookup): string {
  const profile = destinationProfileForFingerprint(fingerprint);
  const variables = [
    ...Object.keys(CANONICAL_DICTIONARY)
      .filter((key) => !key.startsWith('signature.'))
      .map((key) => ({ key: `canonical:${key}`, kind: 'canonical' })),
    ...factDefinitions().map((fact) => ({
      key: `fact:${fact.key}`,
      kind: 'fact',
      label: fact.label,
      ruleSummary: fact.ruleSummary,
      sourceForms: fact.sourceForms,
      reviewSensitive: Boolean(fact.reviewSensitive)
    }))
  ];
  return JSON.stringify(
    {
      task:
        'Map every extracted PDF field to the best internal data/fact key before PDF filling. Return exactly one decision for every fieldIndex. Do not invent keys. Use null when no safe mapping exists. Signature fields and signature-adjacent printed-name/date fields must be ignored with ignoredReason signature_skipped. Legal/evidence-heavy accreditation conclusions should map only to review-sensitive facts, not raw guesses.',
      fingerprint,
      knownProfileContext: profile
        ? {
            title: profile.title,
            skipRules: profile.skipRules,
            signatureZones: profile.signatureZones
          }
        : null,
      sourceCorpus: FORM_INTELLIGENCE_CORPUS.sourceForms,
      availableVariables: variables,
      resolvedClientDataSummary: lookupSummary(lookup),
      pages: structure.pages,
      fields: structure.fields.map((field, fieldIndex) => ({
        fieldIndex,
        page: field.page,
        fieldName: field.fieldName,
        type: field.type,
        rect: field.rect,
        inferredLabel: field.inferredLabel,
        tooltip: field.tooltip ?? null,
        nearbyText: field.nearbyText,
        exportValue: field.exportValue ?? null,
        required: field.flags?.required ?? false
      })),
      outputContract: {
        decisions:
          'Array length must equal fields.length. Each decision has fieldIndex, label, variableKey|null, optionValue|null, format|null, confidence 0..1, ignoredReason|null.'
      }
    },
    null,
    2
  );
}

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decisions'],
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fieldIndex', 'label', 'variableKey', 'confidence'],
        properties: {
          fieldIndex: { type: 'integer', minimum: 0 },
          label: { type: 'string' },
          variableKey: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          optionValue: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          format: { anyOf: [{ enum: ['text', 'date', 'currency', 'phone', 'tin', 'ssn'] }, { type: 'null' }] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          ignoredReason: { anyOf: [{ enum: ['signature_skipped'] }, { type: 'null' }] }
        }
      }
    }
  }
};

function parseAiResponse(raw: string): AiPdfMappingResponse {
  const parsed = JSON.parse(stripFences(raw)) as AiPdfMappingResponse;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.decisions)) {
    throw new Error('AI PDF mapper returned invalid JSON shape.');
  }
  return parsed;
}

function validateDecisions(response: AiPdfMappingResponse, structure: PdfStructure): Map<number, AiFieldDecision> {
  const allowedKeys = allowedVariableKeys();
  const byIndex = new Map<number, AiFieldDecision>();
  for (const decision of response.decisions) {
    if (!Number.isInteger(decision.fieldIndex) || decision.fieldIndex < 0 || decision.fieldIndex >= structure.fields.length) {
      throw new Error(`AI PDF mapper returned invalid fieldIndex ${String(decision.fieldIndex)}.`);
    }
    if (byIndex.has(decision.fieldIndex)) throw new Error(`AI PDF mapper duplicated fieldIndex ${decision.fieldIndex}.`);
    if (decision.variableKey && !allowedKeys.has(decision.variableKey)) {
      throw new Error(`AI PDF mapper returned unknown variable key ${decision.variableKey}.`);
    }
    if (decision.ignoredReason && decision.ignoredReason !== 'signature_skipped') {
      throw new Error(`AI PDF mapper returned unsupported ignoredReason ${decision.ignoredReason}.`);
    }
    if (typeof decision.confidence !== 'number' || decision.confidence < 0 || decision.confidence > 1) {
      throw new Error(`AI PDF mapper returned invalid confidence for fieldIndex ${decision.fieldIndex}.`);
    }
    byIndex.set(decision.fieldIndex, decision);
  }
  if (byIndex.size !== structure.fields.length) {
    throw new Error(`AI PDF mapper returned ${byIndex.size} decisions for ${structure.fields.length} fields.`);
  }
  return byIndex;
}

function decisionTarget(field: ExtractedField, index: number, decision: AiFieldDecision): PdfMappingTarget {
  const safeName = field.fieldName ?? `unnamed_${index}`;
  const skipped = decision.ignoredReason === 'signature_skipped';
  return {
    id: `${skipped ? 'skipped' : 'field'}:${slug(safeName)}:${field.page}:${index}`,
    kind: 'acrofield',
    page: field.page,
    rect: fieldRect(field.rect),
    pdfField: field.fieldName,
    widgetType: widgetType(field),
    variableKey: skipped ? null : decision.variableKey,
    optionValue: skipped ? null : decision.optionValue ?? null,
    format: skipped ? undefined : decision.format ?? (field.type === 'text' ? 'text' : undefined),
    required: field.flags?.required,
    source: 'ai',
    confidence: skipped ? null : decision.confidence,
    ignoredReason: skipped ? 'signature_skipped' : undefined
  };
}

export async function buildAiPdfFill(
  pdf: Uint8Array,
  structure: PdfStructure,
  lookup: ProfileLookup,
  opts: OpenRouterOptions
): Promise<BuiltPdfFill> {
  const fingerprint = fingerprintPdf(pdf);
  const profile = destinationProfileForFingerprint(fingerprint);
  const raw = await chatCompletion(
    [
      {
        role: 'system',
        content:
          'You are TaxAlpha PDF field mapper. Think carefully, then return strict JSON only. You map PDF fields to existing client-data keys before filling. Never guess legal conclusions. Never map signatures.'
      },
      { role: 'user', content: buildPrompt(structure, fingerprint, lookup) }
    ],
    {
      ...opts,
      temperature: 0,
      maxTokens: 64000,
      jsonSchema: { name: 'direct_pdf_field_mapping', schema: RESPONSE_SCHEMA }
    }
  );
  const decisions = validateDecisions(parseAiResponse(raw), structure);
  const mappingLayout = PdfMappingLayout.parse({
    version: 1,
    targets: structure.fields.map((field, index) => decisionTarget(field, index, decisions.get(index)!))
  });
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
