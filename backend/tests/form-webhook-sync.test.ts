import {
  InvestorProfileOnboardingStatus,
  StatementOfFinancialConditionOnboardingStatus
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  buildFormWebhookPayload,
  INVESTOR_PROFILE_FORM_CODE,
  STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE,
  type FormWebhookClientSnapshot
} from '../src/lib/form-webhook-sync.js';

function buildCorporationStep1Data() {
  return {
    accountRegistration: {
      rrName: '',
      rrNo: '',
      customerNames: '',
      accountNo: '',
      retailRetirement: { retail: true, retirement: false }
    },
    typeOfAccount: {
      primaryType: {
        individual: false,
        corporation: true,
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
      corporationDesignation: { cCorp: true, sCorp: false }
    }
  };
}

describe('form-webhook-sync', () => {
  it('includes deterministic autofill values in the investor profile payload', () => {
    const client: FormWebhookClientSnapshot = {
      id: 'client_1',
      name: 'Client One',
      email: 'client@example.com',
      phone: '+1 555 555 5555',
      formSelections: [{ form: { code: 'INVESTOR_PROFILE', title: 'Investor Profile' } }],
      investorProfileOnboarding: {
        status: InvestorProfileOnboardingStatus.IN_PROGRESS,
        step1RrName: null,
        step1RrNo: null,
        step1CustomerNames: null,
        step1AccountNo: null,
        step1AccountType: null,
        step1Data: buildCorporationStep1Data(),
        step2Data: null,
        step3Data: null,
        step4Data: null,
        step5Data: null,
        step6Data: null,
        step7Data: null
      },
      statementOfFinancialConditionOnboarding: {
        status: StatementOfFinancialConditionOnboardingStatus.NOT_STARTED,
        step1Data: {
          liquidNonQualifiedAssets: { cashMoneyMarketsCds: 100_000 },
          liabilities: { otherLiabilities: 10_000 },
          illiquidNonQualifiedAssets: {
            primaryResidence: 50_000,
            investmentRealEstate: 200_000
          },
          liquidQualifiedAssets: { retirementPlans: 20_000 },
          incomeSummary: { salaryCommissions: 30_000 }
        },
        step2Data: null
      },
      baiodfOnboarding: null,
      baiv506cOnboarding: null
    };

    const payload = buildFormWebhookPayload(
      client,
      INVESTOR_PROFILE_FORM_CODE,
      'Advisor One',
      'https://api.example.com'
    );
    const fields = payload.fields as {
      step1: {
        accountRegistration: {
          customerNames: string;
        };
      };
      step3: {
        holder: {
          kind: { person: boolean; entity: boolean };
          contact: {
            email: string;
            phones: { mobile: string | null };
          };
        };
        financialInformation: {
          annualIncomeRange: { fromBracket: number | null; toBracket: number | null };
          netWorthExPrimaryResidenceRange: { fromBracket: number | null; toBracket: number | null };
          liquidNetWorthRange: { fromBracket: number | null; toBracket: number | null };
        };
      };
      step4: {
        holder: {
          kind: { person: boolean; entity: boolean };
        };
      };
    };

    expect(fields.step1.accountRegistration.customerNames).toBe('Client One');
    expect(fields.step3.holder.kind).toEqual({ person: false, entity: true });
    expect(fields.step3.holder.contact.email).toBe('client@example.com');
    expect(fields.step3.holder.contact.phones.mobile).toBe('+1 555 555 5555');
    expect(fields.step3.financialInformation.annualIncomeRange).toEqual({
      fromBracket: 30_000,
      toBracket: null
    });
    expect(fields.step3.financialInformation.netWorthExPrimaryResidenceRange).toEqual({
      fromBracket: 310_000,
      toBracket: null
    });
    expect(fields.step3.financialInformation.liquidNetWorthRange).toEqual({
      fromBracket: 120_000,
      toBracket: null
    });
    expect(fields.step4.holder.kind).toEqual({ person: false, entity: true });
  });

  it('includes SEC-compliant SFC totals in the PDF webhook payload', () => {
    const client: FormWebhookClientSnapshot = {
      id: 'client_1',
      name: 'Client One',
      email: 'client@example.com',
      phone: null,
      formSelections: [{ form: { code: 'SFC', title: 'Statement of Financial Condition' } }],
      investorProfileOnboarding: null,
      statementOfFinancialConditionOnboarding: {
        status: StatementOfFinancialConditionOnboardingStatus.IN_PROGRESS,
        step1Data: {
          liquidNonQualifiedAssets: { cashMoneyMarketsCds: 850_000 },
          liabilities: {
            mortgagePrimaryResidence: 800_000,
            homeEquityLoans: 0,
            otherLiabilities: 20_000
          },
          illiquidNonQualifiedAssets: { primaryResidence: 1_200_000 },
          accreditationAdjustments: {
            primaryResidenceSecuredDebtIncreaseLast60Days: 0
          }
        },
        step2Data: null
      },
      baiodfOnboarding: null,
      baiv506cOnboarding: null
    };

    const payload = buildFormWebhookPayload(
      client,
      STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE,
      'Advisor One',
      'https://api.example.com'
    );
    const fields = payload.fields as {
      computed: {
        financial: {
          totalNetWorth: number;
          netWorthExPrimaryResidence: number;
          accreditedInvestorLiabilities: number;
        };
      };
    };

    expect(fields.computed.financial.totalNetWorth).toBe(1_230_000);
    expect(fields.computed.financial.netWorthExPrimaryResidence).toBe(830_000);
    expect(fields.computed.financial.accreditedInvestorLiabilities).toBe(20_000);
  });
});
