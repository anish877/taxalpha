import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { describeUnmapped, type UnmappedCategory } from '../src/lib/ingestion/describe-unmapped.js';
import { ExtractedField } from '../src/lib/ingestion/schema.js';
import { FormSchemaV2 } from '../src/lib/ingestion/schema-v2.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = <T>(n: string): T => JSON.parse(readFileSync(resolve(here, 'fixtures', n), 'utf8')) as T;
const extracted = ExtractedField.array().parse(read('rgpif.extracted.json'));
const v2 = FormSchemaV2.parse(read('rgpif.schema.v2.json'));

const ALLOWED: UnmappedCategory[] = ['phone', 'address', 'name', 'signature', 'checkbox', 'date', 'writeIn', 'other'];

describe('describeUnmapped — makes leftover boxes understandable', () => {
  const details = describeUnmapped(extracted, v2.unmappedFields);

  it('produces one detail per unmapped box', () => {
    expect(details.length).toBe(v2.unmappedFields.length);
  });

  it('EVERY box gets a non-empty, human hint (no bare underscores) and a known category', () => {
    for (const d of details) {
      expect(d.hint.trim().length, `hint for ${d.name}`).toBeGreaterThan(0);
      expect(/[a-zA-Z]/.test(d.hint), `hint has words for ${d.name}: "${d.hint}"`).toBe(true);
      expect(ALLOWED).toContain(d.category);
    }
  });

  it('classifies the phone-line boxes (undefined_* on "Phone: Business…Home…") as phone', () => {
    const phones = details.filter((d) => d.category === 'phone');
    expect(phones.length).toBeGreaterThanOrEqual(3);
    for (const p of phones) expect(p.hint.toLowerCase()).toContain('phone');
  });

  it('classifies checkbox boxes as checkbox', () => {
    expect(details.filter((d) => d.category === 'checkbox').length).toBeGreaterThanOrEqual(1);
  });

  it('a truly blank underline borrows a nearby label or says write-in — never a bare line', () => {
    // find an unmapped field whose OWN nearby text is only underscores/blank
    const blankOwn = extracted.find(
      (f) => v2.unmappedFields.includes(f.fieldName ?? '') &&
        ![f.inferredLabel ?? '', ...f.nearbyText].some((t) => /[a-zA-Z]{2,}/.test(t.replace(/_{2,}/g, ' ')))
    );
    if (blankOwn) {
      const d = details.find((x) => x.name === blankOwn.fieldName)!;
      expect(/write-in|office-use|[a-zA-Z]{2,}/.test(d.hint)).toBe(true);
    }
  });

  it('collapses ~36-88 cryptic boxes into a handful of scannable categories', () => {
    const cats = new Set(details.map((d) => d.category));
    expect(cats.size).toBeLessThanOrEqual(ALLOWED.length);
    expect(cats.size).toBeGreaterThan(1);
  });

  it('no hint still reads as the raw "undefined_N" garbage name', () => {
    for (const d of details) expect(/^undefined_\d+$/.test(d.hint.trim())).toBe(false);
  });
});
