export interface User {
  id: string;
  name: string;
  email: string;
  isAdmin?: boolean;
}

// --- AI form ingestion (admin) ---------------------------------------------

export type IngestedQuestionType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'number'
  | 'currency'
  | 'email'
  | 'phone'
  | 'ssn-ein'
  | 'single-choice-cards'
  | 'multi-select'
  | 'checkbox'
  | 'signature';

export interface IngestedChoiceOption {
  label: string;
  value: string;
  pdfField: string | null;
}

export interface IngestedQuestion {
  id: string;
  section: number;
  title: string;
  helper?: string | null;
  type: IngestedQuestionType;
  required: boolean;
  pdfField?: string | null;
  options?: IngestedChoiceOption[];
  showIf?: string | null;
  profileKey?: string | null;
}

export interface IngestedFormSchema {
  code: string;
  title: string;
  description?: string | null;
  sections: { number: number; title: string }[];
  items: IngestedQuestion[];
  pdfFieldCount: number;
  unmappedFields: string[];
  unmappedDetails?: { name: string; page: number; hint: string }[];
}

export type FormSourceKind = 'SEED' | 'UPLOAD';
export type FormStatusKind = 'DRAFT' | 'PUBLISHED';

export interface AdminFormSummary {
  id: string;
  code: string;
  title: string;
  status: FormStatusKind;
  source: FormSourceKind;
  unmappedCount: number | null;
  updatedAt: string;
}

export interface AdminFormDetail {
  id: string;
  code: string;
  title: string;
  status: FormStatusKind;
  source: FormSourceKind;
  templateUrl: string | null;
  unmappedCount: number | null;
  schema: V2Schema | null;
}

// --- v2 step-wise schema (the wizard runtime) ---
export interface V2ChoiceOption {
  label: string;
  value: string;
  description?: string | null;
  pdfField: string | null;
  required?: boolean;
  mapping?: MappingExplanation;
}
export interface V2SubField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  pdfField?: string | null;
  canonicalField?: string | null;
  mapping?: MappingExplanation;
  autofill?: AutofillExplanation | null;
}
export interface MappingExplanation {
  reason?: string;
  evidence?: string;
  source?: string;
  confidence?: number | null;
}
export interface AutofillExplanation {
  canonicalField: string;
  reason: string;
  source?: string;
}
export interface V2Question {
  id: string;
  step: number;
  order: number;
  title: string;
  helper?: string | null;
  type: string;
  required?: boolean;
  pdfField?: string | null;
  canonicalField?: string | null;
  options?: V2ChoiceOption[];
  showIf?: string | null;
  subFields?: V2SubField[];
  kind?: string; // 'repeat-block'
  fields?: V2Question[];
  minItems?: number;
  maxItems?: number;
  mapping?: MappingExplanation;
  autofill?: AutofillExplanation | null;
}
export interface V2Step {
  number: number;
  key: string;
  label: string;
  requiredIf?: string | null;
  emits?: string[];
  isTerminal?: boolean;
}
export interface V2Schema {
  version: 2;
  code: string;
  title: string;
  description?: string | null;
  steps: V2Step[];
  items: V2Question[];
  pdfFieldCount: number;
  unmappedFields: string[];
  unmappedDetails?: {
    name: string;
    page: number;
    hint: string;
    category?: string;
    reason?: string;
    recommendedAction?: string;
    source?: string;
    confidence?: number | null;
  }[];
  mappingSummary?: {
    totalFields: number;
    mappedFields: number;
    unmappedFields: number;
    mappedPercent: number;
    questions: number;
    autofillReadyFields: number;
    recoveredByExpansion?: number;
    recoveredBySecondPass?: number;
  };
  analysisReport?: IngestionAnalysisReport;
  mappingLayout?: PdfMappingLayout;
}

export type PdfTargetKind = 'acrofield' | 'overlay';
export type PdfWidgetType = 'text' | 'checkbox' | 'choice';
export type PdfValueFormat = 'text' | 'date' | 'currency' | 'phone' | 'tin' | 'ssn';

export interface PdfMappingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfMappingTarget {
  id: string;
  kind: PdfTargetKind;
  page: number;
  rect: PdfMappingRect;
  pdfField?: string | null;
  widgetType: PdfWidgetType;
  variableKey?: string | null;
  optionValue?: string | null;
  format?: PdfValueFormat;
  required?: boolean;
  source: 'ai' | 'admin';
  confidence?: number | null;
  ignoredReason?: 'signature_skipped' | 'admin_ignored';
}

export interface PdfMappingLayout {
  version: 1;
  targets: PdfMappingTarget[];
}

export interface PdfMapPage {
  page: number;
  width: number;
  height: number;
}

export interface PdfMapField {
  id: string;
  page: number;
  fieldName: string | null;
  type: string;
  rect: PdfMappingRect;
  label: string;
  nearbyText: string[];
  exportValue?: string | null;
  required?: boolean;
}

export interface PdfMapVariable {
  key: string;
  label: string;
  group: string;
  source: 'schema' | 'canonical' | 'fact';
  format?: PdfValueFormat;
  description?: string;
  ruleSummary?: string;
  sourceForms?: string[];
  reviewSensitive?: boolean;
}

export interface SkippedSignatureField {
  id: string;
  page: number;
  fieldName: string | null;
  rect: PdfMappingRect;
  label: string;
  ignoredReason: 'signature_skipped';
}

export interface PdfMapResponse {
  templateUrl: string;
  pages: PdfMapPage[];
  fields: PdfMapField[];
  skippedSignatureFields: SkippedSignatureField[];
  mappingLayout: PdfMappingLayout;
  variables: PdfMapVariable[];
}

export interface PdfMappingWarning {
  targetId: string;
  variableKey: string;
  pdfField?: string | null;
  reason: string;
  missingInputs?: string[];
  needsReview?: boolean;
  sourceFields?: string[];
}

// --- Client direct PDF fill sessions --------------------------------------

