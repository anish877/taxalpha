import {
  BrokerageAccreditedInvestorVerificationOnboardingStatus,
  BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus,
  ClientBrokerRole,
  InvestorProfileOnboardingStatus,
  Prisma,
  StatementOfFinancialConditionOnboardingStatus
} from '@prisma/client';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import {
  STEP_1_LABEL,
  applyStep1Answer,
  clampStep1QuestionIndex,
  defaultStep1Fields,
  getVisibleStep1QuestionIds,
  isStep1QuestionId,
  normalizeStep1Fields,
  serializeStep1Fields,
  type PrimaryTypeKey,
  type Step1Fields,
  type Step1QuestionId,
  validateStep1Answer,
  validateStep1Completion
} from '../lib/investor-profile-step1.js';
import {
  STEP_2_LABEL,
  applyStep2Answer,
  clampStep2QuestionIndex,
  defaultStep2Fields,
  getStep2QuestionIds,
  isStep2QuestionId,
  normalizeStep2Fields,
  serializeStep2Fields,
  type Step2Fields,
  type Step2QuestionId,
  validateStep2Answer,
  validateStep2Completion
} from '../lib/investor-profile-step2.js';
import {
  STEP_3_LABEL,
  applyStep3Answer,
  clampStep3QuestionIndex,
  defaultStep3Fields,
  getVisibleStep3QuestionIds,
  isStep3QuestionId,
  normalizeStep3Fields,
  serializeStep3Fields,
  type Step3Fields,
  type Step3QuestionId,
  validateStep3Answer,
  validateStep3Completion
} from '../lib/investor-profile-step3.js';
import {
  STEP_4_LABEL,
  applyStep4Answer,
  clampStep4QuestionIndex,
  defaultStep4Fields,
  getVisibleStep4QuestionIds,
  isStep4QuestionId,
  normalizeStep4Fields,
  serializeStep4Fields,
  type Step4Fields,
  type Step4QuestionId,
  validateStep4Answer,
  validateStep4Completion
} from '../lib/investor-profile-step4.js';
import {
  STEP_5_LABEL,
  applyStep5Answer,
  clampStep5QuestionIndex,
  defaultStep5Fields,
  getVisibleStep5QuestionIds,
  isStep5QuestionId,
  normalizeStep5Fields,
  serializeStep5Fields,
  type Step5Fields,
  type Step5QuestionId,
  validateStep5Answer,
  validateStep5Completion
} from '../lib/investor-profile-step5.js';
import {
  STEP_6_LABEL,
  applyStep6Answer,
  clampStep6QuestionIndex,
  defaultStep6Fields,
  getVisibleStep6QuestionIds,
  isStep6QuestionId,
  normalizeStep6Fields,
  serializeStep6Fields,
  type Step6Fields,
  type Step6QuestionId,
  validateStep6Answer,
  validateStep6Completion
} from '../lib/investor-profile-step6.js';
import {
  STEP_7_LABEL,
  applyStep7Answer,
  applyStep7Prefill,
  clampStep7QuestionIndex,
  defaultStep7Fields,
  getVisibleStep7QuestionIds,
  isStep7QuestionId,
  normalizeStep7Fields,
  serializeStep7Fields,
  type Step7Fields,
  type Step7QuestionId,
  type Step7ValidationContext,
  validateStep7Answer,
  validateStep7Completion
} from '../lib/investor-profile-step7.js';
import {
  defaultBaiodfStep1Fields,
  normalizeBaiodfStep1Fields,
  serializeBaiodfStep1Fields,
  validateBaiodfStep1Completion
} from '../lib/baiodf-step1.js';
import {
  defaultBaiodfStep2Fields,
  normalizeBaiodfStep2Fields,
  serializeBaiodfStep2Fields,
  validateBaiodfStep2Completion
} from '../lib/baiodf-step2.js';
import {
  defaultBaiodfStep3Fields,
  normalizeBaiodfStep3Fields,
  serializeBaiodfStep3Fields,
  validateBaiodfStep3Completion
} from '../lib/baiodf-step3.js';
import {
  defaultSfcStep1Fields,
  normalizeSfcStep1Fields,
  serializeSfcStep1Fields,
  validateSfcStep1Completion
} from '../lib/statement-of-financial-condition-step1.js';
import {
  defaultSfcStep2Fields,
  normalizeSfcStep2Fields,
  serializeSfcStep2Fields,
  validateSfcStep2Completion
} from '../lib/statement-of-financial-condition-step2.js';
import {
  defaultBaiv506cStep1Fields,
  normalizeBaiv506cStep1Fields,
  serializeBaiv506cStep1Fields,
  validateBaiv506cStep1Completion
} from '../lib/baiv-506c-step1.js';
import {
  defaultBaiv506cStep2Fields,
  normalizeBaiv506cStep2Fields,
  serializeBaiv506cStep2Fields,
  validateBaiv506cStep2Completion
} from '../lib/baiv-506c-step2.js';
import { HttpError } from '../lib/http-error.js';
import { zodFieldErrors } from '../lib/validation.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const INVESTOR_PROFILE_FORM_CODE = 'INVESTOR_PROFILE';
const STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE = 'SFC';
const BAIODF_FORM_CODE = 'BAIODF';
const BAIV_506C_FORM_CODE = 'BAIV_506C';
const FORM_SEQUENCE = [
  INVESTOR_PROFILE_FORM_CODE,
  STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE,
  BAIODF_FORM_CODE,
  BAIV_506C_FORM_CODE
] as const;
const FORM_STEP_COUNT: Record<(typeof FORM_SEQUENCE)[number], number> = {
  [INVESTOR_PROFILE_FORM_CODE]: 7,
  [STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE]: 2,
  [BAIODF_FORM_CODE]: 3,
  [BAIV_506C_FORM_CODE]: 2
};
const SUPPORTED_CLIENT_FORM_CODES = new Set<string>([
  INVESTOR_PROFILE_FORM_CODE,
  STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE,
  BAIODF_FORM_CODE,
  BAIV_506C_FORM_CODE
]);
const phonePattern = /^[+\d()\-.\s]{7,20}$/;

const createClientSchema = z.object({
  clientName: z.string().trim().min(1, 'Client name is required.'),
  clientEmail: z.string().trim().email('Enter a valid client email.'),
  clientPhone: z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const normalized = value.trim();
      return normalized === '' ? undefined : normalized;
    },
    z.string().regex(phonePattern, 'Enter a valid phone number.').optional()
  ),
  additionalBrokers: z
    .array(
      z.object({
        name: z.string().trim().min(1, 'Broker name is required.'),
        email: z.string().trim().email('Enter a valid broker email.')
      })
    )
    .default([]),
  selectedFormCodes: z
    .array(z.string().trim().min(1))
    .default([INVESTOR_PROFILE_FORM_CODE])
});

const clientIdParamsSchema = z.object({
  clientId: z.string().trim().min(1)
});

const investorProfileReviewStepParamsSchema = z.object({
  clientId: z.string().trim().min(1),
  stepNumber: z.coerce.number().int().min(1).max(7)
});

const selectClientFormsSchema = z.object({
  formCodes: z.array(z.string().trim().min(1)).min(1, 'Select at least one form.')
});

const investorProfileStepOnePatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const investorProfileStepTwoPatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const investorProfileStepThreePatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const investorProfileStepFourPatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const investorProfileStepFivePatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const investorProfileStepSixPatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const investorProfileStepSevenPatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const investorProfileReviewStepUpdateSchema = z.object({
  fields: z.unknown()
});

const clientInclude = {
  brokerLinks: {
    include: {
      broker: {
        select: {
          id: true,
          name: true,
          email: true,
          kind: true
        }
      }
    }
  },
  formSelections: {
    include: {
      form: {
        select: {
          id: true,
          code: true,
          title: true
        }
      }
    }
  },
  investorProfileOnboarding: {
    select: {
      status: true,
      step1RrName: true,
      step1RrNo: true,
      step1CustomerNames: true,
      step1AccountNo: true,
      step1AccountType: true,
      step1Data: true,
      step2Data: true,
      step3Data: true,
      step4Data: true,
      step5Data: true,
      step6Data: true,
      step7Data: true
    }
  },
  statementOfFinancialConditionOnboarding: {
    select: {
      status: true,
      step1Data: true,
      step2Data: true
    }
  },
  baiodfOnboarding: {
    select: {
      status: true,
      step1Data: true,
      step2Data: true,
      step3Data: true
    }
  },
  baiv506cOnboarding: {
    select: {
      status: true,
      step1Data: true,
      step2Data: true
    }
  }
} satisfies Prisma.ClientInclude;

type HydratedClient = Prisma.ClientGetPayload<{ include: typeof clientInclude }>;

type StepOneSelectableOnboarding = {
  status: InvestorProfileOnboardingStatus;
  step1RrName: string | null;
  step1RrNo: string | null;
  step1CustomerNames: string | null;
  step1AccountNo: string | null;
  step1AccountType: Prisma.JsonValue | null;
  step1CurrentQuestionIndex: number;
  step1Data: Prisma.JsonValue | null;
};

type StepTwoSelectableOnboarding = {
  status: InvestorProfileOnboardingStatus;
  step2CurrentQuestionIndex: number;
  step2Data: Prisma.JsonValue | null;
};

type StepThreeSelectableOnboarding = {
  status: InvestorProfileOnboardingStatus;
  step1Data: Prisma.JsonValue | null;
  step3CurrentQuestionIndex: number;
  step3Data: Prisma.JsonValue | null;
};

type StepFourSelectableOnboarding = {
  status: InvestorProfileOnboardingStatus;
  step1Data: Prisma.JsonValue | null;
  step4CurrentQuestionIndex: number;
  step4Data: Prisma.JsonValue | null;
};

type StepFiveSelectableOnboarding = {
  status: InvestorProfileOnboardingStatus;
  step1Data: Prisma.JsonValue | null;
  step5CurrentQuestionIndex: number;
  step5Data: Prisma.JsonValue | null;
};

type StepSixSelectableOnboarding = {
  status: InvestorProfileOnboardingStatus;
  step6CurrentQuestionIndex: number;
  step6Data: Prisma.JsonValue | null;
};

type StepSevenSelectableOnboarding = {
  status: InvestorProfileOnboardingStatus;
  step1Data: Prisma.JsonValue | null;
  step3Data: Prisma.JsonValue | null;
  step4Data: Prisma.JsonValue | null;
  step7CurrentQuestionIndex: number;
  step7Data: Prisma.JsonValue | null;
};

const investorProfileReviewSelect = {
  status: true,
  step1RrName: true,
  step1RrNo: true,
  step1CustomerNames: true,
  step1AccountNo: true,
  step1AccountType: true,
  step1CurrentQuestionIndex: true,
  step1Data: true,
  step2CurrentQuestionIndex: true,
  step2Data: true,
  step3CurrentQuestionIndex: true,
  step3Data: true,
  step4CurrentQuestionIndex: true,
  step4Data: true,
  step5CurrentQuestionIndex: true,
  step5Data: true,
  step6CurrentQuestionIndex: true,
  step6Data: true,
  step7CurrentQuestionIndex: true,
  step7Data: true
} satisfies Prisma.InvestorProfileOnboardingSelect;

type InvestorProfileReviewSelectableOnboarding = Prisma.InvestorProfileOnboardingGetPayload<{
  select: typeof investorProfileReviewSelect;
}>;

interface Step1Response {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_1_ACCOUNT_REGISTRATION';
      label: string;
      currentQuestionId: Step1QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Step1QuestionId[];
      fields: Step1Fields;
    };
  };
}

