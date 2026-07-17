import type { Request } from 'express';

/** Build browser-facing URLs from the API request that actually reached us. */
export function requestBaseUrl(request: Request): string {
  const host = request.get('host');
  return host ? `${request.protocol}://${host}` : '';
}
