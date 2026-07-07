import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FormSchema } from '../src/lib/ingestion/schema.js';
import { FormSchemaV2, migrateV1ToV2 } from '../src/lib/ingestion/schema-v2.js';
import { normalizeToFormSchema } from '../src/lib/ingestion/normalize.js';
import { normalizeToV2 } from '../src/lib/ingestion/normalize-v2.js';
import { evaluateShowIf } from '../src/lib/showif/eval.js';
import { runRule } from '../src/lib/validators.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('validators (gold-parity rules)', () => {
  it('requiredString', () => {
    expect(runRule('requiredString', '  hi ').ok).toBe(true);
    expect(runRule('requiredString', '   ').ok).toBe(false);
  });
  it('dates with deterministic now', () => {
    const now = Date.parse('2026-06-28T00:00:00Z');
    expect(runRule('requiredDate', '1990-01-01', { nowMs: now }).ok).toBe(true);
    expect(runRule('requiredDate', '13/2/1990', { nowMs: now }).ok).toBe(false);
    expect(runRule('pastDate', '2999-01-01', { nowMs: now }).ok).toBe(false);
    expect(runRule('pastDate', '1990-01-01', { nowMs: now }).ok).toBe(true);
    expect(runRule('notFutureDate', '2026-06-28', { nowMs: now }).ok).toBe(true);
    expect(runRule('notFutureDate', '2026-06-29', { nowMs: now }).ok).toBe(false);
  });
  it('email / phone', () => {
    expect(runRule('email', 'a@b.com').ok).toBe(true);
    expect(runRule('email', 'nope').ok).toBe(false);
    expect(runRule('phone', '(555) 123-4567').ok).toBe(true);
    expect(runRule('phone', 'abc').ok).toBe(false);
  });
  it('ssnOrEin strips dashes, needs 9 digits', () => {
    const r = runRule('ssnOrEin', '123-45-6789');
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toBe('123456789');
    expect(runRule('ssnOrEin', '12345').ok).toBe(false);
  });
  it('numbers', () => {
    expect(runRule('currency' as never, '0')).toBeTruthy();
    expect(runRule('nonNegativeNumber', '$250,000').ok).toBe(true);
    expect(runRule('nonNegativeNumber', '-5').ok).toBe(false);
    expect(runRule('positiveNumber', '0').ok).toBe(false);
    expect(runRule('integer', '3.5').ok).toBe(false);
  });
  it('countryCode2 / noPoBox', () => {
    expect(runRule('countryCode2', 'us').ok).toBe(true);
    expect(runRule('countryCode2', 'USA').ok).toBe(false);
    expect(runRule('noPoBox', '123 Main St').ok).toBe(true);
    expect(runRule('noPoBox', 'PO Box 7').ok).toBe(false);
    expect(runRule('noPoBox', 'P.O. BOX 7').ok).toBe(false);
  });
  it('single/multi/all-required choice maps', () => {
    const keys = ['a', 'b', 'c'];
    expect(runRule('singleChoiceExactlyOne', { a: true, b: false, c: false }, { keys }).ok).toBe(true);
    expect(runRule('singleChoiceExactlyOne', { a: true, b: true }, { keys }).ok).toBe(false);
    expect(runRule('singleChoiceExactlyOne', { a: false, b: false }, { keys }).ok).toBe(false);
    expect(runRule('multiSelectAtLeastOne', { a: true, b: true }, { keys }).ok).toBe(true);
    expect(runRule('multiSelectAtLeastOne', { a: false }, { keys }).ok).toBe(false);
    expect(runRule('allRequiredChecks', { a: true, b: true }, { keys: ['a', 'b'], requiredKeys: ['a', 'b'] }).ok).toBe(true);
    expect(runRule('allRequiredChecks', { a: true, b: false }, { keys: ['a', 'b'], requiredKeys: ['a', 'b'] }).ok).toBe(false);
  });
});

