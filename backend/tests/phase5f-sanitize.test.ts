import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sanitizeSchema } from '../src/lib/ingestion/sanitize-schema.js';
import { ExtractedField } from '../src/lib/ingestion/schema.js';
import { FormSchemaV2, isRepeatBlock, type FormQuestionV2, type FormSchemaV2 as FormSchemaV2Type } from '../src/lib/ingestion/schema-v2.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = <T>(n: string): T => JSON.parse(readFileSync(resolve(here, 'fixtures', n), 'utf8')) as T;

function field(name: string): ExtractedField {
  return { page: 1, fieldName: name, type: 'text', rect: [0, 0, 1, 1], inferredLabel: null, nearbyText: [], exportValue: null };
}
function schema(items: unknown[]): FormSchemaV2Type {
  return FormSchemaV2.parse({ version: 2, code: 'T', title: 'T', steps: [{ number: 1, key: 'S1', label: 'S1' }], items, pdfFieldCount: 5, unmappedFields: [] });
}

describe('sanitizeSchema — deterministic correctness', () => {
  const ext = [field('Units'), field('Name'), field('Email')];

  it('nulls a GHOST pdfField reference (not a real widget)', () => {
    const s = schema([{ id: 'a', step: 1, order: 0, title: 'Owned', type: 'text', pdfField: 'OwnedRow1' }]);
    const { schema: out, ghostsRemoved } = sanitizeSchema(s, ext);
    expect(ghostsRemoved).toBe(1);
    expect((out.items[0] as FormQuestionV2).pdfField).toBeNull();
  });

  it('dedupes a field bound by two elements (keeps the first)', () => {
    const s = schema([
      { id: 'commit', step: 1, order: 0, title: 'Commitment $', type: 'currency', pdfField: 'Units' },
      { id: 'units', step: 1, order: 1, title: 'Units', type: 'number', pdfField: 'Units' }
    ]);
    const { schema: out, duplicatesRemoved } = sanitizeSchema(s, ext);
    expect(duplicatesRemoved).toBe(1);
    expect((out.items[0] as FormQuestionV2).pdfField).toBe('Units'); // first kept
    expect((out.items[1] as FormQuestionV2).pdfField).toBeNull(); // dup nulled
  });

  it('drops a junk recovered item left with no real binding', () => {
    const s = schema([
      { id: 'recovered.criterion_7', step: 1, order: 0, title: 'Criterion 7', type: 'text', pdfField: 'GHOST' }
    ]);
    const { schema: out, junkDropped } = sanitizeSchema(s, ext);
    expect(junkDropped).toBe(1);
    expect(out.items).toHaveLength(0);
  });

  it('keeps a recovered item that has a real binding but relabels a junk title', () => {
    const s = schema([{ id: 'recovered.x', step: 1, order: 0, title: 'Criterion 3', type: 'text', pdfField: 'Name' }]);
    const { schema: out } = sanitizeSchema(s, ext);
    expect(out.items).toHaveLength(1);
    expect((out.items[0] as FormQuestionV2).title).not.toMatch(/^criterion/i);
    expect((out.items[0] as FormQuestionV2).pdfField).toBe('Name');
  });

  it('recomputes unmappedFields from surviving real bindings', () => {
    const s = schema([{ id: 'a', step: 1, order: 0, title: 'Name', type: 'text', pdfField: 'Name' }]);
    const { schema: out } = sanitizeSchema(s, ext);
    expect(out.unmappedFields.sort()).toEqual(['Email', 'Units']);
  });

  it('output stays a valid FormSchemaV2', () => {
    const s = schema([{ id: 'a', step: 1, order: 0, title: 'X', type: 'text', pdfField: 'GHOST' }]);
    expect(FormSchemaV2.safeParse(sanitizeSchema(s, ext).schema).success).toBe(true);
  });

  it('renumbers duplicate `order` values within a step sequentially', () => {
    const s = schema([
      { id: 'a', step: 1, order: 1, title: 'A', type: 'text', pdfField: 'Name' },
      { id: 'b', step: 1, order: 1, title: 'B', type: 'text', pdfField: 'Email' },
      { id: 'c', step: 1, order: 2, title: 'C', type: 'text', pdfField: 'Units' }
    ]);
    const { schema: out } = sanitizeSchema(s, ext);
    const orders = out.items.map((i) => i.order);
    expect(new Set(orders).size).toBe(orders.length); // all unique
    expect(orders).toEqual([0, 1, 2]);
  });
});

describe('sanitizeSchema — on the real (degraded) TEP schema', () => {
  it('leaves NO ghost references and NO duplicate bindings', () => {
    const v2 = FormSchemaV2.parse(read('tep.schema.v2.json'));
    const extracted = ExtractedField.array().parse(read('tep.extracted.json'));
    const real = new Set(extracted.map((f) => f.fieldName).filter(Boolean));
    const { schema: out } = sanitizeSchema(v2, extracted);

    const used: string[] = [];
    for (const it of out.items) {
      if (isRepeatBlock(it)) { for (const f of it.fields) if (f.pdfField) used.push(f.pdfField); continue; }
      const q = it as FormQuestionV2;
      if (q.pdfField) used.push(q.pdfField);
      for (const o of q.options ?? []) if (o.pdfField) used.push(o.pdfField);
      for (const sf of q.subFields ?? []) if (sf.pdfField) used.push(sf.pdfField);
    }
    // every surviving reference is a REAL widget (no ghosts like OwnedRow1)
    for (const u of used) expect(real.has(u), `ghost ref ${u}`).toBe(true);
    // no field bound more than once (no duplicate bindings)
    expect(new Set(used).size).toBe(used.length);
    // no surviving item is titled "Criterion N"
    const junk = out.items.filter((i) => /^criterion\s*\d+$/i.test((i as FormQuestionV2).title?.trim() ?? ''));
    expect(junk).toEqual([]);
    expect(FormSchemaV2.safeParse(out).success).toBe(true);
  });
});
