import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

const baseStep7Fields = {
  certifications: {
    acceptances: {
      attestationsAccepted: false,
      taxpayerCertificationAccepted: false,
      usPersonDefinitionAcknowledged: false
    }
  },
  signatures: {
    accountOwner: {
      typedSignature: null,
      printedName: null,
      date: null
    },
    jointAccountOwner: {
      typedSignature: null,
      printedName: null,
      date: null
    },
    financialProfessional: {
      typedSignature: null,
      printedName: 'Advisor One',
      date: null
    },
    supervisorPrincipal: {
      typedSignature: null,
      printedName: null,
      date: null
    }
  }
};

describe('InvestorProfileStep7Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('submits certification checklist payload', async () => {
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

      if (
        url.includes('/api/clients/client_1/investor-profile/step-7') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_7_SIGNATURES',
                label: 'STEP 7. SIGNATURES',
                currentQuestionId: 'step7.certifications.acceptances',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step7.certifications.acceptances'],
                requiresJointOwnerSignature: false,
                fields: baseStep7Fields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-7') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_7_SIGNATURES',
                label: 'STEP 7. SIGNATURES',
                currentQuestionId: 'step7.certifications.acceptances',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step7.certifications.acceptances'],
                requiresJointOwnerSignature: false,
                fields: baseStep7Fields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.endsWith('/api/clients') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ clients: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-7');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Please confirm required attestations and certifications.')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    for (const checkbox of checkboxes) {
      await user.click(checkbox);
    }

    await user.click(screen.getByRole('button', { name: 'Save and Return' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-7') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step7.certifications.acceptances');
      expect(body.answer.attestationsAccepted).toBe(true);
      expect(body.answer.taxpayerCertificationAccepted).toBe(true);
      expect(body.answer.usPersonDefinitionAcknowledged).toBe(true);
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
  });

  it('navigates to SFC route when nextRouteAfterCompletion is provided', async () => {
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

      if (
        url.includes('/api/clients/client_1/investor-profile/step-7') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_7_SIGNATURES',
                label: 'STEP 7. SIGNATURES',
                currentQuestionId: 'step7.certifications.acceptances',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step7.certifications.acceptances'],
                requiresJointOwnerSignature: false,
                nextRouteAfterCompletion: null,
                fields: baseStep7Fields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-7') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'COMPLETED',
              step: {
                key: 'STEP_7_SIGNATURES',
                label: 'STEP 7. SIGNATURES',
                currentQuestionId: 'step7.certifications.acceptances',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step7.certifications.acceptances'],
                requiresJointOwnerSignature: false,
                nextRouteAfterCompletion: '/clients/client_1/statement-of-financial-condition/step-1',
                fields: baseStep7Fields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.endsWith('/api/clients') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ clients: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-7');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Please confirm required attestations and certifications.')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    for (const checkbox of checkboxes) {
      await user.click(checkbox);
    }

    await user.click(screen.getByRole('button', { name: 'Save and Return' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/statement-of-financial-condition/step-1');
    });
  });

  it('renders conditional joint owner signature fields and submits account owner block', async () => {
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

      if (
        url.includes('/api/clients/client_1/investor-profile/step-7') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_7_SIGNATURES',
                label: 'STEP 7. SIGNATURES',
                currentQuestionId: 'step7.signatures.accountOwners',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step7.signatures.accountOwners'],
                requiresJointOwnerSignature: true,
                fields: baseStep7Fields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-7') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_7_SIGNATURES',
                label: 'STEP 7. SIGNATURES',
                currentQuestionId: 'step7.signatures.accountOwners',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step7.signatures.accountOwners'],
                requiresJointOwnerSignature: true,
                fields: baseStep7Fields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.endsWith('/api/clients') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ clients: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-7');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Capture account owner signatures.')).toBeInTheDocument();
      expect(screen.getByText('Joint Account Owner Signature (Required)')).toBeInTheDocument();
    });

    const typedSignatureInputs = screen.getAllByLabelText('Typed Signature');
    const printedNameInputs = screen.getAllByLabelText('Printed Name');
    const dateInputs = screen.getAllByLabelText('Date');

    await user.type(typedSignatureInputs[0], 'John Smith');
    await user.type(printedNameInputs[0], 'John Smith');
    await user.type(dateInputs[0], '2026-02-27');

    await user.type(typedSignatureInputs[1], 'Jane Smith');
    await user.type(printedNameInputs[1], 'Jane Smith');
    await user.type(dateInputs[1], '2026-02-27');

    await user.click(screen.getByRole('button', { name: 'Save and Return' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-7') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step7.signatures.accountOwners');
      expect(body.answer.accountOwner.typedSignature).toBe('John Smith');
      expect(body.answer.jointAccountOwner.typedSignature).toBe('Jane Smith');
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
  });

  it('prefills and allows editing financial professional printed name', async () => {
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

      if (
        url.includes('/api/clients/client_1/investor-profile/step-7') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_7_SIGNATURES',
                label: 'STEP 7. SIGNATURES',
                currentQuestionId: 'step7.signatures.firm',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step7.signatures.firm'],
                requiresJointOwnerSignature: false,
                fields: baseStep7Fields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-7') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_7_SIGNATURES',
                label: 'STEP 7. SIGNATURES',
                currentQuestionId: 'step7.signatures.firm',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step7.signatures.firm'],
                requiresJointOwnerSignature: false,
                fields: baseStep7Fields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.endsWith('/api/clients') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ clients: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-7');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Capture firm signatures.')).toBeInTheDocument();
    });

    const printedNameInputs = screen.getAllByLabelText('Printed Name');
    const typedSignatureInputs = screen.getAllByLabelText('Typed Signature');
    const dateInputs = screen.getAllByLabelText('Date');

    expect((printedNameInputs[0] as HTMLInputElement).value).toBe('Advisor One');

    await user.clear(printedNameInputs[0]);
    await user.type(printedNameInputs[0], 'Advisor Two');
    await user.type(typedSignatureInputs[0], 'Advisor Two');
    await user.type(dateInputs[0], '2026-02-27');

    await user.click(screen.getByRole('button', { name: 'Save and Return' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-7') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step7.signatures.firm');
      expect(body.answer.financialProfessional.printedName).toBe('Advisor Two');
      expect(body.answer.supervisorPrincipal.typedSignature).toBeNull();
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
  });
});
