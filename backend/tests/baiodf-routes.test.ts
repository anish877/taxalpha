import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';
import { defaultBaiodfStep1Fields } from '../src/lib/baiodf-step1.js';
import { defaultBaiodfStep2Fields } from '../src/lib/baiodf-step2.js';
import { defaultBaiodfStep3Fields } from '../src/lib/baiodf-step3.js';
import {
  defaultSfcStep1Fields,
  getSfcStep1Totals
} from '../src/lib/statement-of-financial-condition-step1.js';

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
    brokerageAlternativeInvestmentOrderDisclosureOnboarding: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    }
  };
}

describe('baiodf routes', () => {
  it('returns 400 when BAIODF is not selected for the client', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'INVESTOR_PROFILE' } }],
      investorProfileOnboarding: null,
      statementOfFinancialConditionOnboarding: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('not selected');
  });

  it('prefills step 1 account registration from investor profile step 1', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'INVESTOR_PROFILE' } }, { form: { code: 'BAIODF' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR Prefill',
        step1RrNo: '1234',
        step1CustomerNames: 'John Prefill',
        step1Data: null,
        step7Data: null
      },
      statementOfFinancialConditionOnboarding: null
    });
    prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert.mockResolvedValue({
      status: 'NOT_STARTED',
      step1CurrentQuestionIndex: 0,
      step1Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.fields.accountRegistration.rrName).toBe('RR Prefill');
    expect(response.body.onboarding.step.fields.accountRegistration.rrNo).toBe('1234');
    expect(response.body.onboarding.step.fields.accountRegistration.customerNames).toBe('John Prefill');
  });

  it('prefills step 2 totals from SFC totals when available', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);

    const sfcFields = defaultSfcStep1Fields();
    sfcFields.accountRegistration = {
      rrName: 'RR One',
      rrNo: '1001',
      customerNames: 'Client One'
    };
    sfcFields.liquidNonQualifiedAssets.cashMoneyMarketsCds = 25000;
    sfcFields.liquidNonQualifiedAssets.brokerageNonManaged = 10000;
    sfcFields.liquidQualifiedAssets.cashMoneyMarketsCds = 5000;
    sfcFields.illiquidNonQualifiedAssets.primaryResidence = 80000;
    sfcFields.liabilities.creditCards = 5000;
    const expectedTotals = getSfcStep1Totals(sfcFields);

    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'BAIODF' } }, { form: { code: 'SFC' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR One',
        step1RrNo: '1001',
        step1CustomerNames: 'Client One',
        step1Data: null,
        step7Data: null
      },
      statementOfFinancialConditionOnboarding: {
        step1Data: sfcFields,
        step2Data: null
      }
    });
    prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: defaultBaiodfStep1Fields(),
      step2CurrentQuestionIndex: 0,
      step2Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-2')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.fields.netWorthAndConcentration.totalNetWorth).toBe(
      expectedTotals.totalNetWorth
    );
    expect(response.body.onboarding.step.fields.netWorthAndConcentration.liquidNetWorth).toBe(
      expectedTotals.totalPotentialLiquidity
    );
  });

  it('marks onboarding completed on step 3 when all step validators pass', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);

    const step1Fields = defaultBaiodfStep1Fields();
    step1Fields.accountRegistration = {
      rrName: 'RR One',
      rrNo: '1001',
      customerNames: 'Client One'
    };
    step1Fields.orderBasics.proposedPrincipalAmount = 10000;
    step1Fields.orderBasics.qualifiedAccount = { yes: false, no: true };
    step1Fields.orderBasics.solicitedTrade = { yes: true, no: false };
    step1Fields.orderBasics.taxAdvantagePurchase = { yes: false, no: true };

    const step2Fields = defaultBaiodfStep2Fields();
    step2Fields.custodianAndProduct.custodian.direct = true;
    step2Fields.custodianAndProduct.nameOfProduct = 'Sample Product';
    step2Fields.custodianAndProduct.sponsorIssuer = 'Issuer Name';
    step2Fields.custodianAndProduct.dateOfPpm = '2026-02-27';
    step2Fields.custodianAndProduct.datePpmSent = '2026-02-27';
    step2Fields.existingAltPositions.existingIlliquidAltPositions = 5000;
    step2Fields.existingAltPositions.existingSemiLiquidAltPositions = 4000;
    step2Fields.existingAltPositions.existingTaxAdvantageAltPositions = 3000;
    step2Fields.netWorthAndConcentration.totalNetWorth = 200000;
    step2Fields.netWorthAndConcentration.liquidNetWorth = 90000;

    const step3Fields = defaultBaiodfStep3Fields();
    step3Fields.acknowledgements = {
      illiquidLongTerm: true,
      reviewedProspectusOrPpm: true,
      understandFeesAndExpenses: true,
      noPublicMarket: true,
      limitedRedemptionAndSaleRisk: true,
      speculativeMayLoseInvestment: true,
      distributionsMayVaryOrStop: true,
      meetsSuitabilityStandards: true,
      featuresRisksDiscussed: true,
      meetsFinancialGoalsAndAccurate: true
    };
    step3Fields.signatures.accountOwner = {
      typedSignature: 'Client One',
      printedName: 'Client One',
      date: '2026-02-27'
    };

    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'BAIODF' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR One',
        step1RrNo: '1001',
        step1CustomerNames: 'Client One',
        step1Data: {
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
            }
          }
        },
        step7Data: null
      },
      statementOfFinancialConditionOnboarding: null
    });
    prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: step1Fields,
      step2Data: step2Fields,
      step3CurrentQuestionIndex: 2,
      step3Data: step3Fields
    });
    prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert.mockResolvedValue({
      status: 'COMPLETED',
      step3CurrentQuestionIndex: 2,
      step3Data: {
        ...step3Fields,
        signatures: {
          ...step3Fields.signatures,
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
      .post('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-3')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step3.signatures.financialProfessional',
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
    expect(prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'COMPLETED'
        })
      })
    );
  });

  it('returns nextRouteAfterCompletion to BAIV when BAIODF completes and BAIV is pending', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);

    const step1Fields = defaultBaiodfStep1Fields();
    step1Fields.accountRegistration = {
      rrName: 'RR One',
      rrNo: '1001',
      customerNames: 'Client One'
    };
    step1Fields.orderBasics.proposedPrincipalAmount = 10000;
    step1Fields.orderBasics.qualifiedAccount = { yes: false, no: true };
    step1Fields.orderBasics.solicitedTrade = { yes: true, no: false };
    step1Fields.orderBasics.taxAdvantagePurchase = { yes: false, no: true };

    const step2Fields = defaultBaiodfStep2Fields();
    step2Fields.custodianAndProduct.custodian.direct = true;
    step2Fields.custodianAndProduct.nameOfProduct = 'Sample Product';
    step2Fields.custodianAndProduct.sponsorIssuer = 'Issuer Name';
    step2Fields.custodianAndProduct.dateOfPpm = '2026-02-27';
    step2Fields.custodianAndProduct.datePpmSent = '2026-02-27';
    step2Fields.existingAltPositions.existingIlliquidAltPositions = 5000;
    step2Fields.existingAltPositions.existingSemiLiquidAltPositions = 4000;
    step2Fields.existingAltPositions.existingTaxAdvantageAltPositions = 3000;
    step2Fields.netWorthAndConcentration.totalNetWorth = 200000;
    step2Fields.netWorthAndConcentration.liquidNetWorth = 90000;

    const step3Fields = defaultBaiodfStep3Fields();
    step3Fields.acknowledgements = {
      illiquidLongTerm: true,
      reviewedProspectusOrPpm: true,
      understandFeesAndExpenses: true,
      noPublicMarket: true,
      limitedRedemptionAndSaleRisk: true,
      speculativeMayLoseInvestment: true,
      distributionsMayVaryOrStop: true,
      meetsSuitabilityStandards: true,
      featuresRisksDiscussed: true,
      meetsFinancialGoalsAndAccurate: true
    };
    step3Fields.signatures.accountOwner = {
      typedSignature: 'Client One',
      printedName: 'Client One',
      date: '2026-02-27'
    };

    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'BAIODF' } }, { form: { code: 'BAIV_506C' } }],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: 'RR One',
        step1RrNo: '1001',
        step1CustomerNames: 'Client One',
        step1Data: {
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
            }
          }
        },
        step7Data: null
      },
      statementOfFinancialConditionOnboarding: null,
      baiv506cOnboarding: null
    });
    prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: step1Fields,
      step2Data: step2Fields,
      step3CurrentQuestionIndex: 2,
      step3Data: step3Fields
    });
    prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert.mockResolvedValue({
      status: 'COMPLETED',
      step3CurrentQuestionIndex: 2,
      step3Data: {
        ...step3Fields,
        signatures: {
          ...step3Fields.signatures,
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
      .post('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-3')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step3.signatures.financialProfessional',
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
    expect(response.body.onboarding.step.nextRouteAfterCompletion).toBe(
      '/clients/client_1/brokerage-accredited-investor-verification/step-1'
    );
  });
});
