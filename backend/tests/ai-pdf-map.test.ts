import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfileLookup } from '../src/lib/dynamic-step-engine.js';
import type { PdfStructure } from '../src/lib/ingestion/extract.js';
import { buildAiPdfFill } from '../src/lib/pdf-fill/ai-map.js';

const openRouterMocks = vi.hoisted(() => ({ chatCompletion: vi.fn() }));

vi.mock('../src/lib/ingestion/openrouter.js', () => ({
  chatCompletion: openRouterMocks.chatCompletion
}));

const PDF = new Uint8Array(Buffer.from('%PDF-1.4\nai mapping test\n'));
const OPTIONS = {
  apiKey: 'test-key',
  model: 'test-model',
  baseUrl: 'https://example.com',
  reasoningEffort: 'high' as const
};
const LOOKUP: ProfileLookup = {
  'advisor.rrName': { value: 'Advisor One', sourceFormCode: 'INVESTOR_PROFILE' },
  'person.email': { value: 'client@example.com', sourceFormCode: 'INVESTOR_PROFILE' }
};
const STRUCTURE: PdfStructure = {
  pages: [{ page: 1, width: 612, height: 792 }],
  fields: [
    {
      page: 1,
      fieldName: 'RR Name',
      type: 'text',
      rect: [20, 700, 200, 720],
      inferredLabel: 'RR Name',
      nearbyText: ['RR Name'],
      exportValue: null
    },
    {
      page: 1,
      fieldName: 'ContactEmail',
      type: 'text',
      rect: [20, 660, 200, 680],
      inferredLabel: 'Contact email',
      nearbyText: ['Contact email'],
      exportValue: null
    },
    {
      page: 1,
      fieldName: 'Investor Signature',
      type: 'signature',
      rect: [20, 100, 200, 120],
      inferredLabel: 'Investor Signature',
      nearbyText: ['Investor Signature'],
      exportValue: null
    }
  ]
};

describe('AI PDF mapping', () => {
  beforeEach(() => {
    openRouterMocks.chatCompletion.mockReset();
  });

  it('keeps deterministic mappings and signature skips while accepting safe AI additions', async () => {
    openRouterMocks.chatCompletion.mockResolvedValue(
      JSON.stringify({
        decisions: [
          { fieldIndex: 0, label: 'RR Name', variableKey: null, confidence: 0.2 },
          {
            fieldIndex: 1,
            label: 'Contact email',
            variableKey: 'canonical:person.email',
            format: 'text',
            confidence: 0.93
          },
          {
            fieldIndex: 2,
            label: 'Investor Signature',
            variableKey: 'canonical:person.fullName',
            confidence: 0.99
          }
        ]
      })
    );

    const built = await buildAiPdfFill(PDF, STRUCTURE, LOOKUP, OPTIONS);

    expect(built.mappingLayout.targets[0]).toMatchObject({
      variableKey: 'fact:advisor.rrName',
      confidence: 0.86
    });
    expect(built.mappingLayout.targets[1]).toMatchObject({
      variableKey: 'canonical:person.email',
      confidence: 0.93
    });
    expect(built.mappingLayout.targets[2]).toMatchObject({
      variableKey: null,
      ignoredReason: 'signature_skipped'
    });
  });

  it('returns a usable deterministic analysis when the AI provider fails', async () => {
    openRouterMocks.chatCompletion.mockRejectedValue(new Error('provider unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const built = await buildAiPdfFill(PDF, STRUCTURE, LOOKUP, OPTIONS);

    expect(built.resolvedLayout.targets[0]).toMatchObject({
      value: 'Advisor One',
      status: 'filled'
    });
    expect(built.resolvedLayout.targets[2]).toMatchObject({ status: 'skipped' });
    expect(warning).toHaveBeenCalledWith(
      'AI PDF mapping failed; using deterministic mapping fallback.',
      expect.objectContaining({ error: 'provider unavailable' })
    );
    warning.mockRestore();
  });
});
