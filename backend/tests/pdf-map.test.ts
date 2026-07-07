import { describe, expect, it } from 'vitest';

import {
  buildAvailableVariables,
  buildMappingLayoutFromFields,
  resolveMappedPdfValues,
  skippedSignatureFields,
  validateMappingLayout
} from '../src/lib/ingestion/pdf-map.js';
import { FormSchemaV2, type FormSchemaV2 as FormSchemaV2Type } from '../src/lib/ingestion/schema-v2.js';
import type { ExtractedField } from '../src/lib/ingestion/schema.js';

const SCHEMA: FormSchemaV2Type = FormSchemaV2.parse({
  version: 2,
  code: 'RGP_INCOME_FUND_II_SUB',
  title: 'RGP',
  steps: [{ number: 1, key: 'STEP_1', label: 'Investor' }],
  items: [
    {
      id: 'investor.fullName',
      step: 1,
      order: 0,
      title: 'Investor full name',
      type: 'text',
      required: true,
      pdfField: 'Full Name',
      canonicalField: 'person.fullName',
      mapping: { confidence: 0.91 }
    },
    {
      id: 'investmentType',
      step: 1,
      order: 1,
      title: 'Investment type',
      type: 'single-choice-cards',
      canonicalField: 'account.registrationType',
      required: true,
      options: [
        { label: 'Individual', value: 'individual', pdfField: 'Check Individual' },
        { label: 'Entity', value: 'entity', pdfField: 'Check Entity' }
      ]
    }
  ],
  pdfFieldCount: 3,
  unmappedFields: []
});

const FIELDS: ExtractedField[] = [
  {
    page: 1,
    fieldName: 'Full Name',
    type: 'text',
    rect: [50, 150, 210, 170],
    inferredLabel: 'Full Name',
    nearbyText: ['Full Name'],
    exportValue: null
  },
  {
    page: 1,
    fieldName: 'Check Individual',
    type: 'checkbox',
    rect: [50, 118, 62, 130],
    inferredLabel: 'Individual',
    nearbyText: ['Individual'],
    exportValue: 'Yes'
  },
  {
    page: 1,
    fieldName: 'Acct Owner Name',
    type: 'text',
    rect: [50, 86, 210, 104],
    inferredLabel: 'Printed Name',
    nearbyText: ['Account Owner Signature', 'Printed Name', 'Date'],
    exportValue: null
  },
  {
    page: 1,
    fieldName: 'Investor Signature',
    type: 'signature',
    rect: [50, 60, 210, 80],
    inferredLabel: 'Signature',
    nearbyText: ['Signature'],
    exportValue: null
  }
];

