import type { ExtractedField, FormQuestion, FormSchema } from './schema.js';

/**
 * Deterministic repeat-block expansion (no AI).
 *
 * The LLM reliably labels the FIRST instance of a repeated person/owner block
 * (e.g. AcroForm field "Name", "Phone Business", "...TIN") but skips the
 * duplicate instances ("Name_4", "Phone Business_5", "...TIN_3") because their
 * names carry no meaning on their own. Those duplicates share a base name with
 * the mapped instance, differing only by a trailing "_<n>" counter. We detect
 * that pattern and stamp the mapped instance's semantics onto every sibling.
 *
 * Garbage bases (e.g. "undefined", "Text12", "Check Box3", bare numbers) are
 * NOT semantically uniform and are deliberately left for human review.
 */

/** Strip a single trailing "_<digits>" counter. "Name_4" -> "Name", "Name" -> "Name". */
export function baseName(name: string): string {
  return name.replace(/_\d+$/, '');
}

/** The instance counter encoded in the suffix. "Name" -> 1, "Name_4" -> 4. */
export function instanceOf(name: string): number {
  const m = name.match(/_(\d+)$/);
  return m ? Number(m[1]) : 1;
}

/** Bases we refuse to treat as a meaningful repeated field. */
export function isGarbageBase(base: string): boolean {
  const b = base.trim();
  if (b.length < 3) return true;
  if (/^undefined$/i.test(b)) return true;
  if (/^(text|check\s*box|button|field|untitled)\s*\d*$/i.test(b)) return true;
  if (/^\d+$/.test(b)) return true; // bare numbers like "1", "2"
  return false;
}

export interface ExpansionResult {
  schema: FormSchema;
  /** AcroForm field names newly mapped by expansion. */
  recovered: string[];
}

/**
 * Collect, for each scalar item that maps to a single AcroForm field, a usable
 * "template" keyed by the field's base name.
 */
function buildTemplates(items: FormSchema['items']): Map<string, FormQuestion> {
  const templates = new Map<string, FormQuestion>();
  for (const item of items) {
    // Only scalar questions (single pdfField) are templates — not choice groups
    // or repeat-blocks.
    if (!('pdfField' in item)) continue;
    const q = item as FormQuestion;
    if (typeof q.pdfField !== 'string' || !q.pdfField) continue;
    const base = baseName(q.pdfField);
    if (isGarbageBase(base)) continue;
    // Prefer the lowest-instance mapped field as the template.
    const existing = templates.get(base);
    if (!existing || instanceOf(q.pdfField) < instanceOf(existing.pdfField as string)) {
      templates.set(base, q);
    }
  }
  return templates;
}

function mappedFieldNames(items: FormSchema['items']): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    const q = item as FormQuestion;
    if (typeof q.pdfField === 'string' && q.pdfField) set.add(q.pdfField);
    const opts = q.options;
    opts?.forEach((o) => o.pdfField && set.add(o.pdfField));
  }
  return set;
}

export function expandRepeats(schema: FormSchema, extracted: ExtractedField[]): ExpansionResult {
  const templates = buildTemplates(schema.items);
  const mapped = mappedFieldNames(schema.items);
  const newItems: FormQuestion[] = [];
  const recovered: string[] = [];

  for (const field of extracted) {
    const name = field.fieldName;
    if (!name || mapped.has(name)) continue;
    const base = baseName(name);
    if (isGarbageBase(base)) continue;
    const template = templates.get(base);
    if (!template) continue;
    // Don't re-map the template's own field.
    if (template.pdfField === name) continue;

    const inst = instanceOf(name);
    newItems.push({
      id: `${template.id}__i${inst}`,
      section: template.section,
      title: `${template.title} (instance ${inst})`,
      helper: `Auto-expanded repeat of "${template.title}". Verify the owner this belongs to.`,
      type: template.type,
      required: false,
      pdfField: name,
      showIf: template.showIf ?? null,
      profileKey: template.profileKey ?? null
    });
    mapped.add(name);
    recovered.push(name);
  }

  const items = [...schema.items, ...newItems];
  const stillMapped = mappedFieldNames(items);
  const unmappedFields = schema.unmappedFields.filter((f) => !stillMapped.has(f));

  return { schema: { ...schema, items, unmappedFields }, recovered };
}
