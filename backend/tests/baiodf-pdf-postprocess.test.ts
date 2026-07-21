import { readFile } from 'node:fs/promises';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { postprocessGeneratedBaiodfPdf } from '../src/lib/baiodf-pdf-postprocess.js';
import { defaultBaiodfStep1Fields, serializeBaiodfStep1Fields } from '../src/lib/baiodf-step1.js';
import { defaultBaiodfStep2Fields, serializeBaiodfStep2Fields } from '../src/lib/baiodf-step2.js';

describe('BAIODF generated PDF post-processing', () => {
  it('overrides the template No default and writes all concentration percentages', async () => {
    const source = await readFile('tests/fixtures/gold/BAIODF.source.pdf');
    const step1 = defaultBaiodfStep1Fields();
    step1.orderBasics.proposedPrincipalAmount = 20_000;
    step1.orderBasics.taxAdvantagePurchase = { yes: true, no: false };

    const step2 = defaultBaiodfStep2Fields();
    step2.existingAltPositions.existingIlliquidAltPositions = 10_000;
    step2.existingAltPositions.existingSemiLiquidAltPositions = 5_000;
    step2.existingAltPositions.existingTaxAdvantageAltPositions = 2_000;
    step2.netWorthAndConcentration.totalNetWorth = 100_000;

    const result = await postprocessGeneratedBaiodfPdf(
      source,
      serializeBaiodfStep1Fields(step1),
      serializeBaiodfStep2Fields(step2)
    );
    const document = await PDFDocument.load(result);
    const form = document.getForm();

    expect(form.getRadioGroup('Radio4').getSelected()).toBe('Choice1');
    expect(form.getTextField('ExistingIlliquidAltConcentration').getText()).toBe('10.00');
    expect(form.getTextField('ExistingSemiLiquidAltConcentration').getText()).toBe('5.00');
    expect(form.getTextField('ExistingTaxAdvantageAltConcentration').getText()).toBe('2.00');
    expect(form.getTextField('TotalConcentration').getText()).toBe('35.00');
  });

  it('clears the template No default when the saved answer is incomplete', async () => {
    const source = await readFile('tests/fixtures/gold/BAIODF.source.pdf');
    const result = await postprocessGeneratedBaiodfPdf(source, null, null);
    const document = await PDFDocument.load(result);

    expect(document.getForm().getRadioGroup('Radio4').getSelected()).toBeUndefined();
  });
});
