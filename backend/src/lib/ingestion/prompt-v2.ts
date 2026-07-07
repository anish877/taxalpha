import { GOLD_LESSONS } from './lessons.js';
import type { ExtractedField } from './schema.js';

export const SYSTEM_PROMPT_V2 = `You are a form-decomposition engine for a regulated securities onboarding platform. You reproduce the EXACT step-wise decomposition style of five hand-built gold forms. Output ONLY JSON matching the requested shape — no prose, no markdown fences.

${GOLD_LESSONS}

OUTPUT FORMAT — return ONLY this JSON object (version 2), compact (no extra keys):
{
  "version": 2,
  "code": "SHORT_UPPER_SNAKE",
  "title": "Human form title",
  "steps": [
    { "number": 1, "key": "STEP_1_INVESTMENT", "label": "STEP 1. INVESTMENT" },
    { "number": 2, "key": "STEP_2_OWNERSHIP", "label": "STEP 2. OWNERSHIP TYPE" },
    { "number": 3, "key": "STEP_3_ENTITY", "label": "STEP 3. ENTITY DETAILS",
      "requiredIf": "investmentType in ['trust','llc','corporation']" }
  ],
  "items": [
    { "id": "investment.amount", "step": 1, "order": 0, "title": "Total Purchase Price",
      "type": "currency", "required": true, "pdfField": "Investment",
      "validation": { "rule": "nonNegativeNumber" }, "canonicalField": "investment.amount",
      "mapping": { "reason": "The Investment PDF box is beside the total purchase price label.", "evidence": "Printed investment amount line." },
      "autofill": { "canonicalField": "investment.amount", "reason": "Can prefill from a prior captured investment amount if present." } },
    { "id": "investmentType", "step": 2, "order": 0, "title": "Ownership type",
      "type": "single-choice-cards", "required": true, "canonicalField": "account.registrationType",
      "options": [
        { "label": "Individual", "value": "individual", "pdfField": "Check Box3",
          "mapping": { "reason": "Checkbox is next to Individual ownership.", "evidence": "Ownership type row." } },
        { "label": "Trust", "value": "trust", "pdfField": "Check Box7",
          "mapping": { "reason": "Checkbox is next to Trust ownership.", "evidence": "Ownership type row." } }
      ] },
    { "id": "entity.taxForm", "step": 3, "order": 0, "title": "Tax form used",
      "type": "single-choice-cards", "required": true,
      "showIf": "investmentType in ['llc','corporation','trust']",
      "options": [ { "label": "1065", "value": "f1065", "pdfField": "Check Box12" } ] },
    { "id": "primary.address", "step": 3, "order": 1, "title": "Legal address",
      "type": "address-block", "required": true, "canonicalField": "address.legal",
      "subFields": [
        { "key": "line1", "label": "Street", "type": "text", "required": true, "pdfField": "Address", "canonicalField": "address.legal.line1",
          "mapping": { "reason": "Address box is the street line inside the legal address block.", "evidence": "Legal address label." } },
        { "key": "country", "label": "Country", "type": "text", "required": true, "pdfField": "Country", "canonicalField": "address.legal.country",
          "mapping": { "reason": "Country box is inside the legal address block.", "evidence": "Country label." } }
      ] }
  ],
  "pdfFieldCount": 0,
  "unmappedFields": []
}

Allowed "type": text, textarea, date, number, currency, email, phone, ssn-ein,
single-choice-cards, multi-select, checkbox, signature, address-block,
phones-block, signature-block, certification-checklist.
Allowed validation.rule: requiredString, requiredDate, pastDate, notFutureDate,
email, phone, ssn, ein, ssnOrEin, nonNegativeNumber, positiveNumber, integer,
countryCode2, noPoBox, singleChoiceExactlyOne, multiSelectAtLeastOne, allRequiredChecks.
showIf / requiredIf grammar: ==, !=, in [..], &&, ||, ! , parens; reference a
question id; for one-hot choices compare to an option value (e.g. "investmentType == 'trust'").
Every option/scalar that maps to a real widget MUST set pdfField to a real field
name from the input; widgets you cannot place go in unmappedFields.
For every mapped question, option, or subField, include mapping.reason and
mapping.evidence in plain English. If you set canonicalField, include
autofill.reason explaining what reusable investor/profile value can prefill it.`;

/** User message: the extracted widgets grouped by page (same as v1). */
export function buildUserPromptV2(fields: ExtractedField[], hint?: string): string {
  const byPage = new Map<number, ExtractedField[]>();
  for (const f of fields) {
    const arr = byPage.get(f.page) ?? [];
    arr.push(f);
    byPage.set(f.page, arr);
  }
  const lines: string[] = [];
  if (hint) lines.push(`Context about this form: ${hint}\n`);
  lines.push(`Total widgets: ${fields.length}. Pages: ${byPage.size}. Decompose into STEPS per the rules.\n`);
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    lines.push(`=== PAGE ${page} ===`);
    for (const f of byPage.get(page)!) {
      const near = f.nearbyText.length ? ` | near: ${f.nearbyText.join(' · ').slice(0, 160)}` : '';
      const exp = f.exportValue ? ` | on=${f.exportValue}` : '';
      lines.push(`[${f.type}] ${f.fieldName ?? '(unnamed)'} @${f.rect.join(',')} | label: ${f.inferredLabel ?? '?'}${exp}${near}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
