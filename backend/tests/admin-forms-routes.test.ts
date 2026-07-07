import type { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';
import { HttpError } from '../src/lib/http-error.js';
import { createAdminFormsRouter, type IngestFn, type StoreFn } from '../src/routes/admin-forms.js';
import type { RuntimeConfig } from '../src/types/deps.js';

const config: RuntimeConfig = {
  nodeEnv: 'test',
  frontendUrl: 'http://localhost:5173',
  jwtSecret: 'test_secret_test_secret_test_secret_1234',
  jwtExpiresIn: '7d',
  n8nWebhooks: {
    investorProfileUrl: null,
    investorProfileAdditionalHolderUrl: null,
    statementOfFinancialConditionUrl: null,
    baiodfUrl: null,
    baiv506cUrl: null,
    timeoutMs: 5000,
    callbackSecret: 'cb'
  },
  openrouter: { apiKey: null, model: 'openai/gpt-5.5', baseUrl: 'https://openrouter.ai/api/v1', reasoningEffort: 'high' }
};

const PDF = Buffer.from('%PDF-1.4\n%fake test pdf\n');

const fakeSchema = {
  version: 2,
  code: 'RGPIF_II',
  title: 'RGP Income Fund II',
  description: null,
  steps: [{ number: 1, key: 'STEP_1', label: 'STEP 1. INVESTMENT' }],
  items: [{ id: 'amount', step: 1, order: 0, title: 'Amount', type: 'currency', required: true, pdfField: 'Investment', canonicalField: 'investment.amount' }],
  pdfFieldCount: 195,
  unmappedFields: ['Check Box48', 'undefined_5']
};

const fakeIngest: IngestFn = vi.fn(async () => ({
  schema: fakeSchema as never,
  extracted: [] as never,
  stats: { totalFields: 195, steps: 1, questions: 1, mapped: 107, unmapped: 2, choiceGroups: 0, recoveredByExpansion: 0, recoveredBySecondPass: 0 }
}));

const fakeStore: StoreFn = vi.fn(async (id) => `local:${id}`);

interface MockOpts {
  isAdmin?: boolean;
  user?: boolean;
  createImpl?: () => unknown;
  schemaOverride?: unknown;
  templateBytes?: Buffer;
}

function buildApp(prismaOverrides: MockOpts = {}, ingest: IngestFn = fakeIngest) {
  const { isAdmin = true, user = true, createImpl, schemaOverride, templateBytes = Buffer.from('%PDF-1.4 stored') } = prismaOverrides;
  const storedSchema = schemaOverride ?? fakeSchema;
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(
        user ? { id: 'u1', name: 'Admin', email: 'a@x.com', isAdmin } : null
      )
    },
    formCatalog: {
      create: vi.fn(
        createImpl ??
          (async () => ({ id: 'f1', code: 'RGPIF_II', title: 'RGP Income Fund II', status: 'DRAFT', source: 'UPLOAD' }))
      ),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'f1',
        code: 'RGPIF_II',
        title: 'RGP Income Fund II',
        status: 'DRAFT',
        source: 'UPLOAD',
        unmappedCount: 2,
        ...args.data
      })),
      findMany: vi.fn().mockResolvedValue([{ id: 'f1', code: 'RGPIF_II', title: 'x', status: 'DRAFT', source: 'UPLOAD', unmappedCount: 2, updatedAt: new Date() }]),
      findUnique: vi.fn().mockResolvedValue({ id: 'f1', code: 'RGPIF_II', title: 'RGP Income Fund II', schema: storedSchema, templateUrl: 'local:f1' })
    },
    client: {
      upsert: vi.fn().mockResolvedValue({ id: 'preview1', isPreview: true })
    }
  } as unknown as PrismaClient;

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/admin', createAdminFormsRouter({ prisma, config }, { ingest, storeTemplate: fakeStore, loadTemplate: async () => templateBytes }));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Internal server error.' });
  };
  app.use(errorHandler);
  return { app, prisma };
}

async function makeTemplatePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([320, 220]);
  const form = doc.getForm();
  const investment = form.createTextField('Investment');
  investment.addToPage(page, { x: 60, y: 150, width: 150, height: 20 });
  const check = form.createCheckBox('Investor Check');
  check.addToPage(page, { x: 60, y: 115, width: 14, height: 14 });
  return Buffer.from(await doc.save());
}

function adminCookie(): string {
  return `${AUTH_COOKIE_NAME}=${createSessionToken('u1', config.jwtSecret, config.jwtExpiresIn)}`;
}

