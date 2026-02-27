import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('InvestorProfileStep1Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads rr name and submits step 1 update', async () => {
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

      if (url.includes('/api/clients/client_1/investor-profile/step-1') && (!init || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'NOT_STARTED',
              step: {
                key: 'STEP_1_ACCOUNT_REGISTRATION',
                label: 'STEP 1. ACCOUNT REGISTRATION',
                rrName: ''
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
                rrName: 'Anish Suman'
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
    });

    await user.type(screen.getByPlaceholderText('Enter RR Name'), 'Anish Suman');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/clients/client_1/investor-profile/step-1'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
