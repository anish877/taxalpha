import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getVisibleDynamicQuestionIds, deriveContext, normalizeDynamicFields } from '../src/lib/dynamic-step-engine.js';
import { expandRepeatsV2 } from '../src/lib/ingestion/expand-repeats-v2.js';
import { ExtractedField } from '../src/lib/ingestion/schema.js';
import { FormSchemaV2, type FormSchemaV2 as FormSchemaV2Type } from '../src/lib/ingestion/schema-v2.js';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = <T>(n: string): T => JSON.parse(readFileSync(resolve(here, 'fixtures', n), 'utf8')) as T;

function field(name: string): ExtractedField {
  return { page: 1, fieldName: name, type: 'text', rect: [0, 0, 1, 1], inferredLabel: null, nearbyText: [], exportValue: null };
}
function schema(items: unknown[], unmapped: string[]): FormSchemaV2Type {
  return FormSchemaV2.parse({
    version: 2, code: 'T', title: 'T',
    steps: [{ number: 4, key: 'S4', label: 'STEP 4' }],
    items, pdfFieldCount: 0, unmappedFields: unmapped
  });
}

describe('expandRepeatsV2 — unit', () => {
  it('stamps a mapped scalar template onto unmapped siblings (different party, no canonical)', () => {
    const s = schema(
      [{ id: 'primary.home', step: 4, order: 0, title: 'Home Phone', type: 'phone', pdfField: 'Home', canonicalField: 'person.phone' }],
      ['Home_2', 'Home_3']
    );
    const ext = [field('Home'), field('Home_2'), field('Home_3')];
    const { schema: out, recovered } = expandRepeatsV2(s, ext);
    expect(recovered.sort()).toEqual(['Home_2', 'Home_3']);
    expect(out.unmappedFields).toEqual([]);
    const added = out.items.filter((i) => (i as { pdfField?: string }).pdfField !== 'Home') as Array<{ type: string; canonicalField?: string | null; step: number }>;
    expect(added).toHaveLength(2);
    for (const a of added) {
      expect(a.type).toBe('phone');
      expect(a.step).toBe(4);
      expect(a.canonicalField ?? null).toBeNull(); // instance 2+ never auto-fills from primary
    }
  });

  it('never expands garbage bases (undefined / Check Box / Text\\d)', () => {
    const s = schema(
      [{ id: 'x', step: 4, order: 0, title: 'X', type: 'text', pdfField: 'undefined' }],
      ['undefined_2', 'Check Box41', 'Text49']
    );
    const ext = [field('undefined'), field('undefined_2'), field('Check Box41'), field('Text49')];
    const { recovered } = expandRepeatsV2(s, ext);
    expect(recovered).toEqual([]);
  });

  it('leaves a group untouched when no sibling is mapped', () => {
    const s = schema([], ['Spouse SSN', 'Spouse SSN_2']);
    const { recovered, schema: out } = expandRepeatsV2(s, [field('Spouse SSN'), field('Spouse SSN_2')]);
    expect(recovered).toEqual([]);
    expect(out.unmappedFields).toEqual(['Spouse SSN', 'Spouse SSN_2']);
  });

  it('recovers from a composite sub-field template', () => {
    const s = schema(
      [{ id: 'primary.address', step: 4, order: 0, title: 'Address', type: 'address-block',
        subFields: [{ key: 'line1', label: 'Street', type: 'text', pdfField: 'Addr' }] }],
      ['Addr_2']
    );
    const { recovered, schema: out } = expandRepeatsV2(s, [field('Addr'), field('Addr_2')]);
    expect(recovered).toEqual(['Addr_2']);
    const added = out.items.find((i) => (i as { pdfField?: string }).pdfField === 'Addr_2') as { type: string };
    expect(added.type).toBe('text');
  });

  it('is idempotent', () => {
    const s = schema([{ id: 'p.home', step: 4, order: 0, title: 'Home', type: 'phone', pdfField: 'Home' }], ['Home_2']);
    const first = expandRepeatsV2(s, [field('Home'), field('Home_2')]);
    const second = expandRepeatsV2(first.schema, [field('Home'), field('Home_2')]);
    expect(second.recovered).toEqual([]);
    expect(second.schema.items).toHaveLength(first.schema.items.length);
  });

  it('output remains a valid FormSchemaV2 with unique ids', () => {
    const s = schema([{ id: 'p.home', step: 4, order: 0, title: 'Home', type: 'phone', pdfField: 'Home' }], ['Home_2', 'Home_3']);
    const { schema: out } = expandRepeatsV2(s, [field('Home'), field('Home_2'), field('Home_3')]);
    expect(FormSchemaV2.safeParse(out).success).toBe(true);
    const ids = out.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('expandRepeatsV2 — real RGPIF v2 fixture', () => {
  const v2 = FormSchemaV2.parse(readFixture('rgpif.schema.v2.json'));
  const extracted = ExtractedField.array().parse(readFixture('rgpif.extracted.json'));

  it('materially recovers repeated owner/contact fields', () => {
    const before = v2.unmappedFields.length;
    const { schema: out, recovered } = expandRepeatsV2(v2, extracted);
    const after = out.unmappedFields.length;
    expect(before).toBeGreaterThan(60);
    expect(recovered.length).toBeGreaterThanOrEqual(30);
    expect(after).toBe(before - recovered.length);
    // recovers the known repeated bases
    expect(recovered.some((n) => /^Home_\d/.test(n))).toBe(true);
    expect(recovered.some((n) => /^Phone Business_\d/.test(n))).toBe(true);
    expect(recovered.some((n) => /^Email Address_\d/.test(n))).toBe(true);
    expect(recovered.some((n) => /TIN_\d/.test(n))).toBe(true);
  });

  it('NEVER recovers a garbage box (undefined* / Check Box* / Text\\d)', () => {
    const { recovered } = expandRepeatsV2(v2, extracted);
    expect(recovered.some((n) => /^undefined/i.test(n))).toBe(false);
    expect(recovered.some((n) => /^Check Box/i.test(n))).toBe(false);
    expect(recovered.some((n) => /^Text\d/i.test(n))).toBe(false);
  });

  it('every recovered field is a real widget; result stays engine-drivable', () => {
    const real = new Set(extracted.map((e) => e.fieldName));
    const { schema: out, recovered } = expandRepeatsV2(v2, extracted);
    for (const n of recovered) expect(real.has(n)).toBe(true);
    expect(FormSchemaV2.safeParse(out).success).toBe(true);
    const ctx = deriveContext(Date.parse('2026-06-28T00:00:00Z'));
    for (const s of out.steps) {
      const f = normalizeDynamicFields(out, s.number, {});
      expect(() => getVisibleDynamicQuestionIds(out, s.number, f, ctx)).not.toThrow();
    }
    // ids remain unique after expansion
    const ids = out.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
