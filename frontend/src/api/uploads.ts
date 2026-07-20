import { API_BASE_URL, ApiError, apiRequest } from './client';

// Keep in sync with backend UPLOAD_LIMITS.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export const UPLOAD_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

interface UploadResponse {
  key: string;
  fileName: string;
}

export interface UploadedDocument {
  documentKey: string;
  documentFileName: string;
}

export function isAcceptedUploadType(contentType: string): boolean {
  return ACCEPTED_UPLOAD_TYPES.includes(contentType);
}

/**
 * Upload through the API, which persists the file to S3. Keeping the browser
 * out of the S3 request avoids S3 bucket CORS requirements for ID uploads.
 */
export async function uploadDocument(file: File, scope: string): Promise<UploadedDocument> {
  const response = await fetch(`${API_BASE_URL}/api/uploads`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-File-Name': encodeURIComponent(file.name),
      'X-Upload-Scope': scope
    },
    body: file,
    credentials: 'include'
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? ((await response.json()) as { message?: string } & Partial<UploadResponse>)
    : null;

  if (!response.ok) {
    throw new ApiError(payload?.message ?? 'Upload failed. Please try again.', response.status);
  }

  if (!payload?.key || !payload.fileName) {
    throw new Error('Upload completed without a document reference.');
  }

  return { documentKey: payload.key, documentFileName: payload.fileName };
}

/** Exchange a stored object key for a short-lived URL to view/download the file. */
export async function getDocumentViewUrl(key: string): Promise<string> {
  const { url } = await apiRequest<{ url: string; expiresIn: number }>(
    `/api/uploads/view?key=${encodeURIComponent(key)}`
  );
  return url;
}