describe('showIf expression evaluator', () => {
  const fields = {
    typeOfAccount: { primaryType: { trust: true, individual: false, llc: false } },
    investmentType: { llc: false, corporation: true },
    holder: { hasEin: { yes: true, no: false } },
    netWorth: { toBracket: 5 },
    liquidNetWorth: { toBracket: 8 },
    primary: { dob: '2015-01-01' }
  };
  const ctx = { requiresJointOwnerSignature: true, isMinor: (d: unknown) => String(d) >= '2008-01-01' };

  it('null/empty → visible', () => {
    expect(evaluateShowIf(null, fields)).toBe(true);
    expect(evaluateShowIf('', fields)).toBe(true);
  });
  it('equality against one-hot map', () => {
    expect(evaluateShowIf("typeOfAccount.primaryType == 'trust'", fields)).toBe(true);
    expect(evaluateShowIf("typeOfAccount.primaryType == 'llc'", fields)).toBe(false);
    expect(evaluateShowIf("typeOfAccount.primaryType != 'llc'", fields)).toBe(true);
  });
  it('membership in [...]', () => {
    expect(evaluateShowIf("investmentType in ['llc','corporation']", fields)).toBe(true);
    expect(evaluateShowIf("investmentType in ['trust','partnership']", fields)).toBe(false);
  });
  it('negation + parens + precedence (! > && > ||)', () => {
    expect(evaluateShowIf("!(typeOfAccount.primaryType == 'llc')", fields)).toBe(true);
    // a || b && c  ==  a || (b && c)
    expect(evaluateShowIf("typeOfAccount.primaryType == 'trust' || investmentType == 'x' && holder.hasEin == 'no'", fields)).toBe(true);
    expect(evaluateShowIf("(typeOfAccount.primaryType == 'llc' || investmentType == 'corporation') && holder.hasEin == 'yes'", fields)).toBe(true);
  });
  it('numeric comparison', () => {
    expect(evaluateShowIf('liquidNetWorth.toBracket > netWorth.toBracket', fields)).toBe(true);
    expect(evaluateShowIf('liquidNetWorth.toBracket <= netWorth.toBracket', fields)).toBe(false);
  });
  it('ctx flag + ctx.isMinor()', () => {
    expect(evaluateShowIf('ctx.requiresJointOwnerSignature == true', fields, ctx)).toBe(true);
    expect(evaluateShowIf('ctx.isMinor(primary.dob)', fields, ctx)).toBe(true);
  });
  it('fail-closed on server (bad expr hidden), fail-open on client (shown)', () => {
    expect(evaluateShowIf('this is ))( not valid', fields, {}, true)).toBe(false);
    expect(evaluateShowIf('this is ))( not valid', fields, {}, false)).toBe(true);
  });
  it('rejects unknown ctx names (parse error → fail-closed hides)', () => {
    expect(evaluateShowIf('ctx.dropTables() == true', fields, {}, true)).toBe(false);
  });
});

describe('schema v2 + migrateV1ToV2', () => {
  it('normalizes years employed questions to number fields', () => {
    const v1 = normalizeToFormSchema(
      {
        title: 'Investor profile',
        items: [
          {
            id: 'holder.employment.yearsEmployed',
            section: 1,
            title: 'Years employed?',
            type: 'text',
            pdfField: 'YearsEmployed'
          }
        ]
      },
      ['YearsEmployed']
    );
    expect(v1.items[0]?.type).toBe('number');

    const v2 = normalizeToV2(
      {
        title: 'Investor profile',
        items: [
          {
            id: 'holder.employment.yearsEmployed',
            step: 1,
            order: 0,
            title: 'Years employed?',
            type: 'text',
            pdfField: 'YearsEmployed'
          }
        ]
      },
      ['YearsEmployed']
    );
    expect(v2.items[0]?.type).toBe('number');
  });

  it('parses a hand v2 object', () => {
    const v2 = {
      version: 2, code: 'X', title: 'X',
      steps: [{ number: 1, key: 'S1', label: 'STEP 1' }],
      items: [{ id: 'q', step: 1, order: 0, title: 'Q', type: 'text', required: true }],
      pdfFieldCount: 0, unmappedFields: []
    };
    expect(FormSchemaV2.safeParse(v2).success).toBe(true);
  });

  it('lifts the real v1 RGPIF fixture into valid v2 (flat, branchless)', () => {
    const v1raw = JSON.parse(readFileSync(resolve(here, 'fixtures', 'rgpif.schema.json'), 'utf8'));
    const v1 = FormSchema.parse(v1raw);
    const v2 = migrateV1ToV2(v1);
    expect(FormSchemaV2.safeParse(v2).success).toBe(true);
    expect(v2.version).toBe(2);
    // sections became steps
    expect(v2.steps.length).toBe(v1.sections.length);
    // same number of items carried over
    expect(v2.items.length).toBe(v1.items.length);
    // lossy lift: showIf is PRESERVED from v1, never invented or dropped
    const v1ShowIf = v1.items.filter((i) => (i as { showIf?: string | null }).showIf).length;
    const v2ShowIf = v2.items.filter((i) => (i as { showIf?: string | null }).showIf).length;
    expect(v2ShowIf).toBe(v1ShowIf);
    // pdf counts preserved
    expect(v2.pdfFieldCount).toBe(v1.pdfFieldCount);
  });
});
