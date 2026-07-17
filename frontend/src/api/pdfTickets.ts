import { API_BASE_URL, ApiError, apiRequest } from './client';
import type { ClientDocumentRecord, ClientFormPdfRecord, InvestmentTicketPair } from '../types/api';

interface PdfTicketListResponse {
  clientId: string;
  pdfs: ClientFormPdfRecord[];
  documents: ClientDocumentRecord[];
  investmentPairs: InvestmentTicketPair[];
}

export type PdfTicketOrderItem = {
  kind: 'pdf' | 'investment' | 'document';
  id: string;
};

function contentDispositionFileName(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const quotedMatch = value.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = value.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() ?? null;
}

async function parseDownloadError(response: Response): Promise<ApiError> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as { message?: string };
    return new ApiError(payload.message ?? 'Unable to create ticket.', response.status);
  }

  return new ApiError('Unable to create ticket.', response.status);
}

export async function listPdfTicketPdfs(clientId: string): Promise<PdfTicketListResponse> {
  const response = await apiRequest<PdfTicketListResponse>(`/api/clients/${clientId}/pdf-ticket/pdfs`);
  return response;
}

export async function createPdfTicket(
  clientId: string,
  otherPdfIds: string[],
  investmentIds: string[] = [],
  documentIds: string[] = [],
  items: PdfTicketOrderItem[] = []
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(`${API_BASE_URL}/api/clients/${clientId}/pdf-ticket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ otherPdfIds, investmentIds, documentIds, items })
  });

  if (!response.ok) {
    throw await parseDownloadError(response);
  }

  const blob = await response.blob();
  return {
    blob,
    fileName: contentDispositionFileName(response.headers.get('content-disposition')) ?? 'docusign-ticket.pdf'
  };
}
