import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { createSessionToken, AUTH_COOKIE_NAME } from '../src/lib/auth.js';
import { defaultSfcStep1Fields } from '../src/lib/statement-of-financial-condition-step1.js';
import { defaultSfcStep2Fields } from '../src/lib/statement-of-financial-condition-step2.js';

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
    client: {
      findFirst: vi.fn()
    },
    statementOfFinancialConditionOnboarding: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    }
  };
}

describe('statement-of-financial-condition routes', () => {
  it('prefills step 1 account registration from investor profile', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'INVESTOR_PROFILE' } }, { form: { code: 'SFC' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR Prefill',
        step1RrNo: '1234',
        step1CustomerNames: 'John Prefill',
        step1Data: null,
        step7Data: null
      }
    });
    prisma.statementOfFinancialConditionOnboarding.upsert.mockResolvedValue({
      status: 'NOT_STARTED',
      step1CurrentQuestionIndex: 0,
      step1Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/statement-of-financial-condition/step-1')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.fields.accountRegistration.rrName).toBe('RR Prefill');
    expect(response.body.onboarding.step.fields.accountRegistration.rrNo).toBe('1234');
    expect(response.body.onboarding.step.fields.accountRegistration.customerNames).toBe('John Prefill');
  });

  it('validates step 1 numeric fields and rejects invalid negative amounts', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'SFC' } }],
      investorProfileOnboarding: null
    });
    prisma.statementOfFinancialConditionOnboarding.findUnique.mockResolvedValue({
      status: 'NOT_STARTED',
      step1CurrentQuestionIndex: 0,
      step1Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/statement-of-financial-condition/step-1')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step1.liabilities',
        answer: {
          mortgagePrimaryResidence: -1,
          mortgagesSecondaryInvestment: 0,
          homeEquityLoans: 0,
          creditCards: 0,
          otherLiabilities: 0
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors['step1.liabilities.mortgagePrimaryResidence']).toContain(
      'non-negative'
    );
  });

  it('enforces step 2 acknowledgement boolean-map cardinality', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'SFC' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR One',
        step1RrNo: '1001',
        step1CustomerNames: 'Client One',
        step1Data: null,
        step7Data: null
      }
    });
    prisma.statementOfFinancialConditionOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: defaultSfcStep1Fields(),
      step2CurrentQuestionIndex: 1,
      step2Data: defaultSfcStep2Fields()
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/statement-of-financial-condition/step-2')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step2.acknowledgements',
        answer: {
          attestDataAccurateComplete: true,
          agreeReportMaterialChanges: true,
          understandMayNeedRecertification: false,
          understandMayNeedSupportingDocumentation: true,
          understandInfoUsedForBestInterestRecommendations: true
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors['step2.acknowledgements']).toContain('must be accepted');
  });

  it('marks step 2 as completed when step 1 and step 2 completion requirements are satisfied', async () => {
    const prisma = createMockPrisma();
    const completeStep1 = defaultSfcStep1Fields();
    completeStep1.accountRegistration = {
      rrName: 'RR One',
      rrNo: '1001',
      customerNames: 'Client One'
    };

    const completeStep2 = defaultSfcStep2Fields();
    completeStep2.acknowledgements = {
      attestDataAccurateComplete: true,
      agreeReportMaterialChanges: true,
      understandMayNeedRecertification: true,
      understandMayNeedSupportingDocumentation: true,
      understandInfoUsedForBestInterestRecommendations: true
    };
    completeStep2.signatures.accountOwner = {
      typedSignature: 'Client One',
      printedName: 'Client One',
      date: '2026-02-27'
    };

    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'SFC' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR One',
        step1RrNo: '1001',
        step1CustomerNames: 'Client One',
        step1Data: null,
        step7Data: null
      }
    });
    prisma.statementOfFinancialConditionOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completeStep1,
      step2CurrentQuestionIndex: 3,
      step2Data: completeStep2
    });
    prisma.statementOfFinancialConditionOnboarding.upsert.mockResolvedValue({
      status: 'COMPLETED',
      step2CurrentQuestionIndex: 3,
      step2Data: {
        ...completeStep2,
        signatures: {
          ...completeStep2.signatures,
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          }
        }
      }
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/statement-of-financial-condition/step-2')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step2.signatures.firm',
        answer: {
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          },
          registeredPrincipal: {
            typedSignature: null,
            printedName: null,
            date: null
          }
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('COMPLETED');
  });

  it('returns nextRouteAfterCompletion to BAIODF when SFC completes and BAIODF is pending', async () => {
    const prisma = createMockPrisma();
    const completeStep1 = defaultSfcStep1Fields();
    completeStep1.accountRegistration = {
      rrName: 'RR One',
      rrNo: '1001',
      customerNames: 'Client One'
    };

    const completeStep2 = defaultSfcStep2Fields();
    completeStep2.acknowledgements = {
      attestDataAccurateComplete: true,
      agreeReportMaterialChanges: true,
      understandMayNeedRecertification: true,
      understandMayNeedSupportingDocumentation: true,
      understandInfoUsedForBestInterestRecommendations: true
    };
    completeStep2.signatures.accountOwner = {
      typedSignature: 'Client One',
      printedName: 'Client One',
      date: '2026-02-27'
    };

    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'SFC' } }, { form: { code: 'BAIODF' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR One',
        step1RrNo: '1001',
        step1CustomerNames: 'Client One',
        step1Data: null,
        step7Data: null
      },
      baiodfOnboarding: null
    });
    prisma.statementOfFinancialConditionOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completeStep1,
      step2CurrentQuestionIndex: 3,
      step2Data: completeStep2
    });
    prisma.statementOfFinancialConditionOnboarding.upsert.mockResolvedValue({
      status: 'COMPLETED',
      step2CurrentQuestionIndex: 3,
      step2Data: {
        ...completeStep2,
        signatures: {
          ...completeStep2.signatures,
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          }
        }
      }
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/statement-of-financial-condition/step-2')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step2.signatures.firm',
        answer: {
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          },
          registeredPrincipal: {
            typedSignature: null,
            printedName: null,
            date: null
          }
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('COMPLETED');
    expect(response.body.onboarding.step.nextRouteAfterCompletion).toBe(
      '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1'
    );
  });

  it('returns nextRouteAfterCompletion to BAIV when SFC completes and BAIV is pending', async () => {
    const prisma = createMockPrisma();
    const completeStep1 = defaultSfcStep1Fields();
    completeStep1.accountRegistration = {
      rrName: 'RR One',
      rrNo: '1001',
      customerNames: 'Client One'
    };

    const completeStep2 = defaultSfcStep2Fields();
    completeStep2.acknowledgements = {
      attestDataAccurateComplete: true,
      agreeReportMaterialChanges: true,
      understandMayNeedRecertification: true,
      understandMayNeedSupportingDocumentation: true,
      understandInfoUsedForBestInterestRecommendations: true
    };
    completeStep2.signatures.accountOwner = {
      typedSignature: 'Client One',
      printedName: 'Client One',
      date: '2026-02-27'
    };

    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'SFC' } }, { form: { code: 'BAIV_506C' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR One',
        step1RrNo: '1001',
        step1CustomerNames: 'Client One',
        step1Data: null,
        step7Data: null
      },
      baiodfOnboarding: null,
      baiv506cOnboarding: null
    });
    prisma.statementOfFinancialConditionOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completeStep1,
      step2CurrentQuestionIndex: 3,
      step2Data: completeStep2
    });
    prisma.statementOfFinancialConditionOnboarding.upsert.mockResolvedValue({
      status: 'COMPLETED',
      step2CurrentQuestionIndex: 3,
      step2Data: {
        ...completeStep2,
        signatures: {
          ...completeStep2.signatures,
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          }
        }
      }
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/statement-of-financial-condition/step-2')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step2.signatures.firm',
        answer: {
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          },
          registeredPrincipal: {
            typedSignature: null,
            printedName: null,
            date: null
          }
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('COMPLETED');
    expect(response.body.onboarding.step.nextRouteAfterCompletion).toBe(
      '/clients/client_1/brokerage-accredited-investor-verification/step-1'
    );
  });
});
