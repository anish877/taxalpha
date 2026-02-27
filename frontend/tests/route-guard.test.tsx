import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('protected routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects unauthenticated users from /dashboard to /signin', async () => {
    window.history.pushState({}, '', '/dashboard');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/auth/me')) {
          return new Response(JSON.stringify({ message: 'Authentication required.' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json'
            }
          });
        }

        return new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      })
    );

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
    });
  });
});
