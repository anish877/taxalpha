import type { ExtractedField } from './schema.js';
import { isRepeatBlock, type FormQuestionV2, type FormSchemaV2 } from './schema-v2.js';

/**
 * Deterministic schema sanitizer (any form) — fixes correctness defects the
 * LLM/recovery passes can introduce:
 *   1. GHOST references: a pdfField that isn't a real extracted widget → nulled.
 *   2. DUPLICATE bindings: a real widget bound by >1 element → keep the first
 *      (authored items precede appended __iN/recovered ones), null the rest.
 *   3. JUNK recovered items: a `recovered.*` item left with no valid binding
 *      (e.g. "Criterion 7" placeholder whose field got nulled) → dropped.
 *   4. unmappedFields recomputed from the real bindings that survive.
 * Pure.
 */
export interface SanitizeResult {
  schema: FormSchemaV2;
  ghostsRemoved: number;
  duplicatesRemoved: number;
  junkDropped: number;
}

const JUNK_LABEL = /^(criterion|option|item|field|checkbox|choice)\s*\d+$/i;

export function sanitizeSchema(schema: FormSchemaV2, extracted: ExtractedField[]): SanitizeResult {
  const real = new Set(extracted.map((f) => f.fieldName).filter((n): n is string => Boolean(n)));
  const seen = new Set<string>();
  let ghostsRemoved = 0;
  let duplicatesRemoved = 0;
  let junkDropped = 0;

  // returns the validated pdfField (or null) and records it as seen
  const take = (pdfField: string | null | undefined): string | null => {
    if (typeof pdfField !== 'string' || !pdfField) return null;
    if (!real.has(pdfField)) { ghostsRemoved += 1; return null; }
    if (seen.has(pdfField)) { duplicatesRemoved += 1; return null; }
    seen.add(pdfField);
    return pdfField;
  };

  const cleaned: FormSchemaV2['items'] = [];
  for (const item of schema.items) {
    if (isRepeatBlock(item)) {
      const fields = item.fields.map((f) => ({ ...f, pdfField: take(f.pdfField) }));
      cleaned.push({ ...item, fields });
      continue;
    }
    const q = item as FormQuestionV2;
    const pdfField = take(q.pdfField);
    const options = q.options?.map((o) => ({ ...o, pdfField: take(o.pdfField) }));
    const subFields = q.subFields?.map((sf) => ({ ...sf, pdfField: take(sf.pdfField) }));

    const next: FormQuestionV2 = { ...q, pdfField, options, subFields };

    // drop a recovered item that ended up bound to nothing (junk placeholder)
    const isRecovered = q.id.startsWith('recovered') || q.id.includes('__i');
    const hasBinding = Boolean(pdfField) || (options?.some((o) => o.pdfField) ?? false) || (subFields?.some((s) => s.pdfField) ?? false);
    const junkLabel = JUNK_LABEL.test(q.title.trim());
    if (isRecovered && (!hasBinding || (junkLabel && !hasBinding))) { junkDropped += 1; continue; }
    // also drop a recovered junk-labelled item even if it kept a binding but the
    // label is meaningless AND it has no options to give it meaning
    if (isRecovered && junkLabel && !(options && options.length > 1)) {
      // keep the field mapped via a generic but honest title instead of "Criterion N"
      next.title = q.title.replace(JUNK_LABEL, 'Additional field');
    }

    cleaned.push(next);
  }

  // Renumber `order` sequentially within each step (the LLM/paged merge can
  // produce duplicate orders, e.g. two items with order 1 — which breaks the
  // wizard's question sequence). Stable: preserve current relative order.
  const perStep = new Map<number, number>();
  const ordered = [...cleaned]
    .sort((a, b) => a.step - b.step || a.order - b.order)
    .map((it) => {
      const next = perStep.get(it.step) ?? 0;
      perStep.set(it.step, next + 1);
      return { ...it, order: next };
    });

  const unmappedFields = [...real].filter((n) => !seen.has(n));
  return {
    schema: { ...schema, items: ordered, unmappedFields },
    ghostsRemoved,
    duplicatesRemoved,
    junkDropped
  };
}
