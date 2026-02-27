import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

const baseStep6Fields = {
  trustedContact: {
    decline: {
      yes: false,
      no: false
    },
    contactInfo: {
      name: null,
      email: null,
      phones: {
        home: null,
        business: null,
        mobile: null
      }
    },
    mailingAddress: {
      line1: null,
      city: null,
      stateProvince: null,
      postalCode: null,
      country: null
    }
  }
};

function buildMinimalStep7Response() {
  return {
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
        fields: {
          certifications: {
            acceptances: {
              attestationsAccepted: false,
              taxpayerCertificationAccepted: false,
              usPersonDefinitionAcknowledged: false
            }
          },
          signatures: {
            accountOwner: { typedSignature: null, printedName: null, date: null },
            jointAccountOwner: { typedSignature: null, printedName: null, date: null },
            financialProfessional: { typedSignature: null, printedName: null, date: null },
            supervisorPrincipal: { typedSignature: null, printedName: null, date: null }
          }
        }
      }
    }
  };
}

describe('InvestorProfileStep6Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('submits decline path and navigates to step 7', async () => {
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
        url.includes('/api/clients/client_1/investor-profile/step-6') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_6_TRUSTED_CONTACT',
                label: 'STEP 6. TRUSTED CONTACT',
                currentQuestionId: 'step6.trustedContact.decline',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step6.trustedContact.decline'],
                fields: baseStep6Fields
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-6') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_6_TRUSTED_CONTACT',
                label: 'STEP 6. TRUSTED CONTACT',
                currentQuestionId: 'step6.trustedContact.decline',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step6.trustedContact.decline'],
                fields: {
                  ...baseStep6Fields,
                  trustedContact: {
                    ...baseStep6Fields.trustedContact,
                    decline: { yes: true, no: false }
                  }
                }
              }
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
        return new Response(JSON.stringify(buildMinimalStep7Response()), {
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
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-6');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Would you like to provide a trusted contact?')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /yes, i\/we decline to provide/i }));
    await user.click(screen.getByRole('button', { name: 'Continue to Step 7' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-6') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step6.trustedContact.decline');
      expect(body.answer.yes).toBe(true);
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/investor-profile/step-7');
    });
  });

  it('renders provide path grouped forms and submits contact and address payloads', async () => {
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
        url.includes('/api/clients/client_1/investor-profile/step-6') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_6_TRUSTED_CONTACT',
                label: 'STEP 6. TRUSTED CONTACT',
                currentQuestionId: 'step6.trustedContact.contactInfo',
                currentQuestionIndex: 1,
                visibleQuestionIds: [
                  'step6.trustedContact.decline',
                  'step6.trustedContact.contactInfo',
                  'step6.trustedContact.mailingAddress'
                ],
                fields: {
                  ...baseStep6Fields,
                  trustedContact: {
                    ...baseStep6Fields.trustedContact,
                    decline: { yes: false, no: true }
                  }
                }
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-6') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));

        if (body.questionId === 'step6.trustedContact.contactInfo') {
          return new Response(
            JSON.stringify({
              onboarding: {
                clientId: 'client_1',
                status: 'IN_PROGRESS',
                step: {
                  key: 'STEP_6_TRUSTED_CONTACT',
                  label: 'STEP 6. TRUSTED CONTACT',
                  currentQuestionId: 'step6.trustedContact.mailingAddress',
                  currentQuestionIndex: 2,
                  visibleQuestionIds: [
                    'step6.trustedContact.decline',
                    'step6.trustedContact.contactInfo',
                    'step6.trustedContact.mailingAddress'
                  ],
                  fields: {
                    ...baseStep6Fields,
                    trustedContact: {
                      ...baseStep6Fields.trustedContact,
                      decline: { yes: false, no: true },
                      contactInfo: body.answer
                    }
                  }
                }
              }
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }

        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_6_TRUSTED_CONTACT',
                label: 'STEP 6. TRUSTED CONTACT',
                currentQuestionId: 'step6.trustedContact.mailingAddress',
                currentQuestionIndex: 2,
                visibleQuestionIds: [
                  'step6.trustedContact.decline',
                  'step6.trustedContact.contactInfo',
                  'step6.trustedContact.mailingAddress'
                ],
                fields: {
                  ...baseStep6Fields,
                  trustedContact: {
                    ...baseStep6Fields.trustedContact,
                    decline: { yes: false, no: true },
                    mailingAddress: body.answer
                  }
                }
              }
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
        return new Response(JSON.stringify(buildMinimalStep7Response()), {
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
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-6');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Who should we contact if we suspect financial exploitation?')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Name'), 'Jane Contact');
    await user.type(screen.getByLabelText('Email'), 'jane.contact@example.com');
    await user.type(screen.getByLabelText('Mobile Phone'), '+1 555 555 1212');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-6') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step6.trustedContact.contactInfo');
      expect(body.answer.name).toBe('Jane Contact');
      expect(body.answer.phones.mobile).toBe('+1 555 555 1212');
    });

    await waitFor(() => {
      expect(screen.getByText('What is the trusted contact mailing address?')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Mailing Address'), '12 Main St');
    await user.type(screen.getByLabelText('City'), 'Austin');
    await user.type(screen.getByLabelText('State/Province'), 'TX');
    await user.type(screen.getByLabelText('ZIP/Postal Code'), '78701');
    await user.type(screen.getByLabelText('Country (2-letter code)'), 'US');
    await user.click(screen.getByRole('button', { name: 'Continue to Step 7' }));

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-6') &&
          call[1]?.method === 'POST'
      );
      expect(postCalls.length).toBeGreaterThanOrEqual(2);
      const addressCallBody = JSON.parse(String(postCalls[1]?.[1]?.body));
      expect(addressCallBody.questionId).toBe('step6.trustedContact.mailingAddress');
      expect(addressCallBody.answer.line1).toBe('12 Main St');
      expect(addressCallBody.answer.country).toBe('US');
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/investor-profile/step-7');
    });
  });
});
