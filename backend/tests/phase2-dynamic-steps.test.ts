import type { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';
import { HttpError } from '../src/lib/http-error.js';
import { createDynamicStepsRouter } from '../src/routes/dynamic-steps.js';
import type { RuntimeConfig } from '../src/types/deps.js';

const config = {
  nodeEnv: 'test',
  frontendUrl: 'http://localhost:5173',
  jwtSecret: 'test_secret_test_secret_test_secret_1234',
  jwtExpiresIn: '7d',
  n8nWebhooks: { investorProfileUrl: null, investorProfileAdditionalHolderUrl: null, statementOfFinancialConditionUrl: null, baiodfUrl: null, baiv506cUrl: null, timeoutMs: 5000, callbackSecret: 'c' }
} as unknown as RuntimeConfig;

const SCHEMA = {
  version: 2, code: 'DEMO', title: 'Demo',
  steps: [
    { number: 1, key: 'S1', label: 'STEP 1. TYPE' },
    { number: 2, key: 'S2', label: 'STEP 2. DETAILS', requiredIf: "investmentType in ['trust']" },
    { number: 3, key: 'S3', label: 'STEP 3. PRIMARY' }
  ],
  items: [
    { id: 'investmentType', step: 1, order: 0, title: 'Type', type: 'single-choice-cards', required: true,
      options: [{ label: 'Individual', value: 'individual', pdfField: 'CB1' }, { label: 'Trust', value: 'trust', pdfField: 'CB2' }] },
    { id: 'entity.taxForm', step: 2, order: 0, title: 'Tax form', type: 'single-choice-cards', required: true,
      showIf: "investmentType == 'trust'",
      options: [{ label: '1065', value: 'f1065', pdfField: 'CB3' }] },
    { id: 'primary.ssn', step: 3, order: 0, title: 'SSN', type: 'ssn-ein', required: true, validation: { rule: 'ssnOrEin' } }
  ],
  pdfFieldCount: 3, unmappedFields: []
};

const authUser = { id: 'u1', name: 'A', email: 'a@x.com', isAdmin: false };

function buildApp() {
  const responses = new Map<string, { clientId: string; formCode: string; status: string; stepData: object; stepCursors: object }>();
  const key = (c: string, f: string) => `${c}__${f}`;

  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(authUser) },
    client: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === 'client1' ? { id: 'client1', ownerUserId: 'u1' } : null) },
    formCatalog: { findUnique: vi.fn(async ({ where }: { where: { code: string } }) =>
      where.code === 'DEMO' ? { id: 'f1', code: 'DEMO', schema: SCHEMA, status: 'PUBLISHED' } : null) },
    dynamicFormResponse: {
      upsert: vi.fn(async ({ where, create }: { where: { clientId_formCode: { clientId: string; formCode: string } }; create: { clientId: string; formCode: string } }) => {
        const k = key(where.clientId_formCode.clientId, where.clientId_formCode.formCode);
        if (!responses.has(k)) responses.set(k, { clientId: create.clientId, formCode: create.formCode, status: 'IN_PROGRESS', stepData: {}, stepCursors: {} });
        return responses.get(k);
      }),
      update: vi.fn(async ({ where, data }: { where: { clientId_formCode: { clientId: string; formCode: string } }; data: Record<string, unknown> }) => {
        const k = key(where.clientId_formCode.clientId, where.clientId_formCode.formCode);
        const cur = responses.get(k)!;
        Object.assign(cur, data);
        return cur;
      })
    }
  } as unknown as PrismaClient;

  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use('/api/clients', createDynamicStepsRouter({ prisma, config }));
  const eh: ErrorRequestHandler = (e, _q, res, _n) => {
    if (e instanceof HttpError) res.status(e.statusCode).json({ message: e.message, fieldErrors: e.fieldErrors });
    else res.status(500).json({ message: 'err', detail: (e as Error).message });
  };
  app.use(eh);
  return { app, responses };
}

const cookie = () => `${AUTH_COOKIE_NAME}=${createSessionToken('u1', config.jwtSecret, config.jwtExpiresIn)}`;
const choose = (k: string, ks: string[]) => Object.fromEntries(ks.map((x) => [x, x === k]));

