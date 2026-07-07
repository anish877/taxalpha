import { expandRepeats } from './expand-repeats.js';
import { extractFields } from './extract.js';
import { labelFields, type LabelOptions } from './label-fields.js';
import type { ExtractedField, FormSchema } from './schema.js';

export interface IngestResult {
  schema: FormSchema;
  extracted: ExtractedField[];
  /** Fields recovered by deterministic repeat-block expansion. */
  recovered: string[];
  stats: {
    totalFields: number;
    mappedByLlm: number;
    recoveredByExpansion: number;
    stillUnmapped: number;
  };
}

/**
 * Full ingestion pipeline for one PDF:
 *   1. extract widgets (deterministic)
 *   2. label with the LLM (Stage 2)
 *   3. expand repeated blocks (deterministic) to close the duplicate-instance gap
 */
export async function ingestForm(pdf: Uint8Array, opts: LabelOptions): Promise<IngestResult> {
  const extracted = await extractFields(pdf);
  const labeled = await labelFields(extracted, opts);
  const mappedByLlm = labeled.pdfFieldCount - labeled.unmappedFields.length;

  const { schema, recovered } = expandRepeats(labeled, extracted);

  // Attach a human hint (page + nearby printed text) to each unmapped field so
  // the admin review screen shows something meaningful instead of "Check Box43".
  const byName = new Map(extracted.map((f) => [f.fieldName, f]));
  const unmappedDetails = schema.unmappedFields.map((name) => {
    const f = byName.get(name);
    const hint =
      f?.inferredLabel?.trim() ||
      (f?.nearbyText.length ? f.nearbyText.join(' · ') : '') ||
      'No nearby text found';
    return { name, page: f?.page ?? 0, hint: hint.slice(0, 120) };
  });
  schema.unmappedDetails = unmappedDetails;

  return {
    schema,
    extracted,
    recovered,
    stats: {
      totalFields: schema.pdfFieldCount,
      mappedByLlm,
      recoveredByExpansion: recovered.length,
      stillUnmapped: schema.unmappedFields.length
    }
  };
}
