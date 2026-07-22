import { deleteFilled, loadFilled } from './ingestion/template-store.js';
import { HttpError } from './http-error.js';
import type { RuntimeConfig } from '../types/deps.js';

const MAX_SOURCE_PDF_BYTES = 30 * 1024 * 1024;
const EXTERNAL_PDF_FETCH_TIMEOUT_MS = 15_000;

export interface StoredClientFormPdf {
  id: string;
  clientId: string;
  formCode: string;
  workspaceFormCode: string;
  pdfUrl: string;
  sourceRunId: string | null;
  documentTitle?: string | null;
  fileName?: string | null;
}

function displayTitle(pdf: StoredClientFormPdf): string {
  return pdf.documentTitle || pdf.fileName || `${pdf.workspaceFormCode}.pdf`;
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function pdfUrlPath(pdfUrl: string): string | null {
  try {
    return new URL(pdfUrl, 'http://taxalpha.local').pathname;
  } catch {
    return null;
  }
}

export function clientFormPdfStorageKeys(pdf: StoredClientFormPdf): string[] {
  const keys: string[] = [];
  const add = (key: string | null | undefined) => {
    if (key && !keys.includes(key)) keys.push(key);
  };

  if (pdf.workspaceFormCode === 'PDF_UPLOAD' && pdf.sourceRunId) {
    add(`pdf-fill-${pdf.sourceRunId}`);
  }

  const pathname = pdfUrlPath(pdf.pdfUrl);
  const parts = pathname?.split('/').filter(Boolean).map(decodePathSegment) ?? [];

  if (
    parts[0] === 'api' &&
    parts[1] === 'n8n' &&
    parts[2] === 'clients' &&
    parts[3] === pdf.clientId &&
    parts[4] === 'form-pdfs' &&
    parts[5]
  ) {
    add(`n8n-callback-${parts[5]}`);
  }

  if (
    parts[0] === 'api' &&
    parts[1] === 'clients' &&
    parts[2] === pdf.clientId &&
    parts[3] === 'form-pdfs' &&
    parts[4]
  ) {
    add(`n8n-callback-${parts[4]}`);
  }

  if (
    parts[0] === 'api' &&
    parts[1] === 'clients' &&
    parts[2] === pdf.clientId &&
    parts[3] === 'pdf-fills' &&
    parts[4]
  ) {
    add(`pdf-fill-${parts[4]}`);
  }

  if (
    parts[0] === 'api' &&
    parts[1] === 'clients' &&
    parts[2] === pdf.clientId &&
    parts[3] === 'forms' &&
    parts[4] &&
    (parts[5] === 'filled.pdf' || (parts[5] === 'dynamic' && parts[6] === 'filled.pdf'))
  ) {
    add(`${pdf.clientId}__${parts[4]}`);
  }

  // Current n8n callbacks always use the database PDF id as their durable key.
  // Keep this fallback for records whose public URL predates the authenticated route.
  add(`n8n-callback-${pdf.id}`);
  return keys;
}

function assertPdfBytes(bytes: Buffer, pdf: StoredClientFormPdf): void {
  const title = displayTitle(pdf);
  if (bytes.length === 0) throw new HttpError(422, `${title} is empty.`);
  if (bytes.length > MAX_SOURCE_PDF_BYTES) throw new HttpError(413, `${title} is larger than 30 MB.`);
  if (!bytes.subarray(0, 5).toString('utf8').startsWith('%PDF')) {
    throw new HttpError(422, `${title} is not a readable PDF.`);
  }
}

function isInternalPdfUrl(pdf: StoredClientFormPdf): boolean {
  const pathname = pdfUrlPath(pdf.pdfUrl);
  return Boolean(
    pathname?.startsWith(`/api/clients/${pdf.clientId}/`) ||
    pathname?.startsWith(`/api/n8n/clients/${pdf.clientId}/`)
  );
}

async function fetchLegacyExternalPdf(pdf: StoredClientFormPdf): Promise<Buffer | null> {
  if (isInternalPdfUrl(pdf)) return null;

  let url: URL;
  try {
    url = new URL(pdf.pdfUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTERNAL_PDF_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get('content-length') ?? '0');
    if (contentLength > MAX_SOURCE_PDF_BYTES) {
      throw new HttpError(413, `${displayTitle(pdf)} is larger than 30 MB.`);
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadClientFormPdfBytes(
  pdf: StoredClientFormPdf,
  config: RuntimeConfig
): Promise<Buffer> {
  for (const key of clientFormPdfStorageKeys(pdf)) {
    const bytes = await loadFilled(key, config);
    if (bytes) {
      assertPdfBytes(bytes, pdf);
      return bytes;
    }
  }

  const legacyBytes = await fetchLegacyExternalPdf(pdf);
  if (legacyBytes) {
    assertPdfBytes(legacyBytes, pdf);
    return legacyBytes;
  }

  throw new HttpError(404, `${displayTitle(pdf)} is no longer available. Regenerate the PDF and try again.`);
}

export async function deleteClientFormPdfBytes(
  pdf: StoredClientFormPdf,
  config: RuntimeConfig
): Promise<void> {
  await Promise.allSettled(clientFormPdfStorageKeys(pdf).map((key) => deleteFilled(key, config)));
}