interface Step2Response {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_2_USA_PATRIOT_ACT_INFORMATION';
      label: string;
      currentQuestionId: Step2QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Step2QuestionId[];
      fields: Step2Fields;
    };
  };
}

interface Step3Response {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION';
      label: string;
      currentQuestionId: Step3QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Step3QuestionId[];
      fields: Step3Fields;
      requiresStep4: boolean;
    };
  };
}

interface Step4Response {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_4_SECONDARY_ACCOUNT_HOLDER_INFORMATION';
      label: string;
      currentQuestionId: Step4QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Step4QuestionId[];
      fields: Step4Fields;
    };
  };
}

interface Step5Response {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL';
      label: string;
      currentQuestionId: Step5QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Step5QuestionId[];
      fields: Step5Fields;
      requiresStep4: boolean;
    };
  };
}

interface Step6Response {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_6_TRUSTED_CONTACT';
      label: string;
      currentQuestionId: Step6QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Step6QuestionId[];
      fields: Step6Fields;
    };
  };
}

interface Step7Response {
  onboarding: {
    clientId: string;
    status: InvestorProfileOnboardingStatus;
    step: {
      key: 'STEP_7_SIGNATURES';
      label: string;
      currentQuestionId: Step7QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Step7QuestionId[];
      fields: Step7Fields;
      requiresJointOwnerSignature: boolean;
      nextRouteAfterCompletion: string | null;
    };
  };
}

type WorkspaceOnboardingStatus =
  | InvestorProfileOnboardingStatus
  | StatementOfFinancialConditionOnboardingStatus
  | BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus
  | BrokerageAccreditedInvestorVerificationOnboardingStatus;

interface FormWorkspaceItem {
  code: string;
  title: string;
  selected: boolean;
  onboardingStatus: WorkspaceOnboardingStatus | null;
  resumeRoute: string | null;
  viewRoute: string | null;
  editRoute: string | null;
  totalSteps: number | null;
}

interface FormWorkspaceRecord {
  clientId: string;
  clientName: string;
  forms: FormWorkspaceItem[];
}

interface FormWorkspaceResponse {
  workspace: FormWorkspaceRecord;
}

interface SelectClientFormsResponse {
  addedFormCodes: string[];
  nextOnboardingRoute: string | null;
  workspace: FormWorkspaceRecord;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const PERSON_ACCOUNT_TYPES = new Set<string>([
  'individual',
  'custodial',
  'jointTenant',
  'transferOnDeathIndividual',
  'transferOnDeathJoint'
]);
const STEP4_REQUIRED_ACCOUNT_TYPES = new Set<PrimaryTypeKey>([
  'jointTenant',
  'transferOnDeathJoint',
  'trust',
  'corporation',
  'corporatePensionProfitSharing',
  'limitedLiabilityCompany',
  'individualSingleMemberLlc',
  'partnership',
  'nonprofitOrganization',
  'exemptOrganization',
  'estate'
]);

function inferDefaultHolderKindFromStep1(step1Data: Prisma.JsonValue | null | undefined): 'person' | 'entity' {
  const step1Fields = normalizeStep1Fields(step1Data ?? null);
  const selected = Object.entries(step1Fields.typeOfAccount.primaryType)
    .filter(([, isSelected]) => isSelected)
    .map(([key]) => key);

  if (selected.length !== 1) {
    return 'person';
  }

  return PERSON_ACCOUNT_TYPES.has(selected[0]) ? 'person' : 'entity';
}

function isStep4RequiredFromStep1(step1Data: Prisma.JsonValue | null | undefined): boolean {
  const step1Fields = normalizeStep1Fields(step1Data ?? null);
  const selected = Object.entries(step1Fields.typeOfAccount.primaryType)
    .filter(([, isSelected]) => isSelected)
    .map(([key]) => key as PrimaryTypeKey);

  if (selected.length !== 1) {
    return false;
  }

  return STEP4_REQUIRED_ACCOUNT_TYPES.has(selected[0]);
}

function getStep7ValidationContext(step1Data: Prisma.JsonValue | null | undefined): Step7ValidationContext {
  return {
    requiresJointOwnerSignature: isStep4RequiredFromStep1(step1Data)
  };
}

function applyHolderKindDefault<T extends { holder: { kind: { person: boolean; entity: boolean } } }>(
  fields: T,
  defaultKind: 'person' | 'entity'
): T {
  if (Object.values(fields.holder.kind).some(Boolean)) {
    return fields;
  }

  const next = structuredClone(fields);
  next.holder.kind = {
    person: defaultKind === 'person',
    entity: defaultKind === 'entity'
  };
  return next;
}

function getInvestorProfileResumeStepRoute(client: HydratedClient): string | null {
  if (!client.formSelections.some((selection) => selection.form.code === INVESTOR_PROFILE_FORM_CODE)) {
    return null;
  }

  const onboarding = client.investorProfileOnboarding;
  const base = `/clients/${client.id}/investor-profile`;

  if (!onboarding) {
    return `${base}/step-1`;
  }

  const step1Fields = normalizeStep1Fields(onboarding.step1Data, {
    step1RrName: onboarding.step1RrName,
    step1RrNo: onboarding.step1RrNo,
    step1CustomerNames: onboarding.step1CustomerNames,
    step1AccountNo: onboarding.step1AccountNo,
    step1AccountType: onboarding.step1AccountType
  });

  if (Object.keys(validateStep1Completion(step1Fields)).length > 0) {
    return `${base}/step-1`;
  }

  const step2Fields = normalizeStep2Fields(onboarding.step2Data);
  if (Object.keys(validateStep2Completion(step2Fields)).length > 0) {
    return `${base}/step-2`;
  }

  const step3DefaultKind = inferDefaultHolderKindFromStep1(onboarding.step1Data);
  const step3Fields = applyHolderKindDefault(normalizeStep3Fields(onboarding.step3Data), step3DefaultKind);

  if (Object.keys(validateStep3Completion(step3Fields)).length > 0) {
    return `${base}/step-3`;
  }

  if (isStep4RequiredFromStep1(onboarding.step1Data)) {
    const step4Fields = applyHolderKindDefault(
      normalizeStep4Fields(onboarding.step4Data),
      step3DefaultKind
    );

    if (Object.keys(validateStep4Completion(step4Fields)).length > 0) {
      return `${base}/step-4`;
    }
  }

  const step5Fields = normalizeStep5Fields(onboarding.step5Data);
  if (Object.keys(validateStep5Completion(step5Fields)).length > 0) {
    return `${base}/step-5`;
  }

  const step6Fields = normalizeStep6Fields(onboarding.step6Data);
  if (Object.keys(validateStep6Completion(step6Fields)).length > 0) {
    return `${base}/step-6`;
  }

  const step7Context = getStep7ValidationContext(onboarding.step1Data);
  const step7Fields = normalizeStep7Fields(onboarding.step7Data);
  if (Object.keys(validateStep7Completion(step7Fields, step7Context)).length > 0) {
    return `${base}/step-7`;
  }

  return `${base}/step-7`;
}

function getStatementOfFinancialConditionResumeStepRoute(client: HydratedClient): string | null {
  if (
    !client.formSelections.some(
      (selection) => selection.form.code === STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE
    )
  ) {
    return null;
  }

  const onboarding = client.statementOfFinancialConditionOnboarding;
  const base = `/clients/${client.id}/statement-of-financial-condition`;

  if (!onboarding) {
    return `${base}/step-1`;
  }

  const step1Fields = normalizeSfcStep1Fields(onboarding.step1Data);
  if (Object.keys(validateSfcStep1Completion(step1Fields)).length > 0) {
    return `${base}/step-1`;
  }

  const step2Fields = normalizeSfcStep2Fields(onboarding.step2Data);
  const step2Context = {
    requiresJointOwnerSignature: isStep4RequiredFromStep1(
      client.investorProfileOnboarding?.step1Data ?? null
    )
  };

  if (Object.keys(validateSfcStep2Completion(step2Fields, step2Context)).length > 0) {
    return `${base}/step-2`;
  }

  return `${base}/step-2`;
}

function getBaiodfResumeStepRoute(client: HydratedClient): string | null {
  if (!client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE)) {
    return null;
  }

  const onboarding = client.baiodfOnboarding;
  const base = `/clients/${client.id}/brokerage-alternative-investment-order-disclosure`;

  if (!onboarding) {
    return `${base}/step-1`;
  }

  const step1Fields = normalizeBaiodfStep1Fields(onboarding.step1Data);
  if (Object.keys(validateBaiodfStep1Completion(step1Fields)).length > 0) {
    return `${base}/step-1`;
  }

  const step2Fields = normalizeBaiodfStep2Fields(onboarding.step2Data);
  if (Object.keys(validateBaiodfStep2Completion(step2Fields)).length > 0) {
    return `${base}/step-2`;
  }

  const step3Fields = normalizeBaiodfStep3Fields(onboarding.step3Data);
  if (
    Object.keys(
      validateBaiodfStep3Completion(step3Fields, {
        requiresJointOwnerSignature: isStep4RequiredFromStep1(
          client.investorProfileOnboarding?.step1Data ?? null
        )
      })
    ).length > 0
  ) {
    return `${base}/step-3`;
  }

  return `${base}/step-3`;
}

function getBaiv506cResumeStepRoute(client: HydratedClient): string | null {
  if (!client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE)) {
    return null;
  }

  const onboarding = client.baiv506cOnboarding;
  const base = `/clients/${client.id}/brokerage-accredited-investor-verification`;

  if (!onboarding) {
    return `${base}/step-1`;
  }

  const step1Fields = normalizeBaiv506cStep1Fields(onboarding.step1Data);
  if (Object.keys(validateBaiv506cStep1Completion(step1Fields)).length > 0) {
    return `${base}/step-1`;
  }

  const step2Fields = normalizeBaiv506cStep2Fields(onboarding.step2Data);
  if (
    Object.keys(
      validateBaiv506cStep2Completion(step2Fields, {
        requiresJointOwnerSignature: isStep4RequiredFromStep1(
          client.investorProfileOnboarding?.step1Data ?? null
        )
      })
    ).length > 0
  ) {
    return `${base}/step-2`;
  }

  return `${base}/step-2`;
}