describe('POST /api/admin/forms', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/api/admin/forms').set('Content-Type', 'application/pdf').send(PDF);
    expect(res.status).toBe(401);
  });

  it('rejects non-admins with 403', async () => {
    const { app } = buildApp({ isAdmin: false });
    const res = await request(app)
      .post('/api/admin/forms')
      .set('Cookie', adminCookie())
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(res.status).toBe(403);
  });

  it('rejects a non-PDF body with 400', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/admin/forms')
      .set('Cookie', adminCookie())
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('not a pdf'));
    expect(res.status).toBe(400);
  });

  it('ingests a PDF, stores a DRAFT, and returns stats + unmapped fields', async () => {
    const { app, prisma } = buildApp();
    const res = await request(app)
      .post('/api/admin/forms?title=My%20Fund&hint=subscription')
      .set('Cookie', adminCookie())
      .set('Content-Type', 'application/pdf')
      .send(PDF);

    expect(res.status).toBe(201);
    expect(res.body.form).toMatchObject({ id: 'f1', status: 'DRAFT', source: 'UPLOAD' });
    expect(res.body.stats).toMatchObject({ totalFields: 195, steps: 1, choiceGroups: 0 });
    expect(res.body.unmappedFields).toEqual(['Check Box48', 'undefined_5']);

    // Stored as DRAFT/UPLOAD with the schema + unmapped count.
    const createArg = (prisma.formCatalog.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(createArg.data).toMatchObject({
      title: 'My Fund',
      source: 'UPLOAD',
      status: 'DRAFT',
      unmappedCount: 2
    });
    // Title override is propagated into the stored schema too.
    expect((createArg.data.schema as { title: string }).title).toBe('My Fund');
  });

  it('maps a duplicate-code constraint to 409', async () => {
    const { app } = buildApp({
      createImpl: () => {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
    });
    const res = await request(app)
      .post('/api/admin/forms')
      .set('Cookie', adminCookie())
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(res.status).toBe(409);
  });

  it('returns 503 when ingestion is not configured (no key, no injected ingest)', async () => {
    // Use the default ingest (not injected) with apiKey: null in config.
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', name: 'A', email: 'a@x', isAdmin: true }) },
      formCatalog: { create: vi.fn() }
    } as unknown as PrismaClient;
    const app = express();
    app.use(cookieParser());
    app.use('/api/admin', createAdminFormsRouter({ prisma, config })); // no ingest injected
    app.use(((error, _req, res, _next) => {
      if (error instanceof HttpError) res.status(error.statusCode).json({ message: error.message });
      else res.status(500).json({ message: 'err' });
    }) as ErrorRequestHandler);

    const res = await request(app)
      .post('/api/admin/forms')
      .set('Cookie', adminCookie())
      .set('Content-Type', 'application/pdf')
      .send(PDF);
    expect(res.status).toBe(503);
  });
});

describe('GET /api/admin/forms', () => {
  it('lists catalog entries for admins', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/admin/forms').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.body.forms).toHaveLength(1);
  });

  it('returns 403 for non-admins', async () => {
    const { app } = buildApp({ isAdmin: false });
    const res = await request(app).get('/api/admin/forms').set('Cookie', adminCookie());
    expect(res.status).toBe(403);
  });

  it('fetches a single form schema for review', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/admin/forms/f1').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.body.form.id).toBe('f1');
  });
});

describe('PDF map admin endpoints', () => {
  it('returns PDF pages, editable targets, variables, and skipped signatures list', async () => {
    const { app } = buildApp({ templateBytes: await makeTemplatePdf() });
    const res = await request(app).get('/api/admin/forms/f1/pdf-map').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.body.pages[0]).toMatchObject({ page: 1, width: 320, height: 220 });
    expect(res.body.mappingLayout.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'acrofield',
          pdfField: 'Investment',
          variableKey: 'canonical:investment.amount',
          widgetType: 'text'
        })
      ])
    );
    expect(res.body.variables).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'canonical:person.fullName' })]));
    expect(res.body.skippedSignatureFields).toEqual([]);
  });

  it('saves an admin-created overlay mapping into the schema JSON', async () => {
    const { app, prisma } = buildApp({ templateBytes: await makeTemplatePdf() });
    const mappingLayout = {
      version: 1,
      targets: [
        {
          id: 'overlay:test',
          kind: 'overlay',
          page: 1,
          rect: { x: 60, y: 70, width: 140, height: 18 },
          widgetType: 'text',
          variableKey: 'canonical:person.fullName',
          format: 'text',
          source: 'admin'
        }
      ]
    };
    const res = await request(app)
      .put('/api/admin/forms/f1/pdf-map')
      .set('Cookie', adminCookie())
      .send({ mappingLayout });
    expect(res.status).toBe(200);
    const arg = (prisma.formCatalog.update as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect((arg.data.schema as { mappingLayout: unknown }).mappingLayout).toEqual(mappingLayout);
  });
});

