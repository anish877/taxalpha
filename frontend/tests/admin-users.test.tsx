import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';
import { AdminUsersPage } from '../src/pages/AdminUsersPage';

describe('AdminUsersPage broker fields', () => {
  it('creates a broker with a Rep Code distinct from the representative CRD number', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/auth/me')) {
        return new Response(JSON.stringify({
          user: { id: 'admin_1', name: 'Admin', email: 'admin@example.com', isAdmin: true }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/admin/users') && method === 'GET') {
        return new Response(JSON.stringify({ users: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.includes('/api/admin/brokers') && method === 'GET') {
        return new Response(JSON.stringify({ brokers: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.includes('/api/admin/brokers') && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
          broker: {
            id: 'broker_1',
            name: body.representativeName,
            email: body.email,
            firmName: body.firmName,
            representativeCrdNumber: body.representativeCrdNumber,
            repCode: body.repCode
          }
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ message: 'Not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AdminUsersPage />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    await screen.findByRole('heading', { name: 'Create Broker' });
    await user.type(screen.getByLabelText('Registered Representative Name'), 'Matt Chancey');
    await user.type(screen.getByLabelText('E-mail Address'), 'matt@example.com');
    await user.type(screen.getByLabelText('Broker-Dealer Firm Name'), 'Crescent Securities Inc.');
    await user.type(screen.getByLabelText('Registered Representative CRD No.'), '5645874');
    await user.type(screen.getByLabelText('Rep Code'), 'MC-123');
    await user.click(screen.getByRole('button', { name: 'Create Broker' }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, init]) =>
        String(input).includes('/api/admin/brokers') && init?.method === 'POST'
      );
      expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
        representativeCrdNumber: '5645874',
        repCode: 'MC-123'
      });
    });
    expect(await screen.findByText('Rep Code MC-123')).toBeInTheDocument();
  });
});