export type PdfFillConfidence = 'high' | 'medium' | 'low';
export type PdfFillTargetStatus = 'filled' | 'needs_review' | 'empty' | 'skipped';

export interface PdfFillWarning {
  targetId: string;
  label: string;
  reason: string;
  missingInputs?: string[];
}

export interface PdfFillTarget {
  id: string;
  page: number;
  rect: PdfMappingRect;
  widgetType: PdfWidgetType;
  label: string;
  value: string | boolean | null;
  displayValue: string;
  status: PdfFillTargetStatus;
  sourceLabel?: string;
  explanation?: string;
  confidence: PdfFillConfidence;
  editable: boolean;
  warning?: string;
  pdfField?: string | null;
}

export interface PdfFillLayout {
  pages: PdfMapPage[];
  targets: PdfFillTarget[];
}

export interface PdfFillRecord {
  id: string;
  fileName: string | null;
  status: string;
  originalPdfUrl: string;
  generatedPdfUrl: string | null;
  generatedAt: string | null;
  resolvedLayout: PdfFillLayout;
  warnings: PdfFillWarning[];
}

export interface PdfFillSummary {
  id: string;
  fileName: string | null;
  status: string;
  generatedPdfUrl: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  warningCount: number;
  analysisStartedAt?: string | null;
  analysisStage?: 'QUEUED' | 'READING_PDF' | 'MATCHING_CLIENT_DATA' | 'MAPPING_FIELDS' | 'FINALIZING' | null;
  analysisError?: string | null;
  analysisAttempts?: number;
}

export interface PdfFillOverride {
  value?: string | boolean | null;
  ignored?: boolean;
}

export interface IngestionAnalysisReport {
  headline: string;
  plainSummary: string;
  mappedSummary: string;
  unmappedSummary: string;
  autofillSummary: string;
  reviewPriority: string;
  nextSteps: string[];
}

export interface DynamicStepEnvelope {
  key: string;
  label: string;
  currentQuestionId: string | null;
  currentQuestionIndex: number;
  visibleQuestionIds: string[];
  fields: Record<string, unknown>;
  autoFilled: string[];
  requiresStep4?: boolean;
  requiresJointOwnerSignature?: boolean;
  nextRouteAfterCompletion?: string | null;
}
export interface DynamicStepResponse {
  onboarding: {
    clientId: string;
    status: string;
    totalSteps: number;
    step: DynamicStepEnvelope;
  };
}

export interface UploadFormResult {
  form: { id: string; code: string; title: string; status: FormStatusKind; source: FormSourceKind };
  stats: {
    totalFields: number;
    steps: number;
    questions: number;
    mapped: number;
    unmapped: number;
    choiceGroups: number;
    recoveredByExpansion: number;
    recoveredBySecondPass?: number;
    mappedPercent: number;
  };
  report?: IngestionAnalysisReport | null;
  unmappedFields: string[];
}

export interface AdminIngestionJob {
  id: string;
  kind: 'UPLOAD' | 'REANALYZE';
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  percent: number;
  label: string;
  stage: string;
  createdAt: string;
  updatedAt: string;
  formId?: string;
  result?: UploadFormResult | {
    form: { id: string; code: string; title: string; status: FormStatusKind; source: FormSourceKind; unmappedCount?: number | null };
    stats: UploadFormResult['stats'];
    report?: IngestionAnalysisReport | null;
    unmappedFields: string[];
  };
  error?: string;
}

export interface BrokerSummary {
  id: string;
  name: string;
  email: string;
}

