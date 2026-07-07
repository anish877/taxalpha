import { describe, expect, it } from 'vitest';

import { applyRequiredHints } from '../src/lib/ingestion/required-hints.js';
import { ExtractedField } from '../src/lib/ingestion/schema.js';
import { FormSchemaV2, type FormSchemaV2 as FormSchemaV2Type } from '../src/lib/ingestion/schema-v2.js';

function schema(items: unknown[]): FormSchemaV2Type {
  return FormSchemaV2.parse({
    version: 2, code: 'T', title: 'T',
    steps: [{ number: 12, key: 'S12', label: 'STEP 12. BROKER-DEALER' }],
    items, pdfFieldCount: 3, unmappedFields: []
  });
}
const ext = ExtractedField.array().parse([
  { page: 13, fieldName: 'PrincipalSig', type: 'signature', rect: [0, 0, 1, 1], inferredLabel: 'Broker-Dealer Principal Approval Signature (REQUIRED)', nearbyText: [], exportValue: null },
  { page: 13, fieldName: 'RepSig', type: 'signature', rect: [0, 0, 1, 1], inferredLabel: 'Signature of Registered Representative', nearbyText: [], exportValue: null }
]);

describe('applyRequiredHints', () => {
  it('forces required:true when the PDF label says (REQUIRED)', () => {
    const s = schema([
      { id: 'sig.principal', step: 12, order: 0, title: 'Principal approval signature', type: 'signature', required: false, pdfField: 'PrincipalSig' },
      { id: 'sig.rep', step: 12, order: 1, title: 'Representative signature', type: 'signature', required: false, pdfField: 'RepSig' }
    ]);
    const { schema: out, changed } = applyRequiredHints(s, ext);
    expect(changed).toBe(1);
    const principal = out.items.find((i) => i.id === 'sig.principal') as { required: boolean };
    const rep = out.items.find((i) => i.id === 'sig.rep') as { required: boolean };
    expect(principal.required).toBe(true); // had (REQUIRED) in nearby text
    expect(rep.required).toBe(false); // no required marker
  });

  it('detects (REQUIRED) in the question title too', () => {
    const s = schema([{ id: 'x', step: 12, order: 0, title: 'RIA Approval Signature (REQUIRED)', type: 'signature', required: false, pdfField: 'unknown' }]);
    const { schema: out } = applyRequiredHints(s, []);
    expect((out.items[0] as { required: boolean }).required).toBe(true);
  });

  it('honors the authoritative PDF /Ff required flag', () => {
    const s = schema([{ id: 'z', step: 12, order: 0, title: 'Tax ID', type: 'text', required: false, pdfField: 'TIN' }]);
    const flagged = ExtractedField.array().parse([
      { page: 1, fieldName: 'TIN', type: 'text', rect: [0, 0, 1, 1], inferredLabel: 'TIN', nearbyText: [], exportValue: null, flags: { required: true } }
    ]);
    const { schema: out, changed } = applyRequiredHints(s, flagged);
    expect(changed).toBe(1);
    expect((out.items[0] as { required: boolean }).required).toBe(true);
  });

  it('does not downgrade an already-required field or touch unrelated ones', () => {
    const s = schema([{ id: 'y', step: 12, order: 0, title: 'Name', type: 'text', required: true, pdfField: 'RepSig' }]);
    const { changed } = applyRequiredHints(s, ext);
    expect(changed).toBe(0);
  });
});
