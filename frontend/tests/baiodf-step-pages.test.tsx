import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

function mockAuthResponse() {
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

describe('BAIODF step pages', () => {
  it('submits step 1 with yes/no checkbox-map payload and moves to step 2', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/auth/me')) {
        return mockAuthResponse();
      }

      if (
        url.includes('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_1_CUSTOMER_ACCOUNT_INFORMATION',
                label: 'STEP 1. CUSTOMER / ACCOUNT INFORMATION',
                currentQuestionId: 'step1.orderBasics',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step1.orderBasics'],
                fields: {
                  accountRegistration: {
                    rrName: 'RR One',
                    rrNo: '1001',
                    customerNames: 'John Smith'
                  },
                  orderBasics: {
                    proposedPrincipalAmount: 0,
                    qualifiedAccount: { yes: false, no: false },
                    qualifiedAccountRmdCertification: false,
                    solicitedTrade: { yes: false, no: false },
                    taxAdvantagePurchase: { yes: false, no: false }
                  }
                }
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (
        url.includes('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1') &&
        init?.method === 'POST'
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_1_CUSTOMER_ACCOUNT_INFORMATION',
                label: 'STEP 1. CUSTOMER / ACCOUNT INFORMATION',
                currentQuestionId: 'step1.orderBasics',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step1.orderBasics'],
                fields: {
                  accountRegistration: {
                    rrName: 'RR One',
                    rrNo: '1001',
                    customerNames: 'John Smith'
                  },
                  orderBasics: {
                    proposedPrincipalAmount: 50000,
                    qualifiedAccount: { yes: true, no: false },
                    qualifiedAccountRmdCertification: true,
                    solicitedTrade: { yes: true, no: false },
                    taxAdvantagePurchase: { yes: true, no: false }
                  }
                }
              }
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
    window.history.pushState(
      {},
      '',
      '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1'
    );

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Now a few quick order basics.')).toBeInTheDocument();
    });

    await user.clear(screen.getByRole('spinbutton', { name: 'Proposed Principal Amount' }));
    await user.type(screen.getByRole('spinbutton', { name: 'Proposed Principal Amount' }), '50000');

    const yesCheckboxes = screen.getAllByRole('checkbox', { name: 'Yes' });
    await user.click(yesCheckboxes[0]);
    await user.click(screen.getByRole('checkbox', { name: /I certify I have other qualified funds/i }));
    await user.click(yesCheckboxes[1]);
    await user.click(yesCheckboxes[2]);

    await user.click(screen.getByRole('button', { name: 'Continue to Step 2' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes(
            '/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1'
          ) && call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step1.orderBasics');
      expect(body.answer.qualifiedAccount).toEqual({ yes: true, no: false });
      expect(body.answer.solicitedTrade).toEqual({ yes: true, no: false });
      expect(body.answer.taxAdvantagePurchase).toEqual({ yes: true, no: false });
      expect(body.answer.qualifiedAccountRmdCertification).toBe(true);
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-2'
      );
    });
  });

  it('renders concentrations in step 2 and submits custodian checkbox-map payload', async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/auth/me')) {
        return mockAuthResponse();
      }

      if (
        url.includes('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-2') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_2_CUSTOMER_ORDER_INFORMATION',
                label: 'STEP 2. CUSTOMER ORDER INFORMATION',
                currentQuestionId: 'step2.custodianAndProduct',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step2.custodianAndProduct'],
                fields: {
                  custodianAndProduct: {
                    custodian: {
                      firstClearing: false,
                      direct: false,
                      mainStar: false,
                      cnb: false,
                      kingdomTrust: false,
                      other: false
                    },
                    custodianOther: null,
                    nameOfProduct: '',
                    sponsorIssuer: '',
                    dateOfPpm: null,
                    datePpmSent: null
                  },
                  existingAltPositions: {
                    existingIlliquidAltPositions: 15000,
                    existingSemiLiquidAltPositions: 20000,
                    existingTaxAdvantageAltPositions: 5000
                  },
                  netWorthAndConcentration: {
                    totalNetWorth: 250000,
                    liquidNetWorth: 100000
                  }
                },
                concentrations: {
                  existingIlliquidAltConcentrationPercent: 6,
                  existingSemiLiquidAltConcentrationPercent: 8,
                  existingTaxAdvantageAltConcentrationPercent: 2,
                  totalConcentrationPercent: 18
                }
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (
        url.includes('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-2') &&
        init?.method === 'POST'
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_2_CUSTOMER_ORDER_INFORMATION',
                label: 'STEP 2. CUSTOMER ORDER INFORMATION',
                currentQuestionId: 'step2.custodianAndProduct',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step2.custodianAndProduct'],
                fields: {
                  custodianAndProduct: {
                    custodian: {
                      firstClearing: false,
                      direct: true,
                      mainStar: false,
                      cnb: false,
                      kingdomTrust: false,
                      other: false
                    },
                    custodianOther: null,
                    nameOfProduct: 'Sample Product',
                    sponsorIssuer: 'Issuer Name',
                    dateOfPpm: '2026-02-27',
                    datePpmSent: '2026-02-27'
                  },
                  existingAltPositions: {
                    existingIlliquidAltPositions: 15000,
                    existingSemiLiquidAltPositions: 20000,
                    existingTaxAdvantageAltPositions: 5000
                  },
                  netWorthAndConcentration: {
                    totalNetWorth: 250000,
                    liquidNetWorth: 100000
                  }
                },
                concentrations: {
                  existingIlliquidAltConcentrationPercent: 6,
                  existingSemiLiquidAltConcentrationPercent: 8,
                  existingTaxAdvantageAltConcentrationPercent: 2,
                  totalConcentrationPercent: 18
                }
              }
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
    window.history.pushState(
      {},
      '',
      '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-2'
    );

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(
        screen.getByText('Who is the custodian, and what product is being ordered?')
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Existing Illiquid Alt Concentration: 6.00%/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Concentration: 18.00%/i)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Direct' }));
    await user.type(screen.getByRole('textbox', { name: 'Name of Product' }), 'Sample Product');
    await user.type(screen.getByRole('textbox', { name: 'Sponsor / Issuer' }), 'Issuer Name');
    await user.type(screen.getByLabelText('Date of PPM'), '2026-02-27');
    await user.type(screen.getByLabelText('Date PPM Sent'), '2026-02-27');
    await user.click(screen.getByRole('button', { name: 'Continue to Step 3' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes(
            '/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-2'
          ) && call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step2.custodianAndProduct');
      expect(body.answer.custodian.direct).toBe(true);
      expect(body.answer.custodian.firstClearing).toBe(false);
      expect(body.answer.custodian.other).toBe(false);
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe(
        '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-3'
      );
    });
  });

  it('shows validation error mapping in step 3 and then completes to dashboard', async () => {
    const user = userEvent.setup();

    let postCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes('/api/auth/me')) {
        return mockAuthResponse();
      }

      if (
        url.includes('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-3') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_3_DISCLOSURES_AND_SIGNATURES',
                label: 'STEP 3. DISCLOSURES + SIGNATURES',
                currentQuestionId: 'step3.acknowledgements',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step3.acknowledgements'],
                requiresJointOwnerSignature: false,
                fields: {
                  acknowledgements: {
                    illiquidLongTerm: false,
                    reviewedProspectusOrPpm: false,
                    understandFeesAndExpenses: false,
                    noPublicMarket: false,
                    limitedRedemptionAndSaleRisk: false,
                    speculativeMayLoseInvestment: false,
                    distributionsMayVaryOrStop: false,
                    meetsSuitabilityStandards: false,
                    featuresRisksDiscussed: false,
                    meetsFinancialGoalsAndAccurate: false
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
        url.includes('/api/clients/client_1/brokerage-alternative-investment-order-disclosure/step-3') &&
        init?.method === 'POST'
      ) {
        postCalls += 1;

        if (postCalls === 1) {
          return new Response(
            JSON.stringify({
              message: 'Please correct the highlighted fields.',
              fieldErrors: {
                'step3.acknowledgements': 'All required disclosures must be acknowledged.'
              }
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'COMPLETED',
              step: {
                key: 'STEP_3_DISCLOSURES_AND_SIGNATURES',
                label: 'STEP 3. DISCLOSURES + SIGNATURES',
                currentQuestionId: 'step3.acknowledgements',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step3.acknowledgements'],
                requiresJointOwnerSignature: false,
                fields: {
                  acknowledgements: {
                    illiquidLongTerm: true,
                    reviewedProspectusOrPpm: true,
                    understandFeesAndExpenses: true,
                    noPublicMarket: true,
                    limitedRedemptionAndSaleRisk: true,
                    speculativeMayLoseInvestment: true,
                    distributionsMayVaryOrStop: true,
                    meetsSuitabilityStandards: true,
                    featuresRisksDiscussed: true,
                    meetsFinancialGoalsAndAccurate: true
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

      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState(
      {},
      '',
      '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-3'
    );

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Please acknowledge each disclosure statement.')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Save and Return' }));

    await waitFor(() => {
      expect(screen.getByText('All required disclosures must be acknowledged.')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    for (const checkbox of checkboxes) {
      await user.click(checkbox);
    }

    await user.click(screen.getByRole('button', { name: 'Save and Return' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/dashboard');
    });
  });
});
