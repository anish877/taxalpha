import { z } from 'zod';

import { type FormSchema as FormSchemaV1 } from './schema.js';

/**
 * Enriched v2 schema (spec Part 1.2) that drives the step-wise wizard runtime.
 * v1 (schema.ts) stays parseable; `migrateV1ToV2` is a LOSSY structural lift
 * (it cannot synthesize showIf/requiredIf/subFields/repeat templates).
 */

export const SchemaVersion = z.literal(2);

export const ChoiceOptionV2 = z.object({
  label: z.string(),
  value: z.string(), // stable key = one-hot map key
  description: z.string().nullable().optional(),
  pdfField: z.string().nullable(),
  required: z.boolean().default(false),
  mapping: z
    .object({
      reason: z.string().optional(),
      evidence: z.string().optional(),
      source: z.string().optional(),
      confidence: z.number().min(0).max(1).nullable().optional()
    })
    .optional()
});
export type ChoiceOptionV2 = z.infer<typeof ChoiceOptionV2>;

export const QuestionValidation = z.object({
  pattern: z.string().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  rule: z
    .enum([
      'requiredString', 'requiredDate', 'pastDate', 'notFutureDate',
      'email', 'phone', 'ssn', 'ein', 'ssnOrEin',
      'nonNegativeNumber', 'positiveNumber', 'integer',
      'countryCode2', 'noPoBox',
      'singleChoiceExactlyOne', 'multiSelectAtLeastOne', 'allRequiredChecks'
    ])
    .optional(),
  crossField: z
    .array(z.object({ when: z.string(), error: z.string(), target: z.string() }))
    .optional()
});

export const QuestionTypeV2 = z.enum([
  'text', 'textarea', 'date', 'number', 'currency', 'email', 'phone', 'ssn-ein',
  'single-choice-cards', 'multi-select', 'checkbox', 'signature',
  'address-block', 'phones-block', 'signature-block', 'range-bracket',
  'photo-id-block', 'investment-knowledge-block', 'certification-checklist', 'repeat-block-ref'
]);
export type QuestionTypeV2 = z.infer<typeof QuestionTypeV2>;

export const SubField = z.object({
  key: z.string(),
  label: z.string(),
  type: QuestionTypeV2,
  required: z.boolean().default(false),
  pdfField: z.string().nullable().optional(),
  canonicalField: z.string().nullable().optional(),
  sameAsCanonical: z.string().nullable().optional(),
  validation: QuestionValidation.optional(),
  mapping: z
    .object({
      reason: z.string().optional(),
      evidence: z.string().optional(),
      source: z.string().optional(),
      confidence: z.number().min(0).max(1).nullable().optional()
    })
    .optional(),
  autofill: z
    .object({
      canonicalField: z.string(),
      reason: z.string(),
      source: z.string().optional()
    })
    .nullable()
    .optional()
});
export type SubField = z.infer<typeof SubField>;

export const FormQuestionV2 = z.object({
  id: z.string(),
  step: z.number().int().positive(),
  order: z.number().int().nonnegative(),
  title: z.string(),
  helper: z.string().nullable().optional(),
  type: QuestionTypeV2,
  required: z.boolean().default(false),
  pdfField: z.string().nullable().optional(),
  options: z.array(ChoiceOptionV2).optional(),
  showIf: z.string().nullable().optional(),
  validation: QuestionValidation.optional(),
  canonicalField: z.string().nullable().optional(),
  subFields: z.array(SubField).optional(),
  fieldErrorKey: z.string().optional(),
  mapping: z
    .object({
      reason: z.string().optional(),
      evidence: z.string().optional(),
      source: z.string().optional(),
      confidence: z.number().min(0).max(1).nullable().optional()
    })
    .optional(),
  autofill: z
    .object({
      canonicalField: z.string(),
      reason: z.string(),
      source: z.string().optional()
    })
    .nullable()
    .optional()
});
export type FormQuestionV2 = z.infer<typeof FormQuestionV2>;

export const RepeatBlockV2 = z.object({
  id: z.string(),
  step: z.number().int().positive(),
  order: z.number().int().nonnegative(),
  title: z.string(),
  kind: z.literal('repeat-block'),
  minItems: z.number().int().nonnegative().default(1),
  maxItems: z.number().int().positive(),
  showIf: z.string().nullable().optional(),
  fields: z.array(FormQuestionV2),
  instanceOverrides: z
    .record(
      z.string(),
      z.array(
        z.object({
          fieldId: z.string(),
          patch: z.object({
            options: z.array(ChoiceOptionV2).optional(),
            required: z.boolean().optional(),
            showIf: z.string().nullable().optional(),
            title: z.string().optional()
          })
        })
      )
    )
    .optional(),
  instancePdfFieldMap: z.record(z.string(), z.array(z.string())).optional(),
  canonicalField: z.string().nullable().optional()
});
export type RepeatBlockV2 = z.infer<typeof RepeatBlockV2>;

export const SchemaItemV2 = z.union([FormQuestionV2, RepeatBlockV2]);
export type SchemaItemV2 = z.infer<typeof SchemaItemV2>;

export const PdfMappingRect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive()
});
export type PdfMappingRect = z.infer<typeof PdfMappingRect>;

export const PdfMappingTarget = z.object({
  id: z.string(),
  kind: z.enum(['acrofield', 'overlay']),
  page: z.number().int().positive(),
  rect: PdfMappingRect,
  pdfField: z.string().nullable().optional(),
  widgetType: z.enum(['text', 'checkbox', 'choice']),
  variableKey: z.string().nullable().optional(),
  optionValue: z.string().nullable().optional(),
  format: z.enum(['text', 'date', 'currency', 'phone', 'tin', 'ssn']).optional(),
  required: z.boolean().optional(),
  source: z.enum(['ai', 'admin']),
  confidence: z.number().min(0).max(1).nullable().optional(),
  ignoredReason: z.enum(['signature_skipped', 'admin_ignored']).optional()
});
export type PdfMappingTarget = z.infer<typeof PdfMappingTarget>;

