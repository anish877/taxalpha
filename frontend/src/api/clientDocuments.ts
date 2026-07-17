import { API_BASE_URL, ApiError, apiRequest } from './client';
import type { ApiFieldErrors, ClientDocumentRecord } from '../types/api';

export const MAX_CLIENT_DOCUMENT_BYTES = 50 * 1024 * 1024;

interface ApiErrorPayload {
  message?: string;
  fieldErrors?: ApiFieldErrors;
}

export async function listClientDocuments(clientId: string): Promise<ClientDocumentRecord[]> {
  const response = await apiRequest<{ documents: ClientDocumentRecord[] }>(
    `/api/clients/${clientId}/documents`
  );
  return response.documents;
}

export async function uploadClientDocument(
  clientId: string,
  file: File
): Promise<ClientDocumentRecord> {
  const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'document')
    },
    body: file,
    credentials: 'include'
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? ((await response.json()) as ApiErrorPayload & { document?: ClientDocumentRecord })
    : null;

  if (!response.ok) {
    throw new ApiError(
      payload?.message ?? 'Unable to upload document.',
      response.status,
      payload?.fieldErrors
    );
  }

  if (!payload?.document) {
    throw new Error('Upload completed without a document record.');
  }

  return payload.document;
}

export async function deleteClientDocument(clientId: string, documentId: string): Promise<void> {
  await apiRequest(`/api/clients/${clientId}/documents/${documentId}`, { method: 'DELETE' });
}

export function clientDocumentViewUrl(document: ClientDocumentRecord): string {
  return `${API_BASE_URL}${document.viewUrl}`;
}
