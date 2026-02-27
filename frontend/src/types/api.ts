export interface User {
  id: string;
  name: string;
  email: string;
}

export interface BrokerSummary {
  id: string;
  name: string;
  email: string;
}

export interface FormCatalogItem {
  id: string;
  code: string;
  title: string;
}

export type InvestorProfileOnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface ClientRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  primaryBroker: BrokerSummary | null;
  additionalBrokers: BrokerSummary[];
  selectedForms: FormCatalogItem[];
  hasInvestorProfile: boolean;
  investorProfileOnboardingStatus: InvestorProfileOnboardingStatus;
}

export interface InvestorProfileStepOneResponse {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_1_ACCOUNT_REGISTRATION';
      label: string;
      currentQuestionIndex: number;
      fields: {
        rrName: string;
        rrNo: string;
        customerNames: string;
        accountNo: string;
        accountType: {
          retirement: boolean;
          retail: boolean;
        };
      };
    };
  };
}

export interface InvestorProfileStepOneUpdateRequest {
  rrName?: string;
  rrNo?: string;
  customerNames?: string;
  accountNo?: string;
  accountType?: {
    retirement: boolean;
    retail: boolean;
  };
  currentQuestionIndex?: number;
}

export interface ApiFieldErrors {
  [key: string]: string;
}
