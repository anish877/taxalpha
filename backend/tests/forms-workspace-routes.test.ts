import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';

const config = {
  nodeEnv: 'test' as const,
  frontendUrl: 'http://localhost:5173',
  backendPublicUrl: 'https://api.example.com',
  jwtSecret: 'test_secret_test_secret_test_secret_1234',
  jwtExpiresIn: '7d',
  n8nWebhooks: {
    investorProfileUrl: 'https://example.com/investor-profile',
    investorProfileAdditionalHolderUrl: 'https://example.com/additional-holder',
    statementOfFinancialConditionUrl: 'https://example.com/sfc',
    baiodfUrl: 'https://example.com/baiodf',
    baiv506cUrl: 'https://example.com/baiv-506c',
    timeoutMs: 5000,
    callbackSecret: 'callback-secret'
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
      findUnique: vi.fn()
    },
    client: {
      findFirst: vi.fn()
    },
    clientFormPdf: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn()
    },
    formCatalog: {
      findMany: vi.fn()
    },
    clientFormSelection: {
      createMany: vi.fn()
    },
    investorProfileOnboarding: {
      upsert: vi.fn()
    },
    statementOfFinancialConditionOnboarding: {
      upsert: vi.fn()
    },
    brokerageAlternativeInvestmentOrderDisclosureOnboarding: {
      upsert: vi.fn()
    },
    brokerageAccreditedInvestorVerificationOnboarding: {
      upsert: vi.fn()
    },
    $transaction: vi.fn()
  };
}

