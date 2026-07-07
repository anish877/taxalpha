import { CANONICAL_DICTIONARY } from '../profile/canonical-dictionary.js';
import { describeUnmapped } from './describe-unmapped.js';
import { expandRepeatsV2 } from './expand-repeats-v2.js';
import { extractPages, type PageExtract } from './extract.js';
import { GOLD_FORMS_DIGEST, GOLD_LESSONS } from './lessons.js';
import { enrichMappingExplanations } from './mapping-explanations.js';
import { normalizeToV2 } from './normalize-v2.js';
import { chatCompletion, chatWithImage } from './openrouter.js';
import { recoverUnmapped } from './recover-unmapped.js';
import { renderPages } from './render-pages.js';
import { applyRequiredHints } from './required-hints.js';
import { sanitizeSchema } from './sanitize-schema.js';
import type { ExtractedField } from './schema.js';
import { FormSchemaV2, type FormSchemaV2 as FormSchemaV2Type } from './schema-v2.js';

/**
 * Page-by-page ingestion with ROLLING CONTEXT (spec: process each page with the
 * running structure of prior pages + the 5 gold forms as canonical context).
 *
 * Why: a single giant prompt makes the model gloss over middle pages of a long
 * form (the 38-page TEP page-4 degradation). Per-page gives full attention to
 * each page; the rolling summary preserves continuity (step numbering, which
 * owner block we're in, branching); the gold context enforces the canonical
 * decomposition style + canonical-field keys so values auto-fill across forms.
 */

type Any = Record<string, unknown>;

export const GOLD_CONTEXT = `${GOLD_LESSONS}

CANONICAL KEYS — set "canonicalField" to one of these EXACT keys when a field captures reusable identity/financial data, so it auto-fills across forms:
${Object.keys(CANONICAL_DICTIONARY).join(', ')}

${GOLD_FORMS_DIGEST}`;

export const PAGED_SYSTEM = `You decompose a multi-page PDF subscription/onboarding form into a step-wise web form, ONE PAGE AT A TIME, keeping continuity with the pages already processed. Output ONLY JSON.

${GOLD_CONTEXT}

You are ALSO given an IMAGE of the current page. The image is the AUTHORITY for field↔label association: look at it to see exactly which blank/checkbox each printed label belongs to, and fix any ambiguity the text alone would cause (e.g. a value that belongs to the row above/below, or which checkbox a label sits next to).

For the CURRENT PAGE, return additions that extend the form:
- Reuse an EXISTING step number (from the rolling context) when this page continues that section; create a NEW step (next number) only at a new printed section banner.
- Cluster a choose-one checkbox grid into ONE single-choice-cards question; "check all that apply" → multi-select; map each option to its checkbox pdfField.
- Map every fillable widget on this page (use the exact field names given); skip only static legal prose, blank continuation underlines, and office-use boxes.
- Set canonicalField (from the list) on reusable identity/financial fields; set showIf/requiredIf for conditional content.
- For every mapped question, option, or subField, include mapping.reason explaining why that PDF box belongs there, and mapping.evidence citing the nearby printed label/visual placement.
- When you set canonicalField, include autofill.reason explaining what prior investor/profile value can safely prefill it.

OUTPUT (compact JSON, no fences):
{"steps":[{"number":int,"key":"STEP_N_KEY","label":"STEP N. TITLE","requiredIf":null}],
 "items":[{"id":"dotted.id","step":int,"order":int,"title":"...","type":"...","required":bool,"pdfField":"<name>"|null,"mapping":{"reason":"why this widget maps here","evidence":"printed label / visual placement"},"options":[{"label":"..","value":"..","pdfField":"<name>","mapping":{"reason":"why this checkbox maps to this option","evidence":"printed label / visual placement"}}],"showIf":null,"canonicalField":null,"autofill":{"canonicalField":"...","reason":"why this can prefill from profile"} }],
 "summary":"<=400 chars: the running list of steps + which section/owner this page covered, to carry forward"}`;

