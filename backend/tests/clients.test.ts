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

  it('returns step 1 payload with visible question ids', async () => {
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
      step1CurrentQuestionIndex: 0,
      step1Data: null
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
    expect(response.body.onboarding.step.currentQuestionId).toBe('rrName');
    expect(response.body.onboarding.step.visibleQuestionIds).toContain('typeOfAccount.primaryType');
  });

  it('saves answer patch and moves cursor', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'NOT_STARTED',
      step1RrName: null,
      step1RrNo: null,
      step1CustomerNames: null,
      step1AccountNo: null,
      step1AccountType: { retirement: false, retail: false },
      step1CurrentQuestionIndex: 0,
      step1Data: null
    });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1RrName: 'Anish Suman',
      step1RrNo: null,
      step1CustomerNames: null,
      step1AccountNo: null,
      step1AccountType: { retirement: false, retail: false },
      step1CurrentQuestionIndex: 1,
      step1Data: {
        accountRegistration: {
          rrName: 'Anish Suman',
          rrNo: '',
          customerNames: '',
          accountNo: '',
          retailRetirement: { retirement: false, retail: false }
        },
        typeOfAccount: {
          primaryType: {
            individual: false,
            corporation: false,
            corporatePensionProfitSharing: false,
            custodial: false,
            estate: false,
            jointTenant: false,
            limitedLiabilityCompany: false,
            individualSingleMemberLlc: false,
            soleProprietorship: false,
            transferOnDeathIndividual: false,
            transferOnDeathJoint: false,
            trust: false,
            nonprofitOrganization: false,
            partnership: false,
            exemptOrganization: false,
            other: false
          },
          corporationDesignation: { cCorp: false, sCorp: false },
          llcDesignation: { cCorp: false, sCorp: false, partnership: false },
          trust: {
            establishmentDate: null,
            trustType: {
              charitable: false,
              living: false,
              irrevocableLiving: false,
              family: false,
              revocable: false,
              irrevocable: false,
              testamentary: false
            }
          },
          custodial: { custodialType: { ugma: false, utma: false }, gifts: [] },
          joint: {
            marriedToEachOther: { yes: false, no: false },
            tenancyState: null,
            numberOfTenants: null,
            tenancyClause: {
              communityProperty: false,
              tenantsByEntirety: false,
              communityPropertyWithRightsOfSurvivorship: false,
              jointTenantsWithRightsOfSurvivorship: false,
              tenantsInCommon: false
            }
          },
          transferOnDeath: {
            individualAgreementDate: null,
            jointAgreementDate: null
          },
          otherDescription: null
        }
      }
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-1')
      .set('Cookie', createAuthCookie())
      .send({ questionId: 'rrName', answer: 'Anish Suman' });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('IN_PROGRESS');
    expect(response.body.onboarding.step.fields.accountRegistration.rrName).toBe('Anish Suman');
    expect(response.body.onboarding.step.currentQuestionId).toBe('rrNo');
  });

  it('rejects inactive branch question updates', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1RrName: 'A',
      step1RrNo: 'B',
      step1CustomerNames: 'C',
      step1AccountNo: 'D',
      step1AccountType: { retirement: true, retail: false },
      step1CurrentQuestionIndex: 5,
      step1Data: {
        accountRegistration: {
          rrName: 'A',
          rrNo: 'B',
          customerNames: 'C',
          accountNo: 'D',
          retailRetirement: { retirement: true, retail: false }
        },
        typeOfAccount: {
          primaryType: {
            individual: true,
            corporation: false,
            corporatePensionProfitSharing: false,
            custodial: false,
            estate: false,
            jointTenant: false,
            limitedLiabilityCompany: false,
            individualSingleMemberLlc: false,
            soleProprietorship: false,
            transferOnDeathIndividual: false,
            transferOnDeathJoint: false,
            trust: false,
            nonprofitOrganization: false,
            partnership: false,
            exemptOrganization: false,
            other: false
          },
          corporationDesignation: { cCorp: false, sCorp: false },
          llcDesignation: { cCorp: false, sCorp: false, partnership: false },
          trust: {
            establishmentDate: null,
            trustType: {
              charitable: false,
              living: false,
              irrevocableLiving: false,
              family: false,
              revocable: false,
              irrevocable: false,
              testamentary: false
            }
          },
          custodial: { custodialType: { ugma: false, utma: false }, gifts: [] },
          joint: {
            marriedToEachOther: { yes: false, no: false },
            tenancyState: null,
            numberOfTenants: null,
            tenancyClause: {
              communityProperty: false,
              tenantsByEntirety: false,
              communityPropertyWithRightsOfSurvivorship: false,
              jointTenantsWithRightsOfSurvivorship: false,
              tenantsInCommon: false
            }
          },
          transferOnDeath: {
            individualAgreementDate: null,
            jointAgreementDate: null
          },
          otherDescription: null
        }
      }
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-1')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'typeOfAccount.corporationDesignation',
        answer: {
          cCorp: true,
          sCorp: false
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.questionId).toContain('not active');
  });

  it('requires trust establishment date when trust account type is selected', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1RrName: 'A',
      step1RrNo: 'B',
      step1CustomerNames: 'C',
      step1AccountNo: 'D',
      step1AccountType: { retirement: true, retail: false },
      step1CurrentQuestionIndex: 7,
      step1Data: {
        accountRegistration: {
          rrName: 'A',
          rrNo: 'B',
          customerNames: 'C',
          accountNo: 'D',
          retailRetirement: { retirement: true, retail: false }
        },
        typeOfAccount: {
          primaryType: {
            individual: false,
            corporation: false,
            corporatePensionProfitSharing: false,
            custodial: false,
            estate: false,
            jointTenant: false,
            limitedLiabilityCompany: false,
            individualSingleMemberLlc: false,
            soleProprietorship: false,
            transferOnDeathIndividual: false,
            transferOnDeathJoint: false,
            trust: true,
            nonprofitOrganization: false,
            partnership: false,
            exemptOrganization: false,
            other: false
          },
          corporationDesignation: { cCorp: false, sCorp: false },
          llcDesignation: { cCorp: false, sCorp: false, partnership: false },
          trust: {
            establishmentDate: null,
            trustType: {
              charitable: false,
              living: false,
              irrevocableLiving: false,
              family: false,
              revocable: false,
              irrevocable: false,
              testamentary: false
            }
          },
          custodial: { custodialType: { ugma: false, utma: false }, gifts: [] },
          joint: {
            marriedToEachOther: { yes: false, no: false },
            tenancyState: null,
            numberOfTenants: null,
            tenancyClause: {
              communityProperty: false,
              tenantsByEntirety: false,
              communityPropertyWithRightsOfSurvivorship: false,
              jointTenantsWithRightsOfSurvivorship: false,
              tenantsInCommon: false
            }
          },
          transferOnDeath: {
            individualAgreementDate: null,
            jointAgreementDate: null
          },
          otherDescription: null
        }
      }
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-1')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'typeOfAccount.trust.establishmentDate',
        answer: ''
      });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors['typeOfAccount.trust.establishmentDate']).toContain('required');
  });

  it('returns step 2 onboarding payload for owned client', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step2CurrentQuestionIndex: 0,
      step2Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/investor-profile/step-2')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.currentQuestionId).toBe('step2.initialSourceOfFunds');
    expect(response.body.onboarding.step.fields.initialSourceOfFunds.accountsReceivable).toBe(false);
  });

  it('validates step 2 other details when other source is selected', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-2')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step2.initialSourceOfFunds',
        answer: {
          accountsReceivable: false,
          incomeFromEarnings: false,
          legalSettlement: false,
          spouseParent: false,
          accumulatedSavings: false,
          inheritance: false,
          lotteryGaming: false,
          rentalIncome: false,
          alimony: false,
          insuranceProceeds: false,
          pensionIraRetirementSavings: false,
          saleOfBusiness: false,
          gift: false,
          investmentProceeds: false,
          saleOfRealEstate: false,
          other: true,
          otherDetails: ''
        }
      });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors['initialSourceOfFunds.otherDetails']).toContain('Please add details');
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
      .send({ questionId: 'rrName', answer: 'Any Name' });

    expect(response.status).toBe(404);
  });
});
