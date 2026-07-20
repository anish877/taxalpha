import { API_BASE_URL, apiRequest } from './client';
import type { PdfFillLayout, PdfFillOverride, PdfFillRecord, PdfFillSummary, PdfFillWarning } from '../types/api';

const MAX_PDF_BYTES = 15 * 1024 * 1024;

function pdfFillFileUrl(clientId: string, fillId: string, kind: 'original' | 'filled'): string {
  const baseUrl = API_BASE_URL.replace(/\/+$/, '');
  return `${baseUrl}/api/clients/${encodeURIComponent(clientId)}/pdf-fills/${encodeURIComponent(fillId)}/${kind}.pdf`;
}

function withBrowserPdfUrls(clientId: string, fill: PdfFillRecord): PdfFillRecord {
  return {
    ...fill,
    originalPdfUrl: pdfFillFileUrl(clientId, fill.id, 'original'),
    generatedPdfUrl: fill.generatedPdfUrl ? pdfFillFileUrl(clientId, fill.id, 'filled') : null
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Unable to read PDF file.'));
    reader.readAsDataURL(file);
  });
}

export async function listPdfFills(clientId: string): Promise<PdfFillSummary[]> {
  const response = await apiRequest<{ fills: PdfFillSummary[] }>(`/api/clients/${clientId}/pdf-fills`);
  return response.fills.map((fill) => ({
    ...fill,
    generatedPdfUrl: fill.generatedPdfUrl ? pdfFillFileUrl(clientId, fill.id, 'filled') : null
  }));
}

export async function createPdfFill(clientId: string, file: File): Promise<PdfFillRecord> {
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Upload a PDF file.');
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('Upload a PDF smaller than 15 MB.');
  }
  const pdfBase64 = await readFileAsDataUrl(file);
  const response = await apiRequest<{ fill: PdfFillRecord }>(`/api/clients/${clientId}/pdf-fills`, {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, pdfBase64 })
  });
  return withBrowserPdfUrls(clientId, response.fill);
}

export async function analyzePdfFill(clientId: string, fillId: string) {
  return apiRequest<{ fillId: string; status: 'ANALYZING' }>(`/api/clients/${clientId}/pdf-fills/${fillId}/analyze`, {
    method: 'POST'
  });
}

export async function getPdfFill(clientId: string, fillId: string): Promise<PdfFillRecord> {
  const response = await apiRequest<{ fill: PdfFillRecord }>(`/api/clients/${clientId}/pdf-fills/${fillId}`);
  return withBrowserPdfUrls(clientId, response.fill);
}

export async function deletePdfFill(clientId: string, fillId: string): Promise<void> {
  await apiRequest(`/api/clients/${clientId}/pdf-fills/${fillId}`, { method: 'DELETE' });
}

export async function savePdfFillValues(
  clientId: string,
  fillId: string,
  overrides: Record<string, PdfFillOverride>
): Promise<{ resolvedLayout: PdfFillLayout; warnings: PdfFillWarning[]; status: 'DRAFT' }> {
  return apiRequest<{ resolvedLayout: PdfFillLayout; warnings: PdfFillWarning[]; status: 'DRAFT' }>(
    `/api/clients/${clientId}/pdf-fills/${fillId}/values`,
    {
      method: 'PUT',
      body: JSON.stringify({ overrides })
    }
  );
}

export async function reanalyzePdfFill(
  clientId: string,
  fillId: string
): Promise<{ resolvedLayout: PdfFillLayout; warnings: PdfFillWarning[] }> {
  return apiRequest<{ resolvedLayout: PdfFillLayout; warnings: PdfFillWarning[] }>(
    `/api/clients/${clientId}/pdf-fills/${fillId}/reanalyze`,
    { method: 'POST' }
  );
}

export async function generatePdfFill(
  clientId: string,
  fillId: string
): Promise<{ ok: true; pdfUrl: string; fieldsFilled: number; resolvedLayout: PdfFillLayout; warnings: PdfFillWarning[] }> {
  const response = await apiRequest<{ ok: true; pdfUrl: string; fieldsFilled: number; resolvedLayout: PdfFillLayout; warnings: PdfFillWarning[] }>(
    `/api/clients/${clientId}/pdf-fills/${fillId}/generate`,
    { method: 'POST' }
  );
  return { ...response, pdfUrl: pdfFillFileUrl(clientId, fillId, 'filled') };
}