function widgetLines(widgets: ExtractedField[]): string {
  return widgets
    .map((w) => `[${w.type}] ${w.fieldName ?? '(unnamed)'} | ${(w.inferredLabel ?? '') || w.nearbyText.slice(0, 3).join(' · ')}`.slice(0, 180))
    .join('\n');
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Compact list of choice questions defined so far + their option values. */
export function definedChoices(items: Any[]): string {
  return items
    .filter((i) => Array.isArray(i.options) && (i.options as Any[]).length > 0)
    .map((i) => `${i.id} = [${(i.options as Any[]).map((o) => o.value).filter(Boolean).join(', ')}]`)
    .join('\n')
    .slice(0, 1500);
}

export interface PageMergeState {
  steps: Any[];
  items: Any[];
  stepNumberByLabel: Map<string, number>;
  nextStep: number;
}

/** Merge one page's LLM result into the accumulating form, reconciling step numbers by label. */
export function mergePageResult(state: PageMergeState, pageSteps: Any[], pageItems: Any[]): void {
  const remap = new Map<number, number>(); // page-local step number -> global
  for (const s of Array.isArray(pageSteps) ? pageSteps : []) {
    const label = typeof s.label === 'string' ? s.label : `Step ${s.number}`;
    const key = norm(label);
    let globalNum = state.stepNumberByLabel.get(key);
    if (globalNum === undefined) {
      globalNum = state.nextStep++;
      state.stepNumberByLabel.set(key, globalNum);
      state.steps.push({ ...s, number: globalNum, label });
    }
    if (typeof s.number === 'number') remap.set(s.number, globalNum);
  }
  const fallback = state.steps.length ? (state.steps[state.steps.length - 1]!.number as number) : 1;
  for (const it of Array.isArray(pageItems) ? pageItems : []) {
    const localStep = typeof it.step === 'number' ? it.step : NaN;
    const step = remap.get(localStep) ?? (state.steps.find((s) => s.number === localStep)?.number as number | undefined) ?? fallback;
    state.items.push({ ...it, step });
  }
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1]! : s).trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

export interface IngestPagedOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  hint?: string;
  /** Enable model "thinking" (reasoning effort) where supported. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Opt-in vision pass: render each page to an image for the LLM. Higher
   *  field↔label precision (fixes off-by-one) at the cost of speed/coverage. */
  vision?: boolean;
  /** Injectable per-page completion for tests: (system,user)=>json string */
  complete?: (system: string, user: string, page: number) => Promise<string>;
  onProgress?: (progress: { percent: number; label: string; stage: string }) => void;
}

export interface IngestPagedResult {
  schema: FormSchemaV2Type;
  extracted: ExtractedField[];
  stats: {
    totalFields: number;
    pages: number;
    pagesWithWidgets: number;
    steps: number;
    questions: number;
    mapped: number;
    unmapped: number;
    recoveredByExpansion: number;
  recoveredBySecondPass: number;
  visionPages: number;
  mappedPercent: number;
  };
}

