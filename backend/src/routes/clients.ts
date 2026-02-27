import { ClientBrokerRole, InvestorProfileOnboardingStatus, Prisma } from '@prisma/client';
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
import { HttpError } from '../lib/http-error.js';
import { zodFieldErrors } from '../lib/validation.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const INVESTOR_PROFILE_FORM_CODE = 'INVESTOR_PROFILE';
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
    .default([])
});

const clientIdParamsSchema = z.object({
  clientId: z.string().trim().min(1)
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
    };
  };
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

function toClientDto(client: HydratedClient) {
  const primaryLink = client.brokerLinks.find((item) => item.role === ClientBrokerRole.PRIMARY);
  const hasInvestorProfile = client.formSelections.some(
    (selection) => selection.form.code === INVESTOR_PROFILE_FORM_CODE
  );

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
    investorProfileResumeStepRoute: hasInvestorProfile ? getInvestorProfileResumeStepRoute(client) : null
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
  advisorName: string
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
        requiresJointOwnerSignature: context.requiresJointOwnerSignature
      }
    }
  };
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

    try {
      const investorProfileForm = await deps.prisma.formCatalog.findFirst({
        where: {
          code: INVESTOR_PROFILE_FORM_CODE,
          active: true
        },
        select: { id: true }
      });

      if (!investorProfileForm) {
        response.status(500).json({
          message: 'Investor Profile form is not configured. Please seed forms first.'
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

        await transactionClient.clientFormSelection.create({
          data: {
            clientId: createdClient.id,
            formId: investorProfileForm.id
          }
        });

        const onboardingDefaults = createDefaultOnboardingPayload();

        await transactionClient.investorProfileOnboarding.create({
          data: {
            clientId: createdClient.id,
            status: InvestorProfileOnboardingStatus.NOT_STARTED,
            ...onboardingDefaults
          }
        });

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
          step3Data: true,
          step4Data: true,
          step7CurrentQuestionIndex: true,
          step7Data: true
        }
      });

      response.json(toStepSevenResponse(clientId, onboarding, authUser.name));
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

      response.json(toStepSevenResponse(clientId, onboarding, authUser.name));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
