import type {
  AdminIngestionJob,
  AdminFormDetail,
  AdminFormSummary,
  PdfMapResponse,
  PdfMappingLayout,
  UploadFormResult,
  V2Schema
} from '../types/api';
import { API_BASE_URL, ApiError, apiRequest } from './client';

export type UploadProgressPhase = 'uploading' | 'analyzing';
export interface UploadProgressEvent {
  phase: UploadProgressPhase;
  percent: number;
  label: string;
}

export interface ReanalyzeFormResult {
  unmappedFields: string[];
  stats: {
    mapped: number;
    totalFields: number;
    mappedPercent: number;
    recoveredByExpansion: number;
    recoveredBySecondPass?: number;
  };
}

export async function listAdminForms(): Promise<AdminFormSummary[]> {
  const res = await apiRequest<{ forms: AdminFormSummary[] }>('/api/admin/forms');
  return res.forms;
}

export async function getAdminForm(id: string): Promise<AdminFormDetail> {
  const res = await apiRequest<{ form: AdminFormDetail }>(`/api/admin/forms/${id}`);
  return res.form;
}

/**
 * Upload a PDF as raw bytes. We bypass the JSON `apiRequest` wrapper because the
 * body is binary; the backend reads it with express.raw.
 */
export async function uploadForm(
  file: File,
  meta: { title?: string; code?: string; hint?: string; vision?: boolean } = {},
  onProgress?: (event: UploadProgressEvent) => void
): Promise<UploadFormResult> {
  const params = new URLSearchParams();
  if (meta.title) params.set('title', meta.title);
  if (meta.code) params.set('code', meta.code);
  if (meta.hint) params.set('hint', meta.hint);
  if (meta.vision) params.set('vision', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/admin/forms${qs}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/pdf');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress?.({ phase: 'uploading', percent: 8, label: 'Uploading PDF' });
        return;
      }
      const uploadPercent = Math.round((event.loaded / event.total) * 35);
      onProgress?.({
        phase: 'uploading',
        percent: Math.max(1, Math.min(35, uploadPercent)),
        label: 'Uploading PDF'
      });
    };
    xhr.upload.onload = () => {
      onProgress?.({ phase: 'analyzing', percent: 38, label: 'AI analyzing fields' });
    };
    xhr.onerror = () => reject(new ApiError('Upload failed. Please try again.', xhr.status || 0));
    xhr.onload = () => {
      let payload: (UploadFormResult & { message?: string }) | null = null;
      try {
        payload = JSON.parse(xhr.responseText || 'null') as (UploadFormResult & { message?: string }) | null;
      } catch {
        payload = null;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(payload?.message ?? 'Upload failed.', xhr.status));
        return;
      }
      resolve(payload as UploadFormResult);
    };
    xhr.send(file);
  });
}

export async function startUploadFormJob(
  jobId: string,
  file: File,
  meta: { title?: string; code?: string; hint?: string; vision?: boolean } = {},
  onProgress?: (event: UploadProgressEvent) => void
): Promise<AdminIngestionJob> {
  const params = new URLSearchParams();
  if (meta.title) params.set('title', meta.title);
  if (meta.code) params.set('code', meta.code);
  if (meta.hint) params.set('hint', meta.hint);
  if (meta.vision) params.set('vision', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/admin/forms/ingestion-jobs/${encodeURIComponent(jobId)}${qs}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/pdf');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress?.({ phase: 'uploading', percent: 8, label: 'Uploading PDF' });
        return;
      }
      const uploadPercent = Math.round((event.loaded / event.total) * 35);
      onProgress?.({
        phase: 'uploading',
        percent: Math.max(1, Math.min(35, uploadPercent)),
        label: 'Uploading PDF'
      });
    };
    xhr.upload.onload = () => {
      onProgress?.({ phase: 'analyzing', percent: 38, label: 'PDF uploaded. AI analysis has started.' });
    };
    xhr.onerror = () => reject(new ApiError('Upload failed. Please try again.', xhr.status || 0));
    xhr.onload = () => {
      let payload: { job?: AdminIngestionJob; message?: string } | null = null;
      try {
        payload = JSON.parse(xhr.responseText || 'null') as { job?: AdminIngestionJob; message?: string } | null;
      } catch {
        payload = null;
      }
      if (xhr.status < 200 || xhr.status >= 300 || !payload?.job) {
        reject(new ApiError(payload?.message ?? 'Upload failed.', xhr.status));
        return;
      }
      resolve(payload.job);
    };
    xhr.send(file);
  });
}

export async function getIngestionJob(jobId: string): Promise<AdminIngestionJob> {
  const res = await apiRequest<{ job: AdminIngestionJob }>(
    `/api/admin/forms/ingestion-jobs/${encodeURIComponent(jobId)}`
  );
  return res.job;
}

export async function updateAdminForm(
  id: string,
  data: { title?: string; schema?: V2Schema }
): Promise<void> {
  await apiRequest(`/api/admin/forms/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function getPdfMap(id: string): Promise<PdfMapResponse> {
  return apiRequest<PdfMapResponse>(`/api/admin/forms/${id}/pdf-map`);
}

export async function savePdfMap(id: string, mappingLayout: PdfMappingLayout): Promise<PdfMappingLayout> {
  const res = await apiRequest<{ mappingLayout: PdfMappingLayout }>(`/api/admin/forms/${id}/pdf-map`, {
    method: 'PUT',
    body: JSON.stringify({ mappingLayout })
  });
  return res.mappingLayout;
}

export async function publishAdminForm(id: string): Promise<void> {
  await apiRequest(`/api/admin/forms/${id}/publish`, { method: 'POST' });
}

export async function startPreviewSession(id: string): Promise<{ previewClientId: string; code: string }> {
  return apiRequest(`/api/admin/forms/${id}/preview-session`, { method: 'POST' });
}

export async function reanalyzeForm(
  id: string,
  options: { hint?: string; vision?: boolean } = {}
): Promise<ReanalyzeFormResult> {
  return apiRequest(`/api/admin/forms/${id}/reanalyze`, {
    method: 'POST',
    body: JSON.stringify(options)
  });
}

export async function startReanalyzeFormJob(
  id: string,
  jobId: string,
  options: { hint?: string; vision?: boolean } = {}
): Promise<AdminIngestionJob> {
  const res = await apiRequest<{ job: AdminIngestionJob }>(
    `/api/admin/forms/${id}/reanalyze-jobs/${encodeURIComponent(jobId)}`,
    {
      method: 'POST',
      body: JSON.stringify(options)
    }
  );
  return res.job;
}

export const templateUrlFor = (id: string): string => `${API_BASE_URL}/api/admin/forms/${id}/template`;
