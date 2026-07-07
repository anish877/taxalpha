import { createRequire } from 'node:module';

import type { ExtractedField, WidgetType } from './schema.js';

// pdfjs-dist ships a Node-friendly legacy build. Loaded lazily so the rest of
// the backend doesn't pull it in unless a form is actually being ingested.
const require = createRequire(import.meta.url);

interface TextFragment {
  text: string;
  x: number;
  y: number;
}

function mapFieldType(fieldType: string | undefined): WidgetType {
  switch (fieldType) {
    case 'Tx':
      return 'text';
    case 'Btn':
      return 'checkbox';
    case 'Ch':
      return 'choice';
    case 'Sig':
      return 'signature';
    default:
      return 'unknown';
  }
}

/**
 * Pick the most likely label for a widget: prefer text to the LEFT on the same
 * line, else the closest text just ABOVE. Also returns nearby words as context.
 */
function labelFor(
  rect: [number, number, number, number],
  frags: TextFragment[]
): { inferredLabel: string | null; nearbyText: string[] } {
  const [x0, y0, , y1] = rect;
  const cy = (y0 + y1) / 2;

  const sameLine: Array<{ dist: number; text: string }> = [];
  const above: Array<{ score: number; text: string }> = [];

  for (const f of frags) {
    const dy = f.y - cy;
    if (Math.abs(dy) <= 7) {
      if (f.x <= rect[2] + 2) sameLine.push({ dist: x0 - f.x, text: f.text });
    } else if (dy > 0 && dy <= 28 && Math.abs(f.x - x0) < 220) {
      above.push({ score: dy + Math.abs(f.x - x0) * 0.1, text: f.text });
    }
  }

  let inferredLabel: string | null = null;
  if (sameLine.length) {
    sameLine.sort((a, b) => a.dist - b.dist);
    inferredLabel = sameLine[0]!.text;
  } else if (above.length) {
    above.sort((a, b) => a.score - b.score);
    inferredLabel = above[0]!.text;
  }

  const nearbyText = frags
    .filter((f) => Math.abs(f.y - cy) <= 24)
    .map((f) => ({ ...f, d: Math.abs(f.y - cy) + Math.abs(f.x - x0) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 6)
    .map((f) => f.text);

  return { inferredLabel, nearbyText };
}

/** A /TU tooltip is useful only if it's a real label (not "undefined", "[1]", numbers). */
function goodTooltip(tu: unknown): string | null {
  if (typeof tu !== 'string') return null;
  const t = tu.trim();
  if (!t || /^undefined$/i.test(t) || /^\[?\d+\]?$/.test(t) || !/[a-zA-Z]{2,}/.test(t)) return null;
  return t;
}

function widgetFlags(a: Record<string, unknown>): { required?: boolean; readOnly?: boolean; multiLine?: boolean; maxLen?: number } {
  const f: { required?: boolean; readOnly?: boolean; multiLine?: boolean; maxLen?: number } = {};
  if (a.required === true) f.required = true;
  if (a.readOnly === true) f.readOnly = true;
  if (a.multiLine === true) f.multiLine = true;
  if (typeof a.maxLen === 'number' && (a.maxLen as number) > 0) f.maxLen = a.maxLen as number;
  return f;
}

/**
 * Stage 1: extract every AcroForm widget with page, type, geometry, and the
 * nearest printed text. Deterministic — no AI. Feeds `labelFields()`.
 */
export async function extractFields(pdf: Uint8Array): Promise<ExtractedField[]> {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: pdf,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true
  }).promise;

  const out: ExtractedField[] = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const frags: TextFragment[] = content.items
      .filter((it: { str?: string }) => typeof it.str === 'string' && it.str.trim())
      .map((it: { str: string; transform: number[] }) => ({
        text: it.str.trim(),
        x: it.transform[4],
        y: it.transform[5]
      }));

    const annots = await page.getAnnotations();
    for (const a of annots as Array<Record<string, unknown>>) {
      if (a.subtype !== 'Widget') continue;
      const rect = (a.rect as number[]).map((n) => Math.round(n * 10) / 10) as [
        number,
        number,
        number,
        number
      ];
      const { inferredLabel, nearbyText } = labelFor(rect, frags);
      const tooltip = goodTooltip(a.alternativeText);
      out.push({
        page: p,
        fieldName: (a.fieldName as string) || null,
        type: mapFieldType(a.fieldType as string | undefined),
        rect,
        // prefer the authored /TU tooltip as the label when it's meaningful
        inferredLabel: tooltip ?? inferredLabel,
        nearbyText,
        exportValue: (a.exportValue as string) ?? null,
        tooltip,
        flags: widgetFlags(a)
      });
    }
  }

  await doc.cleanup();
  return out;
}