export const PdfMappingLayout = z.object({
  version: z.literal(1),
  targets: z.array(PdfMappingTarget)
});
export type PdfMappingLayout = z.infer<typeof PdfMappingLayout>;

export const FormStep = z.object({
  number: z.number().int().positive(),
  key: z.string(),
  label: z.string(),
  requiredIf: z.string().nullable().optional(),
  emits: z.array(z.enum(['requiresStep4', 'requiresJointOwnerSignature', 'nextRouteAfterCompletion'])).optional(),
  isTerminal: z.boolean().default(false)
});
export type FormStep = z.infer<typeof FormStep>;

export const FormSchemaV2 = z.object({
  version: SchemaVersion,
  code: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  steps: z.array(FormStep),
  items: z.array(SchemaItemV2),
  pdfFieldCount: z.number().int(),
  unmappedFields: z.array(z.string()),
  unmappedDetails: z
    .array(
      z.object({
        name: z.string(),
        page: z.number().int(),
        hint: z.string(),
        category: z.string().optional(),
        reason: z.string().optional(),
        recommendedAction: z.string().optional(),
        source: z.string().optional(),
        confidence: z.number().min(0).max(1).nullable().optional()
      })
    )
    .optional(),
  mappingSummary: z
    .object({
      totalFields: z.number().int().nonnegative(),
      mappedFields: z.number().int().nonnegative(),
      unmappedFields: z.number().int().nonnegative(),
      mappedPercent: z.number().min(0).max(100),
      questions: z.number().int().nonnegative(),
      autofillReadyFields: z.number().int().nonnegative(),
      recoveredByExpansion: z.number().int().nonnegative().optional(),
      recoveredBySecondPass: z.number().int().nonnegative().optional()
    })
    .optional(),
  analysisReport: z
    .object({
      headline: z.string(),
      plainSummary: z.string(),
      mappedSummary: z.string(),
      unmappedSummary: z.string(),
      autofillSummary: z.string(),
      reviewPriority: z.string(),
      nextSteps: z.array(z.string())
    })
    .optional(),
  mappingLayout: PdfMappingLayout.optional(),
  clarifications: z.array(z.object({ id: z.string(), question: z.string(), answer: z.string() })).optional()
});
export type FormSchemaV2 = z.infer<typeof FormSchemaV2>;

export function isRepeatBlock(item: SchemaItemV2): item is RepeatBlockV2 {
  return (item as RepeatBlockV2).kind === 'repeat-block';
}

/**
 * LOSSY structural lift v1 → v2 (spec Phase 0). Promotes sections→steps and
 * section→step; carries profileKey→canonicalField. It deliberately does NOT
 * invent showIf/requiredIf/subFields/order beyond positional, repeat templates,
 * or option encoding — those require the real ingestion pipeline.
 */
export function migrateV1ToV2(v1: FormSchemaV1): FormSchemaV2 {
  const sections = v1.sections.length > 0 ? v1.sections : [{ number: 1, title: v1.title }];
  const steps: FormStep[] = sections.map((s) => ({
    number: Math.max(1, s.number || 1),
    key: `STEP_${Math.max(1, s.number || 1)}`,
    label: s.title,
    isTerminal: false
  }));
  const stepNumbers = new Set(steps.map((s) => s.number));

  const perStepOrder = new Map<number, number>();
  const items: SchemaItemV2[] = [];
  for (const it of v1.items) {
    // v1 RepeatBlock has `kind:'repeat-block'`; v1 FormQuestion has a `type`.
    const anyIt = it as unknown as Record<string, unknown>;
    const rawStep = typeof anyIt.section === 'number' ? (anyIt.section as number) : 1;
    const step = stepNumbers.has(rawStep) ? rawStep : 1;
    const order = perStepOrder.get(step) ?? 0;
    perStepOrder.set(step, order + 1);

    if (anyIt.kind === 'repeat-block') {
      items.push({
        id: String(anyIt.id),
        step,
        order,
        title: String(anyIt.title ?? 'Repeated section'),
        kind: 'repeat-block',
        minItems: 1,
        maxItems: typeof anyIt.maxItems === 'number' ? (anyIt.maxItems as number) : 4,
        fields: [],
        canonicalField: null
      });
      continue;
    }

    const opts = Array.isArray(anyIt.options)
      ? (anyIt.options as Array<{ label: string; value: string; pdfField: string | null }>).map((o) => ({
          label: o.label,
          value: o.value,
          pdfField: o.pdfField ?? null,
          required: false
        }))
      : undefined;

    items.push({
      id: String(anyIt.id),
      step,
      order,
      title: String(anyIt.title ?? ''),
      helper: (anyIt.helper as string | null) ?? null,
      type: (QuestionTypeV2.options as readonly string[]).includes(String(anyIt.type))
        ? (anyIt.type as QuestionTypeV2)
        : 'text',
      required: Boolean(anyIt.required),
      pdfField: (anyIt.pdfField as string | null) ?? null,
      options: opts,
      showIf: (anyIt.showIf as string | null) ?? null,
      canonicalField: (anyIt.profileKey as string | null) ?? null
    });
  }

  return {
    version: 2,
    code: v1.code,
    title: v1.title,
    description: v1.description ?? null,
    steps,
    items,
    pdfFieldCount: v1.pdfFieldCount,
    unmappedFields: v1.unmappedFields,
    unmappedDetails: v1.unmappedDetails
  };
}
