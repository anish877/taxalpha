import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';
import { defaultStep3Fields, type Step3Fields } from '../src/lib/investor-profile-step3.js';
import { defaultStep4Fields, type Step4Fields } from '../src/lib/investor-profile-step4.js';
import { defaultStep5Fields, type Step5Fields } from '../src/lib/investor-profile-step5.js';
import { defaultStep6Fields, type Step6Fields } from '../src/lib/investor-profile-step6.js';
import { defaultStep7Fields, type Step7Fields } from '../src/lib/investor-profile-step7.js';
import { defaultBaiv506cStep1Fields } from '../src/lib/baiv-506c-step1.js';
import { defaultBaiv506cStep2Fields } from '../src/lib/baiv-506c-step2.js';
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

const completedStep1Data = {
  accountRegistration: {
    rrName: 'RR One',
    rrNo: '1001',
    customerNames: 'John Smith',
    accountNo: 'ACCT-1',
    retailRetirement: { retail: true, retirement: false }
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
    }
  }
};

const completedStep2Data = {
  initialSourceOfFunds: {
    accountsReceivable: false,
    incomeFromEarnings: true,
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
    other: false,
    otherDetails: null
  }
};

const completedStep1DataRequiresStep4 = {
  ...completedStep1Data,
  typeOfAccount: {
    ...completedStep1Data.typeOfAccount,
    primaryType: {
      ...completedStep1Data.typeOfAccount.primaryType,
      individual: false,
      corporation: true
    },
    corporationDesignation: {
      cCorp: true,
      sCorp: false
    }
  }
};

function buildCompleteStep3EntityFields(): Step3Fields {
  const fields = defaultStep3Fields();

  fields.holder.kind = { person: false, entity: true };
  fields.holder.name = 'Acme Trust LLC';
  fields.holder.taxId.hasEin = { yes: false, no: true };
  fields.holder.contact.email = 'entity@example.com';
  fields.holder.contact.phones.mobile = '+1 555 555 5555';
  fields.holder.legalAddress = {
    line1: '123 Main St',
    city: 'Austin',
    stateProvince: 'TX',
    postalCode: '78701',
    country: 'US'
  };
  fields.holder.mailingDifferent = { yes: false, no: true };
  fields.holder.citizenship.primary = ['US'];

  fields.investmentKnowledge.general = {
    limited: false,
    moderate: true,
    extensive: false,
    none: false
  };

  for (const key of Object.keys(fields.investmentKnowledge.byType)) {
    const typeKey = key as keyof Step3Fields['investmentKnowledge']['byType'];
    fields.investmentKnowledge.byType[typeKey].knowledge = {
      limited: false,
      moderate: false,
      extensive: false,
      none: true
    };
    fields.investmentKnowledge.byType[typeKey].sinceYear = null;
  }

  fields.investmentKnowledge.byType.other.label = null;

  fields.financialInformation.annualIncomeRange = {
    fromBracket: '100k_250k',
    toBracket: '250k_500k'
  };
  fields.financialInformation.netWorthExPrimaryResidenceRange = {
    fromBracket: '250k_500k',
    toBracket: '500k_1m'
  };
  fields.financialInformation.liquidNetWorthRange = {
    fromBracket: '100k_250k',
    toBracket: '250k_500k'
  };
  fields.financialInformation.taxBracket = {
    bracket_0_15: false,
    bracket_15_1_32: true,
    bracket_32_1_50: false,
    bracket_50_1_plus: false
  };

  fields.affiliations.employeeAdvisorFirm = { yes: false, no: true };
  fields.affiliations.relatedAdvisorFirmEmployee = { yes: false, no: true };
  fields.affiliations.employeeBrokerDealer = { yes: false, no: true };
  fields.affiliations.relatedBrokerDealerEmployee = { yes: false, no: true };
  fields.affiliations.maintainsOtherBrokerageAccounts = { yes: false, no: true };
  fields.affiliations.exchangeOrFinraAffiliation = { yes: false, no: true };
  fields.affiliations.seniorOfficerDirectorTenPercentPublicCompany = { yes: false, no: true };

  return fields;
}

