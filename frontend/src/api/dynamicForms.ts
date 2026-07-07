import type { IngestedFormSchema } from '../types/api';
import { API_BASE_URL, apiRequest } from './client';

export interface DynamicFormData {
  form: { id: string; code: string; title: string; status: string; schema: IngestedFormSchema };
  answers: Record<string, unknown>;
  responseStatus: string;
}

export async function getDynamicForm(clientId: string, code: string): Promise<DynamicFormData> {
  return apiRequest<DynamicFormData>(`/api/clients/${clientId}/forms/${code}/dynamic`);
}

export async function saveDynamicForm(
  clientId: string,
  code: string,
  answers: Record<string, unknown>,
  status?: string
): Promise<void> {
  await apiRequest(`/api/clients/${clientId}/forms/${code}/dynamic`, {
    method: 'PUT',
    body: JSON.stringify({ answers, status })
  });
}

export async function generateDynamicPdf(
  clientId: string,
  code: string,
  answers: Record<string, unknown>
): Promise<{ pdfUrl: string; fieldsFilled: number }> {
  return apiRequest(`/api/clients/${clientId}/forms/${code}/dynamic/generate`, {
    method: 'POST',
    body: JSON.stringify({ answers })
  });
}

export const filledPdfUrl = (clientId: string, code: string): string =>
  `${API_BASE_URL}/api/clients/${clientId}/forms/${code}/dynamic/filled.pdf`;
