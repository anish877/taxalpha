import type { ApiFieldErrors } from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

interface ApiErrorPayload {
  message?: string;
  fieldErrors?: ApiFieldErrors;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly fieldErrors?: ApiFieldErrors;

  constructor(message: string, statusCode: number, fieldErrors?: ApiFieldErrors) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include'
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? ((await response.json()) as ApiErrorPayload)
    : null;

  if (!response.ok) {
    throw new ApiError(
      payload?.message ?? 'Unexpected request error.',
      response.status,
      payload?.fieldErrors
    );
  }

  return payload as T;
}
