import { describe, expect, it } from 'vitest';

import { resolveFieldValues } from '../src/lib/ingestion/resolve.js';
import type { FormSchema } from '../src/lib/ingestion/schema.js';

function schema(items: FormSchema['items']): FormSchema {
  return {
    code: 'T',
    title: 'T',
    description: null,
    sections: [],
    items,
    pdfFieldCount: 0,
    unmappedFields: []
  };
}

describe('resolveFieldValues', () => {
  it('maps scalar answers to their pdf field', () => {
    const s = schema([
      { id: 'amount', section: 1, title: 'Amount', type: 'currency', required: true, pdfField: 'Investment' }
    ]);
    expect(resolveFieldValues(s, { amount: '$250,000' })).toEqual({ Investment: '$250,000' });
  });

  it('checks the chosen option for single-choice questions', () => {
    const s = schema([
      {
        id: 'ownership',
        section: 2,
        title: 'Ownership',
        type: 'single-choice-cards',
        required: true,
        options: [
          { label: 'Trust', value: 'trust', pdfField: 'Check Box7' },
          { label: 'LLC', value: 'llc', pdfField: 'Check Box9' }
        ]
      }
    ]);
    expect(resolveFieldValues(s, { ownership: 'trust' })).toEqual({ 'Check Box7': true });
  });

  it('checks every selected option for multi-select', () => {
    const s = schema([
      {
        id: 'acc',
        section: 8,
        title: 'Accreditation',
        type: 'multi-select',
        required: false,
        options: [
          { label: 'Net worth', value: 'nw', pdfField: 'Check Box30' },
          { label: 'Income', value: 'inc', pdfField: 'Check Box31' },
          { label: 'License', value: 'lic', pdfField: 'Check Box32' }
        ]
      }
    ]);
    expect(resolveFieldValues(s, { acc: ['nw', 'lic'] })).toEqual({ 'Check Box30': true, 'Check Box32': true });
  });

  it('handles boolean checkboxes', () => {
    const s = schema([
      { id: 'esign', section: 10, title: 'Consent', type: 'checkbox', required: false, pdfField: 'Check Box57' }
    ]);
    expect(resolveFieldValues(s, { esign: true })).toEqual({ 'Check Box57': true });
    expect(resolveFieldValues(s, { esign: false })).toEqual({ 'Check Box57': false });
  });

  it('skips unanswered questions', () => {
    const s = schema([
      { id: 'a', section: 1, title: 'A', type: 'text', required: false, pdfField: 'FieldA' },
      { id: 'b', section: 1, title: 'B', type: 'text', required: false, pdfField: 'FieldB' }
    ]);
    expect(resolveFieldValues(s, { a: 'hi', b: '' })).toEqual({ FieldA: 'hi' });
  });
});
