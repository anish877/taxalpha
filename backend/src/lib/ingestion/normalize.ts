import type { FormSchema, QuestionType } from './schema.js';

/**
 * Coerce the LLM's free-form JSON into our FormSchema contract.
 *
 * Models drift on key names and nesting (e.g. `sections[].questions[]` vs a flat
 * `items` list, `questionId` vs `id`, `pdfMapping.pdfField` vs `pdfField`).
 * Rather than force strict structured output (support varies per model on
 * OpenRouter), we accept the common variants here. This keeps the good content
 * the model produces and only fixes the shape.
 */

type Any = Record<string, unknown>;

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'field';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

const TYPE_MAP: Record<string, QuestionType> = {
  text: 'text',
  string: 'text',
  textarea: 'textarea',
  longtext: 'textarea',
  date: 'date',
  number: 'number',
  numeric: 'number',
  currency: 'currency',
  money: 'currency',
  email: 'email',
  phone: 'phone',
  tel: 'phone',
  ssn: 'ssn-ein',
  tin: 'ssn-ein',
  ein: 'ssn-ein',
  'ssn-ein': 'ssn-ein',
  'single-choice-cards': 'single-choice-cards',
  'single-choice': 'single-choice-cards',
  radio: 'single-choice-cards',
  select: 'single-choice-cards',
  'multi-select': 'multi-select',
  'checkbox-group': 'multi-select',
  multiselect: 'multi-select',
  checkbox: 'checkbox',
  boolean: 'checkbox',
  signature: 'signature',
  sign: 'signature'
};

const mapType = (t: unknown): QuestionType => TYPE_MAP[String(t ?? '').toLowerCase()] ?? 'text';

const pickPdfField = (q: Any): string | null =>
  str(q.pdfField) ?? str((q.pdfMapping as Any)?.pdfField) ?? str(q.acroField) ?? null;

function isYearsEmployedQuestion(q: Any, title: string, id: string): boolean {
  const hint = [
    title,
    id,
    str(q.label),
    str(q.question),
    str(q.profileKey),
    str(q.canonicalKey),
    str(q.canonicalField),
    str(q.fieldName),
    pickPdfField(q)
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();

  return /\byears?\s+(employed|employment)\b/.test(hint) || /\bemployment\s+years?\b/.test(hint);
}

function normalizeQuestionType(q: Any, title: string, id: string): QuestionType {
  const type = mapType(q.type ?? q.questionType ?? q.fieldType);
  return isYearsEmployedQuestion(q, title, id) ? 'number' : type;
}

const pickShowIf = (q: Any): string | null => {
  const v = q.showIf ?? q.visibleWhen ?? q.condition ?? q.dependsOn;
  if (typeof v === 'string') return v.trim() || null;
  if (v && typeof v === 'object') return JSON.stringify(v);
  return null;
};

function normOption(o: Any): { label: string; value: string; pdfField: string | null } {
  const label = str(o.label) ?? str(o.title) ?? str(o.text) ?? str(o.value) ?? 'Option';
  const value = str(o.value) ?? str(o.optionId) ?? str(o.id) ?? slug(label);
  return { label, value, pdfField: pickPdfField(o) };
}

function normQuestion(q: Any, section: number): Any {
  const title = str(q.title) ?? str(q.label) ?? str(q.question) ?? 'Untitled question';
  const id = str(q.id) ?? str(q.questionId) ?? str(q.key) ?? slug(title);
  const rawOptions = (q.options ?? q.choices ?? q.cards) as Any[] | undefined;
  const out: Any = {
    id,
    section,
    title,
    helper: str(q.helper) ?? str(q.description) ?? null,
    type: normalizeQuestionType(q, title, id),
    required: Boolean(q.required ?? q.isRequired ?? false),
    pdfField: pickPdfField(q),
    showIf: pickShowIf(q),
    profileKey: str(q.profileKey) ?? str(q.canonicalKey) ?? null
  };
  if (Array.isArray(rawOptions)) out.options = rawOptions.map(normOption);
  return out;
}

/** Flatten whatever container the model used into a single question list. */
function collectQuestions(root: Any): Array<{ q: Any; section: number; sectionTitle: string }> {
  const result: Array<{ q: Any; section: number; sectionTitle: string }> = [];

  const sections = (root.sections ?? root.formSections) as Any[] | undefined;
  if (Array.isArray(sections)) {
    sections.forEach((s, i) => {
      const sectionNum = typeof s.order === 'number' ? s.order : i + 1;
      const sectionTitle = str(s.title) ?? str(s.name) ?? `Section ${sectionNum}`;
      const qs = (s.questions ?? s.fields ?? s.items) as Any[] | undefined;
      if (Array.isArray(qs)) qs.forEach((q) => result.push({ q, section: sectionNum, sectionTitle }));
    });
  }

  const flat = (root.items ?? root.questions ?? root.fields) as Any[] | undefined;
  if (Array.isArray(flat)) {
    flat.forEach((q) => {
      const section = typeof q.section === 'number' ? q.section : 0;
      result.push({ q, section, sectionTitle: str(q.sectionTitle) ?? `Section ${section}` });
    });
  }

  return result;
}

export function normalizeToFormSchema(raw: unknown, allPdfFields: string[]): FormSchema {
  const root = (raw ?? {}) as Any;
  const meta = (root.formMetadata ?? root.metadata ?? {}) as Any;

  const title =
    str(root.title) ?? str(meta.formTitle) ?? str(root.formTitle) ?? 'Untitled form';
  const code = str(root.code) ?? str(meta.formCode) ?? slug(title).toUpperCase();
  const description = str(root.description) ?? str(meta.description) ?? null;

  const collected = collectQuestions(root);
  const items = collected.map(({ q, section }) => normQuestion(q, section));

  // Derive sections list from what we saw.
  const sectionMap = new Map<number, string>();
  collected.forEach(({ section, sectionTitle }) => {
    if (!sectionMap.has(section)) sectionMap.set(section, sectionTitle);
  });
  const sections = [...sectionMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, t]) => ({ number, title: t }));

  // Which AcroForm fields did we actually map? The rest are "unmapped".
  const mapped = new Set<string>();
  for (const it of items) {
    if (typeof it.pdfField === 'string') mapped.add(it.pdfField);
    const opts = it.options as Array<{ pdfField: string | null }> | undefined;
    opts?.forEach((o) => o.pdfField && mapped.add(o.pdfField));
  }
  const unmappedFields = allPdfFields.filter((f) => !mapped.has(f));

  return {
    code,
    title,
    description,
    sections,
    items: items as FormSchema['items'],
    pdfFieldCount: allPdfFields.length,
    unmappedFields
  };
}
