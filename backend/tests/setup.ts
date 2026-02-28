import { vi } from 'vitest';

vi.mock('@prisma/client', () => {
  class PrismaClient {}

  class PrismaClientKnownRequestError extends Error {
    public code: string;

    constructor(message: string, options: { code: string }) {
      super(message);
      this.name = 'PrismaClientKnownRequestError';
      this.code = options.code;
    }
  }

  return {
    PrismaClient,
    Prisma: {
      PrismaClientKnownRequestError
    },
    ClientBrokerRole: {
      PRIMARY: 'PRIMARY',
      ADDITIONAL: 'ADDITIONAL'
    },
    InvestorProfileOnboardingStatus: {
      NOT_STARTED: 'NOT_STARTED',
      IN_PROGRESS: 'IN_PROGRESS',
      COMPLETED: 'COMPLETED'
    },
    StatementOfFinancialConditionOnboardingStatus: {
      NOT_STARTED: 'NOT_STARTED',
      IN_PROGRESS: 'IN_PROGRESS',
      COMPLETED: 'COMPLETED'
    },
    BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus: {
      NOT_STARTED: 'NOT_STARTED',
      IN_PROGRESS: 'IN_PROGRESS',
      COMPLETED: 'COMPLETED'
    },
    BrokerageAccreditedInvestorVerificationOnboardingStatus: {
      NOT_STARTED: 'NOT_STARTED',
      IN_PROGRESS: 'IN_PROGRESS',
      COMPLETED: 'COMPLETED'
    }
  };
});
