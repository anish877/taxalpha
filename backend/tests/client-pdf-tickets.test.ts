import type { PrismaClient } from '@prisma/client';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';

const storageMocks = vi.hoisted(() => ({
  loadClientDocumentBytes: vi.fn(),
  loadFilled: vi.fn()
}));

vi.mock('../src/lib/client-document-storage.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/client-document-storage.js')>(
    '../src/lib/client-document-storage.js'
  );
  return { ...actual, loadClientDocumentBytes: storageMocks.loadClientDocumentBytes };
});

vi.mock('../src/lib/ingestion/template-store.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/ingestion/template-store.js')>(
    '../src/lib/ingestion/template-store.js'
  );
  return { ...actual, loadFilled: storageMocks.loadFilled };
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
    callbackSecret: null
  }
};

const authUser = {
  id: 'user_1',
  name: 'Advisor One',
  email: 'advisor@example.com'
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
    clientFormPdf: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    clientDocument: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
      upsert: vi.fn()
    },
    clientInvestment: {
      findMany: vi.fn().mockResolvedValue([])
    }
  };
}

async function createTestPdf(text: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([240, 120]);
  page.drawText(text, { x: 24, y: 64, size: 14, font });
  return Buffer.from(await pdf.save());
}

function pdfRecord(overrides: Partial<{
  id: string;
  formCode: string;
  workspaceFormCode: string;
  pdfUrl: string;
  documentTitle: string | null;
  fileName: string | null;
  sourceRunId: string | null;
  generatedAt: Date | null;
  receivedAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? 'pdf_1',
    clientId: 'client_1',
    formCode: overrides.formCode ?? 'SFC',
    workspaceFormCode: overrides.workspaceFormCode ?? 'SFC',
    pdfUrl: overrides.pdfUrl ?? 'https://files.example.com/sfc.pdf',
    documentTitle: overrides.documentTitle ?? 'Statement of Financial Condition',
    fileName: overrides.fileName ?? 'sfc.pdf',
    sourceRunId: overrides.sourceRunId ?? null,
    generatedAt: overrides.generatedAt ?? new Date('2026-07-09T10:00:00.000Z'),
    receivedAt: overrides.receivedAt ?? new Date('2026-07-09T10:01:00.000Z'),
    createdAt: new Date('2026-07-09T10:01:00.000Z'),
    client: {
      name: 'Client One'
    }
  };
}

