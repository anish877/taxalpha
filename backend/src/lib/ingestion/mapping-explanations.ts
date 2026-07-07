import type { ExtractedField } from './schema.js';
import {
  isRepeatBlock,
  type FormQuestionV2,
  type FormSchemaV2,
  type SchemaItemV2
} from './schema-v2.js';

type MappingInfo = NonNullable<FormQuestionV2['mapping']>;
type AutofillInfo = NonNullable<FormQuestionV2['autofill']>;

export interface MappingExplanationStats {
  recoveredByExpansion?: number;
  recoveredBySecondPass?: number;
}

const TYPE_LABELS: Record<string, string> = {
  text: 'short text',
  textarea: 'long text',
  date: 'date',
  number: 'number',
  currency: 'dollar amount',
  email: 'email address',
  phone: 'phone number',
  'ssn-ein': 'SSN / tax ID',
  'single-choice-cards': 'single-choice',
  'multi-select': 'multi-select',
  checkbox: 'checkbox',
  signature: 'signature',
  'address-block': 'address block',
  'phones-block': 'phone block',
  'signature-block': 'signature block',
  'range-bracket': 'range bracket',
  'photo-id-block': 'photo ID block',
  'investment-knowledge-block': 'investment knowledge block',
  'certification-checklist': 'certification checklist',
  'repeat-block-ref': 'repeat block'
};

function cleanText(value: string | null | undefined, max = 140): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function fieldEvidence(fieldName: string, byName: Map<string, ExtractedField>): string {
  const field = byName.get(fieldName);
  if (!field) return `PDF box "${fieldName}" was present in the extracted AcroForm field list.`;
  const label = cleanText(field.inferredLabel, 90) ?? cleanText(field.nearbyText.join(' / '), 120);
  const type = field.type ? `${field.type} widget` : 'widget';
  return label
    ? `Page ${field.page}, ${type}, near printed text "${label}".`
    : `Page ${field.page}, ${type}, with no reliable nearby printed label.`;
}

function sourceFor(itemId: string, existing?: MappingInfo): string {
  if (existing?.source) return existing.source;
  if (itemId.startsWith('recovered.')) return 'second-pass-recovery';
  if (itemId.includes('__i')) return 'repeat-expansion';
  return existing?.reason ? 'ai' : 'deterministic-explanation';
}

function confidenceFor(itemId: string, existing?: MappingInfo): number {
  if (typeof existing?.confidence === 'number') return existing.confidence;
  if (itemId.startsWith('recovered.')) return 0.72;
  if (itemId.includes('__i')) return 0.78;
  return 0.84;
}

function withMapping(
  existing: MappingInfo | undefined,
  itemId: string,
  pdfField: string | null | undefined,
  reason: string,
  byName: Map<string, ExtractedField>
): MappingInfo | undefined {
  if (!pdfField) return existing;
  return {
    reason: cleanText(existing?.reason, 260) ?? reason,
    evidence: cleanText(existing?.evidence, 240) ?? fieldEvidence(pdfField, byName),
    source: sourceFor(itemId, existing),
    confidence: confidenceFor(itemId, existing)
  };
}

function autofillFor(canonicalField: string | null | undefined, existing?: AutofillInfo | null): AutofillInfo | null {
  if (!canonicalField) return existing ?? null;
  return {
    canonicalField,
    reason:
      cleanText(existing?.reason, 260) ??
      `The ingestion tagged this as canonical field "${canonicalField}", so the runtime can prefill it from a prior completed form and will not overwrite an existing answer.`,
    source: existing?.source ?? 'canonical-field'
  };
}

function questionReason(question: FormQuestionV2, pdfField: string): string {
  const type = TYPE_LABELS[question.type] ?? question.type;
  if (question.id.startsWith('recovered.')) {
    return `Second-pass recovery matched "${pdfField}" to "${question.title}" after the main AI pass left it unmapped.`;
  }
  if (question.id.includes('__i')) {
    return `Repeat expansion mapped "${pdfField}" because its field name follows the same repeated pattern as an already-mapped "${question.title}" field.`;
  }
  return `Mapped "${pdfField}" to "${question.title}" because the widget behaves like a ${type} answer for that printed question.`;
}

function optionReason(questionTitle: string, optionLabel: string, pdfField: string): string {
  return `Mapped "${pdfField}" to option "${optionLabel}" because it is the checkbox/radio widget for that choice under "${questionTitle}".`;
}