describe('Phase 2 — dynamic step routes', () => {
  let app: ReturnType<typeof buildApp>['app'];
  beforeEach(() => { app = buildApp().app; });

  it('GET schema returns the v2 schema', async () => {
    const r = await request(app).get('/api/clients/client1/forms/DEMO/schema').set('Cookie', cookie());
    expect(r.status).toBe(200);
    expect(r.body.schema.code).toBe('DEMO');
  });

  it('404 for a client the user does not own', async () => {
    const r = await request(app).get('/api/clients/other/forms/DEMO/step-1').set('Cookie', cookie());
    expect(r.status).toBe(404);
  });

  it('GET step 1 envelope: visible + current question', async () => {
    const r = await request(app).get('/api/clients/client1/forms/DEMO/step-1').set('Cookie', cookie());
    expect(r.status).toBe(200);
    expect(r.body.onboarding.step.visibleQuestionIds).toEqual(['investmentType']);
    expect(r.body.onboarding.step.currentQuestionId).toBe('investmentType');
    expect(r.body.onboarding.totalSteps).toBe(3);
  });

  it('POST step 1 advances cursor, writes IN_PROGRESS only', async () => {
    const r = await request(app).post('/api/clients/client1/forms/DEMO/step-1')
      .set('Cookie', cookie())
      .send({ questionId: 'investmentType', answer: choose('individual', ['individual', 'trust']), clientCursor: 99 });
    expect(r.status).toBe(200);
    // single visible question -> cursor clamps to last (0)
    expect(r.body.onboarding.step.currentQuestionIndex).toBe(0);
    // overall status not COMPLETED (step 3 ssn still required+empty)
    expect(r.body.onboarding.status).toBe('IN_PROGRESS');
  });

  it('cross-step branching: step 2 hidden for individual, shown for trust', async () => {
    // individual
    await request(app).post('/api/clients/client1/forms/DEMO/step-1').set('Cookie', cookie())
      .send({ questionId: 'investmentType', answer: choose('individual', ['individual', 'trust']) });
    let r = await request(app).get('/api/clients/client1/forms/DEMO/step-2').set('Cookie', cookie());
    expect(r.body.onboarding.step.visibleQuestionIds).toEqual([]);
    // switch to trust
    await request(app).post('/api/clients/client1/forms/DEMO/step-1').set('Cookie', cookie())
      .send({ questionId: 'investmentType', answer: choose('trust', ['individual', 'trust']) });
    r = await request(app).get('/api/clients/client1/forms/DEMO/step-2').set('Cookie', cookie());
    expect(r.body.onboarding.step.visibleQuestionIds).toEqual(['entity.taxForm']);
  });

  it('active-path guard: answering a hidden question -> 400 with gold string', async () => {
    await request(app).post('/api/clients/client1/forms/DEMO/step-1').set('Cookie', cookie())
      .send({ questionId: 'investmentType', answer: choose('individual', ['individual', 'trust']) });
    const r = await request(app).post('/api/clients/client1/forms/DEMO/step-2').set('Cookie', cookie())
      .send({ questionId: 'entity.taxForm', answer: choose('f1065', ['f1065']) });
    expect(r.status).toBe(400);
    // gold keys the active-path error under literal `questionId` (clients.ts:2546)
    expect(r.body.fieldErrors.questionId).toBe('This question is not active for the selected account path.');
  });

  it('validation error -> 400 highlighted fields', async () => {
    const r = await request(app).post('/api/clients/client1/forms/DEMO/step-3').set('Cookie', cookie())
      .send({ questionId: 'primary.ssn', answer: '12' });
    expect(r.status).toBe(400);
    expect(r.body.fieldErrors['primary.ssn']).toBeTruthy();
  });

  it('unknown question -> 400 unsupported', async () => {
    const r = await request(app).post('/api/clients/client1/forms/DEMO/step-1').set('Cookie', cookie())
      .send({ questionId: 'nope', answer: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.fieldErrors.questionId).toBe('Unsupported onboarding question.');
  });

  it('full individual path -> COMPLETED (step 2 skipped as not required)', async () => {
    await request(app).post('/api/clients/client1/forms/DEMO/step-1').set('Cookie', cookie())
      .send({ questionId: 'investmentType', answer: choose('individual', ['individual', 'trust']) });
    const r = await request(app).post('/api/clients/client1/forms/DEMO/step-3').set('Cookie', cookie())
      .send({ questionId: 'primary.ssn', answer: '123-45-6789' });
    expect(r.status).toBe(200);
    expect(r.body.onboarding.status).toBe('COMPLETED');
  });

  it('trust path stays IN_PROGRESS until step 2 filled (never skipped)', async () => {
    await request(app).post('/api/clients/client1/forms/DEMO/step-1').set('Cookie', cookie())
      .send({ questionId: 'investmentType', answer: choose('trust', ['individual', 'trust']) });
    let r = await request(app).post('/api/clients/client1/forms/DEMO/step-3').set('Cookie', cookie())
      .send({ questionId: 'primary.ssn', answer: '123456789' });
    expect(r.body.onboarding.status).toBe('IN_PROGRESS'); // step 2 required+empty
    r = await request(app).post('/api/clients/client1/forms/DEMO/step-2').set('Cookie', cookie())
      .send({ questionId: 'entity.taxForm', answer: choose('f1065', ['f1065']) });
    expect(r.body.onboarding.status).toBe('COMPLETED');
  });
});