export interface BrokerUserOption {
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
export type StatementOfFinancialConditionOnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type BaiodfOnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type Baiv506cOnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface ClientRecord {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: string;
  setupStatus?: 'INCOMPLETE' | 'ACTIVE';
  primaryBroker: BrokerSummary | null;
  additionalBrokers: BrokerSummary[];
  selectedForms: FormCatalogItem[];
  hasInvestorProfile: boolean;
  investorProfileOnboardingStatus: InvestorProfileOnboardingStatus;
  investorProfileResumeStepRoute: string | null;
  hasStatementOfFinancialCondition: boolean;
  statementOfFinancialConditionOnboardingStatus: StatementOfFinancialConditionOnboardingStatus;
  statementOfFinancialConditionResumeStepRoute: string | null;
  hasBaiodf: boolean;
  baiodfOnboardingStatus: BaiodfOnboardingStatus;
  baiodfResumeStepRoute: string | null;
  investments?: ClientInvestmentSummary[];
  hasBaiv506c: boolean;
  baiv506cOnboardingStatus: Baiv506cOnboardingStatus;
  baiv506cResumeStepRoute: string | null;
}

export interface ClientInvestmentSummary {
  id: string;
  name: string;
  position: number;
  baiodfStatus: BaiodfOnboardingStatus;
  agreementStatus: string | null;
  agreementFileName: string | null;
}

export interface InvestmentAgreementSummary {
  fillId: string;
  fileName: string | null;
  status: string;
  warningCount: number;
  generatedPdfUrl: string | null;
  generatedAt: string | null;
  uploadedAt?: string | null;
  analysisStartedAt?: string | null;
  analysisStage?: 'QUEUED' | 'READING_PDF' | 'MATCHING_CLIENT_DATA' | 'MAPPING_FIELDS' | 'FINALIZING' | null;
  analysisError?: string | null;
  analysisAttempts?: number;
}

export interface InvestmentWorkspaceItem {
  id: string;
  name: string;
  position: number;
  baiodfStatus: BaiodfOnboardingStatus;
  baiodfResumeRoute: string;
  baiodfSyncRequestedAt?: string | null;
  baiodfPdf: { id: string; pdfUrl: string; generatedAt: string | null } | null;
  baiodfPdfCount: number;
  agreement: InvestmentAgreementSummary | null;
  pairReady: boolean;
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

export type InvestorProfileInvestmentTypeKey =
  | 'commoditiesFutures'
  | 'equities'
  | 'exchangeTradedFunds'
  | 'fixedAnnuities'
  | 'fixedInsurance'
  | 'mutualFunds'
  | 'options'
  | 'preciousMetals'
  | 'realEstate'
  | 'unitInvestmentTrusts'
  | 'variableAnnuities'
  | 'leveragedInverseEtfs'
  | 'complexProducts'
  | 'alternativeInvestments'
  | 'other';

// Financial ranges (annual income, net worth, liquid net worth) are entered as
// raw dollar amounts. `null` means the field is empty.
export type InvestorProfileFinancialRangeAmount = number;

export type InvestorProfileStepThreeQuestionId =
  | 'step3.holder.kind'
  | 'step3.holder.name'
  | 'step3.holder.taxId.ssn'
  | 'step3.holder.taxId.hasEin'
  | 'step3.holder.taxId.ein'
  | 'step3.holder.contact.email'
  | 'step3.holder.contact.dateOfBirth'
  | 'step3.holder.contact.specifiedAdult'
  | 'step3.holder.contact.phones'
  | 'step3.holder.contact.phones.home'
  | 'step3.holder.contact.phones.business'
  | 'step3.holder.contact.phones.mobile'
  | 'step3.holder.legalAddress'
  | 'step3.holder.legalAddress.line1'
  | 'step3.holder.legalAddress.city'
  | 'step3.holder.legalAddress.stateProvince'
  | 'step3.holder.legalAddress.postalCode'
  | 'step3.holder.legalAddress.country'
  | 'step3.holder.mailingDifferent'
  | 'step3.holder.mailingAddress'
  | 'step3.holder.mailingAddress.line1'
  | 'step3.holder.mailingAddress.city'
  | 'step3.holder.mailingAddress.stateProvince'
  | 'step3.holder.mailingAddress.postalCode'
  | 'step3.holder.mailingAddress.country'
  | 'step3.holder.citizenship.primary'
  | 'step3.holder.citizenship.additional'
  | 'step3.holder.gender'
  | 'step3.holder.maritalStatus'
  | 'step3.holder.employment.status'
  | 'step3.holder.employment.occupation'
  | 'step3.holder.employment.yearsEmployed'
  | 'step3.holder.employment.typeOfBusiness'
  | 'step3.holder.employment.employerName'
  | 'step3.holder.employment.employerAddress.line1'
  | 'step3.holder.employment.employerAddress.city'
  | 'step3.holder.employment.employerAddress.stateProvince'
  | 'step3.holder.employment.employerAddress.postalCode'
  | 'step3.holder.employment.employerAddress.country'
  | 'step3.investment.knowledgeExperience'
  | 'step3.investment.generalKnowledge'
  | `step3.investment.byType.${InvestorProfileInvestmentTypeKey}.knowledge`
  | `step3.investment.byType.${InvestorProfileInvestmentTypeKey}.sinceYear`
  | 'step3.investment.byType.other.label'
  | 'step3.financial.annualIncomeRange'
  | 'step3.financial.netWorthExPrimaryResidenceRange'
  | 'step3.financial.liquidNetWorthRange'
  | 'step3.financial.taxBracket'
  | 'step3.govId.photoId1'
  | 'step3.govId.photoId2'
  | 'step3.disclosure.employeeAdvisorFirm'
  | 'step3.disclosure.relatedAdvisorFirmEmployee'
  | 'step3.disclosure.employeeBrokerDealer'
  | 'step3.disclosure.relatedBrokerDealerEmployee'
  | 'step3.disclosure.maintainsOtherBrokerageAccounts'
  | 'step3.disclosure.exchangeOrFinraAffiliation'
  | 'step3.disclosure.seniorOfficerDirectorTenPercentPublicCompany';

export interface InvestorProfileStepThreeFields {
  holder: {
    kind: {
      person: boolean;
      entity: boolean;
    };
    name: string;
    taxId: {
      ssn: string | null;
      hasEin: {
        yes: boolean;
        no: boolean;
      };
      ein: string | null;
    };
    contact: {
      email: string;
      dateOfBirth: string | null;
      specifiedAdult: string | null;
      phones: {
        home: string | null;
        business: string | null;
        mobile: string | null;
      };
    };
    legalAddress: {
      line1: string | null;
      city: string | null;
      stateProvince: string | null;
      postalCode: string | null;
      country: string | null;
    };
    mailingDifferent: {
      yes: boolean;
      no: boolean;
    };
    mailingAddress: {
      line1: string | null;
      city: string | null;
      stateProvince: string | null;
      postalCode: string | null;
      country: string | null;
    };
    citizenship: {
      primary: string[];
      additional: string[];
    };
    gender: {
      male: boolean;
      female: boolean;
    };
    maritalStatus: {
      single: boolean;
      married: boolean;
      divorced: boolean;
      domesticPartner: boolean;
      widower: boolean;
    };
    employment: {
      status: {
        employed: boolean;
        selfEmployed: boolean;
        retired: boolean;
        unemployed: boolean;
        student: boolean;
      };
      occupation: string | null;
      yearsEmployed: number | null;
      typeOfBusiness: string | null;
      employerName: string | null;
      employerAddress: {
        line1: string | null;
        city: string | null;
        stateProvince: string | null;
        postalCode: string | null;
        country: string | null;
      };
    };
  };
  investmentKnowledge: {
    general: {
      limited: boolean;
      moderate: boolean;
      extensive: boolean;
      none: boolean;
    };
    byType: {
      [key in InvestorProfileInvestmentTypeKey]: {
        knowledge: {
          limited: boolean;
          moderate: boolean;
          extensive: boolean;
          none: boolean;
        };
        sinceYear: number | null;
        label?: string | null;
      };
    } & {
      other: {
        knowledge: {
          limited: boolean;
          moderate: boolean;
          extensive: boolean;
          none: boolean;
        };
        sinceYear: number | null;
        label: string | null;
      };
    };
  };
  financialInformation: {
    annualIncomeRange: {
      fromBracket: InvestorProfileFinancialRangeAmount | null;
      toBracket: InvestorProfileFinancialRangeAmount | null;
    };
    netWorthExPrimaryResidenceRange: {
      fromBracket: InvestorProfileFinancialRangeAmount | null;
      toBracket: InvestorProfileFinancialRangeAmount | null;
    };
    liquidNetWorthRange: {
      fromBracket: InvestorProfileFinancialRangeAmount | null;
      toBracket: InvestorProfileFinancialRangeAmount | null;
    };
    taxBracket: {
      bracket_0_15: boolean;
      bracket_15_1_32: boolean;
      bracket_32_1_50: boolean;
      bracket_50_1_plus: boolean;
    };
  };
  governmentIdentification: {
    photoId1: {
      type: string | null;
      idNumber: string | null;
      countryOfIssue: string | null;
      dateOfIssue: string | null;
      dateOfExpiration: string | null;
      documentKey: string | null;
      documentFileName: string | null;
    };
    photoId2: {
      type: string | null;
      idNumber: string | null;
      countryOfIssue: string | null;
      dateOfIssue: string | null;
      dateOfExpiration: string | null;
      documentKey: string | null;
      documentFileName: string | null;
    };
    requirementContext: {
      requiresDocumentaryId: boolean | null;
      isNonResidentAlien: boolean | null;
    };
  };
  affiliations: {
    employeeAdvisorFirm: {
      yes: boolean;
      no: boolean;
    };
    relatedAdvisorFirmEmployee: {
      yes: boolean;
      no: boolean;
    };
    advisorEmployeeName: string | null;
    advisorEmployeeRelationship: string | null;
    employeeBrokerDealer: {
      yes: boolean;
      no: boolean;
    };
    brokerDealerName: string | null;
    relatedBrokerDealerEmployee: {
      yes: boolean;
      no: boolean;
    };
    relatedBrokerDealerName: string | null;
    relatedBrokerDealerEmployeeName: string | null;
    relatedBrokerDealerRelationship: string | null;
    maintainsOtherBrokerageAccounts: {
      yes: boolean;
      no: boolean;
    };
    otherBrokerageFirms: string | null;
    yearsOfInvestmentExperience: number | null;
    exchangeOrFinraAffiliation: {
      yes: boolean;
      no: boolean;
    };
    affiliationDetails: string | null;
    seniorOfficerDirectorTenPercentPublicCompany: {
      yes: boolean;
      no: boolean;
    };
    publicCompanyNames: string | null;
  };
}

export interface InvestorProfileStepThreeResponse {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION';
      label: string;
      currentQuestionId: InvestorProfileStepThreeQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: InvestorProfileStepThreeQuestionId[];
      fields: InvestorProfileStepThreeFields;
      requiresStep4: boolean;
    };
  };
}

