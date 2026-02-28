import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('Client forms workspace', () => {
  it('stages a form and starts onboarding from the workspace', async () => {
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
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/forms')) {
        return new Response(
          JSON.stringify({
            forms: [
              { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor Profile' },
              { id: 'form_2', code: 'SFC', title: 'Statement of Financial Condition' },
              {
                id: 'form_3',
                code: 'BAIODF',
                title: 'Brokerage Alternative Investment Order and Disclosure Form'
              },
              {
                id: 'form_4',
                code: 'BAIV_506C',
                title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/clients')) {
        return new Response(
          JSON.stringify({
            clients: [
              {
                id: 'client_1',
                name: 'Client One',
                email: 'client@example.com',
                phone: null,
                createdAt: '2026-02-28T00:00:00.000Z',
                primaryBroker: {
                  id: 'user_1',
                  name: 'Advisor One',
                  email: 'advisor@example.com'
                },
                additionalBrokers: [],
                selectedForms: [{ id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor Profile' }],
                hasInvestorProfile: true,
                investorProfileOnboardingStatus: 'COMPLETED',
                investorProfileResumeStepRoute: '/clients/client_1/investor-profile/step-7',
                hasStatementOfFinancialCondition: false,
                statementOfFinancialConditionOnboardingStatus: 'NOT_STARTED',
                statementOfFinancialConditionResumeStepRoute: null,
                hasBaiodf: false,
                baiodfOnboardingStatus: 'NOT_STARTED',
                baiodfResumeStepRoute: null,
                hasBaiv506c: false,
                baiv506cOnboardingStatus: 'NOT_STARTED',
                baiv506cResumeStepRoute: null
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/clients/client_1/forms/workspace')) {
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              addedFormCodes: ['BAIV_506C'],
              nextOnboardingRoute: '/clients/client_1/brokerage-accredited-investor-verification/step-1',
              workspace: {
                clientId: 'client_1',
                clientName: 'Client One',
                forms: [
                  {
                    code: 'INVESTOR_PROFILE',
                    title: 'Investor Profile',
                    selected: true,
                    onboardingStatus: 'COMPLETED',
                    resumeRoute: '/clients/client_1/investor-profile/step-7',
                    viewRoute: '/clients/client_1/forms/INVESTOR_PROFILE/view/step/1',
                    editRoute: '/clients/client_1/forms/INVESTOR_PROFILE/edit/step/1',
                    totalSteps: 7
                  },
                  {
                    code: 'BAIV_506C',
                    title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)',
                    selected: true,
                    onboardingStatus: 'NOT_STARTED',
                    resumeRoute: '/clients/client_1/brokerage-accredited-investor-verification/step-1',
                    viewRoute: '/clients/client_1/forms/BAIV_506C/view/step/1',
                    editRoute: '/clients/client_1/forms/BAIV_506C/edit/step/1',
                    totalSteps: 2
                  }
                ]
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            workspace: {
              clientId: 'client_1',
              clientName: 'Client One',
              forms: [
                {
                  code: 'INVESTOR_PROFILE',
                  title: 'Investor Profile',
                  selected: true,
                  onboardingStatus: 'COMPLETED',
                  resumeRoute: '/clients/client_1/investor-profile/step-7',
                  viewRoute: '/clients/client_1/forms/INVESTOR_PROFILE/view/step/1',
                  editRoute: '/clients/client_1/forms/INVESTOR_PROFILE/edit/step/1',
                  totalSteps: 7
                },
                {
                  code: 'BAIV_506C',
                  title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)',
                  selected: false,
                  onboardingStatus: null,
                  resumeRoute: null,
                  viewRoute: null,
                  editRoute: null,
                  totalSteps: 2
                }
              ]
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/clients/client_1/forms/select')) {
        return new Response(
          JSON.stringify({
            addedFormCodes: ['BAIV_506C'],
            nextOnboardingRoute: '/clients/client_1/brokerage-accredited-investor-verification/step-1',
            workspace: {
              clientId: 'client_1',
              clientName: 'Client One',
              forms: []
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/clients/client_1/brokerage-accredited-investor-verification/step-1')) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'NOT_STARTED',
              step: {
                key: 'STEP_1_CLIENT_ACCOUNT_INFORMATION',
                label: 'STEP 1',
                currentQuestionId: 'step1.accountRegistration',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step1.accountRegistration'],
                fields: {
                  accountRegistration: {
                    rrName: '',
                    rrNo: '',
                    customerNames: ''
                  }
                }
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
    window.history.pushState({}, '', '/dashboard');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Client One')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Forms' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/forms');
      expect(screen.getByText('Client Forms Workspace')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Onboard (1 Selected Forms)' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/brokerage-accredited-investor-verification/step-1');
    });
  });
});