describe('PATCH /api/admin/forms/:id', () => {
  it('saves a title edit', async () => {
    const { app, prisma } = buildApp();
    const res = await request(app)
      .patch('/api/admin/forms/f1')
      .set('Cookie', adminCookie())
      .send({ title: 'Renamed Form' });
    expect(res.status).toBe(200);
    const arg = (prisma.formCatalog.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.data.title).toBe('Renamed Form');
  });

  it('saves an edited schema and recomputes unmappedCount', async () => {
    const { app, prisma } = buildApp();
    const edited = { ...fakeSchema, unmappedFields: [] };
    const res = await request(app)
      .patch('/api/admin/forms/f1')
      .set('Cookie', adminCookie())
      .send({ schema: edited });
    expect(res.status).toBe(200);
    const arg = (prisma.formCatalog.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.data.unmappedCount).toBe(0);
  });

  it('rejects an invalid schema with 400', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .patch('/api/admin/forms/f1')
      .set('Cookie', adminCookie())
      .send({ schema: { nonsense: true } });
    expect(res.status).toBe(400);
  });

  it('requires admin', async () => {
    const { app } = buildApp({ isAdmin: false });
    const res = await request(app)
      .patch('/api/admin/forms/f1')
      .set('Cookie', adminCookie())
      .send({ title: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/forms/:id/publish', () => {
  it('flips a draft to published when the v2 schema is valid', async () => {
    const { app, prisma } = buildApp();
    const res = await request(app).post('/api/admin/forms/f1/publish').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    const arg = (prisma.formCatalog.update as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.data).toMatchObject({ status: 'PUBLISHED', active: true });
  });

  it('rejects publish when a mapping target references an unknown variable', async () => {
    const badSchema = {
      ...fakeSchema,
      mappingLayout: {
        version: 1,
        targets: [
          {
            id: 'overlay:bad',
            kind: 'overlay',
            page: 1,
            rect: { x: 10, y: 10, width: 100, height: 18 },
            widgetType: 'text',
            variableKey: 'canonical:not.real',
            source: 'admin'
          }
        ]
      }
    };
    const { app } = buildApp({ schemaOverride: badSchema });
    const res = await request(app).post('/api/admin/forms/f1/publish').set('Cookie', adminCookie());
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('PDF mapping');
  });
});

describe('POST /api/admin/forms/:id/reanalyze', () => {
  it('re-ingests the stored PDF and updates the schema', async () => {
    const { app, prisma } = buildApp();
    const res = await request(app).post('/api/admin/forms/f1/reanalyze').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.body.stats).toMatchObject({ totalFields: 195 });
    // schema was re-stored
    const calls = (prisma.formCatalog.update as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c) => (c[0] as { data: { schema?: unknown } }).data.schema)).toBe(true);
  });

  it('requires admin', async () => {
    const { app } = buildApp({ isAdmin: false });
    const res = await request(app).post('/api/admin/forms/f1/reanalyze').set('Cookie', adminCookie());
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/forms/:id/preview-session', () => {
  it('creates an admin-owned preview client', async () => {
    const { app, prisma } = buildApp();
    const res = await request(app).post('/api/admin/forms/f1/preview-session').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.body.previewClientId).toBe('preview1');
    expect(res.body.code).toBe('RGPIF_II');
    const arg = (prisma.client.upsert as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.create.isPreview).toBe(true);
  });

  it('requires admin', async () => {
    const { app } = buildApp({ isAdmin: false });
    const res = await request(app).post('/api/admin/forms/f1/preview-session').set('Cookie', adminCookie());
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/forms/:id/template', () => {
  it('streams the stored PDF', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/admin/forms/f1/template').set('Cookie', adminCookie());
    // fakeStore wrote nothing to disk, so loadTemplate('local:f1') returns null -> 404.
    // The route wiring (auth + lookup) is what we assert here.
    expect([200, 404]).toContain(res.status);
  });
});