export interface InvestorProfileStepThreeUpdateRequest {
  questionId: InvestorProfileStepThreeQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: InvestorProfileStepThreeQuestionId;
  };
}

export interface InvestorProfileStepThreeQuestionConfig {
  key: InvestorProfileStepThreeQuestionId;
  title: string;
  helper: string;
  type:
    | 'text'
    | 'date'
    | 'number'
    | 'single-choice-cards'
    | 'phones-block'
    | 'address-block'
    | 'investment-knowledge-block'
    | 'country-multi'
    | 'range-bracket'
    | 'photo-id-block'
    | 'disclosure-related-advisor'
    | 'disclosure-employee-broker'
    | 'disclosure-related-broker'
    | 'disclosure-other-brokerage'
    | 'disclosure-exchange-finra'
    | 'disclosure-public-company';
  placeholder?: string;
  options?: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
  fieldErrorKey?: string;
}

export type InvestorProfileStepFourQuestionId =
  | 'step4.holder.kind'
  | 'step4.holder.name'
  | 'step4.holder.taxId.ssn'
  | 'step4.holder.taxId.hasEin'
  | 'step4.holder.taxId.ein'
  | 'step4.holder.contact.email'
  | 'step4.holder.contact.dateOfBirth'
  | 'step4.holder.contact.specifiedAdult'
  | 'step4.holder.contact.phones'
  | 'step4.holder.contact.phones.home'
  | 'step4.holder.contact.phones.business'
  | 'step4.holder.contact.phones.mobile'
  | 'step4.holder.legalAddress'
  | 'step4.holder.legalAddress.line1'
  | 'step4.holder.legalAddress.city'
  | 'step4.holder.legalAddress.stateProvince'
  | 'step4.holder.legalAddress.postalCode'
  | 'step4.holder.legalAddress.country'
  | 'step4.holder.mailingDifferent'
  | 'step4.holder.mailingAddress'
  | 'step4.holder.mailingAddress.line1'
  | 'step4.holder.mailingAddress.city'
  | 'step4.holder.mailingAddress.stateProvince'
  | 'step4.holder.mailingAddress.postalCode'
  | 'step4.holder.mailingAddress.country'
  | 'step4.holder.citizenship.primary'
  | 'step4.holder.citizenship.additional'
  | 'step4.holder.gender'
  | 'step4.holder.maritalStatus'
  | 'step4.holder.employment.status'
  | 'step4.holder.employment.occupation'
  | 'step4.holder.employment.yearsEmployed'
  | 'step4.holder.employment.typeOfBusiness'
  | 'step4.holder.employment.employerName'
  | 'step4.holder.employment.employerAddress.line1'
  | 'step4.holder.employment.employerAddress.city'
  | 'step4.holder.employment.employerAddress.stateProvince'
  | 'step4.holder.employment.employerAddress.postalCode'
  | 'step4.holder.employment.employerAddress.country'
  | 'step4.investment.knowledgeExperience'
  | 'step4.investment.generalKnowledge'
  | `step4.investment.byType.${InvestorProfileInvestmentTypeKey}.knowledge`
  | `step4.investment.byType.${InvestorProfileInvestmentTypeKey}.sinceYear`
  | 'step4.investment.byType.other.label'
  | 'step4.financial.annualIncomeRange'
  | 'step4.financial.netWorthExPrimaryResidenceRange'
  | 'step4.financial.liquidNetWorthRange'
  | 'step4.financial.taxBracket'
  | 'step4.govId.photoId1'
  | 'step4.govId.photoId2'
  | 'step4.disclosure.employeeAdvisorFirm'
  | 'step4.disclosure.relatedAdvisorFirmEmployee'
  | 'step4.disclosure.employeeBrokerDealer'
  | 'step4.disclosure.relatedBrokerDealerEmployee'
  | 'step4.disclosure.maintainsOtherBrokerageAccounts'
  | 'step4.disclosure.exchangeOrFinraAffiliation'
  | 'step4.disclosure.seniorOfficerDirectorTenPercentPublicCompany';