export async function ingestFormV2Paged(pdf: Uint8Array, opts: IngestPagedOptions): Promise<IngestPagedResult> {
  opts.onProgress?.({ percent: 8, label: 'Preparing the PDF', stage: 'PREPARING' });
  // Render page images FIRST (pdf-to-img's pdfjs) before extractPages' pdfjs
  // instance loads — running them the other way around breaks the rasterizer.
  // Each pdfjs consumer also needs its own copy (it detaches the ArrayBuffer).
  let images = new Map<number, string>();
  if (opts.vision && !opts.complete) {
    opts.onProgress?.({ percent: 14, label: 'Rendering pages for visual analysis', stage: 'VISION_RENDER' });
    images = await renderPages(Uint8Array.from(pdf));
  }

  opts.onProgress?.({ percent: 20, label: 'Reading PDF fields and page text', stage: 'EXTRACTING' });
  const pages: PageExtract[] = await extractPages(Uint8Array.from(pdf));
  const allWidgets: ExtractedField[] = pages.flatMap((p) => p.widgets);
  const fieldNames = allWidgets.map((w) => w.fieldName).filter((n): n is string => Boolean(n));
  const widgetPages = pages.filter((p) => p.widgets.length > 0);

  const state: PageMergeState = { steps: [], items: [], stepNumberByLabel: new Map(), nextStep: 1 };
  let rolling = opts.hint ? `Form context: ${opts.hint}` : '(no pages processed yet)';

  const or = { apiKey: opts.apiKey, model: opts.model, baseUrl: opts.baseUrl, reasoningEffort: opts.reasoningEffort };
  const runPage = (system: string, user: string, page: number): Promise<string> => {
    if (opts.complete) return opts.complete(system, user, page);
    const img = images.get(page) ?? null;
    return img
      ? chatWithImage(system, user, img, or)
      : chatCompletion([{ role: 'system', content: system }, { role: 'user', content: user }], or);
  };

  let pagesWithWidgets = 0;
  for (const pg of pages) {
    if (pg.widgets.length === 0) continue; // static page → skip (saves a call)
    pagesWithWidgets += 1;
    const pagePercent = 24 + Math.round((pagesWithWidgets / Math.max(1, widgetPages.length)) * 46);
    opts.onProgress?.({
      percent: Math.min(70, pagePercent),
      label: `AI analyzing page ${pg.page}`,
      stage: 'AI_PAGE_ANALYSIS'
    });
    const stepsSoFar = state.steps.map((s) => `${s.number}: ${s.label}`).join(' | ') || '(none yet)';
    // CRITICAL for correct branching: list the EXACT option values already
    // defined, so a gating showIf/requiredIf on this page uses real vocabulary
    // (not invented tokens that would make the condition dead).
    const choices = definedChoices(state.items);
    const user = `ROLLING CONTEXT:\n${rolling}\nSTEPS SO FAR: ${stepsSoFar}\n${choices ? `CHOICE FIELDS ALREADY DEFINED (use these EXACT ids + option values in any showIf/requiredIf):\n${choices}\n` : ''}\nCURRENT PAGE ${pg.page} TEXT:\n${pg.text}\n\nCURRENT PAGE ${pg.page} FILLABLE WIDGETS:\n${widgetLines(pg.widgets)}`;
    let parsed: Any = {};
    try {
      parsed = JSON.parse(stripFences(await runPage(PAGED_SYSTEM, user, pg.page))) as Any;
    } catch {
      continue; // a bad page response is skipped, not fatal
    }
    mergePageResult(state, (parsed.steps as Any[]) ?? [], (parsed.items as Any[]) ?? []);
    rolling = typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.slice(0, 600)
      : `${state.steps.length} steps, ${state.items.length} questions so far.`;
  }

  // Build a single v2 object, normalize+validate (canon aliases applied here).
  opts.onProgress?.({ percent: 74, label: 'Building the investor wizard', stage: 'NORMALIZING' });
  let schema = normalizeToV2(
    { code: opts.hint ?? 'UPLOADED_FORM', title: opts.hint ?? 'Uploaded form', steps: state.steps, items: state.items },
    fieldNames
  );

  // Deterministic post-passes (same as single-shot pipeline).
  opts.onProgress?.({ percent: 80, label: 'Recovering repeated fields', stage: 'RECOVERING_REPEATS' });
  const expansion = expandRepeatsV2(schema, allWidgets);
  schema = expansion.schema;
  let recoveredBySecondPass = 0;
  try {
    opts.onProgress?.({ percent: 86, label: 'Checking leftover boxes one more time', stage: 'SECOND_PASS_RECOVERY' });
    const rec = await recoverUnmapped(schema, allWidgets, { apiKey: opts.apiKey, model: opts.model, baseUrl: opts.baseUrl });
    schema = rec.schema;
    recoveredBySecondPass = rec.recovered.length;
  } catch {
    /* no-op */
  }
  schema = applyRequiredHints(schema, allWidgets).schema;
  schema = sanitizeSchema(schema, allWidgets).schema;
  schema.unmappedDetails = describeUnmapped(allWidgets, schema.unmappedFields);
  opts.onProgress?.({ percent: 94, label: 'Writing the explanation report', stage: 'EXPLAINING' });
  schema = enrichMappingExplanations(schema, allWidgets, {
    recoveredByExpansion: expansion.recovered.length,
    recoveredBySecondPass
  });
  FormSchemaV2.parse(schema);

  const mapped = schema.pdfFieldCount - schema.unmappedFields.length;
  const mappedPercent = schema.pdfFieldCount === 0 ? 100 : Math.round((mapped / schema.pdfFieldCount) * 1000) / 10;

  return {
    schema,
    extracted: allWidgets,
    stats: {
      totalFields: schema.pdfFieldCount,
      pages: pages.length,
      pagesWithWidgets,
      steps: schema.steps.length,
      questions: schema.items.length,
      mapped,
      unmapped: schema.unmappedFields.length,
      recoveredByExpansion: expansion.recovered.length,
      recoveredBySecondPass,
      visionPages: images.size,
      mappedPercent
    }
  };
}
