import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';

const baseStep3Fields = {
  holder: {
    kind: { person: true, entity: false },
    name: '',
    taxId: {
      ssn: null,
      hasEin: { yes: false, no: false },
      ein: null
    },
    contact: {
      email: '',
      dateOfBirth: null,
      specifiedAdult: null,
      phones: {
        home: null,
        business: null,
        mobile: null
      }
    },
    legalAddress: {
      line1: null,
      city: null,
      stateProvince: null,
      postalCode: null,
      country: null
    },
    mailingDifferent: { yes: false, no: false },
    mailingAddress: {
      line1: null,
      city: null,
      stateProvince: null,
      postalCode: null,
      country: null
    },
    citizenship: {
      primary: [],
      additional: []
    },
    gender: { male: false, female: false },
    maritalStatus: {
      single: false,
      married: false,
      divorced: false,
      domesticPartner: false,
      widower: false
    },
    employment: {
      status: {
        employed: false,
        selfEmployed: false,
        retired: false,
        unemployed: false,
        student: false
      },
      occupation: null,
      yearsEmployed: null,
      typeOfBusiness: null,
      employerName: null,
      employerAddress: {
        line1: null,
        city: null,
        stateProvince: null,
        postalCode: null,
        country: null
      }
    }
  },
  investmentKnowledge: {
    general: {
      limited: false,
      moderate: false,
      extensive: false,
      none: false
    },
    byType: {
      commoditiesFutures: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      equities: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      exchangeTradedFunds: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      fixedAnnuities: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      fixedInsurance: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      mutualFunds: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      options: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      preciousMetals: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      realEstate: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      unitInvestmentTrusts: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      variableAnnuities: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      leveragedInverseEtfs: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      complexProducts: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      alternativeInvestments: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null },
      other: { knowledge: { limited: false, moderate: false, extensive: false, none: false }, sinceYear: null, label: null }
    }
  },
  financialInformation: {
    annualIncomeRange: { fromBracket: null, toBracket: null },
    netWorthExPrimaryResidenceRange: { fromBracket: null, toBracket: null },
    liquidNetWorthRange: { fromBracket: null, toBracket: null },
    taxBracket: {
      bracket_0_15: false,
      bracket_15_1_32: false,
      bracket_32_1_50: false,
      bracket_50_1_plus: false
    }
  },
  governmentIdentification: {
    photoId1: {
      type: null,
      idNumber: null,
      countryOfIssue: null,
      dateOfIssue: null,
      dateOfExpiration: null
    },
    photoId2: {
      type: null,
      idNumber: null,
      countryOfIssue: null,
      dateOfIssue: null,
      dateOfExpiration: null
    },
    requirementContext: {
      requiresDocumentaryId: null,
      isNonResidentAlien: null
    }
  },
  affiliations: {
    employeeAdvisorFirm: { yes: false, no: false },
    relatedAdvisorFirmEmployee: { yes: false, no: false },
    advisorEmployeeName: null,
    advisorEmployeeRelationship: null,
    employeeBrokerDealer: { yes: false, no: false },
    brokerDealerName: null,
    relatedBrokerDealerEmployee: { yes: false, no: false },
    relatedBrokerDealerName: null,
    relatedBrokerDealerEmployeeName: null,
    relatedBrokerDealerRelationship: null,
    maintainsOtherBrokerageAccounts: { yes: false, no: false },
    otherBrokerageFirms: null,
    yearsOfInvestmentExperience: null,
    exchangeOrFinraAffiliation: { yes: false, no: false },
    affiliationDetails: null,
    seniorOfficerDirectorTenPercentPublicCompany: { yes: false, no: false },
    publicCompanyNames: null
  }
};