export type InvestorProfileStepFourFields = Omit<InvestorProfileStepThreeFields, 'holder'> & {
  holder: Omit<InvestorProfileStepThreeFields['holder'], 'employment'> & {
    employment: Omit<InvestorProfileStepThreeFields['holder']['employment'], 'status'> & {
      status: InvestorProfileStepThreeFields['holder']['employment']['status'] & {
        homemaker: boolean;
      };
    };
  };
};

export interface InvestorProfileStepFourResponse {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_4_SECONDARY_ACCOUNT_HOLDER_INFORMATION';
      label: string;
      currentQuestionId: InvestorProfileStepFourQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: InvestorProfileStepFourQuestionId[];
      fields: InvestorProfileStepFourFields;
    };
  };
}

export interface InvestorProfileStepFourUpdateRequest {
  questionId: InvestorProfileStepFourQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: InvestorProfileStepFourQuestionId;
  };
}

export interface InvestorProfileStepFourQuestionConfig
  extends Omit<InvestorProfileStepThreeQuestionConfig, 'key'> {
  key: InvestorProfileStepFourQuestionId;
}

export type InvestorProfileStepFiveQuestionId =
  | 'step5.profile.riskExposure'
  | 'step5.profile.accountObjectives'
  | 'step5.investments.fixedValues.marketIncome'
  | 'step5.investments.fixedValues.alternativesInsurance'
  | 'step5.investments.hasOther'
  | 'step5.investments.otherEntries'
  | 'step5.horizonAndLiquidity';

export interface InvestorProfileStepFiveFields {
  profile: {
    riskExposure: {
      low: boolean;
      moderate: boolean;
      speculation: boolean;
      highRisk: boolean;
    };
    accountObjectives: {
      income: boolean;
      longTermGrowth: boolean;
      shortTermGrowth: boolean;
    };
  };
  investments: {
    fixedValues: {
      marketIncome: {
        equities: number | null;
        options: number | null;
        fixedIncome: number | null;
        mutualFunds: number | null;
        unitInvestmentTrusts: number | null;
        exchangeTradedFunds: number | null;
      };
      alternativesInsurance: {
        realEstate: number | null;
        insurance: number | null;
        variableAnnuities: number | null;
        fixedAnnuities: number | null;
        preciousMetals: number | null;
        commoditiesFutures: number | null;
      };
    };
    hasOther: {
      yes: boolean;
      no: boolean;
    };
    otherEntries: {
      entries: Array<{
        label: string | null;
        value: number | null;
      }>;
    };
  };
  horizonAndLiquidity: {
    timeHorizon: {
      fromYear: number | null;
      toYear: number | null;
    };
    liquidityNeeds: {
      high: boolean;
      medium: boolean;
      low: boolean;
    };
  };
}

export interface InvestorProfileStepFiveResponse {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL';
      label: string;
      currentQuestionId: InvestorProfileStepFiveQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: InvestorProfileStepFiveQuestionId[];
      fields: InvestorProfileStepFiveFields;
      requiresStep4: boolean;
    };
  };
}

export interface InvestorProfileStepFiveUpdateRequest {
  questionId: InvestorProfileStepFiveQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: InvestorProfileStepFiveQuestionId;
  };
}

export interface InvestorProfileStepFiveQuestionConfig {
  key: InvestorProfileStepFiveQuestionId;
  title: string;
  helper: string;
  type:
    | 'single-choice-cards'
    | 'multi-select-cards'
    | 'investment-values-block'
    | 'other-investments-block'
    | 'horizon-liquidity-block'
    | 'trusted-contact-block'
    | 'certification-checklist-block'
    | 'account-owner-signatures-block'
    | 'firm-signatures-block';
  options?: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
  fieldErrorKey?: string;
}

export type InvestorProfileStepSixQuestionId =
  | 'step6.trustedContact.decline'
  | 'step6.trustedContact.contactInfo'
  | 'step6.trustedContact.mailingAddress';

export interface InvestorProfileStepSixFields {
  trustedContact: {
    decline: {
      yes: boolean;
      no: boolean;
    };
    contactInfo: {
      name: string | null;
      email: string | null;
      phones: {
        home: string | null;
        business: string | null;
        mobile: string | null;
      };
    };
    mailingAddress: {
      line1: string | null;
      city: string | null;
      stateProvince: string | null;
      postalCode: string | null;
      country: string | null;
    };
  };
}

export interface InvestorProfileStepSixResponse {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_6_TRUSTED_CONTACT';
      label: string;
      currentQuestionId: InvestorProfileStepSixQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: InvestorProfileStepSixQuestionId[];
      fields: InvestorProfileStepSixFields;
    };
  };
}

export interface InvestorProfileStepSixUpdateRequest {
  questionId: InvestorProfileStepSixQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: InvestorProfileStepSixQuestionId;
  };
}

export interface InvestorProfileStepSixQuestionConfig {
  key: InvestorProfileStepSixQuestionId;
  title: string;
  helper: string;
  type:
    | 'single-choice-cards'
    | 'trusted-contact-block'
    | 'address-block';
  options?: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
  fieldErrorKey?: string;
}

export type InvestorProfileStepSevenQuestionId =
  | 'step7.certifications.acceptances'
  | 'step7.signatures.accountOwners'
  | 'step7.signatures.firm';