describe('forms workspace routes', () => {
  it('returns all active forms with selected/unselected state', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(authUser);

    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [
        { form: { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor Profile' } },
        { form: { id: 'form_2', code: 'SFC', title: 'Statement of Financial Condition' } }
      ],
      brokerLinks: [],
      investorProfileOnboarding: {
        status: 'IN_PROGRESS',
        step1RrName: null,
        step1RrNo: null,
        step1CustomerNames: null,
        step1AccountNo: null,
        step1AccountType: null,
        step1Data: null,
        step2Data: null,
        step3Data: null,
        step4Data: null,
        step5Data: null,
        step6Data: null,
        step7Data: null
      },
      statementOfFinancialConditionOnboarding: {
        status: 'NOT_STARTED',
        step1Data: null,
        step2Data: null
      },
      baiodfOnboarding: null,
      baiv506cOnboarding: null
    });

    prisma.formCatalog.findMany.mockResolvedValue([
      { code: 'INVESTOR_PROFILE', title: 'Investor Profile' },
      { code: 'SFC', title: 'Statement of Financial Condition' },
      {
        code: 'BAIODF',
        title: 'Brokerage Alternative Investment Order and Disclosure Form'
      },
      {
        code: 'BAIV_506C',
        title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'
      }
    ]);

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .get('/api/clients/client_1/forms/workspace')
      .set('Cookie', createAuthCookie());

    expect(response.status).toBe(200);
    expect(response.body.workspace.clientId).toBe('client_1');
    expect(response.body.workspace.forms).toHaveLength(4);

    const sfc = response.body.workspace.forms.find((item: { code: string }) => item.code === 'SFC');
    const baiv = response.body.workspace.forms.find((item: { code: string }) => item.code === 'BAIV_506C');

    expect(sfc.selected).toBe(true);
    expect(sfc.onboardingStatus).toBe('NOT_STARTED');
    expect(sfc.viewRoute).toBe('/clients/client_1/forms/SFC/view/step/1');
    expect(sfc.pdfCount).toBe(0);
    expect(sfc.latestPdfReceivedAt).toBeNull();
    expect(baiv.selected).toBe(false);
    expect(baiv.onboardingStatus).toBeNull();
  });

  it('selects staged forms and returns next onboarding route in standard sequence', async () => {
    const prisma = createMockPrisma();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200
      })
    );

    vi.stubGlobal('fetch', fetchMock);
    prisma.user.findUnique.mockResolvedValue(authUser);

    prisma.client.findFirst
      .mockResolvedValueOnce({
        id: 'client_1',
        name: 'Client One',
        formSelections: [{ form: { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor Profile' } }],
        brokerLinks: [],
        investorProfileOnboarding: {
          status: 'COMPLETED',
          step1RrName: 'RR One',
          step1RrNo: '1001',
          step1CustomerNames: 'Client One',
          step1AccountNo: 'A-1',
          step1AccountType: { retail: true, retirement: false },
          step1Data: {
            accountRegistration: {
              rrName: 'RR One',
              rrNo: '1001',
              customerNames: 'Client One',
              accountNo: 'A-1',
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
          },
          step2Data: {
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
          },
          step3Data: {
            holder: {
              kind: { person: true, entity: false },
              name: 'Client One',
              taxId: { ssn: '111-22-3333', hasEin: { yes: false, no: true }, ein: null },
              contact: {
                email: 'client@example.com',
                dateOfBirth: '1990-01-01',
                specifiedAdult: null,
                phones: { home: null, business: null, mobile: '+1 555 555 5555' }
              },
              legalAddress: {
                line1: '123 Main',
                city: 'Austin',
                stateProvince: 'TX',
                postalCode: '78701',
                country: 'US'
              },
              mailingDifferent: { yes: false, no: true },
              mailingAddress: {
                line1: null,
                city: null,
                stateProvince: null,
                postalCode: null,
                country: null
              },
              citizenship: { primary: ['US'], additional: [] },
              gender: { male: true, female: false },
              maritalStatus: {
                single: true,
                married: false,
                divorced: false,
                domesticPartner: false,
                widower: false
              },
              employment: {
                status: {
                  employed: true,
                  selfEmployed: false,
                  retired: false,
                  unemployed: false,
                  student: false
                },
                occupation: 'Engineer',
                yearsEmployed: 5,
                typeOfBusiness: 'Technology',
                employerName: 'Acme',
                employerAddress: {
                  line1: '456 Work',
                  city: 'Austin',
                  stateProvince: 'TX',
                  postalCode: '78702',
                  country: 'US'
                }
              }
            },
            investmentKnowledge: {
              general: { limited: false, moderate: true, extensive: false, none: false },
              byType: {
                commoditiesFutures: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                equities: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                exchangeTradedFunds: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                fixedAnnuities: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                fixedInsurance: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                mutualFunds: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                options: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                preciousMetals: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                realEstate: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                unitInvestmentTrusts: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                variableAnnuities: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                leveragedInverseEtfs: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                complexProducts: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                alternativeInvestments: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                other: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null,
                  label: null
                }
              }
            },
            financialInformation: {
              annualIncomeRange: { fromBracket: '100k_250k', toBracket: '250k_500k' },
              netWorthExPrimaryResidenceRange: { fromBracket: '250k_500k', toBracket: '500k_1m' },
              liquidNetWorthRange: { fromBracket: '100k_250k', toBracket: '250k_500k' },
              taxBracket: {
                bracket_0_15: false,
                bracket_15_1_32: true,
                bracket_32_1_50: false,
                bracket_50_1_plus: false
              }
            },
            governmentIdentification: {
              photoId1: {
                type: null,
                idNumber: null,
                countryOfIssue: null,
                dateOfIssue: null,
                dateOfExpiration: null
              },
              photoId2: {
                type: null,
                idNumber: null,
                countryOfIssue: null,
                dateOfIssue: null,
                dateOfExpiration: null
              },
              requirementContext: {
                requiresDocumentaryId: false,
                isNonResidentAlien: false
              }
            },
            affiliations: {
              employeeAdvisorFirm: { yes: false, no: true },
              relatedAdvisorFirmEmployee: { yes: false, no: true },
              advisorEmployeeName: null,
              advisorEmployeeRelationship: null,
              employeeBrokerDealer: { yes: false, no: true },
              brokerDealerName: null,
              relatedBrokerDealerEmployee: { yes: false, no: true },
              relatedBrokerDealerName: null,
              relatedBrokerDealerEmployeeName: null,
              relatedBrokerDealerRelationship: null,
              maintainsOtherBrokerageAccounts: { yes: false, no: true },
              otherBrokerageFirms: null,
              yearsOfInvestmentExperience: 3,
              exchangeOrFinraAffiliation: { yes: false, no: true },
              affiliationDetails: null,
              seniorOfficerDirectorTenPercentPublicCompany: { yes: false, no: true },
              publicCompanyNames: null
            }
          },
          step4Data: null,
          step5Data: {
            profile: {
              riskExposure: { low: false, moderate: true, speculation: false, highRisk: false },
              accountObjectives: { income: false, longTermGrowth: true, shortTermGrowth: false }
            },
            investments: {
              fixedValues: {
                marketIncome: {
                  equities: 1,
                  options: 1,
                  fixedIncome: 1,
                  mutualFunds: 1,
                  unitInvestmentTrusts: 1,
                  exchangeTradedFunds: 1
                },
                alternativesInsurance: {
                  realEstate: 1,
                  insurance: 1,
                  variableAnnuities: 1,
                  fixedAnnuities: 1,
                  preciousMetals: 1,
                  commoditiesFutures: 1
                }
              },
              hasOther: { yes: false, no: true },
              otherEntries: { entries: [] }
            },
            horizonAndLiquidity: {
              timeHorizon: { fromYear: 2026, toYear: 2030 },
              liquidityNeeds: { high: false, medium: true, low: false }
            }
          },
          step6Data: {
            trustedContact: {
              decline: { yes: true, no: false },
              contactInfo: {
                name: null,
                email: null,
                phones: { home: null, business: null, mobile: null }
              },
              mailingAddress: {
                line1: null,
                city: null,
                stateProvince: null,
                postalCode: null,
                country: null
              }
            }
          },
          step7Data: {
            certifications: {
              acceptances: {
                attestationsAccepted: true,
                taxpayerCertificationAccepted: true,
                usPersonDefinitionAcknowledged: true
              }
            },
            signatures: {
              accountOwner: {
                typedSignature: 'Client One',
                printedName: 'Client One',
                date: '2026-02-28'
              },
              jointAccountOwner: {
                typedSignature: null,
                printedName: null,
                date: null
              },
              financialProfessional: {
                typedSignature: 'Advisor One',
                printedName: 'Advisor One',
                date: '2026-02-28'
              },
              supervisorPrincipal: {
                typedSignature: null,
                printedName: null,
                date: null
              }
            }
          }
        },
        statementOfFinancialConditionOnboarding: null,
        baiodfOnboarding: null,
        baiv506cOnboarding: null
      })
      .mockResolvedValueOnce({
        id: 'client_1',
        name: 'Client One',
        formSelections: [
          { form: { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor Profile' } },
          { form: { id: 'form_2', code: 'SFC', title: 'Statement of Financial Condition' } }
        ],
        brokerLinks: [],
        investorProfileOnboarding: {
          status: 'COMPLETED',
          step1RrName: 'RR One',
          step1RrNo: '1001',
          step1CustomerNames: 'Client One',
          step1AccountNo: 'A-1',
          step1AccountType: { retail: true, retirement: false },
          step1Data: {
            accountRegistration: {
              rrName: 'RR One',
              rrNo: '1001',
              customerNames: 'Client One',
              accountNo: 'A-1',
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
          },
          step2Data: {
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
          },
          step3Data: {
            holder: {
              kind: { person: true, entity: false },
              name: 'Client One',
              taxId: { ssn: '111-22-3333', hasEin: { yes: false, no: true }, ein: null },
              contact: {
                email: 'client@example.com',
                dateOfBirth: '1990-01-01',
                specifiedAdult: null,
                phones: { home: null, business: null, mobile: '+1 555 555 5555' }
              },
              legalAddress: {
                line1: '123 Main',
                city: 'Austin',
                stateProvince: 'TX',
                postalCode: '78701',
                country: 'US'
              },
              mailingDifferent: { yes: false, no: true },
              mailingAddress: {
                line1: null,
                city: null,
                stateProvince: null,
                postalCode: null,
                country: null
              },
              citizenship: { primary: ['US'], additional: [] },
              gender: { male: true, female: false },
              maritalStatus: {
                single: true,
                married: false,
                divorced: false,
                domesticPartner: false,
                widower: false
              },
              employment: {
                status: {
                  employed: true,
                  selfEmployed: false,
                  retired: false,
                  unemployed: false,
                  student: false
                },
                occupation: 'Engineer',
                yearsEmployed: 5,
                typeOfBusiness: 'Technology',
                employerName: 'Acme',
                employerAddress: {
                  line1: '456 Work',
                  city: 'Austin',
                  stateProvince: 'TX',
                  postalCode: '78702',
                  country: 'US'
                }
              }
            },
            investmentKnowledge: {
              general: { limited: false, moderate: true, extensive: false, none: false },
              byType: {
                commoditiesFutures: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                equities: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                exchangeTradedFunds: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                fixedAnnuities: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                fixedInsurance: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                mutualFunds: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                options: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                preciousMetals: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                realEstate: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                unitInvestmentTrusts: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                variableAnnuities: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                leveragedInverseEtfs: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                complexProducts: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                alternativeInvestments: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null
                },
                other: {
                  knowledge: { limited: false, moderate: false, extensive: false, none: true },
                  sinceYear: null,
                  label: null
                }
              }
            },
            financialInformation: {
              annualIncomeRange: { fromBracket: '100k_250k', toBracket: '250k_500k' },
              netWorthExPrimaryResidenceRange: { fromBracket: '250k_500k', toBracket: '500k_1m' },
              liquidNetWorthRange: { fromBracket: '100k_250k', toBracket: '250k_500k' },
              taxBracket: {
                bracket_0_15: false,
                bracket_15_1_32: true,
                bracket_32_1_50: false,
                bracket_50_1_plus: false
              }
            },
            governmentIdentification: {
              photoId1: {
                type: null,
                idNumber: null,
                countryOfIssue: null,
                dateOfIssue: null,
                dateOfExpiration: null
              },
              photoId2: {
                type: null,
                idNumber: null,
                countryOfIssue: null,
                dateOfIssue: null,
                dateOfExpiration: null
              },
              requirementContext: {
                requiresDocumentaryId: false,
                isNonResidentAlien: false
              }
            },
            affiliations: {
              employeeAdvisorFirm: { yes: false, no: true },
              relatedAdvisorFirmEmployee: { yes: false, no: true },
              advisorEmployeeName: null,
              advisorEmployeeRelationship: null,
              employeeBrokerDealer: { yes: false, no: true },
              brokerDealerName: null,
              relatedBrokerDealerEmployee: { yes: false, no: true },
              relatedBrokerDealerName: null,
              relatedBrokerDealerEmployeeName: null,
              relatedBrokerDealerRelationship: null,
              maintainsOtherBrokerageAccounts: { yes: false, no: true },
              otherBrokerageFirms: null,
              yearsOfInvestmentExperience: 3,
              exchangeOrFinraAffiliation: { yes: false, no: true },
              affiliationDetails: null,
              seniorOfficerDirectorTenPercentPublicCompany: { yes: false, no: true },
              publicCompanyNames: null
            }
          },
          step4Data: null,
          step5Data: {
            profile: {
              riskExposure: { low: false, moderate: true, speculation: false, highRisk: false },
              accountObjectives: { income: false, longTermGrowth: true, shortTermGrowth: false }
            },
            investments: {
              fixedValues: {
                marketIncome: {
                  equities: 1,
                  options: 1,
                  fixedIncome: 1,
                  mutualFunds: 1,
                  unitInvestmentTrusts: 1,
                  exchangeTradedFunds: 1
                },
                alternativesInsurance: {
                  realEstate: 1,
                  insurance: 1,
                  variableAnnuities: 1,
                  fixedAnnuities: 1,
                  preciousMetals: 1,
                  commoditiesFutures: 1
                }
              },
              hasOther: { yes: false, no: true },
              otherEntries: { entries: [] }
            },
            horizonAndLiquidity: {
              timeHorizon: { fromYear: 2026, toYear: 2030 },
              liquidityNeeds: { high: false, medium: true, low: false }
            }
          },
          step6Data: {
            trustedContact: {
              decline: { yes: true, no: false },
              contactInfo: {
                name: null,
                email: null,
                phones: { home: null, business: null, mobile: null }
              },
              mailingAddress: {
                line1: null,
                city: null,
                stateProvince: null,
                postalCode: null,
                country: null
              }
            }
          },
          step7Data: {
            certifications: {
              acceptances: {
                attestationsAccepted: true,
                taxpayerCertificationAccepted: true,
                usPersonDefinitionAcknowledged: true
              }
            },
            signatures: {
              accountOwner: {
                typedSignature: 'Client One',
                printedName: 'Client One',
                date: '2026-02-28'
              },
              jointAccountOwner: {
                typedSignature: null,
                printedName: null,
                date: null
              },
              financialProfessional: {
                typedSignature: 'Advisor One',
                printedName: 'Advisor One',
                date: '2026-02-28'
              },
              supervisorPrincipal: {
                typedSignature: null,
                printedName: null,
                date: null
              }
            }
          }
        },
        statementOfFinancialConditionOnboarding: {
          status: 'NOT_STARTED',
          step1Data: null,
          step2Data: null
        },
        baiodfOnboarding: null,
        baiv506cOnboarding: null
      });

    prisma.formCatalog.findMany
      .mockResolvedValueOnce([{ id: 'form_2', code: 'SFC' }])
      .mockResolvedValueOnce([
        { code: 'INVESTOR_PROFILE', title: 'Investor Profile' },
        { code: 'SFC', title: 'Statement of Financial Condition' },
        {
          code: 'BAIODF',
          title: 'Brokerage Alternative Investment Order and Disclosure Form'
        },
        {
          code: 'BAIV_506C',
          title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'
        }
      ]);

    const tx = {
      clientFormSelection: {
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      investorProfileOnboarding: {
        upsert: vi.fn()
      },
      statementOfFinancialConditionOnboarding: {
        upsert: vi.fn().mockResolvedValue({ id: 'sfc_onboarding_1' })
      },
      brokerageAlternativeInvestmentOrderDisclosureOnboarding: {
        upsert: vi.fn()
      },
      brokerageAccreditedInvestorVerificationOnboarding: {
        upsert: vi.fn()
      }
    };

    prisma.$transaction.mockImplementation(async (callback: (trx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/forms/select')
      .set('Cookie', createAuthCookie())
      .send({ formCodes: ['SFC'] });

    expect(response.status).toBe(200);
    expect(response.body.addedFormCodes).toEqual(['SFC']);
    expect(response.body.nextOnboardingRoute).toBe('/clients/client_1/statement-of-financial-condition/step-1');
    expect(tx.clientFormSelection.createMany).toHaveBeenCalledTimes(1);
    expect(tx.statementOfFinancialConditionOnboarding.upsert).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [webhookUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(requestInit.body));

    expect(webhookUrl).toBe('https://example.com/sfc');
    expect(payload.metadata.formCode).toBe('SFC');
    expect(payload.metadata.workspaceFormCode).toBe('SFC');
    expect(payload.metadata.callbackUrl).toBe('https://api.example.com/api/n8n/clients/client_1/forms/SFC/pdfs');
    expect(payload.fields.step1.liquidNonQualifiedAssets.cashMoneyMarketsCds).toBe(0);
    expect(payload.fields.step2.signatures.accountOwner.printedName).toBe('Client One');
  });

  it('syncs investor profile and additional holder payloads when investor profile is selected', async () => {
    const prisma = createMockPrisma();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200
      })
    );

    vi.stubGlobal('fetch', fetchMock);
    prisma.user.findUnique.mockResolvedValue(authUser);

    prisma.client.findFirst
      .mockResolvedValueOnce({
        id: 'client_1',
        name: 'Client One',
        email: 'client@example.com',
        phone: null,
        formSelections: [],
        brokerLinks: [],
        investorProfileOnboarding: null,
        statementOfFinancialConditionOnboarding: null,
        baiodfOnboarding: null,
        baiv506cOnboarding: null
      })
      .mockResolvedValueOnce({
        id: 'client_1',
        name: 'Client One',
        email: 'client@example.com',
        phone: null,
        formSelections: [{ form: { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor Profile' } }],
        brokerLinks: [],
        investorProfileOnboarding: {
          status: 'NOT_STARTED',
          step1RrName: null,
          step1RrNo: null,
          step1CustomerNames: null,
          step1AccountNo: null,
          step1AccountType: null,
          step1Data: null,
          step2Data: null,
          step3Data: null,
          step4Data: null,
          step5Data: null,
          step6Data: null,
          step7Data: null
        },
        statementOfFinancialConditionOnboarding: null,
        baiodfOnboarding: null,
        baiv506cOnboarding: null
      });

    prisma.formCatalog.findMany
      .mockResolvedValueOnce([{ id: 'form_1', code: 'INVESTOR_PROFILE' }])
      .mockResolvedValueOnce([
        { code: 'INVESTOR_PROFILE', title: 'Investor Profile' },
        { code: 'SFC', title: 'Statement of Financial Condition' },
        {
          code: 'BAIODF',
          title: 'Brokerage Alternative Investment Order and Disclosure Form'
        },
        {
          code: 'BAIV_506C',
          title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'
        }
      ]);

    const tx = {
      clientFormSelection: {
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      investorProfileOnboarding: {
        upsert: vi.fn().mockResolvedValue({ id: 'investor_onboarding_1' })
      },
      statementOfFinancialConditionOnboarding: {
        upsert: vi.fn()
      },
      brokerageAlternativeInvestmentOrderDisclosureOnboarding: {
        upsert: vi.fn()
      },
      brokerageAccreditedInvestorVerificationOnboarding: {
        upsert: vi.fn()
      }
    };

    prisma.$transaction.mockImplementation(async (callback: (trx: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/clients/client_1/forms/select')
      .set('Cookie', createAuthCookie())
      .send({ formCodes: ['INVESTOR_PROFILE'] });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.com/investor-profile');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://example.com/additional-holder');

    const investorPayload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    const additionalHolderPayload = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));

    expect(investorPayload.fields.step1.accountRegistration.rrName).toBe('');
    expect(investorPayload.metadata.callbackUrl).toBe(
      'https://api.example.com/api/n8n/clients/client_1/forms/INVESTOR_PROFILE/pdfs'
    );
    expect(additionalHolderPayload.metadata.sourceFormCode).toBe('INVESTOR_PROFILE');
    expect(additionalHolderPayload.metadata.workspaceFormCode).toBe('INVESTOR_PROFILE');
    expect(additionalHolderPayload.metadata.callbackUrl).toBe(
      'https://api.example.com/api/n8n/clients/client_1/forms/INVESTOR_PROFILE_ADDITIONAL_HOLDER/pdfs'
    );
    expect(additionalHolderPayload.fields.holder.name).toBe('');
  });

  it('stores callback PDFs under the mapped workspace form code', async () => {
    const prisma = createMockPrisma();
    prisma.client.findFirst.mockResolvedValue({
      id: 'client_1',
      name: 'Client One',
      formSelections: [{ form: { code: 'INVESTOR_PROFILE' } }]
    });
    prisma.clientFormPdf.create.mockResolvedValue({ id: 'pdf_1' });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/n8n/clients/client_1/forms/INVESTOR_PROFILE_ADDITIONAL_HOLDER/pdfs')
      .set('Content-Type', 'application/json')
      .set('x-taxalpha-callback-secret', 'callback-secret')
      .send({
        pdfUrl: 'https://files.example.com/additional-holder.pdf',
        sourceRunId: 'run_1',
        generatedAt: '2026-03-16T10:00:00.000Z'
      });

    expect(response.status).toBe(201);
    expect(prisma.clientFormPdf.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client_1',
          formCode: 'INVESTOR_PROFILE_ADDITIONAL_HOLDER',
          workspaceFormCode: 'INVESTOR_PROFILE',
          documentTitle: 'Additional Holder'
        })
      })
    );
  });

  it('rejects callbacks with an invalid secret', async () => {
    const prisma = createMockPrisma();
    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app)
      .post('/api/n8n/clients/client_1/forms/SFC/pdfs')
      .set('x-taxalpha-callback-secret', 'wrong-secret')
      .send({
        pdfUrl: 'https://files.example.com/sfc.pdf'
      });

    expect(response.status).toBe(401);
    expect(prisma.clientFormPdf.create).not.toHaveBeenCalled();
  });
});
