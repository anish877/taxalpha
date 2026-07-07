import { describe, expect, it } from 'vitest';

import { definedChoices, mergePageResult, type PageMergeState } from '../src/lib/ingestion/ingest-paged.js';

function fresh(): PageMergeState {
  return { steps: [], items: [], stepNumberByLabel: new Map(), nextStep: 1 };
}

describe('mergePageResult — rolling-context continuity', () => {
  it('reuses a step number when a later page CONTINUES the same section', () => {
    const s = fresh();
    mergePageResult(s, [{ number: 1, label: 'STEP 5. PRIMARY INVESTOR' }], [{ id: 'a', step: 1 }]);
    // next page re-emits the same section as its local step 1, plus a new section
    mergePageResult(s, [
      { number: 1, label: 'STEP 5. PRIMARY INVESTOR' },
      { number: 2, label: 'STEP 6. SECONDARY INVESTOR' }
    ], [{ id: 'b', step: 1 }, { id: 'c', step: 2 }]);

    expect(s.steps).toHaveLength(2); // section reused, not duplicated
    expect(s.steps.map((x) => x.label)).toEqual(['STEP 5. PRIMARY INVESTOR', 'STEP 6. SECONDARY INVESTOR']);
    const byId = Object.fromEntries(s.items.map((i) => [i.id, i.step]));
    expect(byId.a).toBe(byId.b); // a and b both land in the primary-investor step
    expect(byId.c).not.toBe(byId.a); // c in the new secondary step
  });

  it('assigns globally increasing numbers even if pages reuse local "1"', () => {
    const s = fresh();
    mergePageResult(s, [{ number: 1, label: 'STEP 1. A' }], [{ id: 'a', step: 1 }]);
    mergePageResult(s, [{ number: 1, label: 'STEP 2. B' }], [{ id: 'b', step: 1 }]); // page calls it local 1 but it's new
    expect(s.steps.map((x) => x.number)).toEqual([1, 2]);
    const byId = Object.fromEntries(s.items.map((i) => [i.id, i.step]));
    expect(byId.a).toBe(1);
    expect(byId.b).toBe(2); // remapped to the new global step
  });

  it('routes an item with an unknown step to the latest step (no orphan)', () => {
    const s = fresh();
    mergePageResult(s, [{ number: 1, label: 'STEP 1. A' }], []);
    mergePageResult(s, [], [{ id: 'orphan', step: 99 }]); // no steps this page
    expect(s.items[0]!.step).toBe(1);
  });

  it('dedupes the same section across many pages (case/space-insensitive)', () => {
    const s = fresh();
    mergePageResult(s, [{ number: 3, label: 'STEP 9. ACCREDITED INVESTOR STATUS' }], [{ id: 'x', step: 3 }]);
    mergePageResult(s, [{ number: 1, label: 'step 9.  accredited investor status' }], [{ id: 'y', step: 1 }]);
    expect(s.steps).toHaveLength(1);
    expect(s.items.map((i) => i.step)).toEqual([s.steps[0]!.number, s.steps[0]!.number]);
  });
});

describe('definedChoices — rolling context feeds real option vocab forward', () => {
  it('lists choice questions with their exact option values (so later showIf is not dead)', () => {
    const out = definedChoices([
      { id: 'ownership.type', options: [{ value: 'individual' }, { value: 'joint_survivorship' }, { value: 'trust' }] },
      { id: 'plainText' },
      { id: 'distribution.method', options: [{ value: 'ach' }, { value: 'check' }] }
    ]);
    expect(out).toContain('ownership.type = [individual, joint_survivorship, trust]');
    expect(out).toContain('distribution.method = [ach, check]');
    expect(out).not.toContain('plainText');
  });
});
