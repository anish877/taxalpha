import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';

const config = {
  nodeEnv: 'test' as const,
  frontendUrl: 'http://localhost:5173',
  backendPublicUrl: 'https://api.example.com',
  jwtSecret: 'test_secret_test_secret_test_secret_1234',
  jwtExpiresIn: '7d',
  n8nWebhooks: {
    investorProfileUrl: null,
    investorProfileAdditionalHolderUrl: null,
    statementOfFinancialConditionUrl: null,
    baiodfUrl: null,
    baiv506cUrl: null,
    timeoutMs: 5000,
    callbackSecret: null
  }
};

const authUser = { id: 'user_1', name: 'Advisor One', email: 'advisor@example.com' };

function cookie() {
  return `${AUTH_COOKIE_NAME}=${createSessionToken(authUser.id, config.jwtSecret, config.jwtExpiresIn)}`;
}

function createMockPrisma() {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(authUser) },
    client: { findFirst: vi.fn().mockResolvedValue({ id: 'client_1', name: 'Client One' }) },
    clientUploadedPdfFill: { findFirst: vi.fn(), delete: vi.fn().mockResolvedValue({ id: 'fill_1' }) },
    clientFormPdf: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations))
  };
}

describe('client PDF fill delete route', () => {
  it('deletes a direct fill and removes its generated ticket record', async () => {
    const prisma = createMockPrisma();
    prisma.clientUploadedPdfFill.findFirst.mockResolvedValue({
      id: 'fill_1',
      originalPdfUrl: 'local:pdf-fill-original-fill_1'
    });
    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });

    const response = await request(app)
      .delete('/api/clients/client_1/pdf-fills/fill_1')
      .set('Cookie', cookie());

    expect(response.status).toBe(204);
    expect(prisma.clientUploadedPdfFill.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'fill_1', clientId: 'client_1', investmentId: null } })
    );
    expect(prisma.clientFormPdf.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: 'client_1', investmentId: null, sourceRunId: 'fill_1' } })
    );
    expect(prisma.clientUploadedPdfFill.delete).toHaveBeenCalledWith({ where: { id: 'fill_1' } });
  });
});
