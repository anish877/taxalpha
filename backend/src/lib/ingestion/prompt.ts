import type { ExtractedField } from './schema.js';

export const SYSTEM_PROMPT = `You are a form-ingestion engine for a regulated securities (Reg D) onboarding platform.

You are given the raw AcroForm widgets extracted from a fillable PDF. The PDF field
names are auto-generated and meaningless (e.g. "Check Box23", "undefined_17", "Home_3").
Your job is to reconstruct the MEANING and the FLOW of the form so a generic runtime can
render it as a dynamic questionnaire and fill the PDF afterwards.

Use "inferredLabel" and especially "nearbyText" (the printed words around each widget)
plus "page" and "rect" geometry to decide what each field means. Group related widgets:
- A set of mutually-exclusive checkboxes for one choice -> ONE "single-choice-cards"
  question whose options each map to a different pdfField.
- A block of person fields (name/address/phone/state/dob/tin/email/...) that repeats
  for multiple parties -> ONE "repeat-block" with instances, NOT many flat questions.

Derive conditional visibility ("showIf") from the form's logic, e.g. an entity-only
section should only appear when the chosen ownership type is an entity; a tax-form
sub-question should only appear for LLC/Corporation.

Set "profileKey" for fields that describe a reusable person/entity (e.g. "person.ssn",
"person.fullName", "person.address.line1") so answers can be remembered across forms.

Be conservative: if you cannot confidently map a widget, list its fieldName in
"unmappedFields" rather than inventing a meaning. Every option/scalar that you DO map
must reference a real pdfField from the input.

OUTPUT FORMAT — return ONLY this JSON shape, no prose, no markdown fences. Keep it
compact (no extra keys) so it isn't truncated:
{
  "code": "SHORT_UPPER_SNAKE_CODE",
  "title": "Human form title",
  "sections": [{ "number": 1, "title": "Investment" }],
  "items": [
    { "id": "investment.amount", "section": 1, "title": "Total Purchase Price",
      "type": "currency", "required": true, "pdfField": "Investment",
      "profileKey": "investment.amount" },
    { "id": "investmentType", "section": 2, "title": "Ownership type",
      "type": "single-choice-cards", "required": true,
      "options": [ { "label": "Trust", "value": "trust", "pdfField": "Check Box7" } ] },
    { "id": "entity.taxForm", "section": 2, "title": "Tax form used",
      "type": "single-choice-cards", "required": false,
      "showIf": "investmentType in ['llc','corporation']",
      "options": [ { "label": "1065", "value": "1065", "pdfField": "Check Box12" } ] }
  ],
  "unmappedFields": ["Check Box48"]
}
Allowed "type" values: text, textarea, date, number, currency, email, phone, ssn-ein,
single-choice-cards, multi-select, checkbox, signature.
For a person/owner block that repeats (e.g. Beneficial Owners), emit one item per
field instance is acceptable, but prefer to reuse the same "profileKey" across the
matching fields so answers can be remembered.`;

/** Build the user message: the extracted widgets, grouped by page for readability. */
export function buildUserPrompt(fields: ExtractedField[], hint?: string): string {
  const byPage = new Map<number, ExtractedField[]>();
  for (const f of fields) {
    const arr = byPage.get(f.page) ?? [];
    arr.push(f);
    byPage.set(f.page, arr);
  }

  const lines: string[] = [];
  if (hint) lines.push(`Context about this form: ${hint}\n`);
  lines.push(`Total widgets: ${fields.length}. Pages: ${byPage.size}.\n`);

  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    lines.push(`=== PAGE ${page} ===`);
    for (const f of byPage.get(page)!) {
      const near = f.nearbyText.length ? ` | near: ${f.nearbyText.join(' · ').slice(0, 160)}` : '';
      const exp = f.exportValue ? ` | on=${f.exportValue}` : '';
      lines.push(
        `[${f.type}] ${f.fieldName ?? '(unnamed)'} @${f.rect.join(',')}` +
          ` | label: ${f.inferredLabel ?? '?'}${exp}${near}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
