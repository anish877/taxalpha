import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  baseName,
  expandRepeats,
  instanceOf,
  isGarbageBase
} from '../src/lib/ingestion/expand-repeats.js';
import { ExtractedField, FormSchema, type FormQuestion } from '../src/lib/ingestion/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const readFixture = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(here, 'fixtures', name), 'utf8')) as T;

// --- helpers -----------------------------------------------------------------

function scalar(over: Partial<FormQuestion> & { pdfField: string }): FormQuestion {
  return {
    id: over.id ?? `q_${over.pdfField}`,
    section: over.section ?? 1,
    title: over.title ?? 'Q',
    type: over.type ?? 'text',
    required: over.required ?? false,
    pdfField: over.pdfField,
    helper: over.helper ?? null,
    showIf: over.showIf ?? null,
    profileKey: over.profileKey ?? null,
    options: over.options
  };
}

function field(name: string, over: Partial<ExtractedField> = {}): ExtractedField {
  return {
    page: over.page ?? 1,
    fieldName: name,
    type: over.type ?? 'text',
    rect: over.rect ?? [0, 0, 10, 10],
    inferredLabel: over.inferredLabel ?? null,
    nearbyText: over.nearbyText ?? [],
    exportValue: over.exportValue ?? null
  };
}

function makeSchema(items: FormQuestion[], unmapped: string[]): FormSchema {
  return {
    code: 'TEST',
    title: 'Test',
    description: null,
    sections: [{ number: 1, title: 'S1' }],
    items,
    pdfFieldCount: 0,
    unmappedFields: unmapped
  };
}

// --- pure helpers ------------------------------------------------------------

describe('base-name helpers', () => {
  it('strips a single trailing counter only', () => {
    expect(baseName('Name')).toBe('Name');
    expect(baseName('Name_4')).toBe('Name');
    expect(baseName('Social Security or Federal Tax ID Number TIN_3')).toBe(
      'Social Security or Federal Tax ID Number TIN'
    );
    // address-line bases keep their own embedded number, only the counter goes
    expect(baseName('Address of Principal Place of Residence no PO Box 1_2')).toBe(
      'Address of Principal Place of Residence no PO Box 1'
    );
  });

  it('reads the instance counter', () => {
    expect(instanceOf('Name')).toBe(1);
    expect(instanceOf('Name_4')).toBe(4);
    expect(instanceOf('Home_7')).toBe(7);
  });

  it('flags garbage bases', () => {
    expect(isGarbageBase('undefined')).toBe(true);
    expect(isGarbageBase('Text49')).toBe(true);
    expect(isGarbageBase('Check Box11')).toBe(true);
    expect(isGarbageBase('1')).toBe(true);
    expect(isGarbageBase('Name')).toBe(false);
    expect(isGarbageBase('Email Address')).toBe(false);
  });
});

// --- unit behaviour ----------------------------------------------------------

describe('expandRepeats — unit', () => {
  it('stamps a mapped template onto unmapped siblings', () => {
    const schema = makeSchema(
      [scalar({ pdfField: 'Name', title: 'Full Name', type: 'text', profileKey: 'person.name' })],
      ['Name_2', 'Name_3']
    );
    const extracted = [field('Name'), field('Name_2'), field('Name_3')];

    const { schema: out, recovered } = expandRepeats(schema, extracted);

    expect(recovered.sort()).toEqual(['Name_2', 'Name_3']);
    expect(out.unmappedFields).toEqual([]);
    const added = out.items.filter((i) => (i as FormQuestion).pdfField !== 'Name') as FormQuestion[];
    expect(added).toHaveLength(2);
    for (const a of added) {
      expect(a.type).toBe('text');
      expect(a.profileKey).toBe('person.name'); // semantics carried over
    }
  });

  it('never expands garbage bases even if one sibling is mapped', () => {
    const schema = makeSchema(
      [scalar({ pdfField: 'undefined', title: 'Mystery' })],
      ['undefined_2', 'undefined_3']
    );
    const extracted = [field('undefined'), field('undefined_2'), field('undefined_3')];

    const { schema: out, recovered } = expandRepeats(schema, extracted);

    expect(recovered).toEqual([]);
    expect(out.unmappedFields).toEqual(['undefined_2', 'undefined_3']);
  });

  it('leaves a group untouched when no sibling is mapped (no template)', () => {
    const schema = makeSchema([], ['Spouse SSN', 'Spouse SSN_2']);
    const extracted = [field('Spouse SSN'), field('Spouse SSN_2')];

    const { recovered, schema: out } = expandRepeats(schema, extracted);

    expect(recovered).toEqual([]);
    expect(out.unmappedFields).toEqual(['Spouse SSN', 'Spouse SSN_2']);
  });

  it('uses the lowest-instance mapped field as the template', () => {
    // Only the _5 instance happens to be mapped; expansion should still work.
    const schema = makeSchema(
      [scalar({ pdfField: 'Email Address_5', title: 'Email', type: 'email' })],
      ['Email Address', 'Email Address_2']
    );
    const extracted = [field('Email Address'), field('Email Address_2'), field('Email Address_5')];

    const { recovered } = expandRepeats(schema, extracted);
    expect(recovered.sort()).toEqual(['Email Address', 'Email Address_2']);
  });

  it('is idempotent — a second pass adds nothing', () => {
    const schema = makeSchema(
      [scalar({ pdfField: 'Home', title: 'Home Phone', type: 'phone' })],
      ['Home_2']
    );
    const extracted = [field('Home'), field('Home_2')];

    const first = expandRepeats(schema, extracted);
    const second = expandRepeats(first.schema, extracted);

    expect(second.recovered).toEqual([]);
    expect(second.schema.items).toHaveLength(first.schema.items.length);
  });

  it('output still satisfies the FormSchema contract', () => {
    const schema = makeSchema(
      [scalar({ pdfField: 'Name', title: 'Name' })],
      ['Name_2']
    );
    const { schema: out } = expandRepeats(schema, [field('Name'), field('Name_2')]);
    expect(FormSchema.safeParse(out).success).toBe(true);
  });
});

