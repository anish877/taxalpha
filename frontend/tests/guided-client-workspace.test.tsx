import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Guided client workspace', () => {
  it('shows full form names, global forms first, and investments as document pairs', async () => {
    const user = userEvent.setup();
    vi.stubEnv('VITE_GUIDED_CLIENT_WORKSPACE', 'true');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) {
        return new Response(JSON.stringify({
          user: { id: 'user_1', name: 'Advisor One', email: 'advisor@example.com' }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/clients/client_1/documents')) {
        return new Response(JSON.stringify({ documents: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.includes('/api/clients/client_1/pdf-fills')) {
        return new Response(JSON.stringify({ fills: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.includes('/api/clients/client_1/forms/INVESTOR_PROFILE/pdfs')) {
        return new Response(JSON.stringify({ pdfs: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.includes('/api/clients/client_1/forms/workspace')) {
        return new Response(JSON.stringify({
          workspace: {
            clientId: 'client_1',
            clientName: 'Client One',
            setupStatus: 'ACTIVE',
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
                code: 'SFC',
                title: 'SFC',
                selected: true,
                onboardingStatus: 'IN_PROGRESS',
                resumeRoute: '/clients/client_1/statement-of-financial-condition/step-1',
                viewRoute: null,
                editRoute: null,
                totalSteps: 2,
                pdfCount: 0,
                latestPdfReceivedAt: null
              },
              {
                code: 'BAIODF',
                title: 'BAIODF',
                selected: true,
                onboardingStatus: 'COMPLETED',
                resumeRoute: null,
                viewRoute: null,
                editRoute: null,
                totalSteps: 3,
                pdfCount: 0,
                latestPdfReceivedAt: null
              },
              {
                code: 'BAIV_506C',
                title: 'BAIV 506(c)',
                selected: false,
                onboardingStatus: null,
                resumeRoute: null,
                viewRoute: null,
                editRoute: null,
                totalSteps: 2,
                pdfCount: 0,
                latestPdfReceivedAt: null
              }
            ],
            investments: [
              {
                id: 'investment_1',
                name: 'RGP Income Fund II',
                position: 1,
                baiodfStatus: 'COMPLETED',
                baiodfResumeRoute: '/clients/client_1/investments/investment_1/baiodf/step-3',
                baiodfSyncRequestedAt: null,
                baiodfPdf: null,
                baiodfPdfCount: 0,
                agreement: {
                  fillId: 'fill_1',
                  fileName: 'subscription-agreement.pdf',
                  status: 'GENERATED',
                  warningCount: 0,
                  generatedPdfUrl: '/api/clients/client_1/pdf-fills/fill_1/filled.pdf',
                  generatedAt: '2026-07-17T18:00:00.000Z'
                },
                pairReady: false
              }
            ]
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }));

    const [{ App }, { AuthProvider }, { ToastProvider }] = await Promise.all([
      import('../src/App'),
      import('../src/context/AuthContext'),
      import('../src/context/ToastContext')
    ]);

    window.history.pushState({}, '', '/clients/client_1/forms');
    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Client forms' })).toBeInTheDocument());
    expect(screen.getByText('Client checklist')).toBeInTheDocument();

    const clientFormsHeading = screen.getByRole('heading', { name: 'Client forms' });
    const investmentsHeading = screen.getByRole('heading', { name: 'Investments' });
    expect(clientFormsHeading.compareDocumentPosition(investmentsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Statement of Financial Condition')).toBeInTheDocument();
    expect(screen.getByText('Brokerage Alternative Investment Order and Disclosure Form')).toBeInTheDocument();
    expect(screen.getByText('Brokerage Accredited Investor Verification Form for SEC Rule 506(c)')).toBeInTheDocument();
    expect(screen.queryByText('BAIODF')).not.toBeInTheDocument();
    expect(screen.queryByText('BAIV 506(c)')).not.toBeInTheDocument();
    expect(screen.queryByText('SFC')).not.toBeInTheDocument();
    expect(screen.getByText('3 of 4 tasks complete')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 documents ready')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit document' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF history (0)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'PDF history (0)' }));
    expect(screen.getByRole('dialog', { name: 'Investor Profile' })).toBeInTheDocument();
    expect(await screen.findByText('No PDFs received yet.')).toBeInTheDocument();
  });
});
