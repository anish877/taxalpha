import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('Landing page', () => {
  it('renders minimal hero headline copy', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ message: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Investor onboarding workspace'
      })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/me'),
        expect.objectContaining({ credentials: 'include' })
      );
    });
  });
});
