import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';

const config = {
  nodeEnv: 'test' as const,
  frontendUrl: 'http://localhost:5173',
  jwtSecret: 'test_secret_test_secret_test_secret_1234',
  jwtExpiresIn: '7d'
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
      findUnique: vi.fn()
    },
    formCatalog: {
      findFirst: vi.fn()
    },
    client: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    investorProfileOnboarding: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    },
    $transaction: vi.fn()
  };
}

describe('client routes', () => {
  it('blocks unauthenticated access to clients list', async () => {
    const prisma = createMockPrisma();
    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).get('/api/clients');
    expect(response.status).toBe(401);
  });

  it('creates a client with investor profile onboarding and reuses broker by email', async () => {
    const prisma = createMockPrisma();

    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.formCatalog.findFirst.mockResolvedValue({ id: 'form_investor' });

    const tx = {
      client: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'client_1',
            name: 'John Smith',
            email: 'john@example.com',
            phone: '+1 222 333 4444',
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            brokerLinks: [
              {
                role: 'PRIMARY',
                broker: {
                  id: 'broker_self',
                  name: authUser.name,
                  email: authUser.email,
                  kind: 'SELF'
                }
              },
              {
                role: 'ADDITIONAL',
                broker: {
                  id: 'broker_2',
                  name: 'Extra Broker',
                  email: 'extra@example.com',
                  kind: 'EXTERNAL'
                }
              }
            ],
            formSelections: [
              { form: { id: 'form_investor', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' } }
            ],
            investorProfileOnboarding: {
              status: 'NOT_STARTED',
              step1RrName: null
            }
          }),
        create: vi.fn().mockResolvedValue({ id: 'client_1' })
      },
      broker: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'broker_self',
          ownerUserId: authUser.id,
          name: authUser.name,
          email: authUser.email,
          kind: 'SELF'
        }),
        create: vi.fn(),
        upsert: vi.fn().mockResolvedValue({
          id: 'broker_2',
          ownerUserId: authUser.id,
          name: 'Extra Broker',
          email: 'extra@example.com',
          kind: 'EXTERNAL'
        })
      },
      clientBroker: {
        createMany: vi.fn().mockResolvedValue({ count: 2 })
      },
      clientFormSelection: {
        create: vi.fn().mockResolvedValue({ clientId: 'client_1', formId: 'form_investor' })
      },
      investorProfileOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'onboarding_1' })
      }
    };

    prisma.$transaction.mockImplementation(async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx));

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients')
      .set('Cookie', createAuthCookie())
      .send({
        clientName: 'John Smith',
        clientEmail: 'John@example.com',
        clientPhone: '+1 222 333 4444',
        additionalBrokers: [
          { name: 'Extra Broker', email: 'extra@example.com' },
          { name: 'Extra Broker', email: 'EXTRA@example.com' }
        ]
      });

    expect(response.status).toBe(201);
    expect(response.body.client.email).toBe('john@example.com');
    expect(response.body.client.additionalBrokers).toHaveLength(1);
    expect(response.body.client.investorProfileOnboardingStatus).toBe('NOT_STARTED');
    expect(response.body.client.hasInvestorProfile).toBe(true);
    expect(tx.broker.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects duplicate client email in same user workspace', async () => {
    const prisma = createMockPrisma();

    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.formCatalog.findFirst.mockResolvedValue({ id: 'form_investor' });

    const tx = {
      client: {
        findUnique: vi.fn().mockResolvedValueOnce({ id: 'existing_client' }),
        create: vi.fn()
      },
      broker: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn()
      },
      clientBroker: {
        createMany: vi.fn()
      },
      clientFormSelection: {
        create: vi.fn()
      },
      investorProfileOnboarding: {
        create: vi.fn()
      }
    };

    prisma.$transaction.mockImplementation(async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx));

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients')
      .set('Cookie', createAuthCookie())
      .send({
        clientName: 'Duplicate User',
        clientEmail: 'duplicate@example.com',
        additionalBrokers: []
      });

    expect(response.status).toBe(409);
    expect(response.body.fieldErrors.clientEmail).toBe('Client email already exists.');
  });

  it('returns step 1 onboarding payload for owned client', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'NOT_STARTED',
      step1RrName: null,
      step1RrNo: null,
      step1CustomerNames: null,
      step1AccountNo: null,
      step1AccountType: { retirement: false, retail: false },
      step1CurrentQuestionIndex: 0
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/investor-profile/step-1')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.clientId).toBe('client_1');
    expect(response.body.onboarding.status).toBe('NOT_STARTED');
    expect(response.body.onboarding.step.fields.rrName).toBe('');
    expect(response.body.onboarding.step.fields.accountType).toEqual({
      retirement: false,
      retail: false
    });
  });

  it('saves RR Name and keeps onboarding in progress', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      step1RrName: null,
      step1RrNo: null,
      step1CustomerNames: null,
      step1AccountNo: null,
      step1AccountType: { retirement: false, retail: false },
      step1CurrentQuestionIndex: 0
    });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1RrName: 'Anish Suman',
      step1RrNo: null,
      step1CustomerNames: null,
      step1AccountNo: null,
      step1AccountType: { retirement: false, retail: false },
      step1CurrentQuestionIndex: 1
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-1')
      .set('Cookie', createAuthCookie())
      .send({ rrName: 'Anish Suman', currentQuestionIndex: 1 });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('IN_PROGRESS');
    expect(response.body.onboarding.step.fields.rrName).toBe('Anish Suman');
    expect(prisma.investorProfileOnboarding.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid account type when none or multiple options are selected', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-1')
      .set('Cookie', createAuthCookie())
      .send({
        accountType: {
          retirement: false,
          retail: false
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.accountType).toBe('Select exactly one account type.');
  });

  it('blocks onboarding access for clients outside owner scope', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue(null);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_other/investor-profile/step-1')
      .set('Cookie', createAuthCookie())
      .send({ rrName: 'Any Name' });

    expect(response.status).toBe(404);
  });
});