export interface InvestorProfileStepSevenFields {
  certifications: {
    acceptances: {
      attestationsAccepted: boolean;
      taxpayerCertificationAccepted: boolean;
      usPersonDefinitionAcknowledged: boolean;
    };
  };
  signatures: {
    accountOwner: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
    jointAccountOwner: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
    financialProfessional: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
    supervisorPrincipal: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
  };
}

export interface InvestorProfileStepSevenResponse {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_7_SIGNATURES';
      label: string;
      currentQuestionId: InvestorProfileStepSevenQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: InvestorProfileStepSevenQuestionId[];
      fields: InvestorProfileStepSevenFields;
      requiresJointOwnerSignature: boolean;
      nextRouteAfterCompletion: string | null;
    };
  };
}

export interface InvestorProfileStepSevenUpdateRequest {
  questionId: InvestorProfileStepSevenQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: InvestorProfileStepSevenQuestionId;
  };
}

export interface InvestorProfileStepSevenQuestionConfig {
  key: InvestorProfileStepSevenQuestionId;
  title: string;
  helper: string;
  type:
    | 'certification-checklist-block'
    | 'account-owner-signatures-block'
    | 'firm-signatures-block';
  options?: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
  fieldErrorKey?: string;
}

export type StatementOfFinancialConditionStepOneQuestionId =
  | 'step1.accountRegistration'
  | 'step1.liquidNonQualifiedAssets'
  | 'step1.liabilities'
  | 'step1.illiquidNonQualifiedAssets'
  | 'step1.accreditationAdjustments'
  | 'step1.liquidQualifiedAssets'
  | 'step1.incomeSummary'
  | 'step1.illiquidQualifiedAssets';

export interface StatementOfFinancialConditionStepOneFields {
  accountRegistration: {
    rrName: string;
    rrNo: string;
    customerNames: string;
  };
  liquidNonQualifiedAssets: {
    cashMoneyMarketsCds: number | null;
    brokerageNonManaged: number | null;
    managedAccounts: number | null;
    mutualFundsDirect: number | null;
    annuitiesLessSurrenderCharges: number | null;
    cashValueLifeInsurance: number | null;
    otherBusinessAssetsCollectibles: number | null;
  };
  liabilities: {
    mortgagePrimaryResidence: number | null;
    mortgagesSecondaryInvestment: number | null;
    homeEquityLoans: number | null;
    creditCards: number | null;
    otherLiabilities: number | null;
  };
  illiquidNonQualifiedAssets: {
    primaryResidence: number | null;
    investmentRealEstate: number | null;
    privateBusiness: number | null;
  };
  accreditationAdjustments: {
    primaryResidenceSecuredDebtIncreaseLast60Days: number | null;
  };
  liquidQualifiedAssets: {
    cashMoneyMarketsCds: number | null;
    retirementPlans: number | null;
    brokerageNonManaged: number | null;
    managedAccounts: number | null;
    mutualFundsDirect: number | null;
    annuities: number | null;
  };
  incomeSummary: {
    salaryCommissions: number | null;
    investmentIncome: number | null;
    pension: number | null;
    socialSecurity: number | null;
    netRentalIncome: number | null;
    other: number | null;
  };
  illiquidQualifiedAssets: {
    purchaseAmountValue: number | null;
  };
}

export interface StatementOfFinancialConditionStepOneTotals {
  totalLiabilities: number;
  totalLiquidAssets: number;
  totalLiquidQualifiedAssets: number;
  totalAnnualIncome: number;
  totalIlliquidAssetsEquity: number;
  totalAssets: number;
  totalAssetsLessPrimaryResidence: number;
  totalNetWorthAssetsLessPrimaryResidenceLiabilities: number;
  totalIlliquidSecurities: number;
  totalNetWorth: number;
  totalPotentialLiquidity: number;
  totalIlliquidQualifiedAssets: number;
  primaryResidenceSecuredDebt: number;
  excludedPrimaryResidenceSecuredDebt: number;
  countedPrimaryResidenceSecuredDebt: number;
  accreditedInvestorLiabilities: number;
  accreditedInvestorNetWorth: number;
}

export interface StatementOfFinancialConditionStepOneResponse {
  onboarding: {
    clientId: string;
    status: StatementOfFinancialConditionOnboardingStatus;
    step: {
      key: 'STEP_1_FINANCIALS';
      label: string;
      currentQuestionId: StatementOfFinancialConditionStepOneQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: StatementOfFinancialConditionStepOneQuestionId[];
      fields: StatementOfFinancialConditionStepOneFields;
      totals: StatementOfFinancialConditionStepOneTotals;
    };
  };
}

export interface StatementOfFinancialConditionStepOneUpdateRequest {
  questionId: StatementOfFinancialConditionStepOneQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: StatementOfFinancialConditionStepOneQuestionId;
  };
}

export interface StatementOfFinancialConditionStepOneQuestionConfig {
  key: StatementOfFinancialConditionStepOneQuestionId;
  title: string;
  helper: string;
  type: 'account-registration-block' | 'amount-grid-block';
  fieldErrorKey?: string;
}

export type StatementOfFinancialConditionStepTwoQuestionId =
  | 'step2.notes'
  | 'step2.acknowledgements'
  | 'step2.signatures.accountOwners'
  | 'step2.signatures.firm';

export interface StatementOfFinancialConditionStepTwoFields {
  notes: {
    notes: string | null;
    additionalNotes: string | null;
  };
  acknowledgements: {
    attestDataAccurateComplete: boolean;
    agreeReportMaterialChanges: boolean;
    understandMayNeedRecertification: boolean;
    understandMayNeedSupportingDocumentation: boolean;
    understandInfoUsedForBestInterestRecommendations: boolean;
  };
  signatures: {
    accountOwner: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
    jointAccountOwner: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
    financialProfessional: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
    registeredPrincipal: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
  };
}