function subFieldReason(questionTitle: string, label: string, pdfField: string): string {
  return `Mapped "${pdfField}" to "${label}" inside "${questionTitle}" because it is a smaller PDF box that belongs to the same grouped question.`;
}

function enrichQuestion(question: FormQuestionV2, byName: Map<string, ExtractedField>): FormQuestionV2 {
  const pdfField = question.pdfField ?? null;
  const mapping = withMapping(
    question.mapping,
    question.id,
    pdfField,
    pdfField ? questionReason(question, pdfField) : '',
    byName
  );
  const options = question.options?.map((option) => ({
    ...option,
    mapping: withMapping(
      option.mapping,
      question.id,
      option.pdfField,
      option.pdfField ? optionReason(question.title, option.label, option.pdfField) : '',
      byName
    )
  }));
  const subFields = question.subFields?.map((subField) => ({
    ...subField,
    mapping: withMapping(
      subField.mapping,
      question.id,
      subField.pdfField,
      subField.pdfField ? subFieldReason(question.title, subField.label, subField.pdfField) : '',
      byName
    ),
    autofill: autofillFor(subField.canonicalField, subField.autofill)
  }));

  return {
    ...question,
    mapping,
    options,
    subFields,
    autofill: autofillFor(question.canonicalField, question.autofill)
  };
}

function enrichItem(item: SchemaItemV2, byName: Map<string, ExtractedField>): SchemaItemV2 {
  if (!isRepeatBlock(item)) return enrichQuestion(item, byName);
  return {
    ...item,
    fields: item.fields.map((field) => enrichQuestion(field, byName))
  };
}

function mappedFieldNames(schema: FormSchemaV2): Set<string> {
  const fields = new Set<string>();
  const take = (name: string | null | undefined) => {
    if (name) fields.add(name);
  };
  for (const item of schema.items) {
    if (isRepeatBlock(item)) {
      for (const field of item.fields) {
        take(field.pdfField);
        for (const option of field.options ?? []) take(option.pdfField);
        for (const subField of field.subFields ?? []) take(subField.pdfField);
      }
      continue;
    }
    take(item.pdfField);
    for (const option of item.options ?? []) take(option.pdfField);
    for (const subField of item.subFields ?? []) take(subField.pdfField);
  }
  return fields;
}

function countAutofillReady(schema: FormSchemaV2): number {
  let count = 0;
  for (const item of schema.items) {
    const questions = isRepeatBlock(item) ? item.fields : [item];
    for (const question of questions) {
      if (question.canonicalField) count += 1;
      for (const subField of question.subFields ?? []) if (subField.canonicalField) count += 1;
    }
  }
  return count;
}

function unmappedReason(category: string | undefined): string {
  switch (category) {
    case 'checkbox':
      return 'Left unmapped because the pipeline could not confidently attach this checkbox to a distinct investor-facing choice after the main AI pass, repeat recovery, and second-pass recovery.';
    case 'phone':
      return 'Left unmapped because it looks like a phone fragment or continuation box, and mapping it blindly could split a phone number incorrectly.';
    case 'address':
      return 'Left unmapped because it looks like an address continuation or adjacent address fragment without enough context to place safely.';
    case 'name':
      return 'Left unmapped because the nearby text suggests a name line, but the pipeline could not tell which party or role it belongs to.';
    case 'signature':
      return 'Left unmapped because signature widgets often require a separate signing flow and should be confirmed before becoming investor questions.';
    case 'date':
      return 'Left unmapped because it looks date-like but did not have enough reliable context to attach to a specific question.';
    case 'writeIn':
      return 'Left unmapped because it appears to be a blank write-in or continuation line, which is often office-use or duplicate detail.';
    default:
      return 'Left unmapped because the final schema could not place this PDF box without risking a wrong investor-facing question.';
  }
}

function recommendedAction(category: string | undefined): string {
  if (category === 'signature') return 'Add it only if this form should collect that signature inside the web wizard.';
  if (category === 'checkbox') return 'Add it if the checkbox is a real investor election; otherwise leave it unmapped.';
  if (category === 'writeIn') return 'Leave it unmapped unless the investor must type a unique answer into this line.';
  return 'Use Add as question if investors must answer it; otherwise leave it for manual PDF review.';
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function explainUnmapped(details: Array<{ category?: string }>, count: number): string {
  if (count === 0) return 'No PDF boxes need manual review.';
  const byCategory = new Map<string, number>();
  for (const detail of details) {
    const category = detail.category ?? 'other';
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }
  const top = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, n]) => `${n} ${category === 'writeIn' ? 'blank/write-in' : category}`)
    .join(', ');
  return `${plural(count, 'box', 'boxes')} still need human review. Most look like ${top || 'unclear fields'}, so the app did not turn them into investor questions automatically.`;
}

