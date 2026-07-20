import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';

const authUser = {
  id: 'user_1',
  name: 'Advisor One',
  email: 'advisor@example.com',
  isAdmin: false
};

const config = {
  nodeEnv: 'test' as const,
  frontendUrl: 'http://localhost:5173',
  jwtSecret: 'test_secret_test_secret_test_secret_1234',
  jwtExpiresIn: '7d',
  n8nWebhooks: {
    investorProfileUrl: null,
    investorProfileAdditionalHolderUrl: null,
    statementOfFinancialConditionUrl: null,
    baiodfUrl: null,
    baiv506cUrl: null,
    timeoutMs: 5000
  },
  s3: {
    region: 'us-east-1',
    bucket: 'test-bucket',
    uploadPrefix: 'investor-profile/government-id',
    clientDocumentPrefix: 'client-documents',
    filledPdfPrefix: 'filled-pdfs'
  }
};

function createAuthCookie(): string {
  const token = createSessionToken(authUser.id, config.jwtSecret, config.jwtExpiresIn);
  return `${AUTH_COOKIE_NAME}=${token}`;
}

describe('document upload route', () => {
  it('rejects unsupported content types before attempting an S3 upload', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(authUser)
      }
    };
    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });

    const response = await request(app)
      .post('/api/uploads')
      .set('Cookie', createAuthCookie())
      .set('Content-Type', 'text/plain')
      .set('X-File-Name', encodeURIComponent('notes.txt'))
      .set('X-Upload-Scope', 'step3.govId.photoId1')
      .send('not an ID');

    expect(response.status).toBe(415);
    expect(response.body.message).toContain('Unsupported file type');
  });

  it('requires S3 storage to be configured', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(authUser)
      }
    };
    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config: { ...config, s3: { ...config.s3, bucket: null } }
    });

    const response = await request(app)
      .post('/api/uploads')
      .set('Cookie', createAuthCookie())
      .set('Content-Type', 'application/pdf')
      .set('X-File-Name', encodeURIComponent('government ID.pdf'))
      .set('X-Upload-Scope', 'step3.govId.photoId1')
      .send(Buffer.from('%PDF-1.4'));

    expect(response.status).toBe(503);
    expect(response.body.message).toContain('not configured');
  });
});
