import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateClientDrawer } from '../src/components/create-client/CreateClientDrawer';
import { ToastProvider } from '../src/context/ToastContext';

describe('CreateClientDrawer', () => {
  const forms = [
    {
      id: 'form_1',
      code: 'INVESTOR_PROFILE',
      title: 'Investor-Profile'
    },
    {
      id: 'form_2',
      code: 'SFC',
      title: 'Statement of Financial Condition'
    },
    {
      id: 'form_3',
      code: 'BAIODF',
      title: 'Brokerage Alternative Investment Order and Disclosure Form'
    },
    {
      id: 'form_4',
      code: 'BAIV_506C',
      title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'
    }
  ];

  it('shows required investor profile and both optional forms on step 3', async () => {
    const user = userEvent.setup();

    render(
      <ToastProvider>
        <CreateClientDrawer
          forms={forms}
          open
          primaryBroker={{ id: 'user_1', name: 'Advisor One', email: 'advisor@example.com' }}
          onClientCreated={vi.fn()}
          onClose={vi.fn()}
        />
      </ToastProvider>
    );

    await user.type(screen.getByPlaceholderText('Enter full name'), 'John Smith');
    await user.type(screen.getByPlaceholderText('name@example.com'), 'john@example.com');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Primary Locked Broker')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Required Form')).toBeInTheDocument();
    expect(screen.getByText('Investor-Profile')).toBeInTheDocument();
    expect(screen.getByText('Statement of Financial Condition')).toBeInTheDocument();
    expect(
      screen.getByText('Brokerage Alternative Investment Order and Disclosure Form')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Brokerage Accredited Investor Verification Form for SEC Rule 506(c)')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Client' })).toBeInTheDocument();
  });

  it('submits selectedFormCodes including SFC when optional form is toggled on', async () => {
    const user = userEvent.setup();
    const onClientCreated = vi.fn();

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          client: {
            id: 'client_1',
            name: 'John Smith',
            email: 'john@example.com',
            phone: null,
            createdAt: '2026-02-28T00:00:00.000Z',
            primaryBroker: {
              id: 'user_1',
              name: 'Advisor One',
              email: 'advisor@example.com'
            },
            additionalBrokers: [],
            selectedForms: [
              { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' },
              { id: 'form_2', code: 'SFC', title: 'Statement of Financial Condition' }
            ],
            hasInvestorProfile: true,
            investorProfileOnboardingStatus: 'NOT_STARTED',
            investorProfileResumeStepRoute: '/clients/client_1/investor-profile/step-1',
            hasStatementOfFinancialCondition: true,
            statementOfFinancialConditionOnboardingStatus: 'NOT_STARTED',
            statementOfFinancialConditionResumeStepRoute:
              '/clients/client_1/statement-of-financial-condition/step-1',
            hasBaiodf: false,
            baiodfOnboardingStatus: 'NOT_STARTED',
            baiodfResumeStepRoute: null,
            hasBaiv506c: false,
            baiv506cOnboardingStatus: 'NOT_STARTED',
            baiv506cResumeStepRoute: null
          }
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <ToastProvider>
        <CreateClientDrawer
          forms={forms}
          open
          primaryBroker={{ id: 'user_1', name: 'Advisor One', email: 'advisor@example.com' }}
          onClientCreated={onClientCreated}
          onClose={vi.fn()}
        />
      </ToastProvider>
    );

    await user.type(screen.getByPlaceholderText('Enter full name'), 'John Smith');
    await user.type(screen.getByPlaceholderText('name@example.com'), 'john@example.com');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByRole('button', { name: /statement of financial condition/i }));
    await user.click(screen.getByRole('button', { name: 'Create Client' }));

    const postCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/clients'));
    expect(postCall).toBeDefined();

    const [, requestInit] = postCall as [RequestInfo | URL, RequestInit | undefined];
    const body = JSON.parse(String(requestInit?.body ?? '{}'));
    expect(body.selectedFormCodes).toEqual(['INVESTOR_PROFILE', 'SFC']);
    expect(onClientCreated).toHaveBeenCalledTimes(1);
  });

  it('submits selectedFormCodes including BAIODF when optional form is toggled on', async () => {
    const user = userEvent.setup();
    const onClientCreated = vi.fn();

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          client: {
            id: 'client_1',
            name: 'John Smith',
            email: 'john@example.com',
            phone: null,
            createdAt: '2026-02-28T00:00:00.000Z',
            primaryBroker: {
              id: 'user_1',
              name: 'Advisor One',
              email: 'advisor@example.com'
            },
            additionalBrokers: [],
            selectedForms: [
              { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' },
              {
                id: 'form_3',
                code: 'BAIODF',
                title: 'Brokerage Alternative Investment Order and Disclosure Form'
              }
            ],
            hasInvestorProfile: true,
            investorProfileOnboardingStatus: 'NOT_STARTED',
            investorProfileResumeStepRoute: '/clients/client_1/investor-profile/step-1',
            hasStatementOfFinancialCondition: false,
            statementOfFinancialConditionOnboardingStatus: 'NOT_STARTED',
            statementOfFinancialConditionResumeStepRoute: null,
            hasBaiodf: true,
            baiodfOnboardingStatus: 'NOT_STARTED',
            baiodfResumeStepRoute: '/clients/client_1/brokerage-alternative-investment-order-disclosure/step-1',
            hasBaiv506c: false,
            baiv506cOnboardingStatus: 'NOT_STARTED',
            baiv506cResumeStepRoute: null
          }
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <ToastProvider>
        <CreateClientDrawer
          forms={forms}
          open
          primaryBroker={{ id: 'user_1', name: 'Advisor One', email: 'advisor@example.com' }}
          onClientCreated={onClientCreated}
          onClose={vi.fn()}
        />
      </ToastProvider>
    );

    await user.type(screen.getByPlaceholderText('Enter full name'), 'John Smith');
    await user.type(screen.getByPlaceholderText('name@example.com'), 'john@example.com');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByRole('button', { name: /brokerage alternative investment order/i }));
    await user.click(screen.getByRole('button', { name: 'Create Client' }));

    const postCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/clients'));
    expect(postCall).toBeDefined();

    const [, requestInit] = postCall as [RequestInfo | URL, RequestInit | undefined];
    const body = JSON.parse(String(requestInit?.body ?? '{}'));
    expect(body.selectedFormCodes).toEqual(['INVESTOR_PROFILE', 'BAIODF']);
    expect(onClientCreated).toHaveBeenCalledTimes(1);
  });

  it('submits selectedFormCodes including BAIV_506C when optional form is toggled on', async () => {
    const user = userEvent.setup();
    const onClientCreated = vi.fn();

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          client: {
            id: 'client_1',
            name: 'John Smith',
            email: 'john@example.com',
            phone: null,
            createdAt: '2026-02-28T00:00:00.000Z',
            primaryBroker: {
              id: 'user_1',
              name: 'Advisor One',
              email: 'advisor@example.com'
            },
            additionalBrokers: [],
            selectedForms: [
              { id: 'form_1', code: 'INVESTOR_PROFILE', title: 'Investor-Profile' },
              {
                id: 'form_4',
                code: 'BAIV_506C',
                title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'
              }
            ],
            hasInvestorProfile: true,
            investorProfileOnboardingStatus: 'NOT_STARTED',
            investorProfileResumeStepRoute: '/clients/client_1/investor-profile/step-1',
            hasStatementOfFinancialCondition: false,
            statementOfFinancialConditionOnboardingStatus: 'NOT_STARTED',
            statementOfFinancialConditionResumeStepRoute: null,
            hasBaiodf: false,
            baiodfOnboardingStatus: 'NOT_STARTED',
            baiodfResumeStepRoute: null,
            hasBaiv506c: true,
            baiv506cOnboardingStatus: 'NOT_STARTED',
            baiv506cResumeStepRoute: '/clients/client_1/brokerage-accredited-investor-verification/step-1'
          }
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <ToastProvider>
        <CreateClientDrawer
          forms={forms}
          open
          primaryBroker={{ id: 'user_1', name: 'Advisor One', email: 'advisor@example.com' }}
          onClientCreated={onClientCreated}
          onClose={vi.fn()}
        />
      </ToastProvider>
    );

    await user.type(screen.getByPlaceholderText('Enter full name'), 'John Smith');
    await user.type(screen.getByPlaceholderText('name@example.com'), 'john@example.com');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.click(screen.getByRole('button', { name: /accredited investor verification/i }));
    await user.click(screen.getByRole('button', { name: 'Create Client' }));

    const postCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/api/clients'));
    expect(postCall).toBeDefined();

    const [, requestInit] = postCall as [RequestInfo | URL, RequestInit | undefined];
    const body = JSON.parse(String(requestInit?.body ?? '{}'));
    expect(body.selectedFormCodes).toEqual(['INVESTOR_PROFILE', 'BAIV_506C']);
    expect(onClientCreated).toHaveBeenCalledTimes(1);
  });
});