function getNextRouteAfterInvestorProfileCompletion(params: {
  clientId: string;
  hasStatementOfFinancialCondition: boolean;
  statementOfFinancialConditionOnboarding:
    | {
        step1Data: Prisma.JsonValue | null;
        step2Data: Prisma.JsonValue | null;
      }
    | null
    | undefined;
  hasBaiodf: boolean;
  baiodfOnboarding:
    | {
        step1Data: Prisma.JsonValue | null;
        step2Data: Prisma.JsonValue | null;
        step3Data: Prisma.JsonValue | null;
      }
    | null
    | undefined;
  hasBaiv506c: boolean;
  baiv506cOnboarding:
    | {
        step1Data: Prisma.JsonValue | null;
        step2Data: Prisma.JsonValue | null;
      }
    | null
    | undefined;
  requiresJointOwnerSignature: boolean;
}): string | null {
  if (params.hasStatementOfFinancialCondition) {
    const sfcBase = `/clients/${params.clientId}/statement-of-financial-condition`;
    const sfcOnboarding = params.statementOfFinancialConditionOnboarding;

    if (!sfcOnboarding) {
      return `${sfcBase}/step-1`;
    }

    const step1Fields = normalizeSfcStep1Fields(sfcOnboarding.step1Data);
    if (Object.keys(validateSfcStep1Completion(step1Fields)).length > 0) {
      return `${sfcBase}/step-1`;
    }

    const step2Fields = normalizeSfcStep2Fields(sfcOnboarding.step2Data);
    const step2Errors = validateSfcStep2Completion(step2Fields, {
      requiresJointOwnerSignature: params.requiresJointOwnerSignature
    });

    if (Object.keys(step2Errors).length > 0) {
      return `${sfcBase}/step-2`;
    }
  }

  if (params.hasBaiodf) {
    const baiodfBase = `/clients/${params.clientId}/brokerage-alternative-investment-order-disclosure`;
    const baiodfOnboarding = params.baiodfOnboarding;

    if (!baiodfOnboarding) {
      return `${baiodfBase}/step-1`;
    }

    const step1Fields = normalizeBaiodfStep1Fields(baiodfOnboarding.step1Data);
    if (Object.keys(validateBaiodfStep1Completion(step1Fields)).length > 0) {
      return `${baiodfBase}/step-1`;
    }

    const step2Fields = normalizeBaiodfStep2Fields(baiodfOnboarding.step2Data);
    if (Object.keys(validateBaiodfStep2Completion(step2Fields)).length > 0) {
      return `${baiodfBase}/step-2`;
    }

    const step3Fields = normalizeBaiodfStep3Fields(baiodfOnboarding.step3Data);
    if (
      Object.keys(
        validateBaiodfStep3Completion(step3Fields, {
          requiresJointOwnerSignature: params.requiresJointOwnerSignature
        })
      ).length > 0
    ) {
      return `${baiodfBase}/step-3`;
    }
  }

  if (params.hasBaiv506c) {
    const baivBase = `/clients/${params.clientId}/brokerage-accredited-investor-verification`;
    const baivOnboarding = params.baiv506cOnboarding;

    if (!baivOnboarding) {
      return `${baivBase}/step-1`;
    }

    const step1Fields = normalizeBaiv506cStep1Fields(baivOnboarding.step1Data);
    if (Object.keys(validateBaiv506cStep1Completion(step1Fields)).length > 0) {
      return `${baivBase}/step-1`;
    }

    const step2Fields = normalizeBaiv506cStep2Fields(baivOnboarding.step2Data);
    if (
      Object.keys(
        validateBaiv506cStep2Completion(step2Fields, {
          requiresJointOwnerSignature: params.requiresJointOwnerSignature
        })
      ).length > 0
    ) {
      return `${baivBase}/step-2`;
    }
  }

  return null;
}

function getSelectedFormCodes(client: HydratedClient): Set<string> {
  return new Set(client.formSelections.map((selection) => selection.form.code));
}

function getOnboardingStatusForForm(
  client: HydratedClient,
  formCode: string
): WorkspaceOnboardingStatus | null {
  switch (formCode) {
    case INVESTOR_PROFILE_FORM_CODE:
      return client.investorProfileOnboarding?.status ?? InvestorProfileOnboardingStatus.NOT_STARTED;
    case STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE:
      return (
        client.statementOfFinancialConditionOnboarding?.status ??
        StatementOfFinancialConditionOnboardingStatus.NOT_STARTED
      );
    case BAIODF_FORM_CODE:
      return (
        client.baiodfOnboarding?.status ??
        BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.NOT_STARTED
      );
    case BAIV_506C_FORM_CODE:
      return (
        client.baiv506cOnboarding?.status ??
        BrokerageAccreditedInvestorVerificationOnboardingStatus.NOT_STARTED
      );
    default:
      return null;
  }
}

function getResumeRouteForForm(client: HydratedClient, formCode: string): string | null {
  switch (formCode) {
    case INVESTOR_PROFILE_FORM_CODE:
      return getInvestorProfileResumeStepRoute(client);
    case STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE:
      return getStatementOfFinancialConditionResumeStepRoute(client);
    case BAIODF_FORM_CODE:
      return getBaiodfResumeStepRoute(client);
    case BAIV_506C_FORM_CODE:
      return getBaiv506cResumeStepRoute(client);
    default:
      return null;
  }
}

function isOnboardingIncomplete(status: WorkspaceOnboardingStatus | null): boolean {
  if (!status) {
    return false;
  }

  return status !== InvestorProfileOnboardingStatus.COMPLETED;
}

function getNextOnboardingRouteForClient(client: HydratedClient, filterCodes?: Set<string>): string | null {
  const selectedCodes = getSelectedFormCodes(client);

  for (const formCode of FORM_SEQUENCE) {
    if (!selectedCodes.has(formCode)) {
      continue;
    }

    if (filterCodes && !filterCodes.has(formCode)) {
      continue;
    }

    const status = getOnboardingStatusForForm(client, formCode);
    if (!isOnboardingIncomplete(status)) {
      continue;
    }

    const resumeRoute = getResumeRouteForForm(client, formCode);
    if (resumeRoute) {
      return resumeRoute;
    }
  }

  return null;
}

function toFormWorkspaceRecord(client: HydratedClient, activeForms: Array<{ code: string; title: string }>): FormWorkspaceRecord {
  const selectedCodes = getSelectedFormCodes(client);
  const sortedForms = [...activeForms].sort((left, right) => {
    const leftIndex = FORM_SEQUENCE.indexOf(left.code as (typeof FORM_SEQUENCE)[number]);
    const rightIndex = FORM_SEQUENCE.indexOf(right.code as (typeof FORM_SEQUENCE)[number]);

    const normalizedLeft = leftIndex >= 0 ? leftIndex : Number.MAX_SAFE_INTEGER;
    const normalizedRight = rightIndex >= 0 ? rightIndex : Number.MAX_SAFE_INTEGER;

    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }

    return left.title.localeCompare(right.title);
  });

  return {
    clientId: client.id,
    clientName: client.name,
    forms: sortedForms.map((form) => {
      const selected = selectedCodes.has(form.code);
      const status = selected ? getOnboardingStatusForForm(client, form.code) : null;
      const resumeRoute = selected ? getResumeRouteForForm(client, form.code) : null;
      const canRoute = selected && SUPPORTED_CLIENT_FORM_CODES.has(form.code);

      return {
        code: form.code,
        title: form.title,
        selected,
        onboardingStatus: status,
        resumeRoute,
        viewRoute: canRoute ? `/clients/${client.id}/forms/${form.code}/view/step/1` : null,
        editRoute: canRoute ? `/clients/${client.id}/forms/${form.code}/edit/step/1` : null,
        totalSteps: SUPPORTED_CLIENT_FORM_CODES.has(form.code)
          ? FORM_STEP_COUNT[form.code as (typeof FORM_SEQUENCE)[number]]
          : null
      };
    })
  };
}

function toClientDto(client: HydratedClient) {
  const primaryLink = client.brokerLinks.find((item) => item.role === ClientBrokerRole.PRIMARY);
  const hasInvestorProfile = client.formSelections.some(
    (selection) => selection.form.code === INVESTOR_PROFILE_FORM_CODE
  );
  const hasStatementOfFinancialCondition = client.formSelections.some(
    (selection) => selection.form.code === STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE
  );
  const hasBaiodf = client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE);
  const hasBaiv506c = client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE);

  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    createdAt: client.createdAt,
    primaryBroker: primaryLink
      ? {
          id: primaryLink.broker.id,
          name: primaryLink.broker.name,
          email: primaryLink.broker.email
        }
      : null,
    additionalBrokers: client.brokerLinks
      .filter((item) => item.role === ClientBrokerRole.ADDITIONAL)
      .map((item) => ({
        id: item.broker.id,
        name: item.broker.name,
        email: item.broker.email
      })),
    selectedForms: client.formSelections.map((selection) => selection.form),
    hasInvestorProfile,
    investorProfileOnboardingStatus:
      client.investorProfileOnboarding?.status ?? InvestorProfileOnboardingStatus.NOT_STARTED,
    investorProfileResumeStepRoute: hasInvestorProfile ? getInvestorProfileResumeStepRoute(client) : null,
    hasStatementOfFinancialCondition,
    statementOfFinancialConditionOnboardingStatus:
      client.statementOfFinancialConditionOnboarding?.status ??
      StatementOfFinancialConditionOnboardingStatus.NOT_STARTED,
    statementOfFinancialConditionResumeStepRoute: hasStatementOfFinancialCondition
      ? getStatementOfFinancialConditionResumeStepRoute(client)
      : null,
    hasBaiodf,
    baiodfOnboardingStatus:
      client.baiodfOnboarding?.status ??
      BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.NOT_STARTED,
    baiodfResumeStepRoute: hasBaiodf ? getBaiodfResumeStepRoute(client) : null,
    hasBaiv506c,
    baiv506cOnboardingStatus:
      client.baiv506cOnboarding?.status ??
      BrokerageAccreditedInvestorVerificationOnboardingStatus.NOT_STARTED,
    baiv506cResumeStepRoute: hasBaiv506c ? getBaiv506cResumeStepRoute(client) : null
  };
}

function createDefaultOnboardingPayload() {
  const step1Defaults = defaultStep1Fields();
  const step2Defaults = defaultStep2Fields();
  const step3Defaults = defaultStep3Fields();
  const step4Defaults = defaultStep4Fields();
  const step5Defaults = defaultStep5Fields();
  const step6Defaults = defaultStep6Fields();
  const step7Defaults = defaultStep7Fields();

  return {
    step1RrName: step1Defaults.accountRegistration.rrName,
    step1RrNo: step1Defaults.accountRegistration.rrNo,
    step1CustomerNames: step1Defaults.accountRegistration.customerNames,
    step1AccountNo: step1Defaults.accountRegistration.accountNo,
    step1AccountType: step1Defaults.accountRegistration.retailRetirement,
    step1CurrentQuestionIndex: 0,
    step1Data: serializeStep1Fields(step1Defaults),
    step2CurrentQuestionIndex: 0,
    step2Data: serializeStep2Fields(step2Defaults),
    step3CurrentQuestionIndex: 0,
    step3Data: serializeStep3Fields(step3Defaults),
    step4CurrentQuestionIndex: 0,
    step4Data: serializeStep4Fields(step4Defaults),
    step5CurrentQuestionIndex: 0,
    step5Data: serializeStep5Fields(step5Defaults),
    step6CurrentQuestionIndex: 0,
    step6Data: serializeStep6Fields(step6Defaults),
    step7CurrentQuestionIndex: 0,
    step7Data: serializeStep7Fields(step7Defaults)
  } as const;
}

function createDefaultStatementOfFinancialConditionOnboardingPayload() {
  const step1Defaults = defaultSfcStep1Fields();
  const step2Defaults = defaultSfcStep2Fields();

  return {
    step1CurrentQuestionIndex: 0,
    step1Data: serializeSfcStep1Fields(step1Defaults),
    step2CurrentQuestionIndex: 0,
    step2Data: serializeSfcStep2Fields(step2Defaults)
  } as const;
}

function createDefaultBaiodfOnboardingPayload() {
  const step1Defaults = defaultBaiodfStep1Fields();
  const step2Defaults = defaultBaiodfStep2Fields();
  const step3Defaults = defaultBaiodfStep3Fields();

  return {
    step1CurrentQuestionIndex: 0,
    step1Data: serializeBaiodfStep1Fields(step1Defaults),
    step2CurrentQuestionIndex: 0,
    step2Data: serializeBaiodfStep2Fields(step2Defaults),
    step3CurrentQuestionIndex: 0,
    step3Data: serializeBaiodfStep3Fields(step3Defaults)
  } as const;
}

