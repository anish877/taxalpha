import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    callbackSecret: 'callback-secret'
  }
};

const authUser = {
  id: 'user_1',
  name: 'Advisor One',
  email: 'advisor@example.com',
  isAdmin: false
};
const testClientId = 'test_client_documents';
const storageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.local-storage/client-documents'
);
type StoredDocumentCreateData = {
  clientId: string;
  uploadedByUserId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  storageProvider: string;
};

function createAuthCookie(): string {
  const token = createSessionToken(authUser.id, config.jwtSecret, config.jwtExpiresIn);
  return `${AUTH_COOKIE_NAME}=${token}`;
}

function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue(authUser)
    },
    client: {
      findFirst: vi.fn()
    },
    clientDocument: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn()
    }
  };
}

afterEach(async () => {
  await fs.promises.rm(path.join(storageRoot, testClientId), { recursive: true, force: true });
});

describe('client document routes', () => {
  it('lists documents for an owned client', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: testClientId });
    prisma.clientDocument.findMany.mockResolvedValue([
      {
        id: 'doc_1',
        clientId: testClientId,
        fileName: 'Tax Return.pdf',
        contentType: 'application/pdf',
        sizeBytes: 4096,
        storageKey: `${testClientId}/doc_1-Tax Return.pdf`,
        createdAt: new Date('2026-07-07T10:00:00.000Z'),
        uploadedBy: {
          name: 'Advisor One'
        }
      }
    ]);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get(`/api/clients/${testClientId}/documents`)
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.documents).toEqual([
      {
        id: 'doc_1',
        clientId: testClientId,
        fileName: 'Tax Return.pdf',
        contentType: 'application/pdf',
        sizeBytes: 4096,
        uploadedByName: 'Advisor One',
        createdAt: '2026-07-07T10:00:00.000Z',
        viewUrl: `/api/clients/${testClientId}/documents/doc_1/view`
      }
    ]);
  });

  it('uploads any document bytes and stores metadata', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: testClientId });

    let storedData: StoredDocumentCreateData | null = null;

    prisma.clientDocument.create.mockImplementation(async ({ data }: { data: StoredDocumentCreateData }) => {
      storedData = data;
      return {
        id: 'doc_created',
        ...data,
        createdAt: new Date('2026-07-07T10:05:00.000Z'),
        uploadedBy: {
          name: 'Advisor One'
        }
      };
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post(`/api/clients/${testClientId}/documents`)
      .set('Cookie', createAuthCookie())
      .set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .set('X-File-Name', encodeURIComponent('Tax Letter.docx'))
      .send(Buffer.from('hello'));

    expect(response.status).toBe(201);
    expect(storedData).toMatchObject({
      clientId: testClientId,
      uploadedByUserId: authUser.id,
      fileName: 'Tax Letter.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 5,
      storageProvider: 'LOCAL'
    });
    expect(storedData?.storageKey).toContain(`${testClientId}/`);
    await expect(fs.promises.readFile(path.join(storageRoot, storedData!.storageKey), 'utf8')).resolves.toBe('hello');
    expect(response.body.document).toMatchObject({
      id: 'doc_created',
      clientId: testClientId,
      fileName: 'Tax Letter.docx',
      uploadedByName: 'Advisor One'
    });
  });

  it('streams a stored document for an owned client', async () => {
    const prisma = createMockPrisma();
    const storageKey = `${testClientId}/doc_1-note.txt`;
    const storagePath = path.join(storageRoot, storageKey);

    await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.promises.writeFile(storagePath, 'client note');

    prisma.clientDocument.findFirst.mockResolvedValue({
      id: 'doc_1',
      clientId: testClientId,
      uploadedByUserId: authUser.id,
      fileName: 'note.txt',
      contentType: 'text/plain',
      sizeBytes: 11,
      storageKey,
      createdAt: new Date('2026-07-07T10:00:00.000Z')
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get(`/api/clients/${testClientId}/documents/doc_1/view`)
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(response.text).toBe('client note');
  });
});