export interface PageExtract {
  page: number;
  widgets: ExtractedField[];
  /** the page's printed text, top-to-bottom, for headings/section context */
  text: string;
}

export interface PdfPageGeometry {
  page: number;
  width: number;
  height: number;
}

export interface PdfStructure {
  pages: PdfPageGeometry[];
  fields: ExtractedField[];
}

/**
 * Per-page extraction for the rolling-context (page-by-page) ingestion pipeline.
 * Returns each page's widgets PLUS its printed text (ordered top→bottom) so the
 * LLM can see section banners/headings, not just widget labels.
 */
export async function extractPages(pdf: Uint8Array): Promise<PageExtract[]> {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: pdf, isEvalSupported: false, useWorkerFetch: false, disableFontFace: true }).promise;
  const pages: PageExtract[] = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((it: { str?: string }) => typeof it.str === 'string' && it.str.trim())
      .map((it: { str: string; transform: number[] }) => ({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] }));
    const frags: TextFragment[] = items;
    const text = [...items]
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((i) => i.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 4000);

    const widgets: ExtractedField[] = [];
    const annots = await page.getAnnotations();
    for (const a of annots as Array<Record<string, unknown>>) {
      if (a.subtype !== 'Widget') continue;
      const rect = (a.rect as number[]).map((n) => Math.round(n * 10) / 10) as [number, number, number, number];
      const { inferredLabel, nearbyText } = labelFor(rect, frags);
      const tooltip = goodTooltip(a.alternativeText);
      widgets.push({
        page: p,
        fieldName: (a.fieldName as string) || null,
        type: mapFieldType(a.fieldType as string | undefined),
        rect,
        inferredLabel: tooltip ?? inferredLabel,
        nearbyText,
        exportValue: (a.exportValue as string) ?? null,
        tooltip,
        flags: widgetFlags(a)
      });
    }
    pages.push({ page: p, widgets, text });
  }

  await doc.cleanup();
  return pages;
}

/** Extract page sizes plus widgets for the visual admin PDF mapping editor. */
export async function extractPdfStructure(pdf: Uint8Array): Promise<PdfStructure> {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: pdf,
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true
  }).promise;

  const pages: PdfPageGeometry[] = [];
  const fields: ExtractedField[] = [];

  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({
      page: p,
      width: Math.round(viewport.width * 10) / 10,
      height: Math.round(viewport.height * 10) / 10
    });

    const content = await page.getTextContent();
    const frags: TextFragment[] = content.items
      .filter((it: { str?: string }) => typeof it.str === 'string' && it.str.trim())
      .map((it: { str: string; transform: number[] }) => ({
        text: it.str.trim(),
        x: it.transform[4],
        y: it.transform[5]
      }));

    const annots = await page.getAnnotations();
    for (const a of annots as Array<Record<string, unknown>>) {
      if (a.subtype !== 'Widget') continue;
      const rect = (a.rect as number[]).map((n) => Math.round(n * 10) / 10) as [
        number,
        number,
        number,
        number
      ];
      const { inferredLabel, nearbyText } = labelFor(rect, frags);
      const tooltip = goodTooltip(a.alternativeText);
      fields.push({
        page: p,
        fieldName: (a.fieldName as string) || null,
        type: mapFieldType(a.fieldType as string | undefined),
        rect,
        inferredLabel: tooltip ?? inferredLabel,
        nearbyText,
        exportValue: (a.exportValue as string) ?? null,
        tooltip,
        flags: widgetFlags(a)
      });
    }
  }

  await doc.cleanup();
  return { pages, fields };
}