// --- integration on the real RGP Income Fund II form -------------------------

describe('expandRepeats — real RGPIF II form', () => {
  const extracted = ExtractedField.array().parse(readFixture('rgpif.extracted.json'));
  const schema = FormSchema.parse(readFixture('rgpif.schema.json'));

  it('materially raises coverage', () => {
    const before = schema.unmappedFields.length;
    const { schema: out, recovered } = expandRepeats(schema, extracted);
    const after = out.unmappedFields.length;

    // Sonnet left 88 unmapped; expansion should recover a large chunk.
    expect(before).toBeGreaterThan(60);
    expect(recovered.length).toBeGreaterThanOrEqual(25);
    expect(after).toBeLessThan(before - 25);
    // sanity: counts reconcile
    expect(after).toBe(before - recovered.length);
  });

  it('recovers the known repeated person-block fields', () => {
    const { schema: out } = expandRepeats(schema, extracted);
    const mapped = new Set(
      out.items
        .map((i) => (i as FormQuestion).pdfField)
        .filter((n): n is string => Boolean(n))
    );
    for (const expected of [
      'Name_4',
      'Phone Business_5',
      'Home_5',
      'Social Security or Federal Tax ID Number TIN_3',
      'Email Address_4',
      'Date of Birth_4'
    ]) {
      expect(mapped.has(expected), `expected ${expected} to be mapped`).toBe(true);
    }
  });

  it('expansion never adds a garbage "undefined*" field', () => {
    // The LLM may legitimately map an "undefined"-named field from context
    // (e.g. it identified undefined_5 as the Control Person address line). What
    // we forbid is *expansion* propagating by the meaningless name pattern.
    const { schema: out, recovered } = expandRepeats(schema, extracted);
    expect(recovered.some((n) => /^undefined/i.test(n))).toBe(false);
    const expandedUndefined = out.items
      .filter((i) => (i as FormQuestion).id?.includes('__i'))
      .map((i) => (i as FormQuestion).pdfField)
      .filter((n): n is string => Boolean(n))
      .filter((n) => /^undefined/i.test(n));
    expect(expandedUndefined).toEqual([]);
  });

  it('every recovered field is a real widget and inherits valid semantics', () => {
    const realNames = new Set(extracted.map((f) => f.fieldName));
    const { schema: out, recovered } = expandRepeats(schema, extracted);
    for (const n of recovered) expect(realNames.has(n)).toBe(true);
    // all expanded items carry a non-garbage type and reference a real field
    const expanded = out.items.filter((i) => (i as FormQuestion).id?.includes('__i')) as FormQuestion[];
    expect(expanded.length).toBe(recovered.length);
    for (const e of expanded) {
      expect(typeof e.type).toBe('string');
      expect(realNames.has(e.pdfField as string)).toBe(true);
    }
    // result is still a valid schema
    expect(FormSchema.safeParse(out).success).toBe(true);
  });
});
