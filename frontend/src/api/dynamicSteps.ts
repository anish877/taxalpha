import type { DynamicStepResponse, PdfMappingWarning, V2Schema } from '../types/api';
import { API_BASE_URL, apiRequest } from './client';

export async function getStepSchema(clientId: string, code: string): Promise<V2Schema> {
  const res = await apiRequest<{ schema: V2Schema }>(`/api/clients/${clientId}/forms/${code}/schema`);
  return res.schema;
}

export function getStep(clientId: string, code: string, step: number): Promise<DynamicStepResponse> {
  return apiRequest<DynamicStepResponse>(`/api/clients/${clientId}/forms/${code}/step-${step}`);
}

export function postStepAnswer(
  clientId: string,
  code: string,
  step: number,
  questionId: string,
  answer: unknown
): Promise<DynamicStepResponse> {
  return apiRequest<DynamicStepResponse>(`/api/clients/${clientId}/forms/${code}/step-${step}`, {
    method: 'POST',
    body: JSON.stringify({ questionId, answer })
  });
}

export function generatePdf(clientId: string, code: string): Promise<{ pdfUrl: string; fieldsFilled: number; warnings?: PdfMappingWarning[] }> {
  return apiRequest(`/api/clients/${clientId}/forms/${code}/generate`, { method: 'POST', body: JSON.stringify({}) });
}

export const filledPdfV2Url = (clientId: string, code: string): string =>
  `${API_BASE_URL}/api/clients/${clientId}/forms/${code}/filled.pdf`;
