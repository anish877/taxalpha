import { chatCompletion, type OpenRouterOptions } from './openrouter.js';
import { normalizeToFormSchema } from './normalize.js';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt.js';
import { ExtractedField, FormSchema } from './schema.js';

export interface LabelOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** Optional free-text hint about the form (e.g. its title/purpose). */
  hint?: string;
}

function stripFences(s: string): string {
  let out = s.trim();
  // Closed fence ```json ... ``` -> inner. Open-only fence -> drop the opener.
  const closed = out.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (closed) return closed[1]!.trim();
  out = out.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '');
  return out.trim();
}

/**
 * Stage 2: turn extracted widgets into a validated, runnable FormSchema via the
 * LLM. The model's free-form JSON is run through `normalizeToFormSchema` (which
 * tolerates key/nesting drift) before Zod validation, with one repair attempt.
 */
export async function labelFields(
  fields: ExtractedField[],
  opts: LabelOptions
): Promise<FormSchema> {
  ExtractedField.array().parse(fields); // guard the input shape
  const fieldNames = fields.map((f) => f.fieldName).filter((n): n is string => Boolean(n));

  const or: OpenRouterOptions = { apiKey: opts.apiKey, model: opts.model, baseUrl: opts.baseUrl };
  const userPrompt = buildUserPrompt(fields, opts.hint);

  const first = await chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ],
    or
  );

  const parsed = tryParse(first, fieldNames);
  if (parsed.ok) return parsed.value;

  // One repair round: hand the model its own output plus the validation errors.
  const repair = await chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: first },
      {
        role: 'user',
        content:
          `Your JSON failed validation with these errors:\n${parsed.error}\n` +
          `Return corrected JSON only.`
      }
    ],
    or
  );

  const reparsed = tryParse(repair, fieldNames);
  if (reparsed.ok) return reparsed.value;
  throw new Error(`Schema validation failed after repair:\n${reparsed.error}`);
}

function tryParse(
  raw: string,
  fieldNames: string[]
): { ok: true; value: FormSchema } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(stripFences(raw));
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  const normalized = normalizeToFormSchema(obj, fieldNames);
  const result = FormSchema.safeParse(normalized);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
  };
}
