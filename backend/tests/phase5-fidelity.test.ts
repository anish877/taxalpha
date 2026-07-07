import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  computeStepRequired,
  deriveContext,
  getVisibleDynamicQuestionIds,
  normalizeDynamicFields,
  type Fields
} from '../src/lib/dynamic-step-engine.js';
import { FormSchemaV2 } from '../src/lib/ingestion/schema-v2.js';
import { normalizeToV2 } from '../src/lib/ingestion/normalize-v2.js';

const here = dirname(fileURLToPath(import.meta.url));
const v2 = FormSchemaV2.parse(JSON.parse(readFileSync(resolve(here, 'fixtures', 'rgpif.schema.v2.json'), 'utf8')));
const ctx = deriveContext(Date.parse('2026-06-28T00:00:00Z'));
const choose = (key: string, keys: string[]): Fields => Object.fromEntries(keys.map((k) => [k, k === key]));

describe('Phase 5 — ingestion fidelity (RGPIF v2 snapshot)', () => {
  it('is a valid multi-step v2 schema', () => {
    expect(v2.version).toBe(2);
    expect(v2.steps.length).toBeGreaterThanOrEqual(8);
    expect(v2.pdfFieldCount).toBe(195);
  });

  it('GOLD LESSON B: the ownership checkbox grid collapsed to ONE single-choice (≥6 options)', () => {
    const choice = v2.items.filter((i) => (i as { type?: string }).type === 'single-choice-cards');
    expect(choice.length).toBeGreaterThanOrEqual(3);
    const ownership = v2.items.find((i) => (i as { id: string }).id === 'ownershipType') as { type: string; options: unknown[] } | undefined;
    expect(ownership?.type).toBe('single-choice-cards');
    expect(ownership!.options.length).toBeGreaterThanOrEqual(6);
  });

  it('GOLD LESSON C: master selector gates dependent steps (branching present)', () => {
    const gated = v2.steps.filter((s) => s.requiredIf);
    expect(gated.length).toBeGreaterThanOrEqual(3);
    const withShowIf = v2.items.filter((i) => (i as { showIf?: string }).showIf).length;
    expect(withShowIf).toBeGreaterThanOrEqual(5);
  });

  it('every option/scalar pdfField references a REAL widget (no invented fields)', () => {
    const extracted = JSON.parse(readFileSync(resolve(here, 'fixtures', 'rgpif.extracted.json'), 'utf8')) as Array<{ fieldName: string | null }>;
    const real = new Set(extracted.map((e) => e.fieldName).filter(Boolean));
    for (const it of v2.items) {
      const q = it as { pdfField?: string | null; options?: Array<{ pdfField: string | null }>; subFields?: Array<{ pdfField?: string | null }> };
      if (q.pdfField) expect(real.has(q.pdfField), `scalar ${q.pdfField}`).toBe(true);
      for (const o of q.options ?? []) if (o.pdfField) expect(real.has(o.pdfField), `option ${o.pdfField}`).toBe(true);
      for (const sf of q.subFields ?? []) if (sf.pdfField) expect(real.has(sf.pdfField), `sub ${sf.pdfField}`).toBe(true);
    }
  });

  it('the engine drives the branching: gated steps toggle on ownership type', () => {
    const ownership = v2.items.find((i) => (i as { id: string }).id === 'ownershipType') as { options: Array<{ value: string }> };
    const keys = ownership.options.map((o) => o.value);
    const gatedStep = v2.steps.find((s) => s.requiredIf && s.requiredIf.includes('ownershipType in ['));
    expect(gatedStep).toBeTruthy();
    // a key that IS in this step's requiredIf → step required; one that ISN'T → not required
    const inKey = keys.find((k) => gatedStep!.requiredIf!.includes(`'${k}'`));
    const outKey = keys.find((k) => !gatedStep!.requiredIf!.includes(`'${k}'`));
    expect(inKey, 'a key inside the requiredIf list').toBeTruthy();
    expect(computeStepRequired(v2, gatedStep!.number, { ownershipType: choose(inKey!, keys) }, ctx)).toBe(true);
    if (outKey) expect(computeStepRequired(v2, gatedStep!.number, { ownershipType: choose(outKey, keys) }, ctx)).toBe(false);
  });

  it('visibility computes without throwing for every step (engine ⟷ schema compatible)', () => {
    for (const s of v2.steps) {
      const fields = normalizeDynamicFields(v2, s.number, {});
      expect(() => getVisibleDynamicQuestionIds(v2, s.number, fields, ctx)).not.toThrow();
    }
  });

  it('normalizeToV2 is idempotent on already-v2 JSON', () => {
    const names = (JSON.parse(readFileSync(resolve(here, 'fixtures', 'rgpif.extracted.json'), 'utf8')) as Array<{ fieldName: string | null }>)
      .map((e) => e.fieldName).filter((n): n is string => Boolean(n));
    const again = normalizeToV2(v2, names);
    expect(FormSchemaV2.safeParse(again).success).toBe(true);
    expect(again.steps.length).toBe(v2.steps.length);
    expect(again.items.length).toBe(v2.items.length);
  });
});