function buildAnalysisReport(
  schema: FormSchemaV2,
  mappedFields: number,
  autofillReadyFields: number,
  stats: MappingExplanationStats
): NonNullable<FormSchemaV2['analysisReport']> {
  const totalFields = schema.pdfFieldCount;
  const unmappedFields = schema.unmappedFields.length;
  const mappedPercent = totalFields === 0 ? 100 : Math.round((mappedFields / totalFields) * 1000) / 10;
  const recovered =
    (stats.recoveredByExpansion ?? 0) + (stats.recoveredBySecondPass ?? 0);
  const nextSteps =
    unmappedFields > 0
      ? [
          'Open Needs review and add only the boxes investors truly need to answer.',
          'Use Reanalyze with context if several boxes were misunderstood.',
          'Preview the wizard before publishing so the questions feel right to a normal investor.'
        ]
      : [
          'Preview the wizard from start to finish.',
          'Publish when the questions and PDF output look correct.'
        ];

  return {
    headline:
      unmappedFields === 0
        ? `Ready for review: ${mappedPercent}% of PDF boxes are mapped.`
        : `Needs a human pass: ${mappedPercent}% mapped, ${unmappedFields} boxes still need review.`,
    plainSummary: `The AI read ${plural(totalFields, 'fillable PDF box', 'fillable PDF boxes')} and turned them into ${plural(schema.items.length, 'step-wise question')} across ${plural(schema.steps.length, 'step')}.`,
    mappedSummary: `${plural(mappedFields, 'PDF box', 'PDF boxes')} are connected to investor questions. ${recovered > 0 ? `${plural(recovered, 'box', 'boxes')} were recovered by extra cleanup passes after the first AI read.` : 'No extra recovery was needed after the first AI read.'}`,
    unmappedSummary: explainUnmapped(schema.unmappedDetails ?? [], unmappedFields),
    autofillSummary:
      autofillReadyFields > 0
        ? `${plural(autofillReadyFields, 'field')} can prefill from prior investor/profile answers when available. Prefill never overwrites something the investor already entered.`
        : 'No fields are marked safe for autofill yet.',
    reviewPriority:
      unmappedFields === 0
        ? 'Low: skim the mapped fields and preview the wizard.'
        : 'Medium: review the leftover boxes before publishing.',
    nextSteps
  };
}

export function enrichMappingExplanations(
  schema: FormSchemaV2,
  extracted: ExtractedField[],
  stats: MappingExplanationStats = {}
): FormSchemaV2 {
  const byName = new Map<string, ExtractedField>();
  for (const field of extracted) {
    if (field.fieldName) byName.set(field.fieldName, field);
  }
  const items = schema.items.map((item) => enrichItem(item, byName));
  const withItems: FormSchemaV2 = { ...schema, items };
  const mappedFields = mappedFieldNames(withItems).size;
  const unmappedDetails = (withItems.unmappedDetails ?? []).map((detail) => ({
    ...detail,
    reason: cleanText(detail.reason, 300) ?? unmappedReason(detail.category),
    recommendedAction: cleanText(detail.recommendedAction, 220) ?? recommendedAction(detail.category),
    source: detail.source ?? 'deterministic-review',
    confidence: typeof detail.confidence === 'number' ? detail.confidence : 0.7
  }));

  const totalFields = withItems.pdfFieldCount;
  const unmappedFields = withItems.unmappedFields.length;
  const autofillReadyFields = countAutofillReady(withItems);
  return {
    ...withItems,
    unmappedDetails,
    mappingSummary: {
      totalFields,
      mappedFields,
      unmappedFields,
      mappedPercent: totalFields === 0 ? 100 : Math.round((mappedFields / totalFields) * 1000) / 10,
      questions: withItems.items.length,
      autofillReadyFields,
      recoveredByExpansion: stats.recoveredByExpansion,
      recoveredBySecondPass: stats.recoveredBySecondPass
    },
    analysisReport: buildAnalysisReport(withItems, mappedFields, autofillReadyFields, stats)
  };
}