function createDefaultBaiv506cOnboardingPayload() {
  const step1Defaults = defaultBaiv506cStep1Fields();
  const step2Defaults = defaultBaiv506cStep2Fields();

  return {
    step1CurrentQuestionIndex: 0,
    step1Data: serializeBaiv506cStep1Fields(step1Defaults),
    step2CurrentQuestionIndex: 0,
    step2Data: serializeBaiv506cStep2Fields(step2Defaults)
  } as const;
}

function toStepOneResponse(clientId: string, onboarding: StepOneSelectableOnboarding): Step1Response {
  const fields = normalizeStep1Fields(onboarding.step1Data, {
    step1RrName: onboarding.step1RrName,
    step1RrNo: onboarding.step1RrNo,
    step1CustomerNames: onboarding.step1CustomerNames,
    step1AccountNo: onboarding.step1AccountNo,
    step1AccountType: onboarding.step1AccountType
  });

  const visibleQuestionIds = getVisibleStep1QuestionIds(fields);
  const currentQuestionIndex = clampStep1QuestionIndex(onboarding.step1CurrentQuestionIndex, visibleQuestionIds);
  const currentQuestionId = visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'rrName';

  return {
    onboarding: {
      clientId,
      status: onboarding.status,
      step: {
        key: 'STEP_1_ACCOUNT_REGISTRATION',
        label: STEP_1_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields
      }
    }
  };
}

function toStepTwoResponse(clientId: string, onboarding: StepTwoSelectableOnboarding): Step2Response {
  const fields = normalizeStep2Fields(onboarding.step2Data);
  const visibleQuestionIds = [...getStep2QuestionIds()];
  const currentQuestionIndex = clampStep2QuestionIndex(onboarding.step2CurrentQuestionIndex);
  const currentQuestionId = visibleQuestionIds[currentQuestionIndex] ?? 'step2.initialSourceOfFunds';

  return {
    onboarding: {
      clientId,
      status: onboarding.status,
      step: {
        key: 'STEP_2_USA_PATRIOT_ACT_INFORMATION',
        label: STEP_2_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields
      }
    }
  };
}

function toStepThreeResponse(clientId: string, onboarding: StepThreeSelectableOnboarding): Step3Response {
  const defaultKind = inferDefaultHolderKindFromStep1(onboarding.step1Data);
  const fields = applyHolderKindDefault(normalizeStep3Fields(onboarding.step3Data), defaultKind);
  const visibleQuestionIds = getVisibleStep3QuestionIds(fields);
  const currentQuestionIndex = clampStep3QuestionIndex(onboarding.step3CurrentQuestionIndex, visibleQuestionIds);
  const currentQuestionId = visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step3.holder.kind';
  const requiresStep4 = isStep4RequiredFromStep1(onboarding.step1Data);

  return {
    onboarding: {
      clientId,
      status: onboarding.status,
      step: {
        key: 'STEP_3_PRIMARY_ACCOUNT_HOLDER_INFORMATION',
        label: STEP_3_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields,
        requiresStep4
      }
    }
  };
}

function toStepFourResponse(clientId: string, onboarding: StepFourSelectableOnboarding): Step4Response {
  const defaultKind = inferDefaultHolderKindFromStep1(onboarding.step1Data);
  const fields = applyHolderKindDefault(normalizeStep4Fields(onboarding.step4Data), defaultKind);
  const visibleQuestionIds = getVisibleStep4QuestionIds(fields);
  const currentQuestionIndex = clampStep4QuestionIndex(onboarding.step4CurrentQuestionIndex, visibleQuestionIds);
  const currentQuestionId = visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step4.holder.kind';

  return {
    onboarding: {
      clientId,
      status: onboarding.status,
      step: {
        key: 'STEP_4_SECONDARY_ACCOUNT_HOLDER_INFORMATION',
        label: STEP_4_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields
      }
    }
  };
}

function toStepFiveResponse(clientId: string, onboarding: StepFiveSelectableOnboarding): Step5Response {
  const fields = normalizeStep5Fields(onboarding.step5Data);
  const visibleQuestionIds = getVisibleStep5QuestionIds(fields);
  const currentQuestionIndex = clampStep5QuestionIndex(onboarding.step5CurrentQuestionIndex, visibleQuestionIds);
  const currentQuestionId =
    visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step5.profile.riskExposure';
  const requiresStep4 = isStep4RequiredFromStep1(onboarding.step1Data);

  return {
    onboarding: {
      clientId,
      status: onboarding.status,
      step: {
        key: 'STEP_5_OBJECTIVES_AND_INVESTMENT_DETAIL',
        label: STEP_5_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields,
        requiresStep4
      }
    }
  };
}

function toStepSixResponse(clientId: string, onboarding: StepSixSelectableOnboarding): Step6Response {
  const fields = normalizeStep6Fields(onboarding.step6Data);
  const visibleQuestionIds = getVisibleStep6QuestionIds(fields);
  const currentQuestionIndex = clampStep6QuestionIndex(onboarding.step6CurrentQuestionIndex, visibleQuestionIds);
  const currentQuestionId =
    visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step6.trustedContact.decline';

  return {
    onboarding: {
      clientId,
      status: onboarding.status,
      step: {
        key: 'STEP_6_TRUSTED_CONTACT',
        label: STEP_6_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields
      }
    }
  };
}

function toStepSevenResponse(
  clientId: string,
  onboarding: StepSevenSelectableOnboarding,
  advisorName: string,
  nextRouteAfterCompletion: string | null
): Step7Response {
  const context = getStep7ValidationContext(onboarding.step1Data);
  const step3Fields = normalizeStep3Fields(onboarding.step3Data);
  const step4Fields = normalizeStep4Fields(onboarding.step4Data);
  const baseFields = normalizeStep7Fields(onboarding.step7Data);
  const fields = applyStep7Prefill(baseFields, {
    accountOwnerPrintedName: step3Fields.holder.name || null,
    jointAccountOwnerPrintedName: step4Fields.holder.name || null,
    financialProfessionalPrintedName: advisorName,
    requiresJointOwnerSignature: context.requiresJointOwnerSignature
  });
  const visibleQuestionIds = getVisibleStep7QuestionIds();
  const currentQuestionIndex = clampStep7QuestionIndex(onboarding.step7CurrentQuestionIndex, visibleQuestionIds);
  const currentQuestionId =
    visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step7.certifications.acceptances';

  return {
    onboarding: {
      clientId,
      status: onboarding.status,
      step: {
        key: 'STEP_7_SIGNATURES',
        label: STEP_7_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields,
        requiresJointOwnerSignature: context.requiresJointOwnerSignature,
        nextRouteAfterCompletion
      }
    }
  };
}

function mergeFieldErrors(target: Record<string, string>, source: Record<string, string>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = value;
  }
}

