import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

const baseStep5Fields = {
  profile: {
    riskExposure: {
      low: false,
      moderate: false,
      speculation: false,
      highRisk: false
    },
    accountObjectives: {
      income: false,
      longTermGrowth: false,
      shortTermGrowth: false
    }
  },
  investments: {
    fixedValues: {
      marketIncome: {
        equities: null,
        options: null,
        fixedIncome: null,
        mutualFunds: null,
        unitInvestmentTrusts: null,
        exchangeTradedFunds: null
      },
      alternativesInsurance: {
        realEstate: null,
        insurance: null,
        variableAnnuities: null,
        fixedAnnuities: null,
        preciousMetals: null,
        commoditiesFutures: null
      }
    },
    hasOther: {
      yes: false,
      no: false
    },
    otherEntries: {
      entries: []
    }
  },
  horizonAndLiquidity: {
    timeHorizon: {
      fromYear: null,
      toYear: null
    },
    liquidityNeeds: {
      high: false,
      medium: false,
      low: false
    }
  }
};

describe('InvestorProfileStep5Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads grouped fixed values block and submits numeric payload including 0', async () => {
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

      if (url.endsWith('/api/clients') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ clients: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (
        url.includes('/api/clients/client_1/investor-profile/step-5') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL',
                label: 'STEP 5. OBJECTIVES AND INVESTMENT DETAIL',
                currentQuestionId: 'step5.investments.fixedValues.marketIncome',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step5.investments.fixedValues.marketIncome'],
                fields: baseStep5Fields,
                requiresStep4: false
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-5') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL',
                label: 'STEP 5. OBJECTIVES AND INVESTMENT DETAIL',
                currentQuestionId: 'step5.investments.fixedValues.marketIncome',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step5.investments.fixedValues.marketIncome'],
                fields: baseStep5Fields,
                requiresStep4: false
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
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-5');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Enter current values for market and income holdings.')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Equities'), '0');
    await user.type(screen.getByLabelText('Options'), '10');
    await user.type(screen.getByLabelText('Fixed Income'), '20');
    await user.type(screen.getByLabelText('Mutual Funds'), '30');
    await user.type(screen.getByLabelText('Unit Investment Trusts'), '40');
    await user.type(screen.getByLabelText('Exchange-Traded Funds'), '50');

    await user.click(screen.getByRole('button', { name: 'Continue to Step 6' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-5') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();

      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step5.investments.fixedValues.marketIncome');
      expect(body.answer.equities).toBe(0);
      expect(body.answer.exchangeTradedFunds).toBe(50);
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/investor-profile/step-6');
    });
  });

  it('renders conditional other investments question and submits entries', async () => {
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

      if (url.endsWith('/api/clients') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ clients: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (
        url.includes('/api/clients/client_1/investor-profile/step-5') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL',
                label: 'STEP 5. OBJECTIVES AND INVESTMENT DETAIL',
                currentQuestionId: 'step5.investments.hasOther',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step5.investments.hasOther'],
                fields: baseStep5Fields,
                requiresStep4: false
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-5') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));

        if (body.questionId === 'step5.investments.hasOther') {
          return new Response(
            JSON.stringify({
              onboarding: {
                clientId: 'client_1',
                status: 'IN_PROGRESS',
                step: {
                  key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL',
                  label: 'STEP 5. OBJECTIVES AND INVESTMENT DETAIL',
                  currentQuestionId: 'step5.investments.otherEntries',
                  currentQuestionIndex: 1,
                  visibleQuestionIds: ['step5.investments.hasOther', 'step5.investments.otherEntries'],
                  fields: {
                    ...baseStep5Fields,
                    investments: {
                      ...baseStep5Fields.investments,
                      hasOther: { yes: true, no: false }
                    }
                  },
                  requiresStep4: false
                }
              }
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }

        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL',
                label: 'STEP 5. OBJECTIVES AND INVESTMENT DETAIL',
                currentQuestionId: 'step5.investments.otherEntries',
                currentQuestionIndex: 1,
                visibleQuestionIds: ['step5.investments.hasOther', 'step5.investments.otherEntries'],
                fields: {
                  ...baseStep5Fields,
                  investments: {
                    ...baseStep5Fields.investments,
                    hasOther: { yes: true, no: false },
                    otherEntries: {
                      entries: [{ label: 'Crypto Notes', value: 500 }]
                    }
                  }
                },
                requiresStep4: false
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
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-5');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Do you want to add other investment categories?')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /yes/i }));
    await user.click(screen.getByRole('button', { name: 'Continue to Step 6' }));

    await waitFor(() => {
      expect(screen.getByText('Add other investment categories and values.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Add Other Investment' }));
    await user.type(screen.getByPlaceholderText('Other investment category'), 'Crypto Notes');
    await user.type(screen.getByRole('spinbutton'), '500');
    await user.click(screen.getByRole('button', { name: 'Continue to Step 6' }));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-5') &&
          call[1]?.method === 'POST'
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(2);

      const secondBody = JSON.parse(String(postCalls[1]?.[1]?.body));
      expect(secondBody.questionId).toBe('step5.investments.otherEntries');
      expect(secondBody.answer.entries[0].label).toBe('Crypto Notes');
      expect(secondBody.answer.entries[0].value).toBe(500);
    });
  });

  it('submits horizon and liquidity grouped payload', async () => {
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
        url.includes('/api/clients/client_1/investor-profile/step-5') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL',
                label: 'STEP 5. OBJECTIVES AND INVESTMENT DETAIL',
                currentQuestionId: 'step5.horizonAndLiquidity',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step5.horizonAndLiquidity'],
                fields: baseStep5Fields,
                requiresStep4: false
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-5') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL',
                label: 'STEP 5. OBJECTIVES AND INVESTMENT DETAIL',
                currentQuestionId: 'step5.horizonAndLiquidity',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step5.horizonAndLiquidity'],
                fields: baseStep5Fields,
                requiresStep4: false
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
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-5');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('What is the investment time horizon and liquidity need?')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('From Year'), '2026');
    await user.type(screen.getByLabelText('To Year'), '2034');
    await user.click(screen.getByRole('button', { name: /medium/i }));
    await user.click(screen.getByRole('button', { name: 'Continue to Step 6' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-5') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();

      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step5.horizonAndLiquidity');
      expect(body.answer.timeHorizon.fromYear).toBe(2026);
      expect(body.answer.timeHorizon.toYear).toBe(2034);
      expect(body.answer.liquidityNeeds.medium).toBe(true);
    });
  });
});
