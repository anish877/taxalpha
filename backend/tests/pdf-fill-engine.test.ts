import { describe, expect, it } from 'vitest';

import type { PdfStructure } from '../src/lib/ingestion/extract.js';
import { FORM_INTELLIGENCE_CORPUS } from '../src/lib/pdf-fill/form-intelligence.js';
import {
  buildInitialPdfFill,
  parsePdfFillOverrides,
  resolvePublicPdfFillLayout
} from '../src/lib/pdf-fill/engine.js';
import type { ProfileLookup } from '../src/lib/dynamic-step-engine.js';

const PDF = new Uint8Array(Buffer.from('%PDF-1.4\nunit test pdf\n'));

const LOOKUP: ProfileLookup = {
  'advisor.rrName': { value: 'Alex Advisor', sourceFormCode: 'INVESTOR_PROFILE' },
  'person.fullName': { value: 'Blue Oak Capital LLC', sourceFormCode: 'INVESTOR_PROFILE' },
  'account.registrationType': {
    value: {
      individual: true,
      jointTenant: false,
      limitedLiabilityCompany: false
    },
    sourceFormCode: 'INVESTOR_PROFILE'
  },
  'financial.netWorthExPrimaryResidence': { value: 1_400_000, sourceFormCode: 'SFC' }
};

const STRUCTURE: PdfStructure = {
  pages: [{ page: 1, width: 612, height: 792 }],
  fields: [
    {
      page: 1,
      fieldName: 'RR Name',
      type: 'text',
      rect: [80, 700, 220, 718],
      inferredLabel: 'RR Name',
      nearbyText: ['RR Name'],
      exportValue: null
    },
    {
      page: 1,
      fieldName: 'Check Box28',
      type: 'checkbox',
      rect: [80, 650, 92, 662],
      inferredLabel: 'An individual net worth exceeds $1,000,000',
      nearbyText: ['An individual net worth', 'exceeds $1,000,000'],
      exportValue: 'Yes'
    },
    {
      page: 1,
      fieldName: 'Investor Signature',
      type: 'signature',
      rect: [80, 200, 220, 220],
      inferredLabel: 'Signature',
      nearbyText: ['Signature'],
      exportValue: null
    }
  ]
};

describe('direct PDF fill engine', () => {
  it('documents all five source forms in the corpus', () => {
    expect(FORM_INTELLIGENCE_CORPUS.sourceForms.map((form) => form.code).sort()).toEqual([
      'BAIODF',
      'BAIV_506C',
      'INVESTOR_PROFILE',
      'INVESTOR_PROFILE_ADDITIONAL_HOLDER',
      'SFC'
    ]);
  });

  it('resolves public targets without exposing internal variable keys', () => {
    const built = buildInitialPdfFill(PDF, STRUCTURE, LOOKUP);
    const serialized = JSON.stringify(built.resolvedLayout);

    expect(serialized).not.toContain('canonical:');
    expect(serialized).not.toContain('fact:');
    expect(built.resolvedLayout.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'RR Name',
          value: 'Alex Advisor',
          displayValue: 'Alex Advisor',
          status: 'filled',
          sourceLabel: 'Investor Profile'
        }),
        expect.objectContaining({
          label: 'Signature',
          status: 'skipped',
          editable: false
        })
      ])
    );
  });

  it('lets PDF-instance overrides win without changing mappings', () => {
    const built = buildInitialPdfFill(PDF, STRUCTURE, LOOKUP);
    const rrTarget = built.resolvedLayout.targets.find((target) => target.label === 'RR Name');
    expect(rrTarget).toBeTruthy();

    const { resolvedLayout } = resolvePublicPdfFillLayout(STRUCTURE.pages, built.mappingLayout, LOOKUP, {
      previous: built.resolvedLayout,
      overrides: parsePdfFillOverrides({
        [rrTarget!.id]: { value: 'Edited Advisor' }
      })
    });

    expect(resolvedLayout.targets.find((target) => target.id === rrTarget!.id)).toMatchObject({
      value: 'Edited Advisor',
      sourceLabel: 'Manual edit',
      status: 'filled'
    });
    expect(JSON.stringify(built.mappingLayout)).toContain('fact:advisor.rrName');
  });
});