function toNullableJsonInput(
  value: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function computeInvestorProfileCompletionStatus(input: {
  step1RrName: string | null | undefined;
  step1RrNo: string | null | undefined;
  step1CustomerNames: string | null | undefined;
  step1AccountNo: string | null | undefined;
  step1AccountType: Prisma.JsonValue | null | undefined;
  step1Data: Prisma.JsonValue | null | undefined;
  step2Data: Prisma.JsonValue | null | undefined;
  step3Data: Prisma.JsonValue | null | undefined;
  step4Data: Prisma.JsonValue | null | undefined;
  step5Data: Prisma.JsonValue | null | undefined;
  step6Data: Prisma.JsonValue | null | undefined;
  step7Data: Prisma.JsonValue | null | undefined;
}): InvestorProfileOnboardingStatus {
  const step1Fields = normalizeStep1Fields(input.step1Data ?? null, {
    step1RrName: input.step1RrName ?? null,
    step1RrNo: input.step1RrNo ?? null,
    step1CustomerNames: input.step1CustomerNames ?? null,
    step1AccountNo: input.step1AccountNo ?? null,
    step1AccountType: input.step1AccountType ?? null
  });
  const step2Fields = normalizeStep2Fields(input.step2Data ?? null);
  const step3DefaultKind = inferDefaultHolderKindFromStep1(input.step1Data ?? null);
  const step3Fields = applyHolderKindDefault(normalizeStep3Fields(input.step3Data ?? null), step3DefaultKind);
  const step4Fields = applyHolderKindDefault(normalizeStep4Fields(input.step4Data ?? null), step3DefaultKind);
  const step5Fields = normalizeStep5Fields(input.step5Data ?? null);
  const step6Fields = normalizeStep6Fields(input.step6Data ?? null);
  const step7Context = getStep7ValidationContext(input.step1Data ?? null);
  const step7Fields = normalizeStep7Fields(input.step7Data ?? null);

  const errors: Record<string, string> = {};
  mergeFieldErrors(errors, validateStep1Completion(step1Fields));
  mergeFieldErrors(errors, validateStep2Completion(step2Fields));
  mergeFieldErrors(errors, validateStep3Completion(step3Fields));
  if (isStep4RequiredFromStep1(input.step1Data ?? null)) {
    mergeFieldErrors(errors, validateStep4Completion(step4Fields));
  }
  mergeFieldErrors(errors, validateStep5Completion(step5Fields));
  mergeFieldErrors(errors, validateStep6Completion(step6Fields));
  mergeFieldErrors(errors, validateStep7Completion(step7Fields, step7Context));

  return Object.keys(errors).length === 0
    ? InvestorProfileOnboardingStatus.COMPLETED
    : InvestorProfileOnboardingStatus.IN_PROGRESS;
}

function withInvestorReviewMeta<T extends object>(payload: T, stepNumber: number): T & {
  review: { stepNumber: number; totalSteps: number };
} {
  return {
    ...payload,
    review: {
      stepNumber,
      totalSteps: 7
    }
  };
}

function toInvestorReviewResponse(
  clientId: string,
  stepNumber: number,
  onboarding: InvestorProfileReviewSelectableOnboarding,
  advisorName: string,
  nextRouteAfterCompletion: string | null
) {
  switch (stepNumber) {
    case 1:
      return withInvestorReviewMeta(
        toStepOneResponse(clientId, {
          status: onboarding.status,
          step1RrName: onboarding.step1RrName,
          step1RrNo: onboarding.step1RrNo,
          step1CustomerNames: onboarding.step1CustomerNames,
          step1AccountNo: onboarding.step1AccountNo,
          step1AccountType: onboarding.step1AccountType,
          step1CurrentQuestionIndex: onboarding.step1CurrentQuestionIndex,
          step1Data: onboarding.step1Data
        }),
        stepNumber
      );
    case 2:
      return withInvestorReviewMeta(
        toStepTwoResponse(clientId, {
          status: onboarding.status,
          step2CurrentQuestionIndex: onboarding.step2CurrentQuestionIndex,
          step2Data: onboarding.step2Data
        }),
        stepNumber
      );
    case 3:
      return withInvestorReviewMeta(
        toStepThreeResponse(clientId, {
          status: onboarding.status,
          step1Data: onboarding.step1Data,
          step3CurrentQuestionIndex: onboarding.step3CurrentQuestionIndex,
          step3Data: onboarding.step3Data
        }),
        stepNumber
      );
    case 4:
      return withInvestorReviewMeta(
        toStepFourResponse(clientId, {
          status: onboarding.status,
          step1Data: onboarding.step1Data,
          step4CurrentQuestionIndex: onboarding.step4CurrentQuestionIndex,
          step4Data: onboarding.step4Data
        }),
        stepNumber
      );
    case 5:
      return withInvestorReviewMeta(
        toStepFiveResponse(clientId, {
          status: onboarding.status,
          step1Data: onboarding.step1Data,
          step5CurrentQuestionIndex: onboarding.step5CurrentQuestionIndex,
          step5Data: onboarding.step5Data
        }),
        stepNumber
      );
    case 6:
      return withInvestorReviewMeta(
        toStepSixResponse(clientId, {
          status: onboarding.status,
          step6CurrentQuestionIndex: onboarding.step6CurrentQuestionIndex,
          step6Data: onboarding.step6Data
        }),
        stepNumber
      );
    case 7:
      return withInvestorReviewMeta(
        toStepSevenResponse(
          clientId,
          {
            status: onboarding.status,
            step1Data: onboarding.step1Data,
            step3Data: onboarding.step3Data,
            step4Data: onboarding.step4Data,
            step7CurrentQuestionIndex: onboarding.step7CurrentQuestionIndex,
            step7Data: onboarding.step7Data
          },
          advisorName,
          nextRouteAfterCompletion
        ),
        stepNumber
      );
    default:
      throw new HttpError(400, 'Invalid review step.');
  }
}

export function createClientsRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  router.get('/', requireAuth(deps), async (request, response, next) => {
    try {
      const clients = await deps.prisma.client.findMany({
        where: {
          ownerUserId: request.authUser!.id
        },
        include: clientInclude,
        orderBy: {
          createdAt: 'desc'
        }
      });

      response.json({ clients: clients.map(toClientDto) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireAuth(deps), async (request, response, next) => {
    const parsed = createClientSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsed.error)
      });
      return;
    }

    const authUser = request.authUser!;
    const clientName = parsed.data.clientName.trim();
    const clientEmail = normalizeEmail(parsed.data.clientEmail);
    const clientPhone = parsed.data.clientPhone?.trim() ?? null;

    const additionalBrokerMap = new Map<string, { name: string; email: string }>();

    for (const broker of parsed.data.additionalBrokers) {
      const email = normalizeEmail(broker.email);

      if (email === authUser.email) {
        continue;
      }

      additionalBrokerMap.set(email, {
        name: broker.name.trim(),
        email
      });
    }

    const selectedFormCodes = [...new Set(parsed.data.selectedFormCodes.map((code) => code.trim().toUpperCase()))];

    if (!selectedFormCodes.includes(INVESTOR_PROFILE_FORM_CODE)) {
      response.status(400).json({
        message: 'Investor Profile must be selected for every client.',
        fieldErrors: {
          selectedFormCodes: 'Investor Profile is required.'
        }
      });
      return;
    }

    const unsupportedFormCodes = selectedFormCodes.filter((code) => !SUPPORTED_CLIENT_FORM_CODES.has(code));

    if (unsupportedFormCodes.length > 0) {
      response.status(400).json({
        message: 'Unsupported form selection.',
        fieldErrors: {
          selectedFormCodes: `Unsupported form code(s): ${unsupportedFormCodes.join(', ')}.`
        }
      });
      return;
    }

    try {
      const selectedForms = await deps.prisma.formCatalog.findMany({
        where: {
          code: {
            in: selectedFormCodes
          },
          active: true
        },
        select: {
          id: true,
          code: true
        }
      });

      if (selectedForms.length !== selectedFormCodes.length) {
        const foundCodes = new Set(selectedForms.map((form) => form.code));
        const missingCodes = selectedFormCodes.filter((code) => !foundCodes.has(code));
        response.status(400).json({
          message: 'Some selected forms are inactive or missing.',
          fieldErrors: {
            selectedFormCodes: `Unavailable form code(s): ${missingCodes.join(', ')}.`
          }
        });
        return;
      }

      const client = await deps.prisma.$transaction(async (transactionClient) => {
        const duplicate = await transactionClient.client.findUnique({
          where: {
            ownerUserId_email: {
              ownerUserId: authUser.id,
              email: clientEmail
            }
          }
        });

        if (duplicate) {
          throw new HttpError(409, 'A client with this email already exists.', {
            clientEmail: 'Client email already exists.'
          });
        }

        let primaryBroker = await transactionClient.broker.findUnique({
          where: {
            ownerUserId_email: {
              ownerUserId: authUser.id,
              email: authUser.email
            }
          }
        });

        if (!primaryBroker) {
          primaryBroker = await transactionClient.broker.create({
            data: {
              ownerUserId: authUser.id,
              name: authUser.name,
              email: authUser.email,
              kind: 'SELF'
            }
          });
        }

        const additionalBrokerIds = new Set<string>();

        for (const broker of additionalBrokerMap.values()) {
          const brokerRecord = await transactionClient.broker.upsert({
            where: {
              ownerUserId_email: {
                ownerUserId: authUser.id,
                email: broker.email
              }
            },
            update: {
              name: broker.name,
              kind: 'EXTERNAL'
            },
            create: {
              ownerUserId: authUser.id,
              name: broker.name,
              email: broker.email,
              kind: 'EXTERNAL'
            }
          });

          if (brokerRecord.id !== primaryBroker.id) {
            additionalBrokerIds.add(brokerRecord.id);
          }
        }

        const createdClient = await transactionClient.client.create({
          data: {
            ownerUserId: authUser.id,
            name: clientName,
            email: clientEmail,
            phone: clientPhone
          }
        });

        const brokerLinks: Array<{ clientId: string; brokerId: string; role: ClientBrokerRole }> = [
          {
            clientId: createdClient.id,
            brokerId: primaryBroker.id,
            role: ClientBrokerRole.PRIMARY
          }
        ];

        for (const brokerId of additionalBrokerIds) {
          brokerLinks.push({
            clientId: createdClient.id,
            brokerId,
            role: ClientBrokerRole.ADDITIONAL
          });
        }

        await transactionClient.clientBroker.createMany({ data: brokerLinks });

        await transactionClient.clientFormSelection.createMany({
          data: selectedForms.map((form) => ({
            clientId: createdClient.id,
            formId: form.id
          }))
        });

        const onboardingDefaults = createDefaultOnboardingPayload();

        await transactionClient.investorProfileOnboarding.create({
          data: {
            clientId: createdClient.id,
            status: InvestorProfileOnboardingStatus.NOT_STARTED,
            ...onboardingDefaults
          }
        });

        if (selectedForms.some((form) => form.code === STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE)) {
          const sfcOnboardingDefaults = createDefaultStatementOfFinancialConditionOnboardingPayload();

          await transactionClient.statementOfFinancialConditionOnboarding.create({
            data: {
              clientId: createdClient.id,
              status: StatementOfFinancialConditionOnboardingStatus.NOT_STARTED,
              ...sfcOnboardingDefaults
            }
          });
        }

        if (selectedForms.some((form) => form.code === BAIODF_FORM_CODE)) {
          const baiodfOnboardingDefaults = createDefaultBaiodfOnboardingPayload();

          await transactionClient.brokerageAlternativeInvestmentOrderDisclosureOnboarding.create({
            data: {
              clientId: createdClient.id,
              status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.NOT_STARTED,
              ...baiodfOnboardingDefaults
            }
          });
        }

        if (selectedForms.some((form) => form.code === BAIV_506C_FORM_CODE)) {
          const baiv506cOnboardingDefaults = createDefaultBaiv506cOnboardingPayload();

          await transactionClient.brokerageAccreditedInvestorVerificationOnboarding.create({
            data: {
              clientId: createdClient.id,
              status: BrokerageAccreditedInvestorVerificationOnboardingStatus.NOT_STARTED,
              ...baiv506cOnboardingDefaults
            }
          });
        }

        const hydratedClient = await transactionClient.client.findUnique({
          where: { id: createdClient.id },
          include: clientInclude
        });

        if (!hydratedClient) {
          throw new HttpError(500, 'Failed to load created client.');
        }

        return hydratedClient;
      });

      response.status(201).json({ client: toClientDto(client) });
    } catch (error) {
      if (error instanceof HttpError) {
        response.status(error.statusCode).json({
          message: error.message,
          fieldErrors: error.fieldErrors
        });
        return;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        response.status(409).json({
          message: 'A client with this email already exists.',
          fieldErrors: { clientEmail: 'Client email already exists.' }
        });
        return;
      }

      next(error);
    }
  });

  router.get('/:clientId/forms/workspace', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const [client, activeForms] = await Promise.all([
        deps.prisma.client.findFirst({
          where: {
            id: clientId,
            ownerUserId: authUser.id
          },
          include: clientInclude
        }),
        deps.prisma.formCatalog.findMany({
          where: {
            active: true
          },
          select: {
            code: true,
            title: true
          }
        })
      ]);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const payload: FormWorkspaceResponse = {
        workspace: toFormWorkspaceRecord(client, activeForms)
      };

      response.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/forms/select', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = selectClientFormsSchema.safeParse(request.body);
    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const requestedCodes = [
      ...new Set(parsedBody.data.formCodes.map((code) => code.trim().toUpperCase()).filter(Boolean))
    ];
    const unsupportedCodes = requestedCodes.filter((code) => !SUPPORTED_CLIENT_FORM_CODES.has(code));

    if (unsupportedCodes.length > 0) {
      response.status(400).json({
        message: 'Unsupported form selection.',
        fieldErrors: {
          formCodes: `Unsupported form code(s): ${unsupportedCodes.join(', ')}.`
        }
      });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const [existingClient, activeRequestedForms] = await Promise.all([
        deps.prisma.client.findFirst({
          where: {
            id: clientId,
            ownerUserId: authUser.id
          },
          include: clientInclude
        }),
        deps.prisma.formCatalog.findMany({
          where: {
            active: true,
            code: {
              in: requestedCodes
            }
          },
          select: {
            id: true,
            code: true
          }
        })
      ]);

      if (!existingClient) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (activeRequestedForms.length !== requestedCodes.length) {
        const availableCodes = new Set(activeRequestedForms.map((form) => form.code));
        const missingCodes = requestedCodes.filter((code) => !availableCodes.has(code));
        response.status(400).json({
          message: 'Some selected forms are inactive or missing.',
          fieldErrors: {
            formCodes: `Unavailable form code(s): ${missingCodes.join(', ')}.`
          }
        });
        return;
      }

      const selectedCodes = getSelectedFormCodes(existingClient);
      const formsToAdd = activeRequestedForms.filter((form) => !selectedCodes.has(form.code));

      if (formsToAdd.length > 0) {
        await deps.prisma.$transaction(async (transactionClient) => {
          await transactionClient.clientFormSelection.createMany({
            data: formsToAdd.map((form) => ({
              clientId,
              formId: form.id
            })),
            skipDuplicates: true
          });

          for (const form of formsToAdd) {
            if (form.code === INVESTOR_PROFILE_FORM_CODE) {
              await transactionClient.investorProfileOnboarding.upsert({
                where: { clientId },
                update: {},
                create: {
                  clientId,
                  status: InvestorProfileOnboardingStatus.NOT_STARTED,
                  ...createDefaultOnboardingPayload()
                }
              });
              continue;
            }

            if (form.code === STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE) {
              await transactionClient.statementOfFinancialConditionOnboarding.upsert({
                where: { clientId },
                update: {},
                create: {
                  clientId,
                  status: StatementOfFinancialConditionOnboardingStatus.NOT_STARTED,
                  ...createDefaultStatementOfFinancialConditionOnboardingPayload()
                }
              });
              continue;
            }

            if (form.code === BAIODF_FORM_CODE) {
              await transactionClient.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert({
                where: { clientId },
                update: {},
                create: {
                  clientId,
                  status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.NOT_STARTED,
                  ...createDefaultBaiodfOnboardingPayload()
                }
              });
              continue;
            }

            if (form.code === BAIV_506C_FORM_CODE) {
              await transactionClient.brokerageAccreditedInvestorVerificationOnboarding.upsert({
                where: { clientId },
                update: {},
                create: {
                  clientId,
                  status: BrokerageAccreditedInvestorVerificationOnboardingStatus.NOT_STARTED,
                  ...createDefaultBaiv506cOnboardingPayload()
                }
              });
            }
          }
        });
      }

      const [hydratedClient, activeForms] = await Promise.all([
        deps.prisma.client.findFirst({
          where: {
            id: clientId,
            ownerUserId: authUser.id
          },
          include: clientInclude
        }),
        deps.prisma.formCatalog.findMany({
          where: { active: true },
          select: {
            code: true,
            title: true
          }
        })
      ]);

      if (!hydratedClient) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const payload: SelectClientFormsResponse = {
        addedFormCodes: formsToAdd.map((form) => form.code),
        nextOnboardingRoute: getNextOnboardingRouteForClient(hydratedClient),
        workspace: toFormWorkspaceRecord(hydratedClient, activeForms)
      };

      response.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/investor-profile/step-1', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: { id: true }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const onboardingDefaults = createDefaultOnboardingPayload();

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.NOT_STARTED,
          ...onboardingDefaults
        },
        select: {
          status: true,
          step1RrName: true,
          step1RrNo: true,
          step1CustomerNames: true,
          step1AccountNo: true,
          step1AccountType: true,
          step1CurrentQuestionIndex: true,
          step1Data: true
        }
      });

      response.json(toStepOneResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/investor-profile/step-1', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = investorProfileStepOnePatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;

    if (!isStep1QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as Step1QuestionId;

    const answerValidation = validateStep1Answer(questionId, parsedBody.data.answer);

    if (!answerValidation.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: answerValidation.fieldErrors
      });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: { id: true }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const existingOnboarding = await deps.prisma.investorProfileOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step1RrName: true,
          step1RrNo: true,
          step1CustomerNames: true,
          step1AccountNo: true,
          step1AccountType: true,
          step1CurrentQuestionIndex: true,
          step1Data: true
        }
      });

      const existingFields = normalizeStep1Fields(existingOnboarding?.step1Data, {
        step1RrName: existingOnboarding?.step1RrName,
        step1RrNo: existingOnboarding?.step1RrNo,
        step1CustomerNames: existingOnboarding?.step1CustomerNames,
        step1AccountNo: existingOnboarding?.step1AccountNo,
        step1AccountType: existingOnboarding?.step1AccountType
      });

      const visibleBefore = getVisibleStep1QuestionIds(existingFields);

      if (!visibleBefore.includes(questionId)) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: {
            questionId: 'This question is not active for the selected account path.'
          }
        });
        return;
      }

      const nextFields = applyStep1Answer(existingFields, questionId, answerValidation.value);

      const visibleAfter = getVisibleStep1QuestionIds(nextFields);
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {
          status: InvestorProfileOnboardingStatus.IN_PROGRESS,
          step1RrName: nextFields.accountRegistration.rrName,
          step1RrNo: nextFields.accountRegistration.rrNo,
          step1CustomerNames: nextFields.accountRegistration.customerNames,
          step1AccountNo: nextFields.accountRegistration.accountNo,
          step1AccountType: nextFields.accountRegistration.retailRetirement,
          step1CurrentQuestionIndex: nextIndex,
          step1Data: serializeStep1Fields(nextFields)
        },
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.IN_PROGRESS,
          step1RrName: nextFields.accountRegistration.rrName,
          step1RrNo: nextFields.accountRegistration.rrNo,
          step1CustomerNames: nextFields.accountRegistration.customerNames,
          step1AccountNo: nextFields.accountRegistration.accountNo,
          step1AccountType: nextFields.accountRegistration.retailRetirement,
          step1CurrentQuestionIndex: nextIndex,
          step1Data: serializeStep1Fields(nextFields)
        },
        select: {
          status: true,
          step1RrName: true,
          step1RrNo: true,
          step1CustomerNames: true,
          step1AccountNo: true,
          step1AccountType: true,
          step1CurrentQuestionIndex: true,
          step1Data: true
        }
      });

      response.json(toStepOneResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/investor-profile/step-2', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: { id: true }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const onboardingDefaults = createDefaultOnboardingPayload();

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.NOT_STARTED,
          ...onboardingDefaults
        },
        select: {
          status: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      response.json(toStepTwoResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/investor-profile/step-2', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = investorProfileStepTwoPatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;

    if (!isStep2QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as Step2QuestionId;
    const answerValidation = validateStep2Answer(questionId, parsedBody.data.answer);

    if (!answerValidation.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: answerValidation.fieldErrors
      });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: { id: true }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const existingOnboarding = await deps.prisma.investorProfileOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      const existingFields = normalizeStep2Fields(existingOnboarding?.step2Data);
      const nextFields = applyStep2Answer(existingFields, questionId, answerValidation.value);
      const nextIndex = clampStep2QuestionIndex(0);

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {
          status: InvestorProfileOnboardingStatus.IN_PROGRESS,
          step2CurrentQuestionIndex: nextIndex,
          step2Data: serializeStep2Fields(nextFields)
        },
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.IN_PROGRESS,
          ...createDefaultOnboardingPayload(),
          step2CurrentQuestionIndex: nextIndex,
          step2Data: serializeStep2Fields(nextFields)
        },
        select: {
          status: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      response.json(toStepTwoResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/investor-profile/step-3', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: {
          id: true,
          formSelections: {
            select: {
              form: {
                select: {
                  code: true
                }
              }
            }
          },
          statementOfFinancialConditionOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          },
          baiodfOnboarding: {
            select: {
              step1Data: true,
              step2Data: true,
              step3Data: true
            }
          },
          baiv506cOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          }
        }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const onboardingDefaults = createDefaultOnboardingPayload();

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.NOT_STARTED,
          ...onboardingDefaults
        },
        select: {
          status: true,
          step1Data: true,
          step3CurrentQuestionIndex: true,
          step3Data: true
        }
      });

      response.json(toStepThreeResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/investor-profile/step-3', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = investorProfileStepThreePatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;

    if (!isStep3QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as Step3QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: {
          id: true,
          formSelections: {
            select: {
              form: {
                select: {
                  code: true
                }
              }
            }
          },
          statementOfFinancialConditionOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          },
          baiodfOnboarding: {
            select: {
              step1Data: true,
              step2Data: true,
              step3Data: true
            }
          },
          baiv506cOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          }
        }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const existingOnboarding = await deps.prisma.investorProfileOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step1Data: true,
          step3CurrentQuestionIndex: true,
          step3Data: true
        }
      });

      const defaultKind = inferDefaultHolderKindFromStep1(existingOnboarding?.step1Data);
      const existingFields = applyHolderKindDefault(
        normalizeStep3Fields(existingOnboarding?.step3Data),
        defaultKind
      );
      const visibleBefore = getVisibleStep3QuestionIds(existingFields);

      if (!visibleBefore.includes(questionId)) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: {
            questionId: 'This question is not active for the selected account path.'
          }
        });
        return;
      }

      const answerValidation = validateStep3Answer(questionId, parsedBody.data.answer, existingFields);

      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applyStep3Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleStep3QuestionIds(nextFields);
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const nextStatus = InvestorProfileOnboardingStatus.IN_PROGRESS;

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {
          status: nextStatus,
          step3CurrentQuestionIndex: nextIndex,
          step3Data: serializeStep3Fields(nextFields)
        },
        create: {
          clientId,
          status: nextStatus,
          ...createDefaultOnboardingPayload(),
          step3CurrentQuestionIndex: nextIndex,
          step3Data: serializeStep3Fields(nextFields)
        },
        select: {
          status: true,
          step1Data: true,
          step3CurrentQuestionIndex: true,
          step3Data: true
        }
      });

      response.json(toStepThreeResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/investor-profile/step-4', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: {
          id: true,
          formSelections: {
            select: {
              form: {
                select: {
                  code: true
                }
              }
            }
          },
          statementOfFinancialConditionOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          },
          baiodfOnboarding: {
            select: {
              step1Data: true,
              step2Data: true,
              step3Data: true
            }
          },
          baiv506cOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          }
        }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const onboardingDefaults = createDefaultOnboardingPayload();

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.NOT_STARTED,
          ...onboardingDefaults
        },
        select: {
          status: true,
          step1Data: true,
          step4CurrentQuestionIndex: true,
          step4Data: true
        }
      });

      if (!isStep4RequiredFromStep1(onboarding.step1Data)) {
        response.status(400).json({
          message: 'Step 4 is not required for the selected account type.'
        });
        return;
      }

      response.json(toStepFourResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/investor-profile/step-4', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = investorProfileStepFourPatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;

    if (!isStep4QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as Step4QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: {
          id: true,
          formSelections: {
            select: {
              form: {
                select: {
                  code: true
                }
              }
            }
          },
          statementOfFinancialConditionOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          },
          baiodfOnboarding: {
            select: {
              step1Data: true,
              step2Data: true,
              step3Data: true
            }
          },
          baiv506cOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          }
        }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const existingOnboarding = await deps.prisma.investorProfileOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step1Data: true,
          step4CurrentQuestionIndex: true,
          step4Data: true
        }
      });

      if (!isStep4RequiredFromStep1(existingOnboarding?.step1Data)) {
        response.status(400).json({
          message: 'Step 4 is not required for the selected account type.'
        });
        return;
      }

      const defaultKind = inferDefaultHolderKindFromStep1(existingOnboarding?.step1Data);
      const existingFields = applyHolderKindDefault(
        normalizeStep4Fields(existingOnboarding?.step4Data),
        defaultKind
      );
      const visibleBefore = getVisibleStep4QuestionIds(existingFields);

      if (!visibleBefore.includes(questionId)) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: {
            questionId: 'This question is not active for the selected account path.'
          }
        });
        return;
      }

      const answerValidation = validateStep4Answer(questionId, parsedBody.data.answer, existingFields);

      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applyStep4Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleStep4QuestionIds(nextFields);
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const nextStatus = InvestorProfileOnboardingStatus.IN_PROGRESS;

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {
          status: nextStatus,
          step4CurrentQuestionIndex: nextIndex,
          step4Data: serializeStep4Fields(nextFields)
        },
        create: {
          clientId,
          status: nextStatus,
          ...createDefaultOnboardingPayload(),
          step4CurrentQuestionIndex: nextIndex,
          step4Data: serializeStep4Fields(nextFields)
        },
        select: {
          status: true,
          step1Data: true,
          step4CurrentQuestionIndex: true,
          step4Data: true
        }
      });

      response.json(toStepFourResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/investor-profile/step-5', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: { id: true }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const onboardingDefaults = createDefaultOnboardingPayload();

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.NOT_STARTED,
          ...onboardingDefaults
        },
        select: {
          status: true,
          step1Data: true,
          step5CurrentQuestionIndex: true,
          step5Data: true
        }
      });

      response.json(toStepFiveResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/investor-profile/step-5', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = investorProfileStepFivePatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;

    if (!isStep5QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as Step5QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: { id: true }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const existingOnboarding = await deps.prisma.investorProfileOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step1Data: true,
          step5CurrentQuestionIndex: true,
          step5Data: true
        }
      });

      const existingFields = normalizeStep5Fields(existingOnboarding?.step5Data);
      const visibleBefore = getVisibleStep5QuestionIds(existingFields);

      if (!visibleBefore.includes(questionId)) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: {
            questionId: 'This question is not active for the selected account path.'
          }
        });
        return;
      }

      const answerValidation = validateStep5Answer(questionId, parsedBody.data.answer);

      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applyStep5Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleStep5QuestionIds(nextFields);
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const nextStatus = InvestorProfileOnboardingStatus.IN_PROGRESS;

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {
          status: nextStatus,
          step5CurrentQuestionIndex: nextIndex,
          step5Data: serializeStep5Fields(nextFields)
        },
        create: {
          clientId,
          status: nextStatus,
          ...createDefaultOnboardingPayload(),
          step5CurrentQuestionIndex: nextIndex,
          step5Data: serializeStep5Fields(nextFields)
        },
        select: {
          status: true,
          step1Data: true,
          step5CurrentQuestionIndex: true,
          step5Data: true
        }
      });

      response.json(toStepFiveResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/investor-profile/step-6', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: { id: true }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const onboardingDefaults = createDefaultOnboardingPayload();

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.NOT_STARTED,
          ...onboardingDefaults
        },
        select: {
          status: true,
          step6CurrentQuestionIndex: true,
          step6Data: true
        }
      });

      response.json(toStepSixResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/investor-profile/step-6', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = investorProfileStepSixPatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;

    if (!isStep6QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as Step6QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: { id: true }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const existingOnboarding = await deps.prisma.investorProfileOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step6CurrentQuestionIndex: true,
          step6Data: true
        }
      });

      const existingFields = normalizeStep6Fields(existingOnboarding?.step6Data);
      const visibleBefore = getVisibleStep6QuestionIds(existingFields);

      if (!visibleBefore.includes(questionId)) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: {
            questionId: 'This question is not active for the selected account path.'
          }
        });
        return;
      }

      const answerValidation = validateStep6Answer(questionId, parsedBody.data.answer);

      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applyStep6Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleStep6QuestionIds(nextFields);
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const nextStatus = InvestorProfileOnboardingStatus.IN_PROGRESS;

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {
          status: nextStatus,
          step6CurrentQuestionIndex: nextIndex,
          step6Data: serializeStep6Fields(nextFields)
        },
        create: {
          clientId,
          status: nextStatus,
          ...createDefaultOnboardingPayload(),
          step6CurrentQuestionIndex: nextIndex,
          step6Data: serializeStep6Fields(nextFields)
        },
        select: {
          status: true,
          step6CurrentQuestionIndex: true,
          step6Data: true
        }
      });

      response.json(toStepSixResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/investor-profile/step-7', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: {
          id: true,
          formSelections: {
            select: {
              form: {
                select: {
                  code: true
                }
              }
            }
          },
          statementOfFinancialConditionOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          },
          baiodfOnboarding: {
            select: {
              step1Data: true,
              step2Data: true,
              step3Data: true
            }
          },
          baiv506cOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          }
        }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const onboardingDefaults = createDefaultOnboardingPayload();

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.NOT_STARTED,
          ...onboardingDefaults
        },
        select: {
          status: true,
          step1Data: true,
          step3Data: true,
          step4Data: true,
          step7CurrentQuestionIndex: true,
          step7Data: true
        }
      });
      const nextRouteAfterCompletion =
        onboarding.status === InvestorProfileOnboardingStatus.COMPLETED
          ? getNextRouteAfterInvestorProfileCompletion({
              clientId,
              hasStatementOfFinancialCondition: client.formSelections.some(
                (selection) => selection.form.code === STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE
              ),
              statementOfFinancialConditionOnboarding: client.statementOfFinancialConditionOnboarding,
              hasBaiodf: client.formSelections.some(
                (selection) => selection.form.code === BAIODF_FORM_CODE
              ),
              baiodfOnboarding: client.baiodfOnboarding,
              hasBaiv506c: client.formSelections.some(
                (selection) => selection.form.code === BAIV_506C_FORM_CODE
              ),
              baiv506cOnboarding: client.baiv506cOnboarding,
              requiresJointOwnerSignature: isStep4RequiredFromStep1(onboarding.step1Data)
            })
          : null;

      response.json(toStepSevenResponse(clientId, onboarding, authUser.name, nextRouteAfterCompletion));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/investor-profile/step-7', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = investorProfileStepSevenPatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;

    if (!isStep7QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as Step7QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId,
          ownerUserId: authUser.id
        },
        select: {
          id: true,
          formSelections: {
            select: {
              form: {
                select: {
                  code: true
                }
              }
            }
          },
          statementOfFinancialConditionOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          },
          baiodfOnboarding: {
            select: {
              step1Data: true,
              step2Data: true,
              step3Data: true
            }
          },
          baiv506cOnboarding: {
            select: {
              step1Data: true,
              step2Data: true
            }
          }
        }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      const existingOnboarding = await deps.prisma.investorProfileOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step1RrName: true,
          step1RrNo: true,
          step1CustomerNames: true,
          step1AccountNo: true,
          step1AccountType: true,
          step1Data: true,
          step2Data: true,
          step3Data: true,
          step4Data: true,
          step5Data: true,
          step6Data: true,
          step7CurrentQuestionIndex: true,
          step7Data: true
        }
      });

      const context = getStep7ValidationContext(existingOnboarding?.step1Data);
      const existingFields = normalizeStep7Fields(existingOnboarding?.step7Data);
      const visibleBefore = getVisibleStep7QuestionIds();

      if (!visibleBefore.includes(questionId)) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: {
            questionId: 'This question is not active for the selected account path.'
          }
        });
        return;
      }

      const answerValidation = validateStep7Answer(questionId, parsedBody.data.answer, context);

      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applyStep7Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleStep7QuestionIds();
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));

      const step7CompletionErrors = validateStep7Completion(nextFields, context);
      const step1Fields = normalizeStep1Fields(existingOnboarding?.step1Data, {
        step1RrName: existingOnboarding?.step1RrName,
        step1RrNo: existingOnboarding?.step1RrNo,
        step1CustomerNames: existingOnboarding?.step1CustomerNames,
        step1AccountNo: existingOnboarding?.step1AccountNo,
        step1AccountType: existingOnboarding?.step1AccountType
      });
      const step2Fields = normalizeStep2Fields(existingOnboarding?.step2Data);
      const step3DefaultKind = inferDefaultHolderKindFromStep1(existingOnboarding?.step1Data);
      const step3Fields = applyHolderKindDefault(
        normalizeStep3Fields(existingOnboarding?.step3Data),
        step3DefaultKind
      );
      const step4Fields = applyHolderKindDefault(
        normalizeStep4Fields(existingOnboarding?.step4Data),
        step3DefaultKind
      );
      const step5Fields = normalizeStep5Fields(existingOnboarding?.step5Data);
      const step6Fields = normalizeStep6Fields(existingOnboarding?.step6Data);

      const priorCompletionErrors: Record<string, string> = {};
      Object.assign(priorCompletionErrors, validateStep1Completion(step1Fields));
      Object.assign(priorCompletionErrors, validateStep2Completion(step2Fields));
      Object.assign(priorCompletionErrors, validateStep3Completion(step3Fields));
      if (isStep4RequiredFromStep1(existingOnboarding?.step1Data)) {
        Object.assign(priorCompletionErrors, validateStep4Completion(step4Fields));
      }
      Object.assign(priorCompletionErrors, validateStep5Completion(step5Fields));
      Object.assign(priorCompletionErrors, validateStep6Completion(step6Fields));

      const nextStatus =
        Object.keys(step7CompletionErrors).length === 0 && Object.keys(priorCompletionErrors).length === 0
          ? InvestorProfileOnboardingStatus.COMPLETED
          : InvestorProfileOnboardingStatus.IN_PROGRESS;

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {
          status: nextStatus,
          step7CurrentQuestionIndex: nextIndex,
          step7Data: serializeStep7Fields(nextFields)
        },
        create: {
          clientId,
          status: nextStatus,
          ...createDefaultOnboardingPayload(),
          step7CurrentQuestionIndex: nextIndex,
          step7Data: serializeStep7Fields(nextFields)
        },
        select: {
          status: true,
          step1Data: true,
          step3Data: true,
          step4Data: true,
          step7CurrentQuestionIndex: true,
          step7Data: true
        }
      });
      const nextRouteAfterCompletion =
        nextStatus === InvestorProfileOnboardingStatus.COMPLETED
          ? getNextRouteAfterInvestorProfileCompletion({
              clientId,
              hasStatementOfFinancialCondition: client.formSelections.some(
                (selection) => selection.form.code === STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE
              ),
              statementOfFinancialConditionOnboarding: client.statementOfFinancialConditionOnboarding,
              hasBaiodf: client.formSelections.some(
                (selection) => selection.form.code === BAIODF_FORM_CODE
              ),
              baiodfOnboarding: client.baiodfOnboarding,
              hasBaiv506c: client.formSelections.some(
                (selection) => selection.form.code === BAIV_506C_FORM_CODE
              ),
              baiv506cOnboarding: client.baiv506cOnboarding,
              requiresJointOwnerSignature: isStep4RequiredFromStep1(existingOnboarding?.step1Data)
            })
          : null;

      response.json(toStepSevenResponse(clientId, onboarding, authUser.name, nextRouteAfterCompletion));
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/:clientId/investor-profile/review/step-:stepNumber',
    requireAuth(deps),
    async (request, response, next) => {
      const parsedParams = investorProfileReviewStepParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        response.status(400).json({ message: 'Invalid review step request.' });
        return;
      }

      const authUser = request.authUser!;
      const { clientId, stepNumber } = parsedParams.data;

      try {
        const client = await deps.prisma.client.findFirst({
          where: {
            id: clientId,
            ownerUserId: authUser.id
          },
          select: {
            id: true,
            formSelections: {
              select: {
                form: {
                  select: {
                    code: true
                  }
                }
              }
            },
            statementOfFinancialConditionOnboarding: {
              select: {
                step1Data: true,
                step2Data: true
              }
            },
            baiodfOnboarding: {
              select: {
                step1Data: true,
                step2Data: true,
                step3Data: true
              }
            },
            baiv506cOnboarding: {
              select: {
                step1Data: true,
                step2Data: true
              }
            }
          }
        });

        if (!client) {
          response.status(404).json({ message: 'Client not found.' });
          return;
        }

        if (!client.formSelections.some((selection) => selection.form.code === INVESTOR_PROFILE_FORM_CODE)) {
          response.status(400).json({
            message: 'Investor Profile is not selected for this client.'
          });
          return;
        }

        const onboardingDefaults = createDefaultOnboardingPayload();
        const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
          where: { clientId },
          update: {},
          create: {
            clientId,
            status: InvestorProfileOnboardingStatus.NOT_STARTED,
            ...onboardingDefaults
          },
          select: investorProfileReviewSelect
        });

        const nextRouteAfterCompletion =
          onboarding.status === InvestorProfileOnboardingStatus.COMPLETED
            ? getNextRouteAfterInvestorProfileCompletion({
                clientId,
                hasStatementOfFinancialCondition: client.formSelections.some(
                  (selection) => selection.form.code === STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE
                ),
                statementOfFinancialConditionOnboarding: client.statementOfFinancialConditionOnboarding,
                hasBaiodf: client.formSelections.some(
                  (selection) => selection.form.code === BAIODF_FORM_CODE
                ),
                baiodfOnboarding: client.baiodfOnboarding,
                hasBaiv506c: client.formSelections.some(
                  (selection) => selection.form.code === BAIV_506C_FORM_CODE
                ),
                baiv506cOnboarding: client.baiv506cOnboarding,
                requiresJointOwnerSignature: isStep4RequiredFromStep1(onboarding.step1Data)
              })
            : null;

        response.json(
          toInvestorReviewResponse(clientId, stepNumber, onboarding, authUser.name, nextRouteAfterCompletion)
        );
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/:clientId/investor-profile/review/step-:stepNumber',
    requireAuth(deps),
    async (request, response, next) => {
      const parsedParams = investorProfileReviewStepParamsSchema.safeParse(request.params);

      if (!parsedParams.success) {
        response.status(400).json({ message: 'Invalid review step request.' });
        return;
      }

      const parsedBody = investorProfileReviewStepUpdateSchema.safeParse(request.body);
      if (!parsedBody.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: zodFieldErrors(parsedBody.error)
        });
        return;
      }

      const authUser = request.authUser!;
      const { clientId, stepNumber } = parsedParams.data;

      try {
        const client = await deps.prisma.client.findFirst({
          where: {
            id: clientId,
            ownerUserId: authUser.id
          },
          select: {
            id: true,
            formSelections: {
              select: {
                form: {
                  select: {
                    code: true
                  }
                }
              }
            },
            statementOfFinancialConditionOnboarding: {
              select: {
                step1Data: true,
                step2Data: true
              }
            },
            baiodfOnboarding: {
              select: {
                step1Data: true,
                step2Data: true,
                step3Data: true
              }
            },
            baiv506cOnboarding: {
              select: {
                step1Data: true,
                step2Data: true
              }
            }
          }
        });

        if (!client) {
          response.status(404).json({ message: 'Client not found.' });
          return;
        }

        if (!client.formSelections.some((selection) => selection.form.code === INVESTOR_PROFILE_FORM_CODE)) {
          response.status(400).json({
            message: 'Investor Profile is not selected for this client.'
          });
          return;
        }

        const defaults = createDefaultOnboardingPayload();
        const existing = await deps.prisma.investorProfileOnboarding.findUnique({
          where: { clientId },
          select: investorProfileReviewSelect
        });

        const currentStep1Data = (existing?.step1Data ?? defaults.step1Data) as Prisma.JsonValue | null;
        const currentStep2Data = (existing?.step2Data ?? defaults.step2Data) as Prisma.JsonValue | null;
        const currentStep3Data = (existing?.step3Data ?? defaults.step3Data) as Prisma.JsonValue | null;
        const currentStep4Data = (existing?.step4Data ?? defaults.step4Data) as Prisma.JsonValue | null;
        const currentStep5Data = (existing?.step5Data ?? defaults.step5Data) as Prisma.JsonValue | null;
        const currentStep6Data = (existing?.step6Data ?? defaults.step6Data) as Prisma.JsonValue | null;
        const currentStep7Data = (existing?.step7Data ?? defaults.step7Data) as Prisma.JsonValue | null;

        const currentStep1RrName = existing?.step1RrName ?? defaults.step1RrName;
        const currentStep1RrNo = existing?.step1RrNo ?? defaults.step1RrNo;
        const currentStep1CustomerNames = existing?.step1CustomerNames ?? defaults.step1CustomerNames;
        const currentStep1AccountNo = existing?.step1AccountNo ?? defaults.step1AccountNo;
        const currentStep1AccountType = existing?.step1AccountType ?? defaults.step1AccountType;

        let nextStep1Data = currentStep1Data;
        let nextStep2Data = currentStep2Data;
        let nextStep3Data = currentStep3Data;
        let nextStep4Data = currentStep4Data;
        let nextStep5Data = currentStep5Data;
        let nextStep6Data = currentStep6Data;
        let nextStep7Data = currentStep7Data;

        let nextStep1RrName = currentStep1RrName;
        let nextStep1RrNo = currentStep1RrNo;
        let nextStep1CustomerNames = currentStep1CustomerNames;
        let nextStep1AccountNo = currentStep1AccountNo;
        let nextStep1AccountType = currentStep1AccountType;

        let stepFieldErrors: Record<string, string> = {};

        if (stepNumber === 1) {
          const fields = normalizeStep1Fields(parsedBody.data.fields as Prisma.JsonValue, {
            step1RrName: currentStep1RrName,
            step1RrNo: currentStep1RrNo,
            step1CustomerNames: currentStep1CustomerNames,
            step1AccountNo: currentStep1AccountNo,
            step1AccountType: currentStep1AccountType
          });
          stepFieldErrors = validateStep1Completion(fields);

          nextStep1RrName = fields.accountRegistration.rrName;
          nextStep1RrNo = fields.accountRegistration.rrNo;
          nextStep1CustomerNames = fields.accountRegistration.customerNames;
          nextStep1AccountNo = fields.accountRegistration.accountNo;
          nextStep1AccountType = fields.accountRegistration.retailRetirement;
          nextStep1Data = serializeStep1Fields(fields) as Prisma.JsonValue;
        } else if (stepNumber === 2) {
          const fields = normalizeStep2Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateStep2Completion(fields);
          nextStep2Data = serializeStep2Fields(fields) as Prisma.JsonValue;
        } else if (stepNumber === 3) {
          const defaultKind = inferDefaultHolderKindFromStep1(nextStep1Data);
          const fields = applyHolderKindDefault(
            normalizeStep3Fields(parsedBody.data.fields as Prisma.JsonValue),
            defaultKind
          );
          stepFieldErrors = validateStep3Completion(fields);
          nextStep3Data = serializeStep3Fields(fields) as Prisma.JsonValue;
        } else if (stepNumber === 4) {
          const defaultKind = inferDefaultHolderKindFromStep1(nextStep1Data);
          const fields = applyHolderKindDefault(
            normalizeStep4Fields(parsedBody.data.fields as Prisma.JsonValue),
            defaultKind
          );
          stepFieldErrors = isStep4RequiredFromStep1(nextStep1Data) ? validateStep4Completion(fields) : {};
          nextStep4Data = serializeStep4Fields(fields) as Prisma.JsonValue;
        } else if (stepNumber === 5) {
          const fields = normalizeStep5Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateStep5Completion(fields);
          nextStep5Data = serializeStep5Fields(fields) as Prisma.JsonValue;
        } else if (stepNumber === 6) {
          const fields = normalizeStep6Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateStep6Completion(fields);
          nextStep6Data = serializeStep6Fields(fields) as Prisma.JsonValue;
        } else if (stepNumber === 7) {
          const context = getStep7ValidationContext(nextStep1Data);
          const fields = normalizeStep7Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateStep7Completion(fields, context);
          nextStep7Data = serializeStep7Fields(fields) as Prisma.JsonValue;
        }

        if (Object.keys(stepFieldErrors).length > 0) {
          response.status(400).json({
            message: 'Please correct the highlighted fields.',
            fieldErrors: stepFieldErrors
          });
          return;
        }

        const nextStatus = computeInvestorProfileCompletionStatus({
          step1RrName: nextStep1RrName,
          step1RrNo: nextStep1RrNo,
          step1CustomerNames: nextStep1CustomerNames,
          step1AccountNo: nextStep1AccountNo,
          step1AccountType: nextStep1AccountType,
          step1Data: nextStep1Data,
          step2Data: nextStep2Data,
          step3Data: nextStep3Data,
          step4Data: nextStep4Data,
          step5Data: nextStep5Data,
          step6Data: nextStep6Data,
          step7Data: nextStep7Data
        });

        const updateData: Prisma.InvestorProfileOnboardingUpdateInput = {
          status: nextStatus
        };
        const createData: Prisma.InvestorProfileOnboardingCreateInput = {
          client: { connect: { id: clientId } },
          status: nextStatus,
          ...defaults,
          step1Data: toNullableJsonInput(defaults.step1Data) ?? Prisma.JsonNull,
          step2Data: toNullableJsonInput(defaults.step2Data) ?? Prisma.JsonNull,
          step3Data: toNullableJsonInput(defaults.step3Data) ?? Prisma.JsonNull,
          step4Data: toNullableJsonInput(defaults.step4Data) ?? Prisma.JsonNull,
          step5Data: toNullableJsonInput(defaults.step5Data) ?? Prisma.JsonNull,
          step6Data: toNullableJsonInput(defaults.step6Data) ?? Prisma.JsonNull,
          step7Data: toNullableJsonInput(defaults.step7Data) ?? Prisma.JsonNull,
          step1AccountType: toNullableJsonInput(defaults.step1AccountType) ?? Prisma.JsonNull
        };

        if (stepNumber === 1) {
          Object.assign(updateData, {
            step1RrName: nextStep1RrName,
            step1RrNo: nextStep1RrNo,
            step1CustomerNames: nextStep1CustomerNames,
            step1AccountNo: nextStep1AccountNo,
            step1AccountType: toNullableJsonInput(nextStep1AccountType),
            step1Data: toNullableJsonInput(nextStep1Data)
          });
          Object.assign(createData, {
            step1RrName: nextStep1RrName,
            step1RrNo: nextStep1RrNo,
            step1CustomerNames: nextStep1CustomerNames,
            step1AccountNo: nextStep1AccountNo,
            step1AccountType: toNullableJsonInput(nextStep1AccountType) ?? Prisma.JsonNull,
            step1Data: toNullableJsonInput(nextStep1Data) ?? Prisma.JsonNull
          });
        } else if (stepNumber === 2) {
          Object.assign(updateData, { step2Data: toNullableJsonInput(nextStep2Data) });
          Object.assign(createData, { step2Data: toNullableJsonInput(nextStep2Data) ?? Prisma.JsonNull });
        } else if (stepNumber === 3) {
          Object.assign(updateData, { step3Data: toNullableJsonInput(nextStep3Data) });
          Object.assign(createData, { step3Data: toNullableJsonInput(nextStep3Data) ?? Prisma.JsonNull });
        } else if (stepNumber === 4) {
          Object.assign(updateData, { step4Data: toNullableJsonInput(nextStep4Data) });
          Object.assign(createData, { step4Data: toNullableJsonInput(nextStep4Data) ?? Prisma.JsonNull });
        } else if (stepNumber === 5) {
          Object.assign(updateData, { step5Data: toNullableJsonInput(nextStep5Data) });
          Object.assign(createData, { step5Data: toNullableJsonInput(nextStep5Data) ?? Prisma.JsonNull });
        } else if (stepNumber === 6) {
          Object.assign(updateData, { step6Data: toNullableJsonInput(nextStep6Data) });
          Object.assign(createData, { step6Data: toNullableJsonInput(nextStep6Data) ?? Prisma.JsonNull });
        } else if (stepNumber === 7) {
          Object.assign(updateData, { step7Data: toNullableJsonInput(nextStep7Data) });
          Object.assign(createData, { step7Data: toNullableJsonInput(nextStep7Data) ?? Prisma.JsonNull });
        }

        const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
          where: { clientId },
          update: updateData,
          create: createData,
          select: investorProfileReviewSelect
        });

        const nextRouteAfterCompletion =
          onboarding.status === InvestorProfileOnboardingStatus.COMPLETED
            ? getNextRouteAfterInvestorProfileCompletion({
                clientId,
                hasStatementOfFinancialCondition: client.formSelections.some(
                  (selection) => selection.form.code === STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE
                ),
                statementOfFinancialConditionOnboarding: client.statementOfFinancialConditionOnboarding,
                hasBaiodf: client.formSelections.some(
                  (selection) => selection.form.code === BAIODF_FORM_CODE
                ),
                baiodfOnboarding: client.baiodfOnboarding,
                hasBaiv506c: client.formSelections.some(
                  (selection) => selection.form.code === BAIV_506C_FORM_CODE
                ),
                baiv506cOnboarding: client.baiv506cOnboarding,
                requiresJointOwnerSignature: isStep4RequiredFromStep1(onboarding.step1Data)
              })
            : null;

        response.json(
          toInvestorReviewResponse(clientId, stepNumber, onboarding, authUser.name, nextRouteAfterCompletion)
        );
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
