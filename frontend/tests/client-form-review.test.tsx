import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('Client form review page', () => {
  it('renders section tabs and shows em dash for empty values in view mode', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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

      if (url.includes('/api/clients/client_1/brokerage-accredited-investor-verification/review/step-2')) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_2_ACKNOWLEDGEMENTS_AND_SIGNATURES',
                label: 'STEP 2',
                fields: {
                  acknowledgements: {
                    rule506cGuidelineAcknowledged: false,
                    secRuleReviewedAndUnderstood: false,
                    incomeOrNetWorthVerified: false,
                    documentationReviewed: false
                  },
                  signatures: {
                    accountOwner: {
                      typedSignature: null,
                      printedName: 'Client One',
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
                    }
                  }
                }
              }
            },
            review: {
              stepNumber: 2,
              totalSteps: 2
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
    window.history.pushState({}, '', '/clients/client_1/forms/BAIV_506C/view/step/2');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Acknowledgements' })).toBeInTheDocument();
    });

    expect(screen.getByText('Form Review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acknowledgements' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Signatures' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Signatures' }));
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('supports inline edit and sends full fields payload on save', async () => {
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

      if (url.includes('/api/clients/client_1/brokerage-accredited-investor-verification/review/step-2')) {
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              onboarding: {
                clientId: 'client_1',
                status: 'IN_PROGRESS',
                step: {
                  key: 'STEP_2_ACKNOWLEDGEMENTS_AND_SIGNATURES',
                  label: 'STEP 2',
                  fields: JSON.parse(String(init.body)).fields
                }
              },
              review: {
                stepNumber: 2,
                totalSteps: 2
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_2_ACKNOWLEDGEMENTS_AND_SIGNATURES',
                label: 'STEP 2',
                fields: {
                  acknowledgements: {
                    rule506cGuidelineAcknowledged: false,
                    secRuleReviewedAndUnderstood: false,
                    incomeOrNetWorthVerified: false,
                    documentationReviewed: false
                  },
                  signatures: {
                    accountOwner: {
                      typedSignature: null,
                      printedName: 'Client One',
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
                    }
                  }
                }
              }
            },
            review: {
              stepNumber: 2,
              totalSteps: 2
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
    window.history.pushState({}, '', '/clients/client_1/forms/BAIV_506C/edit/step/2');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Acknowledgements' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Acknowledgements' }));
    const checklistCheckboxes = screen.getAllByRole('checkbox');
    await user.click(checklistCheckboxes[0]);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/clients/client_1/brokerage-accredited-investor-verification/review/step-2') &&
          init?.method === 'POST'
      );
      expect(postCall).toBeTruthy();

      const payload = JSON.parse(String(postCall?.[1]?.body));
      expect(payload.fields.acknowledgements.rule506cGuidelineAcknowledged).toBe(true);
      expect(payload.fields.signatures.accountOwner.printedName).toBe('Client One');
    });
  });
});
