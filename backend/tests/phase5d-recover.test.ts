import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { applyRecovery, recoverUnmapped } from '../src/lib/ingestion/recover-unmapped.js';
import { ExtractedField } from '../src/lib/ingestion/schema.js';
import { FormSchemaV2, type FormSchemaV2 as FormSchemaV2Type } from '../src/lib/ingestion/schema-v2.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = <T>(n: string): T => JSON.parse(readFileSync(resolve(here, 'fixtures', n), 'utf8')) as T;

function baseSchema(unmapped: string[]): FormSchemaV2Type {
  return FormSchemaV2.parse({
    version: 2, code: 'T', title: 'T',
    steps: [{ number: 1, key: 'S1', label: 'STEP 1' }, { number: 7, key: 'S7', label: 'STEP 7. CERTS' }],
    items: [{ id: 'amount', step: 1, order: 0, title: 'Amount', type: 'currency', required: true, pdfField: 'Investment' }],
    pdfFieldCount: 10, unmappedFields: unmapped
  });
}

describe('applyRecovery — deterministic safety (cannot corrupt the schema)', () => {
  const unmapped = new Set(['Check Box30', 'Check Box31', 'Check Box32', 'AcctName', 'undefined_5']);

  it('accepts a checkbox-cluster addition mapping real leftover fields', () => {
    const s = baseSchema([...unmapped]);
    const { schema, recovered } = applyRecovery(
      s,
      [{ step: 7, title: 'Accredited investor basis', type: 'multi-select', options: [
        { label: 'Net worth > $1M', value: 'netWorth', pdfField: 'Check Box30' },
        { label: 'Income > $200k', value: 'income', pdfField: 'Check Box31' },
        { label: 'FINRA license', value: 'license', pdfField: 'Check Box32' }
      ] }],
      unmapped
    );
    expect(recovered.sort()).toEqual(['Check Box30', 'Check Box31', 'Check Box32']);
    const added = schema.items.find((i) => i.id.startsWith('recovered')) as { type: string; options: unknown[]; step: number };
    expect(added.type).toBe('multi-select');
    expect(added.options).toHaveLength(3);
    expect(added.step).toBe(7);
    expect(schema.unmappedFields).toEqual(['AcctName', 'undefined_5']);
    expect(FormSchemaV2.safeParse(schema).success).toBe(true);
  });

  it('REJECTS invented pdfFields (not in the real unmapped set)', () => {
    const s = baseSchema([...unmapped]);
    const { recovered, schema } = applyRecovery(s, [{ step: 1, title: 'Fake', type: 'text', pdfField: 'TOTALLY_MADE_UP' }], unmapped);
    expect(recovered).toEqual([]);
    expect(schema.items.some((i) => i.id.startsWith('recovered'))).toBe(false);
  });

  it('REJECTS duplicate pdfField claims within the same pass', () => {
    const s = baseSchema([...unmapped]);
    const { recovered } = applyRecovery(s, [
      { step: 1, title: 'A', type: 'text', pdfField: 'AcctName' },
      { step: 1, title: 'B', type: 'text', pdfField: 'AcctName' }
    ], unmapped);
    expect(recovered).toEqual(['AcctName']); // only once
  });

  it('ACCEPTS a real unmapped field even with a cryptic name (Check Box30 / undefined_5)', () => {
    // recovery trusts the LLM + the realUnmapped guard; the §8 accreditation
    // boxes are literally named "Check Box30" etc., so they MUST be recoverable.
    const s = baseSchema([...unmapped]);
    const { recovered } = applyRecovery(s, [
      { step: 7, title: 'Accreditation', type: 'multi-select', options: [{ label: 'Net worth', value: 'nw', pdfField: 'Check Box30' }] },
      { step: 1, title: 'For entity', type: 'text', pdfField: 'undefined_5' }
    ], unmapped);
    expect(recovered).toContain('Check Box30');
    expect(recovered).toContain('undefined_5');
  });

  it('drops a choice addition whose options are all invalid', () => {
    const s = baseSchema([...unmapped]);
    const { recovered, schema } = applyRecovery(s, [{ step: 7, title: 'X', type: 'multi-select', options: [{ label: 'x', value: 'x', pdfField: 'NOPE' }] }], unmapped);
    expect(recovered).toEqual([]);
    expect(schema.items.some((i) => i.id.startsWith('recovered'))).toBe(false);
  });

  it('clamps an unknown step to an existing one and keeps ids unique', () => {
    const s = baseSchema([...unmapped]);
    const { schema } = applyRecovery(s, [
      { step: 99, title: 'Acct name', type: 'text', pdfField: 'AcctName' }
    ], unmapped);
    const added = schema.items.find((i) => i.id.startsWith('recovered')) as { step: number };
    expect([1, 7]).toContain(added.step); // clamped to an existing step
    const ids = schema.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('recoverUnmapped — orchestration with injected LLM', () => {
  it('maps leftovers from a mock model response and stays valid', async () => {
    const unmapped = ['Check Box30', 'Check Box31'];
    const s = baseSchema(unmapped);
    const extracted = ExtractedField.array().parse([
      { page: 8, fieldName: 'Check Box30', type: 'checkbox', rect: [0, 100, 10, 110], inferredLabel: 'Net worth over $1M', nearbyText: [], exportValue: 'Yes' },
      { page: 8, fieldName: 'Check Box31', type: 'checkbox', rect: [0, 90, 10, 100], inferredLabel: 'Income over $200k', nearbyText: [], exportValue: 'Yes' }
    ]);
    const fakeComplete = async () => JSON.stringify({ additions: [
      { step: 7, title: 'Accredited investor basis', type: 'multi-select', options: [
        { label: 'Net worth > $1M', value: 'nw', pdfField: 'Check Box30' },
        { label: 'Income > $200k', value: 'inc', pdfField: 'Check Box31' }
      ] }
    ], skip: [] });
    const { schema, recovered } = await recoverUnmapped(s, extracted, { apiKey: 'x', model: 'm', complete: fakeComplete });
    expect(recovered.sort()).toEqual(['Check Box30', 'Check Box31']);
    expect(schema.unmappedFields).toEqual([]);
    expect(FormSchemaV2.safeParse(schema).success).toBe(true);
  });

  it('is a safe no-op on unparseable model output', async () => {
    const s = baseSchema(['Check Box30']);
    const { recovered, schema } = await recoverUnmapped(s, [], { apiKey: 'x', model: 'm', complete: async () => 'not json' });
    expect(recovered).toEqual([]);
    expect(schema.unmappedFields).toEqual(['Check Box30']);
  });

  it('no-ops when nothing is unmapped (no LLM call)', async () => {
    const s = baseSchema([]);
    let called = false;
    await recoverUnmapped(s, [], { apiKey: 'x', model: 'm', complete: async () => { called = true; return '{}'; } });
    expect(called).toBe(false);
  });
});

describe('recoverUnmapped — real RGPIF extracted leftovers (safety on real data)', () => {
  it('never invents a field and keeps a valid schema for any plausible additions', () => {
    const v2 = FormSchemaV2.parse(read('rgpif.schema.v2.json'));
    const realUnmapped = new Set(v2.unmappedFields);
    // simulate a model that tries to map the first 6 leftovers + one invented field
    const additions = [
      ...v2.unmappedFields.slice(0, 6).map((n, i) => ({ step: 7, title: `Recovered ${i}`, type: 'text', pdfField: n })),
      { step: 7, title: 'Invented', type: 'text', pdfField: 'DEFINITELY_NOT_REAL' }
    ];
    const { schema, recovered } = applyRecovery(v2, additions, realUnmapped);
    expect(recovered).not.toContain('DEFINITELY_NOT_REAL');
    for (const r of recovered) expect(realUnmapped.has(r)).toBe(true);
    expect(FormSchemaV2.safeParse(schema).success).toBe(true);
  });
});
