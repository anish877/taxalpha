import type { Prisma } from '@prisma/client';
import { PDFDocument, PDFRadioGroup, PDFTextField } from 'pdf-lib';

import { normalizeBaiodfStep1Fields } from './baiodf-step1.js';
import {
  getBaiodfStep2Concentrations,
  normalizeBaiodfStep2Fields
} from './baiodf-step2.js';

const TAX_ADVANTAGE_PURCHASE_RADIO = 'Radio4';
const TAX_ADVANTAGE_YES_CHOICE = 'Choice1';
const TAX_ADVANTAGE_NO_CHOICE = 'Choice2';

const CONCENTRATION_FIELDS = {
  existingIlliquidAltConcentrationPercent: 'ExistingIlliquidAltConcentration',
  existingSemiLiquidAltConcentrationPercent: 'ExistingSemiLiquidAltConcentration',
  existingTaxAdvantageAltConcentrationPercent: 'ExistingTaxAdvantageAltConcentration',
  totalConcentrationPercent: 'TotalConcentration'
} as const;

function percentage(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

/**
 * Correct fields that the upstream BAIODF template leaves blank or defaults to
 * the wrong value. Saved onboarding data is authoritative over PDF defaults.
 */
export async function postprocessGeneratedBaiodfPdf(
  bytes: Uint8Array,
  step1Data: Prisma.JsonValue | null | undefined,
  step2Data: Prisma.JsonValue | null | undefined
): Promise<Buffer> {
  const step1 = normalizeBaiodfStep1Fields(step1Data ?? null);
  const step2 = normalizeBaiodfStep2Fields(step2Data ?? null);
  const concentrations = getBaiodfStep2Concentrations(
    step2,
    step1.orderBasics.proposedPrincipalAmount
  );

  const document = await PDFDocument.load(bytes);
  const form = document.getForm();
  const taxAdvantageField = form.getFieldMaybe(TAX_ADVANTAGE_PURCHASE_RADIO);

  if (taxAdvantageField instanceof PDFRadioGroup) {
    const { yes, no } = step1.orderBasics.taxAdvantagePurchase;
    if (yes && !no) {
      taxAdvantageField.select(TAX_ADVANTAGE_YES_CHOICE);
    } else if (no && !yes) {
      taxAdvantageField.select(TAX_ADVANTAGE_NO_CHOICE);
    } else {
      // Do not retain the template's preselected "No" for unanswered data.
      taxAdvantageField.clear();
    }
  }

  for (const [key, pdfFieldName] of Object.entries(CONCENTRATION_FIELDS)) {
    const field = form.getFieldMaybe(pdfFieldName);
    if (field instanceof PDFTextField) {
      field.setText(percentage(concentrations[key as keyof typeof CONCENTRATION_FIELDS]));
    }
  }

  return Buffer.from(await document.save());
}
