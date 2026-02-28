import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

describe('StatementOfFinancialConditionStep1Page', () => {
  it('loads account registration, shows totals, and navigates to step 2 on save', async () => {
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

      if (url.endsWith('/api/clients') && (!init || !init.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ clients: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (
        url.includes('/api/clients/client_1/statement-of-financial-condition/step-1') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_1_FINANCIALS',
                label: 'STEP 1. STATEMENT OF FINANCIAL CONDITION',
                currentQuestionId: 'step1.accountRegistration',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step1.accountRegistration'],
                fields: {
                  accountRegistration: {
                    rrName: 'RR One',
                    rrNo: '1001',
                    customerNames: 'John Smith'
                  },
                  liquidNonQualifiedAssets: {
                    cashMoneyMarketsCds: 0,
                    brokerageNonManaged: 0,
                    managedAccounts: 0,
                    mutualFundsDirect: 0,
                    annuitiesLessSurrenderCharges: 0,
                    cashValueLifeInsurance: 0,
                    otherBusinessAssetsCollectibles: 0
                  },
                  liabilities: {
                    mortgagePrimaryResidence: 45,
                    mortgagesSecondaryInvestment: 0,
                    homeEquityLoans: 0,
                    creditCards: 0,
                    otherLiabilities: 0
                  },
                  illiquidNonQualifiedAssets: {
                    primaryResidence: 0,
                    investmentRealEstate: 0,
                    privateBusiness: 0
                  },
                  liquidQualifiedAssets: {
                    cashMoneyMarketsCds: 0,
                    retirementPlans: 0,
                    brokerageNonManaged: 0,
                    managedAccounts: 0,
                    mutualFundsDirect: 0,
                    annuities: 0
                  },
                  incomeSummary: {
                    salaryCommissions: 0,
                    investmentIncome: 0,
                    pension: 0,
                    socialSecurity: 0,
                    netRentalIncome: 0,
                    other: 0
                  },
                  illiquidQualifiedAssets: {
                    purchaseAmountValue: 0
                  }
                },
                totals: {
                  totalLiabilities: 45,
                  totalLiquidAssets: 0,
                  totalLiquidQualifiedAssets: 0,
                  totalAnnualIncome: 0,
                  totalIlliquidAssetsEquity: 0,
                  totalAssetsLessPrimaryResidence: 0,
                  totalNetWorthAssetsLessPrimaryResidenceLiabilities: -45,
                  totalIlliquidSecurities: 0,
                  totalNetWorth: -45,
                  totalPotentialLiquidity: 0,
                  totalIlliquidQualifiedAssets: 0
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

      if (url.includes('/api/clients/client_1/statement-of-financial-condition/step-1') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_1_FINANCIALS',
                label: 'STEP 1. STATEMENT OF FINANCIAL CONDITION',
                currentQuestionId: 'step1.accountRegistration',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step1.accountRegistration'],
                fields: {
                  accountRegistration: {
                    rrName: 'RR Two',
                    rrNo: '2002',
                    customerNames: 'Jane Smith'
                  },
                  liquidNonQualifiedAssets: {
                    cashMoneyMarketsCds: 0,
                    brokerageNonManaged: 0,
                    managedAccounts: 0,
                    mutualFundsDirect: 0,
                    annuitiesLessSurrenderCharges: 0,
                    cashValueLifeInsurance: 0,
                    otherBusinessAssetsCollectibles: 0
                  },
                  liabilities: {
                    mortgagePrimaryResidence: 45,
                    mortgagesSecondaryInvestment: 0,
                    homeEquityLoans: 0,
                    creditCards: 0,
                    otherLiabilities: 0
                  },
                  illiquidNonQualifiedAssets: {
                    primaryResidence: 0,
                    investmentRealEstate: 0,
                    privateBusiness: 0
                  },
                  liquidQualifiedAssets: {
                    cashMoneyMarketsCds: 0,
                    retirementPlans: 0,
                    brokerageNonManaged: 0,
                    managedAccounts: 0,
                    mutualFundsDirect: 0,
                    annuities: 0
                  },
                  incomeSummary: {
                    salaryCommissions: 0,
                    investmentIncome: 0,
                    pension: 0,
                    socialSecurity: 0,
                    netRentalIncome: 0,
                    other: 0
                  },
                  illiquidQualifiedAssets: {
                    purchaseAmountValue: 0
                  }
                },
                totals: {
                  totalLiabilities: 45,
                  totalLiquidAssets: 0,
                  totalLiquidQualifiedAssets: 0,
                  totalAnnualIncome: 0,
                  totalIlliquidAssetsEquity: 0,
                  totalAssetsLessPrimaryResidence: 0,
                  totalNetWorthAssetsLessPrimaryResidenceLiabilities: -45,
                  totalIlliquidSecurities: 0,
                  totalNetWorth: -45,
                  totalPotentialLiquidity: 0,
                  totalIlliquidQualifiedAssets: 0
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

      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/clients/client_1/statement-of-financial-condition/step-1');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Let's confirm account registration details.")).toBeInTheDocument();
      expect(screen.getByText('Total Liabilities: 45')).toBeInTheDocument();
    });

    const rrName = screen.getByLabelText('RR Name');
    const rrNo = screen.getByLabelText('RR No.');
    const customerNames = screen.getByLabelText('Customer Name(s)');

    await user.clear(rrName);
    await user.type(rrName, 'RR Two');
    await user.clear(rrNo);
    await user.type(rrNo, '2002');
    await user.clear(customerNames);
    await user.type(customerNames, 'Jane Smith');

    await user.click(screen.getByRole('button', { name: 'Continue to Step 2' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/statement-of-financial-condition/step-1') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step1.accountRegistration');
      expect(body.answer.rrName).toBe('RR Two');
      expect(body.answer.rrNo).toBe('2002');
      expect(body.answer.customerNames).toBe('Jane Smith');
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/statement-of-financial-condition/step-2');
    });
  });
});

