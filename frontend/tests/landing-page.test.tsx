import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('Landing page', () => {
  it('renders minimal hero headline copy', () => {
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
  });
});
