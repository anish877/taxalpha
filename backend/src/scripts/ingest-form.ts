/**
 * CLI to run the form-ingestion pipeline against a PDF.
 *
 *   tsx src/scripts/ingest-form.ts <path-to.pdf> [--hint "form description"]
 *
 * Stage 1 (extract) always runs and writes <pdf>.extracted.json.
 * Stage 2 (AI labeling) runs only if OPENROUTER_API_KEY is set, writing
 * <pdf>.schema.json — the runnable FormSchema.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { getEnv } from '../config/env.js';
import { expandRepeats } from '../lib/ingestion/expand-repeats.js';
import { extractFields } from '../lib/ingestion/extract.js';
import { labelFields } from '../lib/ingestion/label-fields.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const pdfPath = args.find((a) => !a.startsWith('--'));
  const hintIdx = args.indexOf('--hint');
  const hint = hintIdx >= 0 ? args[hintIdx + 1] : undefined;
  if (!pdfPath) {
    console.error('Usage: tsx src/scripts/ingest-form.ts <path-to.pdf> [--hint "..."]');
    process.exit(1);
  }

  const bytes = new Uint8Array(await readFile(pdfPath));
  const stem = basename(pdfPath).replace(/\.pdf$/i, '');

  console.log(`[1/2] Extracting AcroForm widgets from ${pdfPath} ...`);
  const fields = await extractFields(bytes);
  await writeFile(`${stem}.extracted.json`, JSON.stringify(fields, null, 2));
  console.log(`      ${fields.length} widgets -> ${stem}.extracted.json`);

  const env = getEnv();
  if (!env.OPENROUTER_API_KEY) {
    console.log('[2/2] OPENROUTER_API_KEY not set — skipping AI labeling.');
    return;
  }

  console.log(`[2/3] Labeling with ${env.OPENROUTER_MODEL} via OpenRouter ...`);
  const labeled = await labelFields(fields, {
    apiKey: env.OPENROUTER_API_KEY,
    model: env.OPENROUTER_MODEL,
    baseUrl: env.OPENROUTER_BASE_URL,
    hint
  });
  const mappedByLlm = labeled.pdfFieldCount - labeled.unmappedFields.length;
  console.log(`      ${labeled.items.length} items, ${mappedByLlm} fields mapped by LLM`);

  console.log('[3/3] Expanding repeated blocks (deterministic) ...');
  const { schema, recovered } = expandRepeats(labeled, fields);
  await writeFile(`${stem}.schema.json`, JSON.stringify(schema, null, 2));
  const mapped = schema.pdfFieldCount - schema.unmappedFields.length;
  console.log(
    `      +${recovered.length} recovered -> ${mapped}/${schema.pdfFieldCount} fields mapped, ` +
      `${schema.unmappedFields.length} left for review -> ${stem}.schema.json`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
