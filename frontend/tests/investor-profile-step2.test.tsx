import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

const baseFields = {
  initialSourceOfFunds: {
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
    other: false,
    otherDetails: null
  }
};

describe('InvestorProfileStep2Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads and saves source of funds answer', async () => {
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

      if (url.includes('/api/clients/client_1/investor-profile/step-2') && (!init || !init.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_2_USA_PATRIOT_ACT_INFORMATION',
                label: 'STEP 2. USA PATRIOT ACT INFORMATION',
                currentQuestionId: 'step2.initialSourceOfFunds',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step2.initialSourceOfFunds'],
                fields: baseFields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-2') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_2_USA_PATRIOT_ACT_INFORMATION',
                label: 'STEP 2. USA PATRIOT ACT INFORMATION',
                currentQuestionId: 'step2.initialSourceOfFunds',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step2.initialSourceOfFunds'],
                fields: {
                  initialSourceOfFunds: {
                    ...baseFields.initialSourceOfFunds,
                    incomeFromEarnings: true
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

    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-2');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('STEP 2. USA PATRIOT ACT INFORMATION')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Income From Earnings' }));
    await user.click(screen.getByRole('button', { name: 'Save and Return' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/clients/client_1/investor-profile/step-2'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    const postCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).includes('/api/clients/client_1/investor-profile/step-2') &&
        call[1]?.method === 'POST'
    );

    expect(postCall).toBeDefined();

    const requestBody = JSON.parse(String(postCall?.[1]?.body));
    expect(requestBody.questionId).toBe('step2.initialSourceOfFunds');
    expect(requestBody.answer.incomeFromEarnings).toBe(true);
  });
});
