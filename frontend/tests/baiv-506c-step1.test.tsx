import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('BAIV 506(c) Step1 Page', () => {
  it('loads prefilled account info, submits, and navigates to step 2', async () => {
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

      if (
        url.includes('/api/clients/client_1/brokerage-accredited-investor-verification/step-1') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_1_CLIENT_ACCOUNT_INFORMATION',
                label: 'STEP 1. CLIENT / ACCOUNT INFORMATION',
                currentQuestionId: 'step1.accountRegistration',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step1.accountRegistration'],
                fields: {
                  accountRegistration: {
                    rrName: 'RR One',
                    rrNo: '1001',
                    customerNames: 'John Smith'
                  }
                }
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (
        url.includes('/api/clients/client_1/brokerage-accredited-investor-verification/step-1') &&
        init?.method === 'POST'
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_1_CLIENT_ACCOUNT_INFORMATION',
                label: 'STEP 1. CLIENT / ACCOUNT INFORMATION',
                currentQuestionId: 'step1.accountRegistration',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step1.accountRegistration'],
                fields: {
                  accountRegistration: {
                    rrName: 'RR One',
                    rrNo: '1001',
                    customerNames: 'John Smith Jr'
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
    window.history.pushState({}, '', '/clients/client_1/brokerage-accredited-investor-verification/step-1');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Let's quickly confirm the account details.")).toBeInTheDocument();
    });

    expect((screen.getByLabelText('RR Name') as HTMLInputElement).value).toBe('RR One');
    expect((screen.getByLabelText('RR No.') as HTMLInputElement).value).toBe('1001');

    await user.clear(screen.getByLabelText('Customer Name(s)'));
    await user.type(screen.getByLabelText('Customer Name(s)'), 'John Smith Jr');
    await user.click(screen.getByRole('button', { name: 'Continue to Step 2' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/brokerage-accredited-investor-verification/step-1') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step1.accountRegistration');
      expect(body.answer.customerNames).toBe('John Smith Jr');
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/brokerage-accredited-investor-verification/step-2');
    });
  });
});
