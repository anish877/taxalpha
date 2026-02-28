import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';
import { defaultBaiodfStep3Fields } from '../src/lib/baiodf-step3.js';
import { defaultBaiv506cStep1Fields } from '../src/lib/baiv-506c-step1.js';
import { defaultBaiv506cStep2Fields } from '../src/lib/baiv-506c-step2.js';
import { defaultStep1Fields } from '../src/lib/investor-profile-step1.js';
import { defaultStep7Fields } from '../src/lib/investor-profile-step7.js';
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
    brokerageAccreditedInvestorVerificationOnboarding: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    }
  };
}

describe('baiv 506(c) routes', () => {
  it('returns 400 when BAIV is not selected for the client', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'INVESTOR_PROFILE' } }],
      investorProfileOnboarding: null,
      statementOfFinancialConditionOnboarding: null,
      baiodfOnboarding: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/brokerage-accredited-investor-verification/step-1')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('not selected');
  });

  it('prefills step 1 from investor profile and falls back customer name to client name', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'BAIV_506C' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR Prefill',
        step1RrNo: '1234',
        step1CustomerNames: null,
        step1Data: null,
        step7Data: null
      },
      statementOfFinancialConditionOnboarding: null,
      baiodfOnboarding: null
    });
    prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert.mockResolvedValue({
      status: 'NOT_STARTED',
      step1CurrentQuestionIndex: 0,
      step1Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/brokerage-accredited-investor-verification/step-1')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.fields.accountRegistration.rrName).toBe('RR Prefill');
    expect(response.body.onboarding.step.fields.accountRegistration.rrNo).toBe('1234');
    expect(response.body.onboarding.step.fields.accountRegistration.customerNames).toBe('Client One');
  });

  it('prefills step 2 signatures by precedence and honors joint signature requirement', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);

    const investorStep1 = defaultStep1Fields();
    investorStep1.typeOfAccount.primaryType.individual = false;
    investorStep1.typeOfAccount.primaryType.jointTenant = true;

    const step7 = defaultStep7Fields();
    step7.signatures.accountOwner = {
      typedSignature: 'Step7 Owner',
      printedName: 'Step7 Owner',
      date: '2026-02-27'
    };

    const sfcStep2 = defaultSfcStep2Fields();
    sfcStep2.signatures.accountOwner = {
      typedSignature: 'SFC Owner',
      printedName: 'SFC Owner',
      date: '2026-02-27'
    };
    sfcStep2.signatures.financialProfessional = {
      typedSignature: 'SFC FP',
      printedName: 'SFC FP',
      date: '2026-02-27'
    };

    const baiodfStep3 = defaultBaiodfStep3Fields();
    baiodfStep3.signatures.accountOwner = {
      typedSignature: 'BAIODF Owner',
      printedName: 'BAIODF Owner',
      date: '2026-02-27'
    };
    baiodfStep3.signatures.jointAccountOwner = {
      typedSignature: 'BAIODF Joint',
      printedName: 'BAIODF Joint',
      date: '2026-02-27'
    };
    baiodfStep3.signatures.financialProfessional = {
      typedSignature: 'BAIODF FP',
      printedName: 'BAIODF FP',
      date: '2026-02-27'
    };

    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'BAIV_506C' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR One',
        step1RrNo: '1001',
        step1CustomerNames: 'Client One',
        step1Data: investorStep1,
        step7Data: step7
      },
      statementOfFinancialConditionOnboarding: {
        step2Data: sfcStep2
      },
      baiodfOnboarding: {
        step3Data: baiodfStep3
      }
    });
    prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step2CurrentQuestionIndex: 0,
      step2Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/brokerage-accredited-investor-verification/step-2')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.requiresJointOwnerSignature).toBe(true);
    expect(response.body.onboarding.step.fields.signatures.accountOwner.printedName).toBe('BAIODF Owner');
    expect(response.body.onboarding.step.fields.signatures.jointAccountOwner.printedName).toBe('BAIODF Joint');
    expect(response.body.onboarding.step.fields.signatures.financialProfessional.printedName).toBe('BAIODF FP');
  });

  it('marks step 2 as COMPLETED when step1 + step2 completion requirements are satisfied', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);

    const existingStep1 = defaultBaiv506cStep1Fields();
    existingStep1.accountRegistration = {
      rrName: 'RR One',
      rrNo: '1001',
      customerNames: 'Client One'
    };

    const existingStep2 = defaultBaiv506cStep2Fields();
    existingStep2.acknowledgements = {
      rule506cGuidelineAcknowledged: true,
      secRuleReviewedAndUnderstood: true,
      incomeOrNetWorthVerified: true,
      documentationReviewed: true
    };
    existingStep2.signatures.accountOwner = {
      typedSignature: 'Client One',
      printedName: 'Client One',
      date: '2026-02-27'
    };

    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'BAIV_506C' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR One',
        step1RrNo: '1001',
        step1CustomerNames: 'Client One',
        step1Data: defaultStep1Fields(),
        step7Data: null
      },
      statementOfFinancialConditionOnboarding: null,
      baiodfOnboarding: null
    });
    prisma.brokerageAccreditedInvestorVerificationOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: existingStep1,
      step2CurrentQuestionIndex: 2,
      step2Data: existingStep2
    });
    prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert.mockResolvedValue({
      status: 'COMPLETED',
      step2CurrentQuestionIndex: 2,
      step2Data: {
        ...existingStep2,
        signatures: {
          ...existingStep2.signatures,
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
      .post('/api/clients/client_1/brokerage-accredited-investor-verification/step-2')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step2.signatures.financialProfessional',
        answer: {
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          }
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('COMPLETED');
    expect(prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'COMPLETED'
        })
      })
    );
  });
});
