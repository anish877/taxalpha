import { chatCompletion, type OpenRouterOptions } from './openrouter.js';
import type { ExtractedField } from './schema.js';
import { FormSchemaV2, type FormQuestionV2, type FormSchemaV2 as FormSchemaV2Type } from './schema-v2.js';

/**
 * Pass F — generic leftover recovery (works for ANY form).
 *
 * After the main LLM decomposition + deterministic repeat-expansion, many real
 * fillable boxes can still sit unmapped — most importantly standalone CHECKBOX
 * GROUPS (e.g. accreditation "check all that apply", direct/indirect ownership,
 * account-type radios) and orphan text fields. A focused second LLM pass folds
 * those leftovers into the EXISTING steps: clustering adjacent checkboxes into
 * one single-choice / multi-select question and mapping orphan text fields.
 *
 * Safety (deterministic, in `applyRecovery`): an addition may ONLY reference
 * pdfField names that are genuinely still-unmapped real widgets; anything
 * invented, duplicated, or already-mapped is dropped. So the LLM cannot corrupt
 * the schema — at worst it adds nothing.
 */

type Any = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'field';

const ADD_TYPES = new Set(['text', 'textarea', 'date', 'number', 'currency', 'email', 'phone', 'ssn-ein', 'single-choice-cards', 'multi-select', 'checkbox', 'signature']);

export interface RecoverResult {
  schema: FormSchemaV2Type;
  recovered: string[];
}

function mappedFieldNames(schema: FormSchemaV2Type): Set<string> {
  const set = new Set<string>();
  for (const it of schema.items) {
    const q = it as FormQuestionV2;
    if (typeof q.pdfField === 'string' && q.pdfField) set.add(q.pdfField);
    for (const o of q.options ?? []) if (o.pdfField) set.add(o.pdfField);
    for (const sf of q.subFields ?? []) if (sf.pdfField) set.add(sf.pdfField);
    const block = it as { fields?: FormQuestionV2[] };
    for (const f of block.fields ?? []) if (f.pdfField) set.add(f.pdfField);
  }
  return set;
}

/**
 * Deterministically merge LLM-proposed additions into the schema, accepting only
 * additions that map genuinely-unmapped real widgets. Pure + safe.
 */
export function applyRecovery(
  schema: FormSchemaV2Type,
  additions: Any[],
  realUnmapped: Set<string>
): RecoverResult {
  const validSteps = new Set(schema.steps.map((s) => s.number));
  const fallbackStep = schema.steps[0]?.number ?? 1;
  const maxOrder = new Map<number, number>();
  for (const it of schema.items) maxOrder.set(it.step, Math.max(maxOrder.get(it.step) ?? -1, it.order));

  const claimed = new Set<string>(); // pdfFields this pass has consumed
  // Recovery trusts the LLM to map any GENUINELY-unmapped real widget (incl.
  // cryptically-named "Check Box30" accreditation boxes). The realUnmapped guard
  // is the safety net — invented/already-mapped names are still rejected.
  const usable = (name: unknown): name is string =>
    typeof name === 'string' && realUnmapped.has(name) && !claimed.has(name);

  const newItems: FormQuestionV2[] = [];
  const recovered: string[] = [];
  const usedIds = new Set(schema.items.map((i) => i.id));

  for (const add of Array.isArray(additions) ? additions : []) {
    const a = add as Any;
    const type = ADD_TYPES.has(String(a.type)) ? String(a.type) : 'text';
    const title = str(a.title) ?? str(a.label) ?? 'Recovered field';
    const step = typeof a.step === 'number' && validSteps.has(a.step) ? a.step : fallbackStep;

    let pdfField: string | null = null;
    let options: Array<{ label: string; value: string; pdfField: string | null; required: boolean; mapping?: { reason?: string; evidence?: string; source?: string } }> | undefined;

    if (Array.isArray(a.options) && a.options.length > 0) {
      options = [];
      for (const o of a.options as Any[]) {
        const opf = o.pdfField;
        if (usable(opf)) {
          claimed.add(opf);
          recovered.push(opf);
          const label = str(o.label) ?? opf;
          options.push({
            label,
            value: str(o.value) ?? slug(label),
            pdfField: opf,
            required: Boolean(o.required),
            mapping: {
              reason:
                str((o.mapping as Any)?.reason) ??
                `Second-pass recovery matched this leftover checkbox to option "${label}".`,
              evidence: str((o.mapping as Any)?.evidence) ?? undefined,
              source: 'second-pass-recovery'
            }
          });
        }
      }
      if (options.length === 0) continue; // no real widgets → skip addition
    } else {
      if (!usable(a.pdfField)) continue;
      pdfField = a.pdfField as string;
      claimed.add(pdfField);
      recovered.push(pdfField);
    }

    let id = str(a.id) ?? `recovered.${slug(title)}`;
    while (usedIds.has(id)) id = `${id}_`;
    usedIds.add(id);
    const order = (maxOrder.get(step) ?? -1) + 1;
    maxOrder.set(step, order);

    const item: FormQuestionV2 = {
      id,
      step,
      order,
      title,
      type: type as FormQuestionV2['type'],
      required: Boolean(a.required),
      helper: 'Recovered field — confirm it belongs here.',
      pdfField,
      options,
      showIf: str(a.showIf),
      canonicalField: null,
      mapping:
        str(a.mappingReason) || str((a.mapping as Any)?.reason)
          ? {
              reason: str(a.mappingReason) ?? str((a.mapping as Any)?.reason) ?? undefined,
              evidence: str((a.mapping as Any)?.evidence) ?? undefined,
              source: 'second-pass-recovery'
            }
          : undefined
    };
    newItems.push(item);
  }

  const items = [...schema.items, ...newItems];
  const nowMapped = mappedFieldNames({ ...schema, items });
  const unmappedFields = schema.unmappedFields.filter((f) => !nowMapped.has(f));
  return { schema: { ...schema, items, unmappedFields }, recovered };
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1]! : s).trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

