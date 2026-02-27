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
      currentQuestionId: InvestorProfileStepOneQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: InvestorProfileStepOneQuestionId[];
      fields: InvestorProfileStepOneFields;
    };
  };
}

export type InvestorProfileStepOneQuestionId =
  | 'rrName'
  | 'rrNo'
  | 'customerNames'
  | 'accountNo'
  | 'accountRegistration.retailRetirement'
  | 'typeOfAccount.primaryType'
  | 'typeOfAccount.corporationDesignation'
  | 'typeOfAccount.llcDesignation'
  | 'typeOfAccount.trust.establishmentDate'
  | 'typeOfAccount.trust.trustType'
  | 'typeOfAccount.custodial.custodialType'
  | 'typeOfAccount.custodial.gifts'
  | 'typeOfAccount.joint.marriedToEachOther'
  | 'typeOfAccount.joint.tenancyState'
  | 'typeOfAccount.joint.numberOfTenants'
  | 'typeOfAccount.joint.tenancyClause'
  | 'typeOfAccount.transferOnDeath.individualAgreementDate'
  | 'typeOfAccount.transferOnDeath.jointAgreementDate'
  | 'typeOfAccount.otherDescription';

export interface InvestorProfileStepOneFields {
  accountRegistration: {
    rrName: string;
    rrNo: string;
    customerNames: string;
    accountNo: string;
    retailRetirement: {
      retail: boolean;
      retirement: boolean;
    };
  };
  typeOfAccount: {
    primaryType: {
      individual: boolean;
      corporation: boolean;
      corporatePensionProfitSharing: boolean;
      custodial: boolean;
      estate: boolean;
      jointTenant: boolean;
      limitedLiabilityCompany: boolean;
      individualSingleMemberLlc: boolean;
      soleProprietorship: boolean;
      transferOnDeathIndividual: boolean;
      transferOnDeathJoint: boolean;
      trust: boolean;
      nonprofitOrganization: boolean;
      partnership: boolean;
      exemptOrganization: boolean;
      other: boolean;
    };
    corporationDesignation: {
      cCorp: boolean;
      sCorp: boolean;
    };
    llcDesignation: {
      cCorp: boolean;
      sCorp: boolean;
      partnership: boolean;
    };
    trust: {
      establishmentDate: string | null;
      trustType: {
        charitable: boolean;
        living: boolean;
        irrevocableLiving: boolean;
        family: boolean;
        revocable: boolean;
        irrevocable: boolean;
        testamentary: boolean;
      };
    };
    custodial: {
      custodialType: {
        ugma: boolean;
        utma: boolean;
      };
      gifts: Array<{
        state: string;
        dateGiftWasGiven: string;
      }>;
    };
    joint: {
      marriedToEachOther: {
        yes: boolean;
        no: boolean;
      };
      tenancyState: string | null;
      numberOfTenants: number | null;
      tenancyClause: {
        communityProperty: boolean;
        tenantsByEntirety: boolean;
        communityPropertyWithRightsOfSurvivorship: boolean;
        jointTenantsWithRightsOfSurvivorship: boolean;
        tenantsInCommon: boolean;
      };
    };
    transferOnDeath: {
      individualAgreementDate: string | null;
      jointAgreementDate: string | null;
    };
    otherDescription: string | null;
  };
}

export interface InvestorProfileStepOneUpdateRequest {
  questionId: InvestorProfileStepOneQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: InvestorProfileStepOneQuestionId;
  };
}

export interface InvestorProfileStepOneQuestionConfig {
  key: InvestorProfileStepOneQuestionId;
  title: string;
  helper: string;
  type:
    | 'text'
    | 'date'
    | 'number'
    | 'single-choice-cards'
    | 'gifts';
  placeholder?: string;
  options?: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
  fieldErrorKey?: string;
}

export type InvestorProfileStepTwoQuestionId = 'step2.initialSourceOfFunds';

export interface InvestorProfileStepTwoFields {
  initialSourceOfFunds: {
    accountsReceivable: boolean;
    incomeFromEarnings: boolean;
    legalSettlement: boolean;
    spouseParent: boolean;
    accumulatedSavings: boolean;
    inheritance: boolean;
    lotteryGaming: boolean;
    rentalIncome: boolean;
    alimony: boolean;
    insuranceProceeds: boolean;
    pensionIraRetirementSavings: boolean;
    saleOfBusiness: boolean;
    gift: boolean;
    investmentProceeds: boolean;
    saleOfRealEstate: boolean;
    other: boolean;
    otherDetails: string | null;
  };
}

export interface InvestorProfileStepTwoResponse {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_2_USA_PATRIOT_ACT_INFORMATION';
      label: string;
      currentQuestionId: InvestorProfileStepTwoQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: InvestorProfileStepTwoQuestionId[];
      fields: InvestorProfileStepTwoFields;
    };
  };
}

export interface InvestorProfileStepTwoUpdateRequest {
  questionId: InvestorProfileStepTwoQuestionId;
  answer: InvestorProfileStepTwoFields['initialSourceOfFunds'];
  clientCursor?: {
    currentQuestionId?: InvestorProfileStepTwoQuestionId;
  };
}

export interface ApiFieldErrors {
  [key: string]: string;
}
