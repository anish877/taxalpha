import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';
import { deleteFilled, loadFilled, storeFilled } from '../src/lib/ingestion/template-store.js';

const s3Mocks = vi.hoisted(() => ({
  downloadClientDocumentFromS3: vi.fn()
}));

vi.mock('../src/lib/s3-client-documents.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/s3-client-documents.js')>(
    '../src/lib/s3-client-documents.js'
  );
  return { ...actual, downloadClientDocumentFromS3: s3Mocks.downloadClientDocumentFromS3 };
});

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
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(authUser)
    },
    client: {
      findFirst: vi.fn()
    },
    clientDocument: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn()
    },
    clientFormPdf: {
      findFirst: vi.fn(),
      delete: vi.fn()
    },
    clientUploadedPdfFill: {
      updateMany: vi.fn()
    },
    $transaction: vi.fn()
  };
  prisma.$transaction.mockImplementation(async (operation: (transaction: typeof prisma) => Promise<unknown>) =>
    operation(prisma)
  );
  return prisma;
}

afterEach(async () => {
  s3Mocks.downloadClientDocumentFromS3.mockReset();
  await fs.promises.rm(path.join(storageRoot, testClientId), { recursive: true, force: true });
});

describe('client document routes', () => {
  it('serves generated form PDFs from the authenticated client route', async () => {
    const prisma = createMockPrisma();
    const pdfId = 'pdf_1';
    const pdfBytes = Buffer.from('%PDF-1.4\nclient form pdf\n%%EOF');
    await storeFilled(`n8n-callback-${pdfId}`, pdfBytes, config);
    prisma.clientFormPdf.findFirst.mockResolvedValue({
      id: pdfId,
      fileName: 'Disclosure.pdf',
      documentTitle: 'Disclosure'
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get(`/api/clients/${testClientId}/form-pdfs/${pdfId}/file.pdf`)
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('Disclosure.pdf');

    await deleteFilled(`n8n-callback-${pdfId}`, config);
  });

  it('serves and deletes a generated direct-fill PDF through the canonical route', async () => {
    const prisma = createMockPrisma();
    const pdfId = 'pdf_direct';
    const fillId = 'fill_direct';
    const pdfBytes = Buffer.from('%PDF-1.4\ndirect fill\n%%EOF');
    await storeFilled(`pdf-fill-${fillId}`, pdfBytes, config);
    prisma.clientFormPdf.findFirst.mockResolvedValue({
      id: pdfId,
      clientId: testClientId,
      formCode: 'PDF_UPLOAD',
      workspaceFormCode: 'PDF_UPLOAD',
      pdfUrl: `/api/clients/${testClientId}/pdf-fills/${fillId}/filled.pdf`,
      sourceRunId: fillId,
      fileName: 'Subscription Agreement.pdf',
      documentTitle: 'Subscription Agreement'
    });

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const openResponse = await request(app)
      .get(`/api/clients/${testClientId}/form-pdfs/${pdfId}/file.pdf`)
      .set('Cookie', createAuthCookie());
    expect(openResponse.status).toBe(200);
    expect(openResponse.body).toEqual(pdfBytes);

    const deleteResponse = await request(app)
      .delete(`/api/clients/${testClientId}/form-pdfs/${pdfId}`)
      .set('Cookie', createAuthCookie());
    expect(deleteResponse.status).toBe(204);
    expect(prisma.clientFormPdf.delete).toHaveBeenCalledWith({ where: { id: pdfId } });
    expect(prisma.clientUploadedPdfFill.updateMany).toHaveBeenCalledWith({
      where: { id: fillId, clientId: testClientId },
      data: { status: 'DRAFT', generatedPdfUrl: null, generatedAt: null }
    });
    await expect(loadFilled(`pdf-fill-${fillId}`, config)).resolves.toBeNull();
  });

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
        source: 'DOCUMENT_DRAWER',
        uploadedByName: 'Advisor One',
        createdAt: '2026-07-07T10:00:00.000Z',
        viewUrl: `/api/clients/${testClientId}/documents/doc_1/view`
      }
    ]);
  });

  it('materializes an uploaded government ID as a client document', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({
      id: testClientId,
      investorProfileOnboarding: {
        step3Data: {
          governmentIdentification: {
            photoId1: {
              documentKey: 'government-id/client_1/drivers-license.jpg',
              documentFileName: 'Drivers License.jpg'
            }
          }
        },
        step4Data: null
      }
    });
    prisma.clientDocument.findMany.mockResolvedValue([]);

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .get(`/api/clients/${testClientId}/documents`)
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(prisma.clientDocument.upsert).toHaveBeenCalledWith({
      where: { storageKey: 'government-id/client_1/drivers-license.jpg' },
      update: expect.objectContaining({
        clientId: testClientId,
        fileName: 'Drivers License.jpg',
        contentType: 'image/jpeg',
        storageProvider: 'S3'
      }),
      create: expect.objectContaining({
        clientId: testClientId,
        fileName: 'Drivers License.jpg',
        contentType: 'image/jpeg',
        storageKey: 'government-id/client_1/drivers-license.jpg',
        storageProvider: 'S3'
      })
    });
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

  it('streams an S3 document through the authenticated backend route', async () => {
    const prisma = createMockPrisma();
    const documentBytes = Buffer.from('word document bytes');
    s3Mocks.downloadClientDocumentFromS3.mockResolvedValue(documentBytes);
    prisma.clientDocument.findFirst.mockResolvedValue({
      id: 'doc_s3',
      clientId: testClientId,
      uploadedByUserId: authUser.id,
      fileName: 'Disclosure.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: documentBytes.length,
      storageKey: 'client-documents/test-client/disclosure.docx',
      storageProvider: 'S3',
      createdAt: new Date('2026-07-07T10:00:00.000Z')
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config: {
        ...config,
        s3: {
          region: 'us-east-1',
          bucket: 'test-bucket',
          uploadPrefix: 'government-id',
          clientDocumentPrefix: 'client-documents',
          filledPdfPrefix: 'filled-pdfs'
        }
      }
    });

    const response = await request(app)
      .get(`/api/clients/${testClientId}/documents/doc_s3/view`)
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.headers.location).toBeUndefined();
    expect(response.headers['content-type']).toContain('officedocument.wordprocessingml.document');
    expect(response.headers['content-length']).toBe(String(documentBytes.length));
    expect(s3Mocks.downloadClientDocumentFromS3).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: 'test-bucket' }),
      { key: 'client-documents/test-client/disclosure.docx' }
    );
  });

  it('deletes an owned document and its local stored file', async () => {
    const prisma = createMockPrisma();
    const storageKey = `${testClientId}/doc_1-delete.pdf`;
    const storagePath = path.join(storageRoot, storageKey);
    await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
    await fs.promises.writeFile(storagePath, '%PDF-delete');

    prisma.clientDocument.findFirst.mockResolvedValue({
      id: 'doc_1',
      clientId: testClientId,
      storageKey,
      storageProvider: 'LOCAL'
    });
    prisma.clientDocument.delete.mockResolvedValue({ id: 'doc_1' });

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .delete(`/api/clients/${testClientId}/documents/doc_1`)
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(204);
    expect(prisma.clientDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc_1' } });
    await expect(fs.promises.access(storagePath)).rejects.toThrow();
  });
});
