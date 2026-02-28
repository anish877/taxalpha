import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

const baseClient = {
  id: 'client_1',
  name: 'John Smith',
  email: 'john@example.com',
  phone: null,
  createdAt: '2026-02-28T00:00:00.000Z',
  primaryBroker: {
    id: 'user_1',
    name: 'Advisor One',
    email: 'advisor@example.com'
  },
  additionalBrokers: [],
  selectedForms: [
    { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' },
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
  ],
  hasInvestorProfile: true,
  hasStatementOfFinancialCondition: true,
  hasBaiodf: true,
  hasBaiv506c: true
};

describe('DashboardPage continue priority', () => {
  it('prioritizes investor profile resume when investor onboarding is incomplete', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
              { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' },
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

      if (url.includes('/api/clients')) {
        return new Response(
          JSON.stringify({
            clients: [
              {
                ...baseClient,
                investorProfileOnboardingStatus: 'IN_PROGRESS',
                investorProfileResumeStepRoute: '/clients/client_1/investor-profile/step-3',
                statementOfFinancialConditionOnboardingStatus: 'IN_PROGRESS',
                statementOfFinancialConditionResumeStepRoute:
                  '/clients/client_1/statement-of-financial-condition/step-1',
                baiodfOnboardingStatus: 'IN_PROGRESS',
                baiodfResumeStepRoute:
                  '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1',
                baiv506cOnboardingStatus: 'IN_PROGRESS',
                baiv506cResumeStepRoute:
                  '/clients/client_1/brokerage-accredited-investor-verification/step-1'
              }
            ]
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
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/investor-profile/step-3');
    });
  });

  it('resumes SFC when investor profile is completed', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
              { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' },
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

      if (url.includes('/api/clients')) {
        return new Response(
          JSON.stringify({
            clients: [
              {
                ...baseClient,
                investorProfileOnboardingStatus: 'COMPLETED',
                investorProfileResumeStepRoute: '/clients/client_1/investor-profile/step-7',
                statementOfFinancialConditionOnboardingStatus: 'IN_PROGRESS',
                statementOfFinancialConditionResumeStepRoute:
                  '/clients/client_1/statement-of-financial-condition/step-2',
                baiodfOnboardingStatus: 'IN_PROGRESS',
                baiodfResumeStepRoute:
                  '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-2',
                baiv506cOnboardingStatus: 'IN_PROGRESS',
                baiv506cResumeStepRoute:
                  '/clients/client_1/brokerage-accredited-investor-verification/step-1'
              }
            ]
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
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/statement-of-financial-condition/step-2');
    });
  });

  it('resumes BAIODF when investor profile and SFC are completed', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
              { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' },
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

      if (url.includes('/api/clients')) {
        return new Response(
          JSON.stringify({
            clients: [
              {
                ...baseClient,
                investorProfileOnboardingStatus: 'COMPLETED',
                investorProfileResumeStepRoute: '/clients/client_1/investor-profile/step-7',
                statementOfFinancialConditionOnboardingStatus: 'COMPLETED',
                statementOfFinancialConditionResumeStepRoute:
                  '/clients/client_1/statement-of-financial-condition/step-2',
                baiodfOnboardingStatus: 'IN_PROGRESS',
                baiodfResumeStepRoute:
                  '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-2',
                baiv506cOnboardingStatus: 'IN_PROGRESS',
                baiv506cResumeStepRoute:
                  '/clients/client_1/brokerage-accredited-investor-verification/step-1'
              }
            ]
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
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe(
        '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-2'
      );
    });
  });

  it('resumes BAIV when investor profile, SFC, and BAIODF are completed', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
              { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' },
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

      if (url.includes('/api/clients')) {
        return new Response(
          JSON.stringify({
            clients: [
              {
                ...baseClient,
                investorProfileOnboardingStatus: 'COMPLETED',
                investorProfileResumeStepRoute: '/clients/client_1/investor-profile/step-7',
                statementOfFinancialConditionOnboardingStatus: 'COMPLETED',
                statementOfFinancialConditionResumeStepRoute:
                  '/clients/client_1/statement-of-financial-condition/step-2',
                baiodfOnboardingStatus: 'COMPLETED',
                baiodfResumeStepRoute:
                  '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-3',
                baiv506cOnboardingStatus: 'IN_PROGRESS',
                baiv506cResumeStepRoute:
                  '/clients/client_1/brokerage-accredited-investor-verification/step-2'
              }
            ]
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
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/brokerage-accredited-investor-verification/step-2');
    });
  });
});
