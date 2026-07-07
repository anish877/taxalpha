import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  rgb
} from 'pdf-lib';

import type { TextOverlayValue } from './pdf-map.js';

/**
 * Stage 3 (low level): write resolved values into a PDF's named AcroForm fields
 * and return the filled bytes. The generic runtime is responsible for turning a
 * client's answers + the FormSchema into this flat `fieldName -> value` map
 * (string for text fields, boolean for checkboxes).
 */
export async function fillPdf(
  template: Uint8Array,
  values: Record<string, string | boolean>,
  options: { flatten?: boolean } = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(template);
  const form = doc.getForm();
  const skipped: string[] = [];

  for (const [name, value] of Object.entries(values)) {
    let field;
    try {
      field = form.getField(name);
    } catch {
      skipped.push(name);
      continue;
    }
    try {
      if (field instanceof PDFCheckBox) {
        if (typeof value === 'boolean') value ? field.check() : field.uncheck();
        else field.check();
      } else if (field instanceof PDFTextField) {
        field.setText(String(value));
      } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
        field.select(String(value));
      } else {
        skipped.push(name);
      }
    } catch {
      skipped.push(name);
    }
  }

  if (options.flatten) form.flatten();
  const bytes = await doc.save();
  if (skipped.length) {
    // Non-fatal: surfaced so the runtime/admin can see which fields didn't apply.
    console.warn(`[fillPdf] ${skipped.length} fields not applied: ${skipped.slice(0, 10).join(', ')}`);
  }
  return bytes;
}

export async function drawPdfTextOverlays(
  pdfBytes: Uint8Array,
  overlays: TextOverlayValue[]
): Promise<Uint8Array> {
  if (overlays.length === 0) return pdfBytes;

  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const overlay of overlays) {
    if (overlay.page < 1 || overlay.page > doc.getPageCount()) continue;
    const page = doc.getPage(overlay.page - 1);
    const { x, y, width, height } = overlay.rect;
    const text = overlay.text.trim();
    if (!text) continue;
    let size = Math.min(10, Math.max(6, height - 3));
    while (size > 6 && font.widthOfTextAtSize(text, size) > width - 3) size -= 0.5;
    page.drawText(text, {
      x: x + 1.5,
      y: y + Math.max(1.5, (height - size) / 2),
      size,
      font,
      color: rgb(0.05, 0.05, 0.05),
      maxWidth: Math.max(8, width - 3)
    });
  }

  return doc.save();
}
