import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

const baseStepFields = {
  accountRegistration: {
    rrName: '',
    rrNo: '',
    customerNames: '',
    accountNo: '',
    retailRetirement: {
      retail: false,
      retirement: false
    }
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
    corporationDesignation: {
      cCorp: false,
      sCorp: false
    },
    llcDesignation: {
      cCorp: false,
      sCorp: false,
      partnership: false
    },
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
    custodial: {
      custodialType: {
        ugma: false,
        utma: false
      },
      gifts: []
    },
    joint: {
      marriedToEachOther: {
        yes: false,
        no: false
      },
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
};

describe('InvestorProfileStep1Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads onboarding question and submits answer patch', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({
            user: {
              id: 'user_1',
              name: 'Advisor One',
              email: 'advisor@example.com'
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (
        url.includes('/api/clients/client_1/investor-profile/step-1') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'NOT_STARTED',
              step: {
                key: 'STEP_1_ACCOUNT_REGISTRATION',
                label: 'STEP 1. ACCOUNT REGISTRATION',
                currentQuestionId: 'rrName',
                currentQuestionIndex: 0,
                visibleQuestionIds: [
                  'rrName',
                  'rrNo',
                  'customerNames',
                  'accountNo',
                  'accountRegistration.retailRetirement',
                  'typeOfAccount.primaryType'
                ],
                fields: baseStepFields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-1') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_1_ACCOUNT_REGISTRATION',
                label: 'STEP 1. ACCOUNT REGISTRATION',
                currentQuestionId: 'rrNo',
                currentQuestionIndex: 1,
                visibleQuestionIds: [
                  'rrName',
                  'rrNo',
                  'customerNames',
                  'accountNo',
                  'accountRegistration.retailRetirement',
                  'typeOfAccount.primaryType'
                ],
                fields: {
                  ...baseStepFields,
                  accountRegistration: {
                    ...baseStepFields.accountRegistration,
                    rrName: 'Anish Suman'
                  }
                }
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-1');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('STEP 1. ACCOUNT REGISTRATION')).toBeInTheDocument();
      expect(screen.getByText("Let's start with the RR Name.")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Enter RR Name'), 'Anish Suman');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/clients/client_1/investor-profile/step-1'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    const postCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/clients/client_1/investor-profile/step-1') && call[1]?.method === 'POST');
    expect(postCall).toBeDefined();

    const requestBody = JSON.parse(String(postCall?.[1]?.body));
    expect(requestBody.questionId).toBe('rrName');
    expect(requestBody.answer).toBe('Anish Suman');

    await waitFor(() => {
      expect(screen.getByText('Perfect. What RR number should we use?')).toBeInTheDocument();
    });
  });
});
