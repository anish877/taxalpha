import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

const baseStep2Fields = {
  notes: {
    notes: null,
    additionalNotes: null
  },
  acknowledgements: {
    attestDataAccurateComplete: false,
    agreeReportMaterialChanges: false,
    understandMayNeedRecertification: false,
    understandMayNeedSupportingDocumentation: false,
    understandInfoUsedForBestInterestRecommendations: false
  },
  signatures: {
    accountOwner: {
      typedSignature: null,
      printedName: null,
      date: null
    },
    jointAccountOwner: {
      typedSignature: null,
      printedName: null,
      date: null
    },
    financialProfessional: {
      typedSignature: null,
      printedName: null,
      date: null
    },
    registeredPrincipal: {
      typedSignature: null,
      printedName: null,
      date: null
    }
  }
};

describe('StatementOfFinancialConditionStep2Page', () => {
  it('submits acknowledgement boolean-map payload and navigates to nextRouteAfterCompletion', async () => {
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
        url.includes('/api/clients/client_1/statement-of-financial-condition/step-2') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_2_FINALIZATION',
                label: 'STEP 2. STATEMENT OF FINANCIAL CONDITION',
                currentQuestionId: 'step2.acknowledgements',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step2.acknowledgements'],
                requiresJointOwnerSignature: false,
                nextRouteAfterCompletion: null,
                fields: baseStep2Fields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/statement-of-financial-condition/step-2') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'COMPLETED',
              step: {
                key: 'STEP_2_FINALIZATION',
                label: 'STEP 2. STATEMENT OF FINANCIAL CONDITION',
                currentQuestionId: 'step2.acknowledgements',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step2.acknowledgements'],
                requiresJointOwnerSignature: false,
                nextRouteAfterCompletion:
                  '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1',
                fields: {
                  ...baseStep2Fields,
                  acknowledgements: {
                    attestDataAccurateComplete: true,
                    agreeReportMaterialChanges: true,
                    understandMayNeedRecertification: true,
                    understandMayNeedSupportingDocumentation: true,
                    understandInfoUsedForBestInterestRecommendations: true
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
    window.history.pushState({}, '', '/clients/client_1/statement-of-financial-condition/step-2');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Please acknowledge each required statement.')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    for (const checkbox of checkboxes) {
      await user.click(checkbox);
    }

    await user.click(screen.getByRole('button', { name: 'Save and Return' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/statement-of-financial-condition/step-2') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step2.acknowledgements');
      expect(body.answer.attestDataAccurateComplete).toBe(true);
      expect(body.answer.understandInfoUsedForBestInterestRecommendations).toBe(true);
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1'
      );
    });
  });
});
