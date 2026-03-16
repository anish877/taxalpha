import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('Client forms workspace', () => {
  it('stages a completed form from the workspace', async () => {
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
                    totalSteps: 7,
                    pdfCount: 0,
                    latestPdfReceivedAt: null
                  },
                  {
                    code: 'BAIV_506C',
                    title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)',
                    selected: true,
                    onboardingStatus: 'NOT_STARTED',
                    resumeRoute: '/clients/client_1/brokerage-accredited-investor-verification/step-1',
                    viewRoute: '/clients/client_1/forms/BAIV_506C/view/step/1',
                    editRoute: '/clients/client_1/forms/BAIV_506C/edit/step/1',
                    totalSteps: 2,
                    pdfCount: 0,
                    latestPdfReceivedAt: null
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
                  totalSteps: 7,
                  pdfCount: 0,
                  latestPdfReceivedAt: null
                },
                {
                  code: 'BAIV_506C',
                  title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)',
                  selected: false,
                  onboardingStatus: null,
                  resumeRoute: null,
                  viewRoute: null,
                  editRoute: null,
                  totalSteps: 2,
                  pdfCount: 0,
                  latestPdfReceivedAt: null
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
            addedFormCodes: [],
            nextOnboardingRoute: null,
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
                  totalSteps: 7,
                  pdfCount: 0,
                  latestPdfReceivedAt: null
                },
                {
                  code: 'BAIV_506C',
                  title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)',
                  selected: false,
                  onboardingStatus: null,
                  resumeRoute: null,
                  viewRoute: null,
                  editRoute: null,
                  totalSteps: 2,
                  pdfCount: 0,
                  latestPdfReceivedAt: null
                }
              ]
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

    await user.click(screen.getByRole('button', { name: 'Workspace' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/forms');
      expect(screen.getByText('Client Workspace')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Client One' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox', { name: 'Select Investor Profile' }));
    await user.click(screen.getByRole('button', { name: 'Send to n8n (1)' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes('/api/clients/client_1/forms/select') && init?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      expect(window.location.pathname).toBe('/clients/client_1/forms');
    });
  });

  it('opens the PDFs drawer and shows PDF history with readable timestamps', async () => {
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

      if (url.includes('/api/clients/client_1/forms/workspace')) {
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
                  totalSteps: 7,
                  pdfCount: 2,
                  latestPdfReceivedAt: '2026-03-16T10:05:00.000Z'
                }
              ]
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/clients/client_1/forms/INVESTOR_PROFILE/pdfs')) {
        return new Response(
          JSON.stringify({
            clientId: 'client_1',
            formCode: 'INVESTOR_PROFILE',
            workspaceFormCode: 'INVESTOR_PROFILE',
            pdfs: [
              {
                id: 'pdf_1',
                clientId: 'client_1',
                clientName: 'Client One',
                formCode: 'INVESTOR_PROFILE',
                workspaceFormCode: 'INVESTOR_PROFILE',
                workspaceFormTitle: 'Investor Profile',
                pdfUrl: 'https://files.example.com/investor-profile.pdf',
                documentTitle: 'Investor Profile',
                fileName: 'investor-profile.pdf',
                sourceRunId: 'run_1',
                generatedAt: '2026-03-16T10:00:00.000Z',
                receivedAt: '2026-03-16T10:05:00.000Z'
              },
              {
                id: 'pdf_2',
                clientId: 'client_1',
                clientName: 'Client One',
                formCode: 'INVESTOR_PROFILE_ADDITIONAL_HOLDER',
                workspaceFormCode: 'INVESTOR_PROFILE',
                workspaceFormTitle: 'Investor Profile',
                pdfUrl: 'https://files.example.com/additional-holder.pdf',
                documentTitle: 'Additional Holder',
                fileName: 'additional-holder.pdf',
                sourceRunId: 'run_2',
                generatedAt: '2026-03-16T10:01:00.000Z',
                receivedAt: '2026-03-16T10:06:00.000Z'
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
    window.history.pushState({}, '', '/clients/client_1/forms');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Client One' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'PDFs (2)' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Investor Profile' })).toBeInTheDocument();
    });

    expect(screen.getByText('Additional Holder')).toBeInTheDocument();
    expect(screen.getAllByText(new Date('2026-03-16T10:05:00.000Z').toLocaleString()).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Open PDF' })).toHaveLength(2);
  });

  it('polls for PDF updates, shows a toast, and refreshes workspace counts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    let workspaceRequests = 0;
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

      if (url.includes('/api/clients/pdfs/updates')) {
        return new Response(
          JSON.stringify({
            updates: [
              {
                id: 'pdf_1',
                clientId: 'client_1',
                clientName: 'Client One',
                formCode: 'INVESTOR_PROFILE',
                workspaceFormCode: 'INVESTOR_PROFILE',
                workspaceFormTitle: 'Investor Profile',
                pdfUrl: 'https://files.example.com/investor-profile.pdf',
                documentTitle: 'Investor Profile',
                fileName: 'investor-profile.pdf',
                sourceRunId: 'run_1',
                generatedAt: '2026-03-16T10:00:00.000Z',
                receivedAt: '2026-03-16T10:05:00.000Z'
              }
            ],
            affectedClientIds: ['client_1'],
            serverTime: '2026-03-16T10:06:00.000Z'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/clients/client_1/forms/workspace')) {
        workspaceRequests += 1;

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
                  totalSteps: 7,
                  pdfCount: workspaceRequests > 1 ? 1 : 0,
                  latestPdfReceivedAt: workspaceRequests > 1 ? '2026-03-16T10:05:00.000Z' : null
                }
              ]
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
    window.history.pushState({}, '', '/clients/client_1/forms');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'PDFs (0)' })).toBeInTheDocument();
    });

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('New PDF received for Client One • Investor Profile')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'PDFs (1)' })).toBeInTheDocument();
    });

    vi.useRealTimers();
  }, 10_000);
});
