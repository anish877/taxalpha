import { API_BASE_URL, ApiError, apiRequest } from './client';
import type { ClientInvestmentSummary } from '../types/api';

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = (await response.json()) as { message?: string };
    return new ApiError(payload.message ?? fallback, response.status);
  } catch {
    return new ApiError(fallback, response.status);
  }
}

export async function uploadInvestmentAgreement(
  clientId: string,
  investmentId: string,
  file: File
): Promise<{ fillId: string; fileName: string; status: string }> {
  if (file.type && file.type !== 'application/pdf') throw new Error('Upload a PDF agreement.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Agreement PDFs must be smaller than 15 MB.');
  const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/investments/${investmentId}/agreement`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf', 'x-file-name': encodeURIComponent(file.name) },
    credentials: 'include',
    body: file
  });
  if (!response.ok) throw await parseError(response, 'Unable to upload agreement.');
  return ((await response.json()) as { agreement: { fillId: string; fileName: string; status: string } }).agreement;
}

export async function finalizeClientSetup(clientId: string) {
  return apiRequest<{ setupStatus: 'ACTIVE'; nextOnboardingRoute: string }>(
    `/api/clients/${clientId}/setup/finalize`,
    { method: 'POST' }
  );
}

export async function analyzeInvestmentAgreement(clientId: string, investmentId: string) {
  return apiRequest<{ fillId: string; status: string; warningCount: number }>(
    `/api/clients/${clientId}/investments/${investmentId}/agreement/analyze`,
    { method: 'POST' }
  );
}

export async function generateInvestmentBaiodf(clientId: string, investmentId: string) {
  return apiRequest<{ ok: true; requestedAt: string }>(
    `/api/clients/${clientId}/investments/${investmentId}/baiodf/generate`,
    { method: 'POST' }
  );
}

export async function addInvestment(clientId: string, name: string): Promise<ClientInvestmentSummary> {
  const response = await apiRequest<{ investment: ClientInvestmentSummary }>(`/api/clients/${clientId}/investments`, {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  return response.investment;
}

export async function renameInvestment(clientId: string, investmentId: string, name: string) {
  return apiRequest(`/api/clients/${clientId}/investments/${investmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name })
  });
}