/** Build the focused prompt for the leftover-recovery pass. */
export function buildRecoverPrompt(schema: FormSchemaV2Type, extracted: ExtractedField[]): { system: string; user: string } {
  const byName = new Map(extracted.map((f) => [f.fieldName, f]));
  const stepList = schema.steps.map((s) => `${s.number}: ${s.label}`).join('\n');
  const candidates = schema.unmappedFields
    .map((n) => byName.get(n))
    .filter((f): f is ExtractedField => Boolean(f))
    .sort((a, b) => a.page - b.page || b.rect[1] - a.rect[1])
    .map((f) => `[${f.type}] ${f.fieldName} | p${f.page} @${f.rect.join(',')} | ${(f.inferredLabel ?? '') || f.nearbyText.join(' · ')}`.slice(0, 200))
    .join('\n');

  const system = `You finish a partially-built step-wise form by mapping its LEFTOVER PDF boxes. Output ONLY JSON.
RULES:
- Cluster ADJACENT checkboxes that share a heading into ONE question: mutually-exclusive → "single-choice-cards"; independent "check all that apply" → "multi-select". Each option's pdfField = that checkbox's field name.
- Map orphan text/date/phone boxes to a single scalar question in the most fitting step.
- A pdfField MUST be one of the provided leftover field names — never invent one.
- Map EVERY checkbox that has a distinct printed label, even if it resembles another — they are different elections, not duplicates. Only ever put area-code fragments, blank continuation underlines, and clearly office-use boxes in "skip".
- Assign each addition to an existing step number from the list.
- Include mapping.reason and mapping.evidence when you can explain why the leftover belongs to the added question.
OUTPUT: {"additions":[{"step":int,"title":"...","type":"single-choice-cards|multi-select|checkbox|text|date|...","required":bool,"pdfField":"<name>"|null,"mapping":{"reason":"...","evidence":"..."},"options":[{"label":"...","value":"...","pdfField":"<name>"}],"showIf":null}],"skip":["<name>", ...]}`;

  const user = `EXISTING STEPS:\n${stepList}\n\nLEFTOVER BOXES (map these):\n${candidates}`;
  return { system, user };
}

export interface RecoverOptions extends OpenRouterOptions {
  /** Injectable for tests. */
  complete?: (system: string, user: string) => Promise<string>;
}

export async function recoverUnmapped(
  schema: FormSchemaV2Type,
  extracted: ExtractedField[],
  opts: RecoverOptions
): Promise<RecoverResult> {
  const realUnmapped = new Set(schema.unmappedFields);
  if (realUnmapped.size === 0) return { schema, recovered: [] };

  const { system, user } = buildRecoverPrompt(schema, extracted);
  const raw = opts.complete
    ? await opts.complete(system, user)
    : await chatCompletion([{ role: 'system', content: system }, { role: 'user', content: user }], opts);

  let additions: Any[] = [];
  try {
    const parsed = JSON.parse(stripFences(raw)) as Any;
    additions = Array.isArray(parsed.additions) ? (parsed.additions as Any[]) : [];
  } catch {
    return { schema, recovered: [] }; // unparseable → safe no-op
  }
  const result = applyRecovery(schema, additions, realUnmapped);
  // guard: the merged schema must still be valid
  const check = FormSchemaV2.safeParse(result.schema);
  return check.success ? result : { schema, recovered: [] };
}
