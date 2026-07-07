import { describeUnmapped } from './describe-unmapped.js';
import { expandRepeatsV2 } from './expand-repeats-v2.js';
import { extractFields } from './extract.js';
import { enrichMappingExplanations } from './mapping-explanations.js';
import { recoverUnmapped } from './recover-unmapped.js';
import { applyRequiredHints } from './required-hints.js';
import { sanitizeSchema } from './sanitize-schema.js';
import { normalizeToV2 } from './normalize-v2.js';
import { chatCompletion, type OpenRouterOptions } from './openrouter.js';
import { buildUserPromptV2, SYSTEM_PROMPT_V2 } from './prompt-v2.js';
import type { ExtractedField } from './schema.js';
import { FormSchemaV2, type FormSchemaV2 as FormSchemaV2Type } from './schema-v2.js';

export interface IngestV2Options {
  apiKey: string;
  model: string;
  baseUrl?: string;
  hint?: string;
}

export interface IngestV2Result {
  schema: FormSchemaV2Type;
  extracted: ExtractedField[];
  stats: {
    totalFields: number;
    steps: number;
    questions: number;
    mapped: number;
    unmapped: number;
    choiceGroups: number;
    recoveredByExpansion: number;
    recoveredBySecondPass: number;
    mappedPercent: number;
  };
}

function stripFences(s: string): string {
  const closed = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (closed) return closed[1]!.trim();
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

/**
 * Stage 2 (v2): emit a step-wise FormSchemaV2 directly, calibrated by the gold
 * lessons + exemplar. Deterministic extraction → LLM → tolerant normalize →
 * Zod validate, with one repair round. Then attach unmappedDetails.
 */
export async function ingestFormV2(pdf: Uint8Array, opts: IngestV2Options): Promise<IngestV2Result> {
  const extracted = await extractFields(pdf);
  const fieldNames = extracted.map((f) => f.fieldName).filter((n): n is string => Boolean(n));
  const or: OpenRouterOptions = { apiKey: opts.apiKey, model: opts.model, baseUrl: opts.baseUrl };
  const user = buildUserPromptV2(extracted, opts.hint);

  const first = await chatCompletion([{ role: 'system', content: SYSTEM_PROMPT_V2 }, { role: 'user', content: user }], or);
  let schema = tryNormalize(first, fieldNames);

  if (!schema) {
    const repair = await chatCompletion(
      [
        { role: 'system', content: SYSTEM_PROMPT_V2 },
        { role: 'user', content: user },
        { role: 'assistant', content: first },
        { role: 'user', content: 'Your JSON did not match the required v2 shape. Return corrected JSON only (no fences).' }
      ],
      or
    );
    schema = tryNormalize(repair, fieldNames);
    if (!schema) throw new Error('Ingestion failed: model did not produce a valid v2 schema after repair.');
  }

  // Deterministic repeat-instance recovery (maps Name_2/Home_5/...TIN_3/etc).
  const expansion = expandRepeatsV2(schema, extracted);
  schema = expansion.schema;

  // Pass F — generic leftover recovery (checkbox groups, orphan fields). Safe:
  // can only map genuinely-unmapped real widgets, else it's a no-op.
  let recoveredBySecondPass = 0;
  try {
    const rec = await recoverUnmapped(schema, extracted, { apiKey: opts.apiKey, model: opts.model, baseUrl: opts.baseUrl });
    schema = rec.schema;
    recoveredBySecondPass = rec.recovered.length;
  } catch {
    /* safe no-op on any failure */
  }

  // Deterministic required-ness recovery ("(REQUIRED)" labels → required:true).
  schema = applyRequiredHints(schema, extracted).schema;

  // Deterministic sanitize: drop ghost refs, dedupe bindings, drop junk recovered items.
  schema = sanitizeSchema(schema, extracted).schema;

  // attach human, position-aware descriptions for the leftover unmapped boxes
  schema.unmappedDetails = describeUnmapped(extracted, schema.unmappedFields);
  schema = enrichMappingExplanations(schema, extracted, {
    recoveredByExpansion: expansion.recovered.length,
    recoveredBySecondPass
  });

  const choiceGroups = schema.items.filter((i) => (i as { type?: string }).type === 'single-choice-cards' || (i as { type?: string }).type === 'multi-select').length;
  const mapped = schema.pdfFieldCount - schema.unmappedFields.length;
  const mappedPercent = schema.pdfFieldCount === 0 ? 100 : Math.round((mapped / schema.pdfFieldCount) * 1000) / 10;
  return {
    schema,
    extracted,
    stats: {
      totalFields: schema.pdfFieldCount,
      steps: schema.steps.length,
      questions: schema.items.length,
      mapped,
      unmapped: schema.unmappedFields.length,
      choiceGroups,
      recoveredByExpansion: expansion.recovered.length,
      recoveredBySecondPass,
      mappedPercent
    }
  };
}

function tryNormalize(raw: string, fieldNames: string[]): FormSchemaV2Type | null {
  try {
    const obj = JSON.parse(stripFences(raw));
    const normalized = normalizeToV2(obj, fieldNames);
    return FormSchemaV2.parse(normalized);
  } catch {
    return null;
  }
}
