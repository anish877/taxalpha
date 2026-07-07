import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('DynamicFormPage', () => {
  it('renders number schema questions as numeric inputs and saves numbers', async () => {
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

      if (url.includes('/api/clients/client_1/forms/UPLOAD/dynamic')) {
        if (init?.method === 'PUT') {
          return new Response(JSON.stringify({ ok: true, status: 'IN_PROGRESS' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response(
          JSON.stringify({
            form: {
              id: 'form_1',
              code: 'UPLOAD',
              title: 'Uploaded Investor Profile',
              status: 'PUBLISHED',
              schema: {
                code: 'UPLOAD',
                title: 'Uploaded Investor Profile',
                sections: [{ number: 1, title: 'Employment' }],
                items: [
                  {
                    id: 'holder.employment.yearsEmployed',
                    section: 1,
                    title: 'Years employed?',
                    type: 'number',
                    required: true,
                    pdfField: 'YearsEmployed'
                  }
                ],
                pdfFieldCount: 1,
                unmappedFields: []
              }
            },
            answers: {
              'holder.employment.yearsEmployed': 0
            },
            responseStatus: 'IN_PROGRESS'
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
    window.history.pushState({}, '', '/clients/client_1/forms/UPLOAD/fill');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    const yearsEmployedInput = await screen.findByRole('spinbutton');
    expect(yearsEmployedInput).toHaveAttribute('type', 'number');
    expect((yearsEmployedInput as HTMLInputElement).value).toBe('0');

    await user.clear(yearsEmployedInput);
    expect((yearsEmployedInput as HTMLInputElement).value).toBe('');
    await user.type(yearsEmployedInput, '7');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes('/api/clients/client_1/forms/UPLOAD/dynamic') && init?.method === 'PUT'
      );
      expect(putCall).toBeTruthy();

      const payload = JSON.parse(String(putCall?.[1]?.body));
      expect(payload.answers['holder.employment.yearsEmployed']).toBe(7);
    });
  });
});
