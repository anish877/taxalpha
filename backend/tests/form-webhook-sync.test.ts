import {
  InvestorProfileOnboardingStatus,
  StatementOfFinancialConditionOnboardingStatus
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  buildFormWebhookPayload,
  INVESTOR_PROFILE_FORM_CODE,
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
        step1Data: null,
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
    expect(fields.step4.holder.kind).toEqual({ person: false, entity: true });
  });
});
