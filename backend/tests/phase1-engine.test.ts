import { describe, expect, it } from 'vitest';

import {
  applyDynamicAnswer,
  applyDynamicPrefill,
  buildDynamicEnvelope,
  computeStepRequired,
  defaultDynamicFields,
  deriveContext,
  deriveDynamicFormStatus,
  getVisibleDynamicQuestionIds,
  normalizeDynamicFields,
  validateDynamicAnswer,
  type Fields
} from '../src/lib/dynamic-step-engine.js';
import { FormSchemaV2 } from '../src/lib/ingestion/schema-v2.js';

const schema = FormSchemaV2.parse({
  version: 2,
  code: 'RGP_INCOME_FUND_II_SUB',
  title: 'RGP Income Fund II',
  steps: [
    { number: 1, key: 'S1', label: 'STEP 1. INVESTMENT' },
    { number: 2, key: 'S2', label: 'STEP 2. OWNERSHIP', emits: ['requiresStep4'] },
    { number: 3, key: 'S3', label: 'STEP 3. ENTITY', requiredIf: "investmentType in ['trust','llc','corporation']" },
    { number: 4, key: 'S4', label: 'STEP 4. PRIMARY' },
    { number: 5, key: 'S5', label: 'STEP 5. JOINT', requiredIf: "investmentType == 'joint'" },
    { number: 6, key: 'S6', label: 'STEP 6. SIGN', isTerminal: true, emits: ['requiresJointOwnerSignature', 'nextRouteAfterCompletion'] }
  ],
  items: [
    { id: 'investment.amount', step: 1, order: 0, title: 'Amount', type: 'currency', required: true,
      validation: { rule: 'nonNegativeNumber' }, canonicalField: 'investment.amount' },
    { id: 'investmentType', step: 2, order: 0, title: 'Type', type: 'single-choice-cards', required: true,
      options: [
        { label: 'Individual', value: 'individual', pdfField: 'CB3' },
        { label: 'Joint', value: 'joint', pdfField: 'CB4' },
        { label: 'Trust', value: 'trust', pdfField: 'CB7' },
        { label: 'LLC', value: 'llc', pdfField: 'CB9' },
        { label: 'Corporation', value: 'corporation', pdfField: 'CB10' }
      ] },
    { id: 'entity.taxForm', step: 3, order: 0, title: 'Tax form', type: 'single-choice-cards', required: true,
      showIf: "investmentType in ['llc','corporation','trust']",
      options: [{ label: '1065', value: 'f1065', pdfField: 'CB12' }, { label: '1120', value: 'f1120', pdfField: 'CB13' }] },
    { id: 'primary.ssn', step: 4, order: 0, title: 'SSN/TIN', type: 'ssn-ein', required: true,
      validation: { rule: 'ssnOrEin' }, canonicalField: 'person.ssn' },
    { id: 'joint.ssn', step: 5, order: 0, title: 'Joint SSN', type: 'ssn-ein', required: true, validation: { rule: 'ssnOrEin' } },
    { id: 'sign.cert', step: 6, order: 0, title: 'Certify', type: 'certification-checklist', required: true,
      options: [
        { label: 'Accurate', value: 'accurate', pdfField: null, required: true },
        { label: 'PPM received', value: 'ppm', pdfField: null, required: true }
      ] }
  ],
  pdfFieldCount: 7,
  unmappedFields: []
});

const ctx = deriveContext(Date.parse('2026-06-28T00:00:00Z'));

const choose = (key: string, options: string[]): Fields => {
  const m: Record<string, boolean> = {};
  for (const o of options) m[o] = o === key;
  return m;
};
const TYPE_KEYS = ['individual', 'joint', 'trust', 'llc', 'corporation'];