function buildCompleteStep4EntityFields(): Step4Fields {
  const fields = defaultStep4Fields();

  fields.holder.kind = { person: false, entity: true };
  fields.holder.name = 'Acme Trust LLC';
  fields.holder.taxId.hasEin = { yes: false, no: true };
  fields.holder.contact.email = 'entity@example.com';
  fields.holder.contact.phones.mobile = '+1 555 555 5555';
  fields.holder.legalAddress = {
    line1: '123 Main St',
    city: 'Austin',
    stateProvince: 'TX',
    postalCode: '78701',
    country: 'US'
  };
  fields.holder.mailingDifferent = { yes: false, no: true };
  fields.holder.citizenship.primary = ['US'];

  fields.investmentKnowledge.general = {
    limited: false,
    moderate: true,
    extensive: false,
    none: false
  };

  for (const key of Object.keys(fields.investmentKnowledge.byType)) {
    const typeKey = key as keyof Step4Fields['investmentKnowledge']['byType'];
    fields.investmentKnowledge.byType[typeKey].knowledge = {
      limited: false,
      moderate: false,
      extensive: false,
      none: true
    };
    fields.investmentKnowledge.byType[typeKey].sinceYear = null;
  }

  fields.investmentKnowledge.byType.other.label = null;

  fields.financialInformation.annualIncomeRange = {
    fromBracket: '100k_250k',
    toBracket: '250k_500k'
  };
  fields.financialInformation.netWorthExPrimaryResidenceRange = {
    fromBracket: '250k_500k',
    toBracket: '500k_1m'
  };
  fields.financialInformation.liquidNetWorthRange = {
    fromBracket: '100k_250k',
    toBracket: '250k_500k'
  };
  fields.financialInformation.taxBracket = {
    bracket_0_15: false,
    bracket_15_1_32: true,
    bracket_32_1_50: false,
    bracket_50_1_plus: false
  };

  fields.affiliations.employeeAdvisorFirm = { yes: false, no: true };
  fields.affiliations.relatedAdvisorFirmEmployee = { yes: false, no: true };
  fields.affiliations.employeeBrokerDealer = { yes: false, no: true };
  fields.affiliations.relatedBrokerDealerEmployee = { yes: false, no: true };
  fields.affiliations.maintainsOtherBrokerageAccounts = { yes: false, no: true };
  fields.affiliations.exchangeOrFinraAffiliation = { yes: false, no: true };
  fields.affiliations.seniorOfficerDirectorTenPercentPublicCompany = { yes: false, no: true };

  return fields;
}

function buildCompleteStep5Fields(): Step5Fields {
  const fields = defaultStep5Fields();

  fields.profile.riskExposure = {
    low: false,
    moderate: true,
    speculation: false,
    highRisk: false
  };
  fields.profile.accountObjectives = {
    income: false,
    longTermGrowth: true,
    shortTermGrowth: false
  };

  fields.investments.fixedValues.marketIncome = {
    equities: 10000,
    options: 0,
    fixedIncome: 25000,
    mutualFunds: 5000,
    unitInvestmentTrusts: 0,
    exchangeTradedFunds: 12500
  };
  fields.investments.fixedValues.alternativesInsurance = {
    realEstate: 30000,
    insurance: 4000,
    variableAnnuities: 1000,
    fixedAnnuities: 2000,
    preciousMetals: 500,
    commoditiesFutures: 0
  };
  fields.investments.hasOther = { yes: false, no: true };
  fields.investments.otherEntries.entries = [];

  fields.horizonAndLiquidity.timeHorizon = {
    fromYear: 2026,
    toYear: 2034
  };
  fields.horizonAndLiquidity.liquidityNeeds = {
    high: false,
    medium: true,
    low: false
  };

  return fields;
}

function buildCompleteStep6Fields(): Step6Fields {
  const fields = defaultStep6Fields();

  fields.trustedContact.decline = {
    yes: true,
    no: false
  };

  return fields;
}