export interface StatementOfFinancialConditionStepTwoResponse {
  onboarding: {
    clientId: string;
    status: StatementOfFinancialConditionOnboardingStatus;
    step: {
      key: 'STEP_2_FINALIZATION';
      label: string;
      currentQuestionId: StatementOfFinancialConditionStepTwoQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: StatementOfFinancialConditionStepTwoQuestionId[];
      fields: StatementOfFinancialConditionStepTwoFields;
      requiresJointOwnerSignature: boolean;
      nextRouteAfterCompletion: string | null;
    };
  };
}

export interface StatementOfFinancialConditionStepTwoUpdateRequest {
  questionId: StatementOfFinancialConditionStepTwoQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: StatementOfFinancialConditionStepTwoQuestionId;
  };
}

export interface StatementOfFinancialConditionStepTwoQuestionConfig {
  key: StatementOfFinancialConditionStepTwoQuestionId;
  title: string;
  helper: string;
  type: 'notes-block' | 'acknowledgements-block' | 'account-owner-signatures-block' | 'firm-signatures-block';
  fieldErrorKey?: string;
}

export type BaiodfStepOneQuestionId = 'step1.accountRegistration' | 'step1.orderBasics';

export interface BaiodfStepOneFields {
  accountRegistration: {
    rrName: string;
    rrNo: string;
    customerNames: string;
  };
  orderBasics: {
    proposedPrincipalAmount: number | null;
    qualifiedAccount: {
      yes: boolean;
      no: boolean;
    };
    qualifiedAccountRmdCertification: boolean;
    solicitedTrade: {
      yes: boolean;
      no: boolean;
    };
    taxAdvantagePurchase: {
      yes: boolean;
      no: boolean;
    };
  };
}

export interface BaiodfStepOneResponse {
  onboarding: {
    clientId: string;
    status: BaiodfOnboardingStatus;
    step: {
      key: 'STEP_1_CUSTOMER_ACCOUNT_INFORMATION';
      label: string;
      currentQuestionId: BaiodfStepOneQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: BaiodfStepOneQuestionId[];
      fields: BaiodfStepOneFields;
    };
  };
}

export interface BaiodfStepOneUpdateRequest {
  questionId: BaiodfStepOneQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: BaiodfStepOneQuestionId;
  };
}

export interface BaiodfStepOneQuestionConfig {
  key: BaiodfStepOneQuestionId;
  title: string;
  helper: string;
  type: 'account-registration-block' | 'order-basics-block';
  fieldErrorKey?: string;
}

export type BaiodfStepTwoQuestionId =
  | 'step2.custodianAndProduct'
  | 'step2.existingAltPositions'
  | 'step2.netWorthAndConcentration';

export interface BaiodfStepTwoFields {
  custodianAndProduct: {
    custodian: {
      firstClearing: boolean;
      direct: boolean;
      mainStar: boolean;
      cnb: boolean;
      kingdomTrust: boolean;
      other: boolean;
    };
    custodianOther: string | null;
    nameOfProduct: string;
    sponsorIssuer: string;
    dateOfPpm: string | null;
    datePpmSent: string | null;
  };
  existingAltPositions: {
    existingIlliquidAltPositions: number | null;
    existingSemiLiquidAltPositions: number | null;
    existingTaxAdvantageAltPositions: number | null;
  };
  netWorthAndConcentration: {
    totalNetWorth: number | null;
    liquidNetWorth: number | null;
  };
}

export interface BaiodfStepTwoConcentrations {
  existingIlliquidAltConcentrationPercent: number;
  existingSemiLiquidAltConcentrationPercent: number;
  existingTaxAdvantageAltConcentrationPercent: number;
  totalConcentrationPercent: number;
}

export interface BaiodfStepTwoResponse {
  onboarding: {
    clientId: string;
    status: BaiodfOnboardingStatus;
    step: {
      key: 'STEP_2_CUSTOMER_ORDER_INFORMATION';
      label: string;
      currentQuestionId: BaiodfStepTwoQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: BaiodfStepTwoQuestionId[];
      fields: BaiodfStepTwoFields;
      concentrations: BaiodfStepTwoConcentrations;
    };
  };
}

export interface BaiodfStepTwoUpdateRequest {
  questionId: BaiodfStepTwoQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: BaiodfStepTwoQuestionId;
  };
}

export interface BaiodfStepTwoQuestionConfig {
  key: BaiodfStepTwoQuestionId;
  title: string;
  helper: string;
  type: 'custodian-product-block' | 'existing-alt-positions-block' | 'net-worth-concentration-block';
  fieldErrorKey?: string;
}

export type BaiodfStepThreeQuestionId =
  | 'step3.acknowledgements'
  | 'step3.signatures.accountOwners'
  | 'step3.signatures.financialProfessional';

export interface BaiodfStepThreeFields {
  acknowledgements: {
    illiquidLongTerm: boolean;
    reviewedProspectusOrPpm: boolean;
    understandFeesAndExpenses: boolean;
    noPublicMarket: boolean;
    limitedRedemptionAndSaleRisk: boolean;
    speculativeMayLoseInvestment: boolean;
    distributionsMayVaryOrStop: boolean;
    meetsSuitabilityStandards: boolean;
    featuresRisksDiscussed: boolean;
    meetsFinancialGoalsAndAccurate: boolean;
  };
  signatures: {
    accountOwner: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
    jointAccountOwner: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
    financialProfessional: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
  };
}

export interface BaiodfStepThreeResponse {
  onboarding: {
    clientId: string;
    status: BaiodfOnboardingStatus;
    step: {
      key: 'STEP_3_DISCLOSURES_AND_SIGNATURES';
      label: string;
      currentQuestionId: BaiodfStepThreeQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: BaiodfStepThreeQuestionId[];
      fields: BaiodfStepThreeFields;
      requiresJointOwnerSignature: boolean;
      nextRouteAfterCompletion: string | null;
    };
  };
}

export interface BaiodfStepThreeUpdateRequest {
  questionId: BaiodfStepThreeQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: BaiodfStepThreeQuestionId;
  };
}