describe('Phase 1 — dynamic step engine', () => {
  it('defaults choice questions to one-hot all-false', () => {
    const f = defaultDynamicFields(schema, 2);
    expect(f.investmentType).toEqual({ individual: false, joint: false, trust: false, llc: false, corporation: false });
  });

  it('validates a single-choice answer (exactly one)', () => {
    expect(validateDynamicAnswer(schema, 'investmentType', choose('trust', TYPE_KEYS)).success).toBe(true);
    expect(validateDynamicAnswer(schema, 'investmentType', { trust: true, llc: true, individual: false, joint: false, corporation: false }).success).toBe(false);
    expect(validateDynamicAnswer(schema, 'investmentType', {}).success).toBe(false);
  });

  it('branching: entity.taxForm visible only for entity types', () => {
    const individual = { investmentType: choose('individual', TYPE_KEYS) };
    const trust = { investmentType: choose('trust', TYPE_KEYS) };
    expect(getVisibleDynamicQuestionIds(schema, 3, individual, ctx)).toEqual([]);
    expect(getVisibleDynamicQuestionIds(schema, 3, trust, ctx)).toEqual(['entity.taxForm']);
  });

  it('step-required derives from requiredIf', () => {
    const individual = { investmentType: choose('individual', TYPE_KEYS) };
    const trust = { investmentType: choose('trust', TYPE_KEYS) };
    const joint = { investmentType: choose('joint', TYPE_KEYS) };
    expect(computeStepRequired(schema, 3, individual, ctx)).toBe(false);
    expect(computeStepRequired(schema, 3, trust, ctx)).toBe(true);
    expect(computeStepRequired(schema, 5, joint, ctx)).toBe(true);
    expect(computeStepRequired(schema, 5, individual, ctx)).toBe(false);
    expect(computeStepRequired(schema, 1, individual, ctx)).toBe(true); // no requiredIf → required
  });

  it('envelope emits optional keys ONLY per step.emits', () => {
    const f1 = normalizeDynamicFields(schema, 1, {});
    const e1 = buildDynamicEnvelope(schema, 1, f1, 0, [], ctx);
    expect('requiresStep4' in e1).toBe(false);

    const f2 = normalizeDynamicFields(schema, 2, {});
    const e2 = buildDynamicEnvelope(schema, 2, f2, 0, [], { ...ctx, requiresStep4: true });
    expect(e2.requiresStep4).toBe(true);

    const f6 = normalizeDynamicFields(schema, 6, {});
    const e6 = buildDynamicEnvelope(schema, 6, f6, 0, [], { ...ctx, requiresJointOwnerSignature: true, nextRouteAfterCompletion: '/done' });
    expect(e6.requiresJointOwnerSignature).toBe(true);
    expect(e6.nextRouteAfterCompletion).toBe('/done');
  });

  it('apply one-hot sets siblings false; cross-step stale values are masked by visibility', () => {
    let fields: Fields = { investmentType: choose('trust', TYPE_KEYS), entity: { taxForm: choose('f1065', ['f1065', 'f1120']) } };
    // switch to individual -> entity.taxForm (a different step) is no longer visible
    fields = applyDynamicAnswer(schema, fields, 'investmentType', choose('individual', TYPE_KEYS), ctx);
    expect((fields.investmentType as Record<string, boolean>).individual).toBe(true);
    expect((fields.investmentType as Record<string, boolean>).trust).toBe(false);
    // never-skip invariant works the other way too: a hidden question is masked,
    // not shown/counted, even if a stale value lingers in its bucket.
    expect(getVisibleDynamicQuestionIds(schema, 3, fields, ctx)).toEqual([]);
  });

  it('clears WITHIN-step hidden dependents on gate toggle', () => {
    // Build a 1-step schema with an in-step gate to prove same-step clearing.
    const s1 = FormSchemaV2.parse({
      version: 2, code: 'X', title: 'X',
      steps: [{ number: 1, key: 'S1', label: 'S1' }],
      items: [
        { id: 'hasOther', step: 1, order: 0, title: 'Other?', type: 'single-choice-cards', required: true,
          options: [{ label: 'Yes', value: 'yes', pdfField: null }, { label: 'No', value: 'no', pdfField: null }] },
        { id: 'otherText', step: 1, order: 1, title: 'Detail', type: 'text', required: true, showIf: "hasOther == 'yes'" }
      ],
      pdfFieldCount: 0, unmappedFields: []
    });
    let f: Fields = { hasOther: { yes: true, no: false }, otherText: 'something' };
    f = applyDynamicAnswer(s1, f, 'hasOther', { yes: false, no: true }, ctx);
    expect(f.otherText).toBe(''); // cleared because now hidden, no canonicalField
  });

  it('form status: COMPLETED only when all REQUIRED steps complete (individual path skips 3 & 5)', () => {
    const stepData: Record<number, Fields> = {
      1: { investment: { amount: '250000' } },
      2: { investmentType: choose('individual', TYPE_KEYS) },
      4: { primary: { ssn: '123456789' } },
      6: { sign: { cert: { accurate: true, ppm: true } } }
    };
    expect(deriveDynamicFormStatus(schema, {}, ctx)).toBe('NOT_STARTED');
    expect(deriveDynamicFormStatus(schema, { 1: stepData[1] }, ctx)).toBe('IN_PROGRESS');
    expect(deriveDynamicFormStatus(schema, stepData, ctx)).toBe('COMPLETED');
  });

  it('trust path is INCOMPLETE until step 3 is filled (never skipped)', () => {
    const stepData: Record<number, Fields> = {
      1: { investment: { amount: '250000' } },
      2: { investmentType: choose('trust', TYPE_KEYS) },
      4: { primary: { ssn: '123456789' } },
      6: { sign: { cert: { accurate: true, ppm: true } } }
    };
    expect(deriveDynamicFormStatus(schema, stepData, ctx)).toBe('IN_PROGRESS'); // step 3 required but empty
    stepData[3] = { entity: { taxForm: choose('f1065', ['f1065', 'f1120']) } };
    expect(deriveDynamicFormStatus(schema, stepData, ctx)).toBe('COMPLETED');
  });

  it('validates composite (address-block) sub-fields, errors keyed by id.subKey', () => {
    const s = FormSchemaV2.parse({
      version: 2, code: 'X', title: 'X',
      steps: [{ number: 1, key: 'S1', label: 'S1' }],
      items: [{
        id: 'primary.address', step: 1, order: 0, title: 'Address', type: 'address-block', required: true,
        subFields: [
          { key: 'line1', label: 'Street', type: 'text', required: true, validation: { rule: 'noPoBox' } },
          { key: 'country', label: 'Country', type: 'text', required: true, validation: { rule: 'countryCode2' } }
        ]
      }],
      pdfFieldCount: 0, unmappedFields: []
    });
    const good = validateDynamicAnswer(s, 'primary.address', { line1: '1 Main St', country: 'US' });
    expect(good.success).toBe(true);
    const bad = validateDynamicAnswer(s, 'primary.address', { line1: 'PO Box 9', country: 'USA' });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.fieldErrors['primary.address.line1']).toBeTruthy();
      expect(bad.fieldErrors['primary.address.country']).toBeTruthy();
    }
  });

  it('prefill fills empty canonical targets, keeps them visible, never clobbers', () => {
    const fields = normalizeDynamicFields(schema, 4, {});
    const lookup = { 'person.ssn': { value: '123456789', sourceFormCode: 'INVESTOR_PROFILE' } };
    const { fields: filled, autoFilled } = applyDynamicPrefill(schema, 4, fields, lookup, schema.code);
    expect(autoFilled).toContain('primary.ssn');
    expect((filled.primary as Record<string, unknown>).ssn).toBe('123456789');
    // still visible (never skipped)
    expect(getVisibleDynamicQuestionIds(schema, 4, filled, ctx)).toContain('primary.ssn');
    // over-fill guard: bad stored value is NOT prefilled
    const bad = applyDynamicPrefill(schema, 4, normalizeDynamicFields(schema, 4, {}), { 'person.ssn': { value: '12', sourceFormCode: 'X' } }, schema.code);
    expect(bad.autoFilled).not.toContain('primary.ssn');
  });
});
