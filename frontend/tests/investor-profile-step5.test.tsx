import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

const fields = {
  profile: {
    riskExposure: { low: false, moderate: false, speculation: false, highRisk: false },
    accountObjectives: { income: false, longTermGrowth: false, shortTermGrowth: false }
  },
  investments: {
    fixedValues: {
      marketIncome: {
        equities: 0,
        options: 0,
        fixedIncome: 0,
        mutualFunds: 0,
        unitInvestmentTrusts: 0,
        exchangeTradedFunds: 0
      },
      alternativesInsurance: {
        realEstate: 0,
        insurance: 0,
        variableAnnuities: 0,
        fixedAnnuities: 0,
        preciousMetals: 0,
        commoditiesFutures: 0
      }
    },
    hasOther: { yes: false, no: true },
    otherEntries: { entries: [] }
  },
  horizonAndLiquidity: {
    timeHorizon: { fromYear: null, toYear: null },
    liquidityNeeds: { high: false, medium: false, low: false }
  }
};

describe('InvestorProfileStep5Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('skips duplicate holding value and other-investment questions', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/auth/me')) {
        return new Response(
          JSON.stringify({ user: { id: 'user_1', name: 'Advisor One', email: 'advisor@example.com' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/clients') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ clients: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-5')) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL',
                label: 'STEP 5. OBJECTIVES AND INVESTMENT DETAIL',
                currentQuestionId: 'step5.profile.riskExposure',
                currentQuestionIndex: 0,
                visibleQuestionIds: [
                  'step5.profile.riskExposure',
                  'step5.profile.accountObjectives',
                  'step5.horizonAndLiquidity'
                ],
                fields,
                requiresStep4: false
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
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
      expect(screen.getByText('How would you describe risk exposure for this account?')).toBeInTheDocument();
    });

    expect(screen.queryByText('Enter current values for market and income holdings.')).not.toBeInTheDocument();
    expect(screen.queryByText('Enter current values for alternatives and insurance holdings.')).not.toBeInTheDocument();
    expect(screen.queryByText('Do you want to add other investment categories?')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Select One Moderate' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-5') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(String(postCall?.[1]?.body)).questionId).toBe('step5.profile.riskExposure');
    });
  });
});