function buildCompleteStep7Fields(requiresJointOwnerSignature: boolean): Step7Fields {
  const fields = defaultStep7Fields();

  fields.certifications.acceptances = {
    attestationsAccepted: true,
    taxpayerCertificationAccepted: true,
    usPersonDefinitionAcknowledged: true
  };

  fields.signatures.accountOwner = {
    typedSignature: 'John Smith',
    printedName: 'John Smith',
    date: '2026-02-27'
  };

  fields.signatures.financialProfessional = {
    typedSignature: 'Advisor One',
    printedName: 'Advisor One',
    date: '2026-02-27'
  };

  if (requiresJointOwnerSignature) {
    fields.signatures.jointAccountOwner = {
      typedSignature: 'Jane Smith',
      printedName: 'Jane Smith',
      date: '2026-02-27'
    };
  }

  return fields;
}

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
      findMany: vi.fn()
    },
    client: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    investorProfileOnboarding: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    },
    statementOfFinancialConditionOnboarding: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    },
    brokerageAlternativeInvestmentOrderDisclosureOnboarding: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    },
    brokerageAccreditedInvestorVerificationOnboarding: {
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
    prisma.formCatalog.findMany.mockResolvedValue([{ id: 'form_investor', code: 'INVESTOR_PROFILE' }]);

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
            },
            statementOfFinancialConditionOnboarding: null
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
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      investorProfileOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'onboarding_1' })
      },
      statementOfFinancialConditionOnboarding: {
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

  it('creates a client with optional SFC onboarding when selected', async () => {
    const prisma = createMockPrisma();

    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.formCatalog.findMany.mockResolvedValue([
      { id: 'form_investor', code: 'INVESTOR_PROFILE' },
      { id: 'form_sfc', code: 'SFC' }
    ]);

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
              }
            ],
            formSelections: [
              { form: { id: 'form_investor', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' } },
              { form: { id: 'form_sfc', code: 'SFC', title: 'Statement of Financial Condition' } }
            ],
            investorProfileOnboarding: {
              status: 'NOT_STARTED',
              step1RrName: null
            },
            statementOfFinancialConditionOnboarding: {
              status: 'NOT_STARTED',
              step1Data: null,
              step2Data: null
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
        upsert: vi.fn()
      },
      clientBroker: {
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      clientFormSelection: {
        createMany: vi.fn().mockResolvedValue({ count: 2 })
      },
      investorProfileOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'onboarding_1' })
      },
      statementOfFinancialConditionOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'sfc_onboarding_1' })
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
        clientEmail: 'john@example.com',
        clientPhone: '+1 222 333 4444',
        additionalBrokers: [],
        selectedFormCodes: ['INVESTOR_PROFILE', 'SFC']
      });

    expect(response.status).toBe(201);
    expect(response.body.client.hasInvestorProfile).toBe(true);
    expect(response.body.client.hasStatementOfFinancialCondition).toBe(true);
    expect(tx.clientFormSelection.createMany).toHaveBeenCalled();
    expect(tx.statementOfFinancialConditionOnboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client_1',
          status: 'NOT_STARTED'
        })
      })
    );
  });

  it('creates a client with optional BAIODF onboarding when selected', async () => {
    const prisma = createMockPrisma();

    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.formCatalog.findMany.mockResolvedValue([
      { id: 'form_investor', code: 'INVESTOR_PROFILE' },
      { id: 'form_baiodf', code: 'BAIODF' }
    ]);

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
              }
            ],
            formSelections: [
              { form: { id: 'form_investor', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' } },
              {
                form: {
                  id: 'form_baiodf',
                  code: 'BAIODF',
                  title: 'Brokerage Alternative Investment Order and Disclosure Form'
                }
              }
            ],
            investorProfileOnboarding: {
              status: 'NOT_STARTED',
              step1RrName: null
            },
            statementOfFinancialConditionOnboarding: null,
            baiodfOnboarding: {
              status: 'NOT_STARTED',
              step1Data: null,
              step2Data: null,
              step3Data: null
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
        upsert: vi.fn()
      },
      clientBroker: {
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      clientFormSelection: {
        createMany: vi.fn().mockResolvedValue({ count: 2 })
      },
      investorProfileOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'onboarding_1' })
      },
      statementOfFinancialConditionOnboarding: {
        create: vi.fn()
      },
      brokerageAlternativeInvestmentOrderDisclosureOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'baiodf_onboarding_1' })
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
        clientEmail: 'john@example.com',
        clientPhone: '+1 222 333 4444',
        additionalBrokers: [],
        selectedFormCodes: ['INVESTOR_PROFILE', 'BAIODF']
      });

    expect(response.status).toBe(201);
    expect(response.body.client.hasInvestorProfile).toBe(true);
    expect(response.body.client.hasBaiodf).toBe(true);
    expect(tx.clientFormSelection.createMany).toHaveBeenCalled();
    expect(tx.brokerageAlternativeInvestmentOrderDisclosureOnboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client_1',
          status: 'NOT_STARTED'
        })
      })
    );
  });

  it('rejects unsupported selected form codes', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients')
      .set('Cookie', createAuthCookie())
      .send({
        clientName: 'John Smith',
        clientEmail: 'john@example.com',
        selectedFormCodes: ['INVESTOR_PROFILE', 'UNKNOWN_FORM']
      });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.selectedFormCodes).toContain('Unsupported form code(s): UNKNOWN_FORM');
    expect(prisma.formCatalog.findMany).not.toHaveBeenCalled();
  });

  it('rejects inactive or missing selected form codes', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.formCatalog.findMany.mockResolvedValue([{ id: 'form_investor', code: 'INVESTOR_PROFILE' }]);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients')
      .set('Cookie', createAuthCookie())
      .send({
        clientName: 'John Smith',
        clientEmail: 'john@example.com',
        selectedFormCodes: ['INVESTOR_PROFILE', 'SFC']
      });

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.selectedFormCodes).toContain('Unavailable form code(s): SFC');
  });

  it('rejects duplicate client email in same user workspace', async () => {
    const prisma = createMockPrisma();

    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.formCatalog.findMany.mockResolvedValue([{ id: 'form_investor', code: 'INVESTOR_PROFILE' }]);

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
        createMany: vi.fn()
      },
      investorProfileOnboarding: {
        create: vi.fn()
      },
      statementOfFinancialConditionOnboarding: {
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

  it('returns step 3 onboarding payload for owned client', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completedStep1Data,
      step3CurrentQuestionIndex: 0,
      step3Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/investor-profile/step-3')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.currentQuestionId).toBe('step3.holder.kind');
    expect(response.body.onboarding.step.fields.holder.kind.person).toBe(true);
  });

  it('saves step 3 answer patch and moves cursor', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completedStep1Data,
      step3CurrentQuestionIndex: 0,
      step3Data: null
    });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completedStep1Data,
      step3CurrentQuestionIndex: 1,
      step3Data: {
        holder: {
          kind: { person: true, entity: false },
          name: '',
          taxId: { ssn: null, hasEin: { yes: false, no: false }, ein: null },
          contact: {
            email: '',
            dateOfBirth: null,
            specifiedAdult: null,
            phones: { home: null, business: null, mobile: null }
          },
          legalAddress: {
            line1: null,
            city: null,
            stateProvince: null,
            postalCode: null,
            country: null
          },
          mailingDifferent: { yes: false, no: false },
          mailingAddress: {
            line1: null,
            city: null,
            stateProvince: null,
            postalCode: null,
            country: null
          },
          citizenship: { primary: [], additional: [] },
          gender: { male: false, female: false },
          maritalStatus: {
            single: false,
            married: false,
            divorced: false,
            domesticPartner: false,
            widower: false
          },
          employment: {
            status: {
              employed: false,
              selfEmployed: false,
              retired: false,
              unemployed: false,
              student: false
            },
            occupation: null,
            yearsEmployed: null,
            typeOfBusiness: null,
            employerName: null,
            employerAddress: {
              line1: null,
              city: null,
              stateProvince: null,
              postalCode: null,
              country: null
            }
          }
        }
      }
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-3')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step3.holder.kind',
        answer: { person: true, entity: false }
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.currentQuestionId).toBe('step3.holder.name');
    expect(response.body.onboarding.step.fields.holder.kind.person).toBe(true);
  });

  it('returns step 4 onboarding payload when account type requires step 4', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completedStep1DataRequiresStep4,
      step4CurrentQuestionIndex: 0,
      step4Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/investor-profile/step-4')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.currentQuestionId).toBe('step4.holder.kind');
    expect(response.body.onboarding.step.fields.holder.kind.entity).toBe(true);
  });

  it('returns 400 for step 4 when account type does not require it', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completedStep1Data,
      step4CurrentQuestionIndex: 0,
      step4Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/investor-profile/step-4')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('not required');
  });

  it('keeps step 3 status IN_PROGRESS when step 4 is required', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    const completeStep3 = buildCompleteStep3EntityFields();
    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completedStep1DataRequiresStep4,
      step3CurrentQuestionIndex: 0,
      step3Data: completeStep3
    });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completedStep1DataRequiresStep4,
      step3CurrentQuestionIndex: 1,
      step3Data: completeStep3
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-3')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step3.holder.name',
        answer: 'Acme Trust LLC'
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('IN_PROGRESS');
    expect(prisma.investorProfileOnboarding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'IN_PROGRESS'
        })
      })
    );
  });

  it('keeps step 4 status IN_PROGRESS so step 5 remains the completion gate', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    const completeStep4 = buildCompleteStep4EntityFields();
    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completedStep1DataRequiresStep4,
      step4CurrentQuestionIndex: 0,
      step4Data: completeStep4
    });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completedStep1DataRequiresStep4,
      step4CurrentQuestionIndex: 1,
      step4Data: completeStep4
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-4')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step4.holder.name',
        answer: 'Acme Trust LLC'
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('IN_PROGRESS');
    expect(prisma.investorProfileOnboarding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'IN_PROGRESS'
        })
      })
    );
  });

  it('returns step 5 onboarding payload', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step5CurrentQuestionIndex: 0,
      step5Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/investor-profile/step-5')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.currentQuestionId).toBe('step5.profile.riskExposure');
  });

  it('keeps step 5 POST status IN_PROGRESS', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    const completeStep5 = buildCompleteStep5Fields();
    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step5CurrentQuestionIndex: 0,
      step5Data: completeStep5
    });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step5CurrentQuestionIndex: 1,
      step5Data: completeStep5
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-5')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step5.profile.riskExposure',
        answer: {
          low: false,
          moderate: true,
          speculation: false,
          highRisk: false
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('IN_PROGRESS');
    expect(prisma.investorProfileOnboarding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'IN_PROGRESS'
        })
      })
    );
  });

  it('returns step 6 onboarding payload', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step6CurrentQuestionIndex: 0,
      step6Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/investor-profile/step-6')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.currentQuestionId).toBe('step6.trustedContact.decline');
  });

  it('keeps step 6 POST status IN_PROGRESS', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({ id: 'client_1' });
    const completeStep6 = buildCompleteStep6Fields();
    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step6CurrentQuestionIndex: 0,
      step6Data: completeStep6
    });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step6CurrentQuestionIndex: 0,
      step6Data: completeStep6
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-6')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step6.trustedContact.decline',
        answer: {
          yes: true,
          no: false
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('IN_PROGRESS');
    expect(prisma.investorProfileOnboarding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'IN_PROGRESS'
        })
      })
    );
  });

  it('returns step 7 onboarding payload with joint signature requirement when step 4 is required', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      formSelections: [{ form: { code: 'INVESTOR_PROFILE' } }],
      statementOfFinancialConditionOnboarding: null
    });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1Data: completedStep1DataRequiresStep4,
      step3Data: null,
      step4Data: null,
      step7CurrentQuestionIndex: 0,
      step7Data: null
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/investor-profile/step-7')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.currentQuestionId).toBe('step7.certifications.acceptances');
    expect(response.body.onboarding.step.requiresJointOwnerSignature).toBe(true);
  });

  it('allows step 7 POST to reach COMPLETED status', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      formSelections: [{ form: { code: 'INVESTOR_PROFILE' } }],
      statementOfFinancialConditionOnboarding: null
    });
    const completeStep3 = buildCompleteStep3EntityFields();
    const completeStep4 = buildCompleteStep4EntityFields();
    const completeStep5 = buildCompleteStep5Fields();
    const completeStep6 = buildCompleteStep6Fields();
    const completeStep7 = buildCompleteStep7Fields(true);
    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1RrName: 'RR One',
      step1RrNo: '1001',
      step1CustomerNames: 'John Smith',
      step1AccountNo: 'ACCT-1',
      step1AccountType: { retail: true, retirement: false },
      step1Data: completedStep1DataRequiresStep4,
      step2Data: completedStep2Data,
      step3Data: completeStep3,
      step4Data: completeStep4,
      step5Data: completeStep5,
      step6Data: completeStep6,
      step7CurrentQuestionIndex: 2,
      step7Data: completeStep7
    });
    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'COMPLETED',
      step1Data: completedStep1DataRequiresStep4,
      step3Data: completeStep3,
      step4Data: completeStep4,
      step7CurrentQuestionIndex: 2,
      step7Data: completeStep7
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-7')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step7.signatures.firm',
        answer: {
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          },
          supervisorPrincipal: {
            typedSignature: null,
            printedName: null,
            date: null
          }
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('COMPLETED');
    expect(prisma.investorProfileOnboarding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: 'COMPLETED'
        })
      })
    );
  });

  it('returns step 7 nextRouteAfterCompletion when SFC is selected and incomplete', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      formSelections: [{ form: { code: 'INVESTOR_PROFILE' } }, { form: { code: 'SFC' } }],
      statementOfFinancialConditionOnboarding: {
        step1Data: null,
        step2Data: null
      }
    });

    const completeStep3 = buildCompleteStep3EntityFields();
    const completeStep4 = buildCompleteStep4EntityFields();
    const completeStep5 = buildCompleteStep5Fields();
    const completeStep6 = buildCompleteStep6Fields();
    const completeStep7 = buildCompleteStep7Fields(true);

    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1RrName: 'RR One',
      step1RrNo: '1001',
      step1CustomerNames: 'John Smith',
      step1AccountNo: 'ACCT-1',
      step1AccountType: { retail: true, retirement: false },
      step1Data: completedStep1DataRequiresStep4,
      step2Data: completedStep2Data,
      step3Data: completeStep3,
      step4Data: completeStep4,
      step5Data: completeStep5,
      step6Data: completeStep6,
      step7CurrentQuestionIndex: 2,
      step7Data: completeStep7
    });

    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'COMPLETED',
      step1Data: completedStep1DataRequiresStep4,
      step3Data: completeStep3,
      step4Data: completeStep4,
      step7CurrentQuestionIndex: 2,
      step7Data: completeStep7
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-7')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step7.signatures.firm',
        answer: {
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          },
          supervisorPrincipal: {
            typedSignature: null,
            printedName: null,
            date: null
          }
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.status).toBe('COMPLETED');
    expect(response.body.onboarding.step.nextRouteAfterCompletion).toBe(
      '/clients/client_1/statement-of-financial-condition/step-1'
    );
  });

  it('returns step 7 nextRouteAfterCompletion for BAIODF when SFC is complete and BAIODF is pending', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);

    const sfcStep1 = defaultSfcStep1Fields();
    sfcStep1.accountRegistration = {
      rrName: 'RR One',
      rrNo: '1001',
      customerNames: 'John Smith'
    };

    const sfcStep2 = defaultSfcStep2Fields();
    sfcStep2.acknowledgements = {
      attestDataAccurateComplete: true,
      agreeReportMaterialChanges: true,
      understandMayNeedRecertification: true,
      understandMayNeedSupportingDocumentation: true,
      understandInfoUsedForBestInterestRecommendations: true
    };
    sfcStep2.signatures.accountOwner = {
      typedSignature: 'John Smith',
      printedName: 'John Smith',
      date: '2026-02-27'
    };
    sfcStep2.signatures.jointAccountOwner = {
      typedSignature: 'Jane Smith',
      printedName: 'Jane Smith',
      date: '2026-02-27'
    };
    sfcStep2.signatures.financialProfessional = {
      typedSignature: 'Advisor One',
      printedName: 'Advisor One',
      date: '2026-02-27'
    };

    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      formSelections: [
        { form: { code: 'INVESTOR_PROFILE' } },
        { form: { code: 'SFC' } },
        { form: { code: 'BAIODF' } }
      ],
      statementOfFinancialConditionOnboarding: {
        step1Data: sfcStep1,
        step2Data: sfcStep2
      },
      baiodfOnboarding: null
    });

    const completeStep3 = buildCompleteStep3EntityFields();
    const completeStep4 = buildCompleteStep4EntityFields();
    const completeStep5 = buildCompleteStep5Fields();
    const completeStep6 = buildCompleteStep6Fields();
    const completeStep7 = buildCompleteStep7Fields(true);

    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1RrName: 'RR One',
      step1RrNo: '1001',
      step1CustomerNames: 'John Smith',
      step1AccountNo: 'ACCT-1',
      step1AccountType: { retail: true, retirement: false },
      step1Data: completedStep1DataRequiresStep4,
      step2Data: completedStep2Data,
      step3Data: completeStep3,
      step4Data: completeStep4,
      step5Data: completeStep5,
      step6Data: completeStep6,
      step7CurrentQuestionIndex: 2,
      step7Data: completeStep7
    });

    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'COMPLETED',
      step1Data: completedStep1DataRequiresStep4,
      step3Data: completeStep3,
      step4Data: completeStep4,
      step7CurrentQuestionIndex: 2,
      step7Data: completeStep7
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-7')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step7.signatures.firm',
        answer: {
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          },
          supervisorPrincipal: {
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

  it('returns resume route pointing to latest incomplete step', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findMany.mockResolvedValue([
      {
        id: 'client_1',
        name: 'John Smith',
        email: 'john@example.com',
        phone: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        brokerLinks: [
          {
            role: 'PRIMARY',
            broker: {
              id: 'broker_1',
              name: authUser.name,
              email: authUser.email,
              kind: 'SELF'
            }
          }
        ],
        formSelections: [{ form: { id: 'form_investor', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' } }],
        investorProfileOnboarding: {
          status: 'IN_PROGRESS',
          step1RrName: 'RR One',
          step1RrNo: '1001',
          step1CustomerNames: 'John Smith',
          step1AccountNo: 'ACCT-1',
          step1AccountType: { retail: true, retirement: false },
          step1Data: completedStep1Data,
          step2Data: completedStep2Data,
          step3Data: null
        }
      }
    ]);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).get('/api/clients').set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.clients[0].investorProfileResumeStepRoute).toBe(
      '/clients/client_1/investor-profile/step-3'
    );
  });

  it('returns resume route pointing to step 4 when required and incomplete', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findMany.mockResolvedValue([
      {
        id: 'client_1',
        name: 'John Smith',
        email: 'john@example.com',
        phone: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        brokerLinks: [
          {
            role: 'PRIMARY',
            broker: {
              id: 'broker_1',
              name: authUser.name,
              email: authUser.email,
              kind: 'SELF'
            }
          }
        ],
        formSelections: [{ form: { id: 'form_investor', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' } }],
        investorProfileOnboarding: {
          status: 'IN_PROGRESS',
          step1RrName: 'RR One',
          step1RrNo: '1001',
          step1CustomerNames: 'John Smith',
          step1AccountNo: 'ACCT-1',
          step1AccountType: { retail: true, retirement: false },
          step1Data: completedStep1DataRequiresStep4,
          step2Data: completedStep2Data,
          step3Data: buildCompleteStep3EntityFields(),
          step4Data: null
        }
      }
    ]);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).get('/api/clients').set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.clients[0].investorProfileResumeStepRoute).toBe(
      '/clients/client_1/investor-profile/step-4'
    );
  });

  it('returns resume route pointing to step 5 when prior steps are complete', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findMany.mockResolvedValue([
      {
        id: 'client_1',
        name: 'John Smith',
        email: 'john@example.com',
        phone: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        brokerLinks: [
          {
            role: 'PRIMARY',
            broker: {
              id: 'broker_1',
              name: authUser.name,
              email: authUser.email,
              kind: 'SELF'
            }
          }
        ],
        formSelections: [{ form: { id: 'form_investor', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' } }],
        investorProfileOnboarding: {
          status: 'IN_PROGRESS',
          step1RrName: 'RR One',
          step1RrNo: '1001',
          step1CustomerNames: 'John Smith',
          step1AccountNo: 'ACCT-1',
          step1AccountType: { retail: true, retirement: false },
          step1Data: completedStep1Data,
          step2Data: completedStep2Data,
          step3Data: buildCompleteStep3EntityFields(),
          step4Data: null,
          step5Data: null
        }
      }
    ]);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).get('/api/clients').set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.clients[0].investorProfileResumeStepRoute).toBe(
      '/clients/client_1/investor-profile/step-5'
    );
  });

  it('returns resume route pointing to step 6 when step 5 is complete and step 6 is incomplete', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findMany.mockResolvedValue([
      {
        id: 'client_1',
        name: 'John Smith',
        email: 'john@example.com',
        phone: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        brokerLinks: [
          {
            role: 'PRIMARY',
            broker: {
              id: 'broker_1',
              name: authUser.name,
              email: authUser.email,
              kind: 'SELF'
            }
          }
        ],
        formSelections: [{ form: { id: 'form_investor', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' } }],
        investorProfileOnboarding: {
          status: 'IN_PROGRESS',
          step1RrName: 'RR One',
          step1RrNo: '1001',
          step1CustomerNames: 'John Smith',
          step1AccountNo: 'ACCT-1',
          step1AccountType: { retail: true, retirement: false },
          step1Data: completedStep1Data,
          step2Data: completedStep2Data,
          step3Data: buildCompleteStep3EntityFields(),
          step4Data: null,
          step5Data: buildCompleteStep5Fields(),
          step6Data: null
        }
      }
    ]);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).get('/api/clients').set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.clients[0].investorProfileResumeStepRoute).toBe(
      '/clients/client_1/investor-profile/step-6'
    );
  });

  it('returns resume route pointing to step 7 when step 6 is complete and step 7 is incomplete', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findMany.mockResolvedValue([
      {
        id: 'client_1',
        name: 'John Smith',
        email: 'john@example.com',
        phone: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        brokerLinks: [
          {
            role: 'PRIMARY',
            broker: {
              id: 'broker_1',
              name: authUser.name,
              email: authUser.email,
              kind: 'SELF'
            }
          }
        ],
        formSelections: [{ form: { id: 'form_investor', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' } }],
        investorProfileOnboarding: {
          status: 'IN_PROGRESS',
          step1RrName: 'RR One',
          step1RrNo: '1001',
          step1CustomerNames: 'John Smith',
          step1AccountNo: 'ACCT-1',
          step1AccountType: { retail: true, retirement: false },
          step1Data: completedStep1Data,
          step2Data: completedStep2Data,
          step3Data: buildCompleteStep3EntityFields(),
          step4Data: null,
          step5Data: buildCompleteStep5Fields(),
          step6Data: buildCompleteStep6Fields(),
          step7Data: null
        }
      }
    ]);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).get('/api/clients').set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.clients[0].investorProfileResumeStepRoute).toBe(
      '/clients/client_1/investor-profile/step-7'
    );
  });

  it('creates a client with optional BAIV onboarding when selected', async () => {
    const prisma = createMockPrisma();

    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.formCatalog.findMany.mockResolvedValue([
      { id: 'form_investor', code: 'INVESTOR_PROFILE' },
      { id: 'form_baiv', code: 'BAIV_506C' }
    ]);

    const tx = {
      client: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'client_1',
            name: 'John Smith',
            email: 'john@example.com',
            phone: null,
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
              }
            ],
            formSelections: [
              { form: { id: 'form_investor', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' } },
              {
                form: {
                  id: 'form_baiv',
                  code: 'BAIV_506C',
                  title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'
                }
              }
            ],
            investorProfileOnboarding: {
              status: 'NOT_STARTED',
              step1RrName: null
            },
            statementOfFinancialConditionOnboarding: null,
            baiodfOnboarding: null,
            baiv506cOnboarding: {
              status: 'NOT_STARTED',
              step1Data: null,
              step2Data: null
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
        upsert: vi.fn()
      },
      clientBroker: {
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      clientFormSelection: {
        createMany: vi.fn().mockResolvedValue({ count: 2 })
      },
      investorProfileOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'onboarding_1' })
      },
      statementOfFinancialConditionOnboarding: {
        create: vi.fn()
      },
      brokerageAlternativeInvestmentOrderDisclosureOnboarding: {
        create: vi.fn()
      },
      brokerageAccreditedInvestorVerificationOnboarding: {
        create: vi.fn().mockResolvedValue({ id: 'baiv_onboarding_1' })
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
        clientEmail: 'john@example.com',
        additionalBrokers: [],
        selectedFormCodes: ['INVESTOR_PROFILE', 'BAIV_506C']
      });

    expect(response.status).toBe(201);
    expect(response.body.client.hasBaiv506c).toBe(true);
    expect(tx.brokerageAccreditedInvestorVerificationOnboarding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client_1',
          status: 'NOT_STARTED'
        })
      })
    );
  });

  it('returns step 7 nextRouteAfterCompletion for BAIV when BAIV is selected and pending', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);

    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      formSelections: [{ form: { code: 'INVESTOR_PROFILE' } }, { form: { code: 'BAIV_506C' } }],
      statementOfFinancialConditionOnboarding: null,
      baiodfOnboarding: null,
      baiv506cOnboarding: null
    });

    const completeStep3 = buildCompleteStep3EntityFields();
    const completeStep4 = buildCompleteStep4EntityFields();
    const completeStep5 = buildCompleteStep5Fields();
    const completeStep6 = buildCompleteStep6Fields();
    const completeStep7 = buildCompleteStep7Fields(true);

    prisma.investorProfileOnboarding.findUnique.mockResolvedValue({
      status: 'IN_PROGRESS',
      step1RrName: 'RR One',
      step1RrNo: '1001',
      step1CustomerNames: 'John Smith',
      step1AccountNo: 'ACCT-1',
      step1AccountType: { retail: true, retirement: false },
      step1Data: completedStep1DataRequiresStep4,
      step2Data: completedStep2Data,
      step3Data: completeStep3,
      step4Data: completeStep4,
      step5Data: completeStep5,
      step6Data: completeStep6,
      step7CurrentQuestionIndex: 2,
      step7Data: completeStep7
    });

    prisma.investorProfileOnboarding.upsert.mockResolvedValue({
      status: 'COMPLETED',
      step1Data: completedStep1DataRequiresStep4,
      step3Data: completeStep3,
      step4Data: completeStep4,
      step7CurrentQuestionIndex: 2,
      step7Data: completeStep7
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/investor-profile/step-7')
      .set('Cookie', createAuthCookie())
      .send({
        questionId: 'step7.signatures.firm',
        answer: {
          financialProfessional: {
            typedSignature: 'Advisor One',
            printedName: 'Advisor One',
            date: '2026-02-27'
          },
          supervisorPrincipal: {
            typedSignature: null,
            printedName: null,
            date: null
          }
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.onboarding.step.nextRouteAfterCompletion).toBe(
      '/clients/client_1/brokerage-accredited-investor-verification/step-1'
    );
  });

  it('includes BAIV status and resume route fields in clients DTO', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);
    prisma.client.findMany.mockResolvedValue([
      {
        id: 'client_1',
        name: 'John Smith',
        email: 'john@example.com',
        phone: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        brokerLinks: [
          {
            role: 'PRIMARY',
            broker: {
              id: 'broker_1',
              name: authUser.name,
              email: authUser.email,
              kind: 'SELF'
            }
          }
        ],
        formSelections: [
          { form: { id: 'form_investor', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' } },
          {
            form: {
              id: 'form_baiv',
              code: 'BAIV_506C',
              title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'
            }
          }
        ],
        investorProfileOnboarding: null,
        statementOfFinancialConditionOnboarding: null,
        baiodfOnboarding: null,
        baiv506cOnboarding: {
          status: 'IN_PROGRESS',
          step1Data: defaultBaiv506cStep1Fields(),
          step2Data: defaultBaiv506cStep2Fields()
        }
      }
    ]);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).get('/api/clients').set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.clients[0].hasBaiv506c).toBe(true);
    expect(response.body.clients[0].baiv506cOnboardingStatus).toBe('IN_PROGRESS');
    expect(response.body.clients[0].baiv506cResumeStepRoute).toBe(
      '/clients/client_1/brokerage-accredited-investor-verification/step-1'
    );
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
