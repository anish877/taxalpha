import type { Request } from 'express';

import type { RuntimeConfig } from '../types/deps.js';

/** Build browser-facing URLs from the API request that actually reached us. */
export function requestBaseUrl(request: Request): string {
  const host = request.get('host');
  return host ? `${request.protocol}://${host}` : '';
}

/**
 * Build a URL that will be opened by a browser outside the API process.
 * Production reverse proxies may replace Host with an internal address such
 * as localhost:4000, so the configured public origin is authoritative there.
 */
export function publicRequestBaseUrl(request: Request, config: RuntimeConfig): string {
  if (config.nodeEnv === 'production' && config.backendPublicUrl) {
    return config.backendPublicUrl.replace(/\/+$/, '');
  }
  return requestBaseUrl(request);
}
