import { apiRequest } from './client';

// Keep in sync with backend UPLOAD_LIMITS.
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export const UPLOAD_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';

interface PresignResponse {
  uploadUrl: string;
  key: string;
  fileName: string;
  contentType: string;
  expiresIn: number;
  maxBytes: number;
}

export interface UploadedDocument {
  documentKey: string;
  documentFileName: string;
}

export function isAcceptedUploadType(contentType: string): boolean {
  return ACCEPTED_UPLOAD_TYPES.includes(contentType);
}

/**
 * Upload a document straight to S3 using a backend-issued presigned URL, then
 * return the stored object key + original file name to persist on the record.
 */
export async function uploadDocument(file: File, scope: string): Promise<UploadedDocument> {
  const presigned = await apiRequest<PresignResponse>('/api/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, contentType: file.type, scope })
  });

  const response = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}). Please try again.`);
  }

  return { documentKey: presigned.key, documentFileName: file.name };
}

/** Exchange a stored object key for a short-lived URL to view/download the file. */
export async function getDocumentViewUrl(key: string): Promise<string> {
  const { url } = await apiRequest<{ url: string; expiresIn: number }>(
    `/api/uploads/view?key=${encodeURIComponent(key)}`
  );
  return url;
}
