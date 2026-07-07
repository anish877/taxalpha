import type { FormQuestion, FormSchema } from './schema.js';

export type AnswerValue = string | number | boolean | string[] | null | undefined;
export type Answers = Record<string, AnswerValue>;

/**
 * Turn a client's answers (keyed by question id) into a flat map of
 * AcroForm field name -> value, ready for `fillPdf`.
 *
 * - scalar question -> its pdfField gets the string value
 * - single-choice -> the chosen option's pdfField (a checkbox) becomes true
 * - multi-select  -> every chosen option's pdfField becomes true
 * - checkbox      -> boolean
 */
export function resolveFieldValues(schema: FormSchema, answers: Answers): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};

  for (const item of schema.items) {
    if (!('type' in item)) continue; // skip repeat-blocks (not produced in MVP)
    const q = item as FormQuestion;
    const answer = answers[q.id];
    if (answer === undefined || answer === null || answer === '') continue;

    if (q.options && q.options.length > 0) {
      const chosen = Array.isArray(answer) ? answer : [answer];
      for (const opt of q.options) {
        if (opt.pdfField && chosen.map(String).includes(opt.value)) {
          values[opt.pdfField] = true;
        }
      }
      continue;
    }

    if (!q.pdfField) continue;
    if (q.type === 'checkbox') {
      values[q.pdfField] = Boolean(answer) && answer !== 'false';
    } else {
      values[q.pdfField] = String(answer);
    }
  }

  return values;
}
