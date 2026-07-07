import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findDeadConditions } from '../src/lib/ingestion/lint-conditions.js';
import { FormSchemaV2, type FormSchemaV2 as FormSchemaV2Type } from '../src/lib/ingestion/schema-v2.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = <T>(n: string): T => JSON.parse(readFileSync(resolve(here, 'fixtures', n), 'utf8')) as T;

function s(items: unknown[], steps: unknown[]): FormSchemaV2Type {
  return FormSchemaV2.parse({ version: 2, code: 'T', title: 'T', steps, items, pdfFieldCount: 0, unmappedFields: [] });
}

describe('findDeadConditions', () => {
  it('flags a requiredIf that references a value the choice field can never hold', () => {
    const schema = s(
      [{ id: 'ownership.type', step: 1, order: 0, title: 'Type', type: 'single-choice-cards',
        options: [{ label: 'Joint', value: 'joint_survivorship', pdfField: null }, { label: 'Ind', value: 'individual', pdfField: null }] }],
      [{ number: 1, key: 'S1', label: 'S1' }, { number: 2, key: 'S2', label: 'S2', requiredIf: "ownership.type in ['joint_tenants','tenants_entirety']" }]
    );
    const dead = findDeadConditions(schema);
    expect(dead.length).toBe(2); // joint_tenants + tenants_entirety don't exist
    expect(dead.map((d) => d.value).sort()).toEqual(['joint_tenants', 'tenants_entirety']);
  });

  it('passes a condition that uses real option values', () => {
    const schema = s(
      [{ id: 'ownership.type', step: 1, order: 0, title: 'Type', type: 'single-choice-cards',
        options: [{ label: 'Joint', value: 'joint_survivorship', pdfField: null }] }],
      [{ number: 1, key: 'S1', label: 'S1' }, { number: 2, key: 'S2', label: 'S2', requiredIf: "ownership.type == 'joint_survivorship'" }]
    );
    expect(findDeadConditions(schema)).toEqual([]);
  });

  it('REGRESSION GATE: the paged TEP schema has ZERO dead conditions', () => {
    const tep = FormSchemaV2.parse(read('tep.schema.paged.json'));
    expect(findDeadConditions(tep)).toEqual([]);
  });
});