describe('PDF mapping helpers', () => {
  it('builds editable targets from extracted widgets and skips signatures', () => {
    const layout = buildMappingLayoutFromFields(SCHEMA, FIELDS);
    expect(layout.targets).toHaveLength(2);
    expect(layout.targets[0]).toMatchObject({
      kind: 'acrofield',
      pdfField: 'Full Name',
      variableKey: 'canonical:person.fullName',
      format: 'text',
      confidence: 0.91
    });
    expect(layout.targets[1]).toMatchObject({
      pdfField: 'Check Individual',
      widgetType: 'checkbox',
      variableKey: 'canonical:account.registrationType',
      optionValue: 'individual'
    });
    expect(skippedSignatureFields(FIELDS)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: 'Acct Owner Name',
          label: 'Printed Name',
          ignoredReason: 'signature_skipped'
        }),
        expect.objectContaining({
          fieldName: 'Investor Signature',
          label: 'Signature',
          ignoredReason: 'signature_skipped'
        })
      ])
    );
  });

  it('validates variables and overlay requirements', () => {
    const valid = {
      version: 1 as const,
      targets: [
        {
          id: 'overlay:1',
          kind: 'overlay' as const,
          page: 1,
          rect: { x: 40, y: 40, width: 120, height: 18 },
          widgetType: 'text' as const,
          variableKey: 'fact:advisor.rrName',
          source: 'admin' as const
        }
      ]
    };
    expect(validateMappingLayout(SCHEMA, valid)).toEqual([]);

    const invalid = {
      ...valid,
      targets: [{ ...valid.targets[0], variableKey: 'canonical:not.real' }]
    };
    expect(validateMappingLayout(SCHEMA, invalid)).toEqual([
      'overlay:1: unknown variable canonical:not.real.'
    ]);
  });

  it('resolves AcroForm values and manual overlays from mapped variables', () => {
    const variables = buildAvailableVariables(SCHEMA).map((variable) => variable.key);
    expect(variables).toContain('canonical:investment.amount');
    expect(variables).toContain('fact:accreditation.naturalPersonNetWorthQualified');

    const layout = {
      version: 1 as const,
      targets: [
        {
          id: 'field:name',
          kind: 'acrofield' as const,
          page: 1,
          rect: { x: 50, y: 150, width: 160, height: 20 },
          pdfField: 'Full Name',
          widgetType: 'text' as const,
          variableKey: 'canonical:person.fullName',
          format: 'text' as const,
          source: 'ai' as const
        },
        {
          id: 'field:check',
          kind: 'acrofield' as const,
          page: 1,
          rect: { x: 50, y: 118, width: 12, height: 12 },
          pdfField: 'Check Individual',
          widgetType: 'checkbox' as const,
          variableKey: 'canonical:account.registrationType',
          optionValue: 'individual',
          source: 'ai' as const
        },
        {
          id: 'field:networth',
          kind: 'acrofield' as const,
          page: 1,
          rect: { x: 50, y: 66, width: 12, height: 12 },
          pdfField: 'Net Worth Check',
          widgetType: 'checkbox' as const,
          variableKey: 'fact:accreditation.naturalPersonNetWorthQualified',
          source: 'ai' as const
        },
        {
          id: 'field:income',
          kind: 'acrofield' as const,
          page: 1,
          rect: { x: 50, y: 44, width: 12, height: 12 },
          pdfField: 'Income Check',
          widgetType: 'checkbox' as const,
          variableKey: 'fact:accreditation.naturalPersonIncomeQualified',
          source: 'ai' as const
        },
        {
          id: 'overlay:amount',
          kind: 'overlay' as const,
          page: 1,
          rect: { x: 50, y: 90, width: 120, height: 18 },
          widgetType: 'text' as const,
          variableKey: 'canonical:investment.amount',
          format: 'currency' as const,
          source: 'admin' as const
        }
      ]
    };
    const resolved = resolveMappedPdfValues(
      SCHEMA,
      layout,
      { investor: { fullName: 'Blue Oak Growth LLC' }, investmentType: { individual: true } },
      {
        'person.fullName': { value: 'Blue Oak Growth LLC', sourceFormCode: 'INVESTOR_PROFILE' },
        'account.registrationType': { value: { individual: true }, sourceFormCode: 'INVESTOR_PROFILE' },
        'investment.amount': { value: 250000, sourceFormCode: 'SUBSCRIPTION' },
        'financial.netWorthExPrimaryResidence': { value: 1_200_000, sourceFormCode: 'SFC' }
      }
    );
    expect(resolved.fieldValues).toEqual({
      'Full Name': 'Blue Oak Growth LLC',
      'Check Individual': true,
      'Net Worth Check': true
    });
    expect(resolved.overlays).toEqual([
      expect.objectContaining({ page: 1, text: '$250,000.00' })
    ]);
    expect(resolved.warnings).toEqual([
      expect.objectContaining({
        targetId: 'field:income',
        variableKey: 'fact:accreditation.naturalPersonIncomeQualified',
        missingInputs: ['priorYearIncome1', 'priorYearIncome2', 'currentYearIncomeExpectation']
      })
    ]);
  });
});
