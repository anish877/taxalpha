import type { ExtractedField } from './schema.js';
import { isRepeatBlock, type FormQuestionV2, type FormSchemaV2 } from './schema-v2.js';

/**
 * Deterministic required-ness recovery (any form).
 *
 * The LLM often leaves a field `required:false` even when the PDF literally
 * prints "(REQUIRED)" next to it (e.g. "Broker-Dealer Principal Approval
 * Signature (REQUIRED)"). We scan each question's title + its widget's printed
 * nearby text and force `required:true` when "(required)" appears. Pure.
 */
const REQUIRED_RE = /\(\s*required\s*\)|\brequired\b\s*[:*]/i;

export function applyRequiredHints(schema: FormSchemaV2, extracted: ExtractedField[]): { schema: FormSchemaV2; changed: number } {
  const textByField = new Map<string, string>();
  const requiredFlag = new Set<string>();
  for (const f of extracted) {
    if (!f.fieldName) continue;
    textByField.set(f.fieldName, `${f.inferredLabel ?? ''} ${f.nearbyText.join(' ')}`);
    if (f.flags?.required) requiredFlag.add(f.fieldName);
  }
  let changed = 0;

  const fieldSaysRequired = (q: { title?: string; pdfField?: string | null; subFields?: Array<{ pdfField?: string | null }> }): boolean => {
    // authoritative PDF /Ff required flag
    if (q.pdfField && requiredFlag.has(q.pdfField)) return true;
    for (const sf of q.subFields ?? []) if (sf.pdfField && requiredFlag.has(sf.pdfField)) return true;
    // printed "(REQUIRED)" marker
    if (q.title && REQUIRED_RE.test(q.title)) return true;
    if (q.pdfField && REQUIRED_RE.test(textByField.get(q.pdfField) ?? '')) return true;
    for (const sf of q.subFields ?? []) if (sf.pdfField && REQUIRED_RE.test(textByField.get(sf.pdfField) ?? '')) return true;
    return false;
  };

  const items = schema.items.map((it) => {
    if (isRepeatBlock(it)) return it;
    const q = it as FormQuestionV2;
    if (!q.required && fieldSaysRequired(q)) {
      changed += 1;
      return { ...q, required: true };
    }
    return q;
  });

  return { schema: { ...schema, items }, changed };
}