describe('client PDF ticket routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    storageMocks.loadClientDocumentBytes.mockReset();
    storageMocks.loadFilled.mockReset();
  });

  it('lists generated PDFs available for a client ticket', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1', name: 'Client One' });
    prisma.clientFormPdf.findMany.mockResolvedValue([pdfRecord()]);

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });

    const response = await request(app)
      .get('/api/clients/client_1/pdf-ticket/pdfs')
      .set('Cookie', createAuthCookie());

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.pdfs).toHaveLength(1);
    expect(response.body.pdfs[0]).toMatchObject({
      id: 'pdf_1',
      clientId: 'client_1',
      documentTitle: 'Statement of Financial Condition',
      fileName: 'sfc.pdf'
    });
    expect(prisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'client_1' })
      })
    );
  });

  it('downloads a merged DocuSign ticket from selected PDFs', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1', name: 'Client One' });
    prisma.clientFormPdf.findMany.mockResolvedValue([
      pdfRecord({ id: 'pdf_a', pdfUrl: 'https://files.example.com/a.pdf', documentTitle: 'A' }),
      pdfRecord({ id: 'pdf_b', pdfUrl: 'https://files.example.com/b.pdf', documentTitle: 'B' })
    ]);

    const pdfA = await createTestPdf('A');
    const pdfB = await createTestPdf('B');
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const href = input instanceof Request ? input.url : String(input);
      const bytes = href.endsWith('/b.pdf') ? pdfB : pdfA;
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(bytes.length)
        }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });

    const response = await request(app)
      .post('/api/clients/client_1/pdf-ticket')
      .set('Cookie', createAuthCookie())
      .send({ pdfIds: ['pdf_b', 'pdf_a'] });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('Client-One-docusign-ticket.pdf');
    expect(response.headers['x-taxalpha-pdf-count']).toBe('2');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const merged = await PDFDocument.load(response.body);
    expect(merged.getPageCount()).toBe(2);
  });

  it('loads authenticated generated-PDF URLs from internal storage without fetching them', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1', name: 'Client One' });
    prisma.clientFormPdf.findMany.mockResolvedValue([
      pdfRecord({
        id: 'pdf_internal',
        pdfUrl: 'https://api.example.com/api/clients/client_1/form-pdfs/pdf_internal/file.pdf'
      })
    ]);
    const sourcePdf = await createTestPdf('Internal PDF');
    storageMocks.loadFilled.mockResolvedValue(sourcePdf);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .post('/api/clients/client_1/pdf-ticket')
      .set('Cookie', createAuthCookie())
      .send({ pdfIds: ['pdf_internal'] });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(storageMocks.loadFilled).toHaveBeenCalledWith('n8n-callback-pdf_internal', config);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads generated workspace forms from their durable storage key', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1', name: 'Client One' });
    prisma.clientFormPdf.findMany.mockResolvedValue([
      pdfRecord({
        id: 'pdf_sfc',
        formCode: 'SFC',
        workspaceFormCode: 'SFC',
        pdfUrl: 'https://api.example.com/api/clients/client_1/forms/SFC/filled.pdf'
      })
    ]);
    const sourcePdf = await createTestPdf('Statement of Financial Condition');
    storageMocks.loadFilled.mockImplementation(async (key: string) =>
      key === 'client_1__SFC' ? sourcePdf : null
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .post('/api/clients/client_1/pdf-ticket')
      .set('Cookie', createAuthCookie())
      .send({ pdfIds: ['pdf_sfc'] });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(storageMocks.loadFilled).toHaveBeenCalledWith('client_1__SFC', config);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves an investment as an atomic BAIODF and agreement pair', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1', name: 'Client One' });
    prisma.clientFormPdf.findMany.mockResolvedValue([]);
    const baiodf = pdfRecord({
      id: 'pdf_baiodf',
      formCode: 'BAIODF',
      workspaceFormCode: 'BAIODF',
      pdfUrl: 'https://files.example.com/baiodf.pdf'
    });
    const agreement = pdfRecord({
      id: 'pdf_agreement',
      formCode: 'PDF_UPLOAD',
      workspaceFormCode: 'PDF_UPLOAD',
      pdfUrl: 'https://files.example.com/agreement.pdf',
      sourceRunId: null,
      documentTitle: 'Agreement'
    });
    prisma.clientInvestment.findMany.mockResolvedValue([
      {
        id: 'investment_1',
        name: 'Growth Fund',
        position: 1,
        formPdfs: [baiodf],
        agreementPdfFill: { id: 'fill_1', status: 'GENERATED', generatedPdfUrl: agreement.pdfUrl }
      }
    ]);
    prisma.clientFormPdf.findFirst.mockResolvedValue(agreement);

    const firstPdf = await createTestPdf('BAIODF');
    const secondPdf = await createTestPdf('Agreement');
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const href = input instanceof Request ? input.url : String(input);
      const bytes = href.endsWith('/agreement.pdf') ? secondPdf : firstPdf;
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-length': String(bytes.length) }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .post('/api/clients/client_1/pdf-ticket')
      .set('Cookie', createAuthCookie())
      .send({ investmentIds: ['investment_1'] });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.headers['x-taxalpha-pdf-count']).toBe('2');
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      'https://files.example.com/baiodf.pdf',
      'https://files.example.com/agreement.pdf'
    ]);
  });

  it('merges investment pairs in the sequence submitted by the user', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1', name: 'Client One' });
    prisma.clientFormPdf.findMany.mockResolvedValue([]);

    const firstBaiodf = pdfRecord({
      id: 'first_baiodf',
      formCode: 'BAIODF',
      workspaceFormCode: 'BAIODF',
      pdfUrl: 'https://files.example.com/first-baiodf.pdf'
    });
    const secondBaiodf = pdfRecord({
      id: 'second_baiodf',
      formCode: 'BAIODF',
      workspaceFormCode: 'BAIODF',
      pdfUrl: 'https://files.example.com/second-baiodf.pdf'
    });
    const firstAgreement = pdfRecord({
      id: 'first_agreement',
      formCode: 'PDF_UPLOAD',
      workspaceFormCode: 'PDF_UPLOAD',
      pdfUrl: 'https://files.example.com/first-agreement.pdf'
    });
    const secondAgreement = pdfRecord({
      id: 'second_agreement',
      formCode: 'PDF_UPLOAD',
      workspaceFormCode: 'PDF_UPLOAD',
      pdfUrl: 'https://files.example.com/second-agreement.pdf'
    });

    // Deliberately return database position order; the request asks for the reverse.
    prisma.clientInvestment.findMany.mockResolvedValue([
      {
        id: 'investment_1',
        name: 'First Fund',
        position: 1,
        formPdfs: [firstBaiodf],
        agreementPdfFill: { id: 'fill_1', status: 'GENERATED', generatedPdfUrl: firstAgreement.pdfUrl }
      },
      {
        id: 'investment_2',
        name: 'Second Fund',
        position: 2,
        formPdfs: [secondBaiodf],
        agreementPdfFill: { id: 'fill_2', status: 'GENERATED', generatedPdfUrl: secondAgreement.pdfUrl }
      }
    ]);
    prisma.clientFormPdf.findFirst.mockImplementation(async ({ where }: any) =>
      where.sourceRunId === 'fill_1' ? firstAgreement : secondAgreement
    );

    const sourcePdf = await createTestPdf('source');
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array(sourcePdf), {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-length': String(sourcePdf.length) }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .post('/api/clients/client_1/pdf-ticket')
      .set('Cookie', createAuthCookie())
      .send({
        items: [
          { kind: 'investment', id: 'investment_2' },
          { kind: 'investment', id: 'investment_1' }
        ]
      });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      'https://files.example.com/second-baiodf.pdf',
      'https://files.example.com/second-agreement.pdf',
      'https://files.example.com/first-baiodf.pdf',
      'https://files.example.com/first-agreement.pdf'
    ]);
  });

  it('allows selecting a subscription agreement without its brokerage disclosure', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1', name: 'Client One' });
    prisma.clientFormPdf.findMany.mockResolvedValue([]);
    const disclosure = pdfRecord({
      id: 'pdf_disclosure',
      formCode: 'BAIODF',
      workspaceFormCode: 'BAIODF',
      pdfUrl: 'https://files.example.com/disclosure.pdf'
    });
    const agreement = pdfRecord({
      id: 'pdf_subscription',
      formCode: 'PDF_UPLOAD',
      workspaceFormCode: 'PDF_UPLOAD',
      pdfUrl: 'https://files.example.com/subscription.pdf',
      sourceRunId: 'fill_subscription'
    });
    prisma.clientInvestment.findMany.mockResolvedValue([
      {
        id: 'investment_1',
        name: 'Growth Fund',
        agreementPdfFill: { id: 'fill_subscription', status: 'GENERATED', generatedPdfUrl: agreement.pdfUrl },
        formPdfs: [disclosure, agreement]
      }
    ]);
    const agreementBytes = await createTestPdf('Subscription only');
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(agreementBytes), {
      status: 200,
      headers: { 'content-type': 'application/pdf' }
    }));
    vi.stubGlobal('fetch', fetchMock);

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .post('/api/clients/client_1/pdf-ticket')
      .set('Cookie', createAuthCookie())
      .send({ items: [{ kind: 'investment-agreement', id: 'investment_1' }] });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.headers['x-taxalpha-pdf-count']).toBe('1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://files.example.com/subscription.pdf');
  });

  it('merges an original uploaded PDF without creating a PDF-fill record', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1', name: 'Client One' });
    prisma.clientFormPdf.findMany.mockResolvedValue([]);
    const uploadedDocument = {
      id: 'document_1',
      clientId: 'client_1',
      uploadedByUserId: 'user_1',
      fileName: 'Original Agreement.pdf',
      contentType: 'application/pdf',
      sizeBytes: 100,
      storageKey: 'client_1/original-agreement.pdf',
      storageProvider: 'LOCAL',
      createdAt: new Date('2026-07-17T10:00:00.000Z')
    };
    prisma.clientDocument.findMany.mockResolvedValue([uploadedDocument]);
    const sourcePdf = await createTestPdf('Original upload');
    storageMocks.loadClientDocumentBytes.mockResolvedValue(sourcePdf);

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .post('/api/clients/client_1/pdf-ticket')
      .set('Cookie', createAuthCookie())
      .send({ documentIds: ['document_1'] });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.headers['x-taxalpha-pdf-count']).toBe('1');
    expect(storageMocks.loadClientDocumentBytes).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: uploadedDocument.storageKey,
        storageProvider: uploadedDocument.storageProvider
      }),
      undefined
    );
    expect(prisma.clientFormPdf.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: [] } }) })
    );
  });

  it('converts an uploaded ID image into a PDF page for the ticket', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1', name: 'Client One' });
    prisma.clientFormPdf.findMany.mockResolvedValue([]);
    prisma.clientDocument.findMany.mockResolvedValue([
      {
        id: 'drivers_license',
        clientId: 'client_1',
        uploadedByUserId: 'user_1',
        fileName: 'Drivers License.png',
        contentType: 'image/png',
        sizeBytes: 286,
        storageKey: 'government-id/client_1/drivers-license.png',
        storageProvider: 'S3',
        createdAt: new Date('2026-07-17T10:00:00.000Z')
      }
    ]);
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64'
    );
    storageMocks.loadClientDocumentBytes.mockResolvedValue(image);

    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .post('/api/clients/client_1/pdf-ticket')
      .set('Cookie', createAuthCookie())
      .send({ documentIds: ['drivers_license'] });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const merged = await PDFDocument.load(response.body);
    expect(merged.getPageCount()).toBe(1);
  });
});
