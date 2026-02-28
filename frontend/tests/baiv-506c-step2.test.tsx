import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('BAIV 506(c) Step2 Page', () => {
  it('submits 4/4 acknowledgement checkbox payload and returns to dashboard', async () => {
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
        url.includes('/api/clients/client_1/brokerage-accredited-investor-verification/step-2') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_2_ACKNOWLEDGEMENTS_AND_SIGNATURES',
                label: 'STEP 2. ACKNOWLEDGEMENTS AND SIGNATURES',
                currentQuestionId: 'step2.acknowledgements',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step2.acknowledgements'],
                requiresJointOwnerSignature: false,
                nextRouteAfterCompletion: null,
                fields: {
                  acknowledgements: {
                    rule506cGuidelineAcknowledged: false,
                    secRuleReviewedAndUnderstood: false,
                    incomeOrNetWorthVerified: false,
                    documentationReviewed: false
                  },
                  signatures: {
                    accountOwner: { typedSignature: null, printedName: null, date: null },
                    jointAccountOwner: { typedSignature: null, printedName: null, date: null },
                    financialProfessional: { typedSignature: null, printedName: 'Advisor One', date: null }
                  }
                }
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (
        url.includes('/api/clients/client_1/brokerage-accredited-investor-verification/step-2') &&
        init?.method === 'POST'
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'COMPLETED',
              step: {
                key: 'STEP_2_ACKNOWLEDGEMENTS_AND_SIGNATURES',
                label: 'STEP 2. ACKNOWLEDGEMENTS AND SIGNATURES',
                currentQuestionId: 'step2.acknowledgements',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step2.acknowledgements'],
                requiresJointOwnerSignature: false,
                nextRouteAfterCompletion: null,
                fields: {
                  acknowledgements: {
                    rule506cGuidelineAcknowledged: true,
                    secRuleReviewedAndUnderstood: true,
                    incomeOrNetWorthVerified: true,
                    documentationReviewed: true
                  },
                  signatures: {
                    accountOwner: { typedSignature: null, printedName: null, date: null },
                    jointAccountOwner: { typedSignature: null, printedName: null, date: null },
                    financialProfessional: { typedSignature: null, printedName: 'Advisor One', date: null }
                  }
                }
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
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
    window.history.pushState({}, '', '/clients/client_1/brokerage-accredited-investor-verification/step-2');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Please confirm these four required acknowledgements.')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    for (const checkbox of checkboxes) {
      await user.click(checkbox);
    }

    await user.click(screen.getByRole('button', { name: 'Save and Return' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/brokerage-accredited-investor-verification/step-2') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step2.acknowledgements');
      expect(body.answer.rule506cGuidelineAcknowledged).toBe(true);
      expect(body.answer.secRuleReviewedAndUnderstood).toBe(true);
      expect(body.answer.incomeOrNetWorthVerified).toBe(true);
      expect(body.answer.documentationReviewed).toBe(true);
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
  });

  it('renders conditional joint account owner signature fields and submits signature block', async () => {
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
        url.includes('/api/clients/client_1/brokerage-accredited-investor-verification/step-2') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_2_ACKNOWLEDGEMENTS_AND_SIGNATURES',
                label: 'STEP 2. ACKNOWLEDGEMENTS AND SIGNATURES',
                currentQuestionId: 'step2.signatures.accountOwners',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step2.signatures.accountOwners'],
                requiresJointOwnerSignature: true,
                nextRouteAfterCompletion: null,
                fields: {
                  acknowledgements: {
                    rule506cGuidelineAcknowledged: true,
                    secRuleReviewedAndUnderstood: true,
                    incomeOrNetWorthVerified: true,
                    documentationReviewed: true
                  },
                  signatures: {
                    accountOwner: { typedSignature: null, printedName: null, date: null },
                    jointAccountOwner: { typedSignature: null, printedName: null, date: null },
                    financialProfessional: { typedSignature: null, printedName: 'Advisor One', date: null }
                  }
                }
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (
        url.includes('/api/clients/client_1/brokerage-accredited-investor-verification/step-2') &&
        init?.method === 'POST'
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_2_ACKNOWLEDGEMENTS_AND_SIGNATURES',
                label: 'STEP 2. ACKNOWLEDGEMENTS AND SIGNATURES',
                currentQuestionId: 'step2.signatures.accountOwners',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step2.signatures.accountOwners'],
                requiresJointOwnerSignature: true,
                nextRouteAfterCompletion: null,
                fields: {
                  acknowledgements: {
                    rule506cGuidelineAcknowledged: true,
                    secRuleReviewedAndUnderstood: true,
                    incomeOrNetWorthVerified: true,
                    documentationReviewed: true
                  },
                  signatures: {
                    accountOwner: { typedSignature: 'John Smith', printedName: 'John Smith', date: '2026-02-27' },
                    jointAccountOwner: { typedSignature: 'Jane Smith', printedName: 'Jane Smith', date: '2026-02-27' },
                    financialProfessional: { typedSignature: null, printedName: 'Advisor One', date: null }
                  }
                }
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
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
    window.history.pushState({}, '', '/clients/client_1/brokerage-accredited-investor-verification/step-2');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Now capture account owner signatures.')).toBeInTheDocument();
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
          String(call[0]).includes('/api/clients/client_1/brokerage-accredited-investor-verification/step-2') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step2.signatures.accountOwners');
      expect(body.answer.accountOwner.typedSignature).toBe('John Smith');
      expect(body.answer.jointAccountOwner.typedSignature).toBe('Jane Smith');
    });
  });
});
