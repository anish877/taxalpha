import { baseName, instanceOf, isGarbageBase } from './expand-repeats.js';
import type { ExtractedField } from './schema.js';
import { isRepeatBlock, type FormQuestionV2, type FormSchemaV2 } from './schema-v2.js';

/**
 * Deterministic repeat-instance recovery for v2 (no AI).
 *
 * The LLM maps the FIRST instance of a repeated owner/contact field (e.g. PDF
 * box "Home", "Phone Business", "...TIN", "Email Address") but skips the
 * duplicate instances ("Home_2", "Phone Business_5", "...TIN_3") because their
 * names are meaningless. Those siblings share a base name with a mapped field,
 * differing only by a trailing "_<n>". We stamp the mapped field's semantics
 * onto every sibling so they become real, fillable questions.
 *
 * Garbage bases (undefined, Check Box\d, Text\d, bare numbers) are NEVER
 * expanded — they go to human review.
 *
 * canonicalField is intentionally DROPPED on expanded instances: instance 2+ is
 * a different party (joint owner, beneficial owner N) and must not auto-fill
 * from the primary person's canonical value.
 */
interface Template {
  idBase: string;
  step: number;
  type: FormQuestionV2['type'];
  title: string;
  ownPdfField: string;
}

export interface ExpansionV2Result {
  schema: FormSchemaV2;
  recovered: string[];
}

function mappedFieldNames(schema: FormSchemaV2): Set<string> {
  const set = new Set<string>();
  for (const it of schema.items) {
    const q = it as FormQuestionV2;
    if (typeof q.pdfField === 'string' && q.pdfField) set.add(q.pdfField);
    for (const o of q.options ?? []) if (o.pdfField) set.add(o.pdfField);
    for (const sf of q.subFields ?? []) if (sf.pdfField) set.add(sf.pdfField);
    if (isRepeatBlock(it)) for (const f of it.fields) if (f.pdfField) set.add(f.pdfField);
  }
  return set;
}

/** base name -> the lowest-instance mapped template that owns it. */
function buildTemplates(schema: FormSchemaV2): Map<string, Template> {
  const templates = new Map<string, Template>();
  const consider = (idBase: string, step: number, type: FormQuestionV2['type'], title: string, pdfField: string) => {
    const base = baseName(pdfField);
    if (isGarbageBase(base)) return;
    const existing = templates.get(base);
    if (!existing || instanceOf(pdfField) < instanceOf(existing.ownPdfField)) {
      templates.set(base, { idBase, step, type, title, ownPdfField: pdfField });
    }
  };
  for (const it of schema.items) {
    if (isRepeatBlock(it)) continue;
    const q = it as FormQuestionV2;
    if (typeof q.pdfField === 'string' && q.pdfField) consider(q.id, q.step, q.type, q.title, q.pdfField);
    for (const sf of q.subFields ?? []) {
      if (sf.pdfField) consider(`${q.id}.${sf.key}`, q.step, sf.type, `${q.title} — ${sf.label}`, sf.pdfField);
    }
  }
  return templates;
}

export function expandRepeatsV2(schema: FormSchemaV2, extracted: ExtractedField[]): ExpansionV2Result {
  const templates = buildTemplates(schema);
  const mapped = mappedFieldNames(schema);

  const maxOrderByStep = new Map<number, number>();
  for (const it of schema.items) maxOrderByStep.set(it.step, Math.max(maxOrderByStep.get(it.step) ?? -1, it.order));

  const newItems: FormQuestionV2[] = [];
  const recovered: string[] = [];

  for (const field of extracted) {
    const name = field.fieldName;
    if (!name || mapped.has(name)) continue;
    const base = baseName(name);
    if (isGarbageBase(base)) continue;
    const t = templates.get(base);
    if (!t || t.ownPdfField === name) continue;

    const inst = instanceOf(name);
    const nextOrder = (maxOrderByStep.get(t.step) ?? -1) + 1;
    maxOrderByStep.set(t.step, nextOrder);
    newItems.push({
      id: `${t.idBase}__i${inst}`.replace(/[^a-zA-Z0-9_.]+/g, '_'),
      step: t.step,
      order: nextOrder,
      title: `${t.title} (${inst})`,
      helper: 'Auto-recovered repeated field — confirm which owner/party this belongs to.',
      type: t.type,
      required: false,
      pdfField: name,
      canonicalField: null
    });
    mapped.add(name);
    recovered.push(name);
  }

  const items = [...schema.items, ...newItems];
  const unmappedFields = schema.unmappedFields.filter((f) => !mapped.has(f));
  return { schema: { ...schema, items, unmappedFields }, recovered };
}