export interface BaiodfStepThreeQuestionConfig {
  key: BaiodfStepThreeQuestionId;
  title: string;
  helper: string;
  type: 'acknowledgements-block' | 'account-owner-signatures-block' | 'financial-professional-signature-block';
  fieldErrorKey?: string;
}

export type Baiv506cStepOneQuestionId = 'step1.accountRegistration';

export interface Baiv506cStepOneFields {
  accountRegistration: {
    rrName: string;
    rrNo: string;
    customerNames: string;
  };
}

export interface Baiv506cStepOneResponse {
  onboarding: {
    clientId: string;
    status: Baiv506cOnboardingStatus;
    step: {
      key: 'STEP_1_CLIENT_ACCOUNT_INFORMATION';
      label: string;
      currentQuestionId: Baiv506cStepOneQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Baiv506cStepOneQuestionId[];
      fields: Baiv506cStepOneFields;
    };
  };
}

export interface Baiv506cStepOneUpdateRequest {
  questionId: Baiv506cStepOneQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: Baiv506cStepOneQuestionId;
  };
}

export interface Baiv506cStepOneQuestionConfig {
  key: Baiv506cStepOneQuestionId;
  title: string;
  helper: string;
  type: 'account-registration-block';
  fieldErrorKey?: string;
}

export type Baiv506cStepTwoQuestionId =
  | 'step2.acknowledgements'
  | 'step2.signatures.accountOwners'
  | 'step2.signatures.financialProfessional';

export interface Baiv506cStepTwoFields {
  acknowledgements: {
    rule506cGuidelineAcknowledged: boolean;
    secRuleReviewedAndUnderstood: boolean;
    incomeOrNetWorthVerified: boolean;
    documentationReviewed: boolean;
  };
  signatures: {
    accountOwner: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
    jointAccountOwner: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
    financialProfessional: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    };
  };
}

export interface Baiv506cStepTwoResponse {
  onboarding: {
    clientId: string;
    status: Baiv506cOnboardingStatus;
    step: {
      key: 'STEP_2_ACKNOWLEDGEMENTS_AND_SIGNATURES';
      label: string;
      currentQuestionId: Baiv506cStepTwoQuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Baiv506cStepTwoQuestionId[];
      fields: Baiv506cStepTwoFields;
      requiresJointOwnerSignature: boolean;
      nextRouteAfterCompletion: string | null;
    };
  };
}

export interface Baiv506cStepTwoUpdateRequest {
  questionId: Baiv506cStepTwoQuestionId;
  answer: unknown;
  clientCursor?: {
    currentQuestionId?: Baiv506cStepTwoQuestionId;
  };
}

export interface Baiv506cStepTwoQuestionConfig {
  key: Baiv506cStepTwoQuestionId;
  title: string;
  helper: string;
  type: 'acknowledgements-block' | 'account-owner-signatures-block' | 'financial-professional-signature-block';
  fieldErrorKey?: string;
}

export interface FormWorkspaceItem {
  code: string;
  title: string;
  selected: boolean;
  onboardingStatus:
    | InvestorProfileOnboardingStatus
    | StatementOfFinancialConditionOnboardingStatus
    | BaiodfOnboardingStatus
    | Baiv506cOnboardingStatus
    | null;
  resumeRoute: string | null;
  viewRoute: string | null;
  editRoute: string | null;
  totalSteps: number | null;
  pdfCount: number;
  latestPdfReceivedAt: string | null;
  dynamic?: boolean;
  mappingTemplate?: boolean;
  fillRoute?: string | null;
  generateRoute?: string | null;
}

export interface FormWorkspaceRecord {
  clientId: string;
  clientName: string;
  setupStatus?: 'INCOMPLETE' | 'ACTIVE';
  forms: FormWorkspaceItem[];
  investments?: InvestmentWorkspaceItem[];
}

export interface InvestmentTicketPair {
  investmentId: string;
  name: string;
  position: number;
  baiodfPdf: ClientFormPdfRecord | null;
  agreement: { id: string; status: string; fileName: string | null; generatedPdfUrl: string | null } | null;
  ready: boolean;
}

export interface ClientDocumentRecord {
  id: string;
  clientId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByName: string;
  createdAt: string;
  viewUrl: string;
}

export interface ClientFormPdfRecord {
  id: string;
  clientId: string;
  clientName: string;
  formCode: string;
  workspaceFormCode: string;
  workspaceFormTitle: string;
  pdfUrl: string;
  documentTitle: string | null;
  fileName: string | null;
  sourceRunId: string | null;
  generatedAt: string | null;
  receivedAt: string;
}

export interface FormPdfListResponse {
  clientId: string;
  formCode: string;
  workspaceFormCode: string;
  pdfs: ClientFormPdfRecord[];
}

export interface PdfUpdatesResponse {
  updates: ClientFormPdfRecord[];
  affectedClientIds: string[];
  serverTime: string;
}

export interface SelectClientFormsRequest {
  formCodes: string[];
}

export interface SelectClientFormsResponse {
  addedFormCodes: string[];
  nextOnboardingRoute: string | null;
  workspace: FormWorkspaceRecord;
}

export type ReviewStepResponse =
  | (InvestorProfileStepOneResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (InvestorProfileStepTwoResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (InvestorProfileStepThreeResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (InvestorProfileStepFourResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (InvestorProfileStepFiveResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (InvestorProfileStepSixResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (InvestorProfileStepSevenResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (StatementOfFinancialConditionStepOneResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (StatementOfFinancialConditionStepTwoResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (BaiodfStepOneResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (BaiodfStepTwoResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (BaiodfStepThreeResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (Baiv506cStepOneResponse & { review?: { stepNumber: number; totalSteps: number } })
  | (Baiv506cStepTwoResponse & { review?: { stepNumber: number; totalSteps: number } });

export interface ReviewStepUpdateRequest {
  fields: unknown;
}

export interface ApiFieldErrors {
  [key: string]: string;
}