describe('InvestorProfileStep3Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads grouped phones question and submits grouped answer patch', async () => {
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
        url.includes('/api/clients/client_1/investor-profile/step-3') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION',
                label: 'STEP 3. PRIMARY ACCOUNT HOLDER INFORMATION',
                currentQuestionId: 'step3.holder.contact.phones',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step3.holder.contact.phones', 'step3.holder.kind'],
                fields: baseStep3Fields,
                requiresStep4: false
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-3') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION',
                label: 'STEP 3. PRIMARY ACCOUNT HOLDER INFORMATION',
                currentQuestionId: 'step3.holder.kind',
                currentQuestionIndex: 1,
                visibleQuestionIds: ['step3.holder.contact.phones', 'step3.holder.kind'],
                requiresStep4: false,
                fields: {
                  ...baseStep3Fields,
                  holder: {
                    ...baseStep3Fields.holder,
                    contact: {
                      ...baseStep3Fields.holder.contact,
                      phones: {
                        home: null,
                        business: null,
                        mobile: '+1 555 555 1212'
                      }
                    }
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

      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-3');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('STEP 3. PRIMARY ACCOUNT HOLDER INFORMATION')).toBeInTheDocument();
      expect(
        screen.getByText('What are the best phone numbers for this holder?')
      ).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('Mobile phone'), '+1 555 555 1212');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/clients/client_1/investor-profile/step-3'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    const postCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).includes('/api/clients/client_1/investor-profile/step-3') &&
        call[1]?.method === 'POST'
    );
    expect(postCall).toBeDefined();

    const requestBody = JSON.parse(String(postCall?.[1]?.body));
    expect(requestBody.questionId).toBe('step3.holder.contact.phones');
    expect(requestBody.answer.mobile).toBe('+1 555 555 1212');

    await waitFor(() => {
      expect(screen.getByText('Is the primary account holder a person or an entity?')).toBeInTheDocument();
    });
  });

  it('submits grouped investment knowledge payload including conditional other fields', async () => {
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
        url.includes('/api/clients/client_1/investor-profile/step-3') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION',
                label: 'STEP 3. PRIMARY ACCOUNT HOLDER INFORMATION',
                currentQuestionId: 'step3.investment.knowledgeExperience',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step3.investment.knowledgeExperience'],
                fields: baseStep3Fields,
                requiresStep4: false
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-3') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION',
                label: 'STEP 3. PRIMARY ACCOUNT HOLDER INFORMATION',
                currentQuestionId: 'step3.investment.knowledgeExperience',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step3.investment.knowledgeExperience'],
                fields: baseStep3Fields,
                requiresStep4: false
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
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-3');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Tell us your overall investment knowledge and by-type experience.')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: 'Moderate' })[0]);

    const otherCard = screen.getByText('Other').closest('div');
    expect(otherCard).not.toBeNull();
    await user.click(within(otherCard as HTMLElement).getByRole('button', { name: 'Moderate' }));
    await user.type(screen.getByPlaceholderText('Describe other investment type'), 'Structured Notes');
    await user.type(screen.getByRole('spinbutton'), '2018');
    const activeSection = screen
      .getByText('Tell us your overall investment knowledge and by-type experience.')
      .closest('section');
    expect(activeSection).not.toBeNull();
    await user.click(within(activeSection as HTMLElement).getByRole('button', { name: 'Continue to Step 5' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/clients/client_1/investor-profile/step-3') &&
          call[1]?.method === 'POST'
      );
      expect(postCall).toBeDefined();

      const body = JSON.parse(String(postCall?.[1]?.body));
      expect(body.questionId).toBe('step3.investment.knowledgeExperience');
      expect(body.answer.general.moderate).toBe(true);
      expect(body.answer.byType.other.knowledge.moderate).toBe(true);
      expect(body.answer.byType.other.sinceYear).toBe(2018);
      expect(body.answer.byType.other.label).toBe('Structured Notes');
    });
  });

  it('navigates to step 4 on final submit when requiresStep4 is true', async () => {
    const user = userEvent.setup();
    const step4Fields = structuredClone(baseStep3Fields);
    (step4Fields as any).holder.employment.status.homemaker = false;

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
        url.includes('/api/clients/client_1/investor-profile/step-3') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION',
                label: 'STEP 3. PRIMARY ACCOUNT HOLDER INFORMATION',
                currentQuestionId: 'step3.holder.kind',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step3.holder.kind'],
                fields: baseStep3Fields,
                requiresStep4: true
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-3') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION',
                label: 'STEP 3. PRIMARY ACCOUNT HOLDER INFORMATION',
                currentQuestionId: 'step3.holder.kind',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step3.holder.kind'],
                fields: baseStep3Fields,
                requiresStep4: true
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
        url.includes('/api/clients/client_1/investor-profile/step-4') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_4_SECONDARY_ACCOUNT_HOLDER_INFORMATION',
                label: 'STEP 4. SECONDARY ACCOUNT HOLDER INFORMATION (Joint Holder #2, Trustee #1, Entity Manager)',
                currentQuestionId: 'step4.holder.kind',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step4.holder.kind'],
                fields: step4Fields
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
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-3');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText('Is the primary account holder a person or an entity?').length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: 'Continue to Step 4' }).length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole('button', { name: 'Continue to Step 4' })[0]);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/investor-profile/step-4');
    });
  });

  it('navigates to step 5 on final submit when requiresStep4 is false', async () => {
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
        url.includes('/api/clients/client_1/investor-profile/step-3') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION',
                label: 'STEP 3. PRIMARY ACCOUNT HOLDER INFORMATION',
                currentQuestionId: 'step3.holder.kind',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step3.holder.kind'],
                fields: baseStep3Fields,
                requiresStep4: false
              }
            }
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      if (url.includes('/api/clients/client_1/investor-profile/step-3') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION',
                label: 'STEP 3. PRIMARY ACCOUNT HOLDER INFORMATION',
                currentQuestionId: 'step3.holder.kind',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step3.holder.kind'],
                fields: baseStep3Fields,
                requiresStep4: false
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
        url.includes('/api/clients/client_1/investor-profile/step-5') &&
        (!init || !init.method || init.method === 'GET')
      ) {
        return new Response(
          JSON.stringify({
            onboarding: {
              clientId: 'client_1',
              status: 'IN_PROGRESS',
              step: {
                key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL',
                label: 'STEP 5. OBJECTIVES AND INVESTMENT DETAIL',
                currentQuestionId: 'step5.profile.riskExposure',
                currentQuestionIndex: 0,
                visibleQuestionIds: ['step5.profile.riskExposure'],
                fields: {
                  profile: {
                    riskExposure: { low: false, moderate: false, speculation: false, highRisk: false },
                    accountObjectives: { income: false, longTermGrowth: false, shortTermGrowth: false }
                  },
                  investments: {
                    fixedValues: {
                      marketIncome: {
                        equities: null,
                        options: null,
                        fixedIncome: null,
                        mutualFunds: null,
                        unitInvestmentTrusts: null,
                        exchangeTradedFunds: null
                      },
                      alternativesInsurance: {
                        realEstate: null,
                        insurance: null,
                        variableAnnuities: null,
                        fixedAnnuities: null,
                        preciousMetals: null,
                        commoditiesFutures: null
                      }
                    },
                    hasOther: { yes: false, no: false },
                    otherEntries: { entries: [] }
                  },
                  horizonAndLiquidity: {
                    timeHorizon: { fromYear: null, toYear: null },
                    liquidityNeeds: { high: false, medium: false, low: false }
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

      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/clients/client_1/investor-profile/step-3');

    render(
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Continue to Step 5' }).length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole('button', { name: 'Continue to Step 5' })[0]);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/clients/client_1/investor-profile/step-5');
    });
  });
});
