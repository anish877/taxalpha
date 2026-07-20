import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { publicRequestBaseUrl } from '../src/lib/request-base-url.js';
import type { RuntimeConfig } from '../src/types/deps.js';

function request(host: string, protocol = 'http'): Request {
  return {
    protocol,
    get: (name: string) => (name.toLowerCase() === 'host' ? host : undefined)
  } as Request;
}

function config(nodeEnv: RuntimeConfig['nodeEnv'], backendPublicUrl?: string): RuntimeConfig {
  return {
    nodeEnv,
    frontendUrl: 'https://forms.example.com',
    backendPublicUrl,
    jwtSecret: 'test_secret_test_secret_test_secret_1234',
    jwtExpiresIn: '7d',
    n8nWebhooks: {
      investorProfileUrl: null,
      investorProfileAdditionalHolderUrl: null,
      statementOfFinancialConditionUrl: null,
      baiodfUrl: null,
      baiv506cUrl: null,
      timeoutMs: 5_000
    }
  };
}

describe('publicRequestBaseUrl', () => {
  it('uses the configured public backend in production instead of an internal proxy host', () => {
    expect(
      publicRequestBaseUrl(request('localhost:4000'), config('production', 'https://api.example.com/'))
    ).toBe('https://api.example.com');
  });

  it('keeps the request origin during local development', () => {
    expect(
      publicRequestBaseUrl(request('localhost:4001'), config('development', 'https://tunnel.example.com'))
    ).toBe('http://localhost:4001');
  });
});
