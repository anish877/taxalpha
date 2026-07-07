import { z } from 'zod';

/**
 * Contract for the AI form-ingestion engine.
 *
 * Stage 1 (deterministic, `extract.ts`) produces `ExtractedField[]`.
 * Stage 2 (LLM, `label-fields.ts`) consumes that and produces a `FormSchema`
 * whose shape mirrors the hand-written `QUESTION_CONFIG` + step-visibility
 * contract the existing forms use — so one generic runtime can render any
 * uploaded form instead of bespoke per-form code.
 */

// ---------------------------------------------------------------------------
// Stage 1 — raw extraction
// ---------------------------------------------------------------------------

export const WidgetType = z.enum(['text', 'checkbox', 'radio', 'choice', 'signature', 'unknown']);
export type WidgetType = z.infer<typeof WidgetType>;

export const ExtractedField = z.object({
  page: z.number().int().positive(),
  /** AcroForm field name, e.g. "Check Box23" / "undefined_17". Null if unnamed. */
  fieldName: z.string().nullable(),
  type: WidgetType,
  /** [x1, y1, x2, y2] in PDF user space (bottom-left origin). */
  rect: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  /** Best-guess label from the nearest printed text (heuristic, may be wrong). */
  inferredLabel: z.string().nullable(),
  /** Surrounding words on/near the same line — the real signal for the LLM. */
  nearbyText: z.array(z.string()),
  /** Checkbox "on" export value (from the widget appearance state), if any. */
  exportValue: z.string().nullable().optional(),
  /** Authored /TU tooltip (the human label the PDF author set), if meaningful. */
  tooltip: z.string().nullable().optional(),
  /** Authoritative AcroForm field flags. */
  flags: z
    .object({
      required: z.boolean().optional(),
      readOnly: z.boolean().optional(),
      multiLine: z.boolean().optional(),
      maxLen: z.number().optional()
    })
    .optional()
});
export type ExtractedField = z.infer<typeof ExtractedField>;

// ---------------------------------------------------------------------------
// Stage 2 — labeled, runnable form schema
// ---------------------------------------------------------------------------

export const QuestionType = z.enum([
  'text',
  'textarea',
  'date',
  'number',
  'currency',
  'email',
  'phone',
  'ssn-ein',
  'single-choice-cards',
  'multi-select',
  'checkbox',
  'signature'
]);
export type QuestionType = z.infer<typeof QuestionType>;

export const ChoiceOption = z.object({
  label: z.string(),
  value: z.string(),
  /** AcroForm field this option toggles (checkboxes are one field per option). */
  pdfField: z.string().nullable()
});

/** A single answerable question, possibly mapping to one or more PDF fields. */
export const FormQuestion = z.object({
  id: z.string(),
  section: z.number().int().nonnegative(),
  title: z.string(),
  helper: z.string().nullable().optional(),
  type: QuestionType,
  required: z.boolean().default(false),
  /** For scalar fields: the AcroForm field name to write into. */
  pdfField: z.string().nullable().optional(),
  /** For choice/checkbox-group questions. */
  options: z.array(ChoiceOption).optional(),
  /**
   * Conditional visibility, e.g. "investmentType in ['LLC','Corporation']"
   * or "investor.isEntity == true". Evaluated by the generic runtime.
   */
  showIf: z.string().nullable().optional(),
  validation: z
    .object({
      pattern: z.string().optional(),
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional()
    })
    .optional(),
  /**
   * Maps a known canonical investor-profile key onto this question so the
   * cross-form memory can pre-fill it (e.g. "person.ssn", "person.address").
   */
  profileKey: z.string().nullable().optional()
});

/** A block of questions that repeats N times (e.g. Beneficial Owner 1..4). */
export const RepeatBlock = z.object({
  id: z.string(),
  section: z.number().int().nonnegative(),
  title: z.string(),
  kind: z.literal('repeat-block'),
  maxItems: z.number().int().positive(),
  showIf: z.string().nullable().optional(),
  /** Stable instance labels, e.g. ["beneficial_owner_1", ...]. */
  instances: z.array(z.string()),
  fields: z.array(FormQuestion)
});

export const SchemaItem = z.union([FormQuestion, RepeatBlock]);

export const FormSchema = z.object({
  code: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  sections: z.array(z.object({ number: z.number().int(), title: z.string() })),
  items: z.array(SchemaItem),
  pdfFieldCount: z.number().int(),
  /** Fields the LLM could not confidently map — surfaced in the admin review UI. */
  unmappedFields: z.array(z.string()),
  /** Human hints (page + nearby printed text) for each unmapped field, for the review UI. */
  unmappedDetails: z
    .array(z.object({ name: z.string(), page: z.number().int(), hint: z.string() }))
    .optional()
});
export type FormSchema = z.infer<typeof FormSchema>;
export type FormQuestion = z.infer<typeof FormQuestion>;
export type RepeatBlock = z.infer<typeof RepeatBlock>;
