import {
  type InvestorProfileOnboardingStatus,
  Prisma,
  BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus
} from '@prisma/client';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import {
  BAIODF_STEP_1_LABEL,
  applyBaiodfStep1Answer,
  applyBaiodfStep1Prefill,
  clampBaiodfStep1QuestionIndex,
  defaultBaiodfStep1Fields,
  getVisibleBaiodfStep1QuestionIds,
  isBaiodfStep1QuestionId,
  normalizeBaiodfStep1Fields,
  serializeBaiodfStep1Fields,
  validateBaiodfStep1Answer,
  validateBaiodfStep1Completion,
  type BaiodfStep1Fields,
  type BaiodfStep1QuestionId
} from '../lib/baiodf-step1.js';
import {
  BAIODF_STEP_2_LABEL,
  applyBaiodfStep2Answer,
  applyBaiodfStep2Prefill,
  clampBaiodfStep2QuestionIndex,
  defaultBaiodfStep2Fields,
  getBaiodfStep2Concentrations,
  getVisibleBaiodfStep2QuestionIds,
  isBaiodfStep2QuestionId,
  normalizeBaiodfStep2Fields,
  serializeBaiodfStep2Fields,
  validateBaiodfStep2Answer,
  validateBaiodfStep2Completion,
  type BaiodfStep2Concentrations,
  type BaiodfStep2Fields,
  type BaiodfStep2QuestionId
} from '../lib/baiodf-step2.js';
import {
  BAIODF_STEP_3_LABEL,
  applyBaiodfStep3Answer,
  applyBaiodfStep3Prefill,
  clampBaiodfStep3QuestionIndex,
  defaultBaiodfStep3Fields,
  getVisibleBaiodfStep3QuestionIds,
  isBaiodfStep3QuestionId,
  normalizeBaiodfStep3Fields,
  serializeBaiodfStep3Fields,
  validateBaiodfStep3Answer,
  validateBaiodfStep3Completion,
  type BaiodfStep3Fields,
  type BaiodfStep3QuestionId
} from '../lib/baiodf-step3.js';
import {
  normalizeBaiv506cStep1Fields,
  validateBaiv506cStep1Completion
} from '../lib/baiv-506c-step1.js';
import {
  normalizeBaiv506cStep2Fields,
  validateBaiv506cStep2Completion
} from '../lib/baiv-506c-step2.js';
import {
  getSfcStep1Totals,
  normalizeSfcStep1Fields
} from '../lib/statement-of-financial-condition-step1.js';
import { normalizeSfcStep2Fields } from '../lib/statement-of-financial-condition-step2.js';
import {
  normalizeStep1Fields,
  type PrimaryTypeKey
} from '../lib/investor-profile-step1.js';
import { normalizeStep7Fields } from '../lib/investor-profile-step7.js';
import { zodFieldErrors } from '../lib/validation.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const BAIODF_FORM_CODE = 'BAIODF';
const BAIV_506C_FORM_CODE = 'BAIV_506C';

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

const clientIdParamsSchema = z.object({
  clientId: z.string().trim().min(1)
});

const baiodfReviewStepParamsSchema = z.object({
  clientId: z.string().trim().min(1),
  stepNumber: z.coerce.number().int().min(1).max(3)
});

const baiodfStepOnePatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const baiodfStepTwoPatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const baiodfStepThreePatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const baiodfReviewStepUpdateSchema = z.object({
  fields: z.unknown()
});

interface BaiodfStep1Response {
  onboarding: {
    clientId: string;
    status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus;
    step: {
      key: 'STEP_1_CUSTOMER_ACCOUNT_INFORMATION';
      label: string;
      currentQuestionId: BaiodfStep1QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: BaiodfStep1QuestionId[];
      fields: BaiodfStep1Fields;
    };
  };
}

interface BaiodfStep2Response {
  onboarding: {
    clientId: string;
    status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus;
    step: {
      key: 'STEP_2_CUSTOMER_ORDER_INFORMATION';
      label: string;
      currentQuestionId: BaiodfStep2QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: BaiodfStep2QuestionId[];
      fields: BaiodfStep2Fields;
      concentrations: BaiodfStep2Concentrations;
    };
  };
}

interface BaiodfStep3Response {
  onboarding: {
    clientId: string;
    status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus;
    step: {
      key: 'STEP_3_DISCLOSURES_AND_SIGNATURES';
      label: string;
      currentQuestionId: BaiodfStep3QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: BaiodfStep3QuestionId[];
      fields: BaiodfStep3Fields;
      requiresJointOwnerSignature: boolean;
      nextRouteAfterCompletion: string | null;
    };
  };
}

interface BaiodfClientContext {
  id: string;
  name: string;
  formSelections: Array<{
    form: {
      code: string;
    };
  }>;
  investorProfileOnboarding: {
    status: InvestorProfileOnboardingStatus;
    step1RrName: string | null;
    step1RrNo: string | null;
    step1CustomerNames: string | null;
    step1Data: Prisma.JsonValue | null;
    step7Data: Prisma.JsonValue | null;
  } | null;
  statementOfFinancialConditionOnboarding: {
    step1Data: Prisma.JsonValue | null;
    step2Data: Prisma.JsonValue | null;
  } | null;
  baiv506cOnboarding: {
    step1Data: Prisma.JsonValue | null;
    step2Data: Prisma.JsonValue | null;
  } | null;
}

const baiodfReviewSelect = {
  status: true,
  step1CurrentQuestionIndex: true,
  step1Data: true,
  step2CurrentQuestionIndex: true,
  step2Data: true,
  step3CurrentQuestionIndex: true,
  step3Data: true
} satisfies Prisma.BrokerageAlternativeInvestmentOrderDisclosureOnboardingSelect;

type BaiodfReviewSelectableOnboarding = Prisma.BrokerageAlternativeInvestmentOrderDisclosureOnboardingGetPayload<{
  select: typeof baiodfReviewSelect;
}>;

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

function toNullableJsonInput(
  value: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
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

function resolveSignatureBlock(
  primary: { typedSignature: string | null; printedName: string | null; date: string | null } | null | undefined,
  fallback: { typedSignature: string | null; printedName: string | null; date: string | null } | null | undefined
) {
  return {
    typedSignature: primary?.typedSignature ?? fallback?.typedSignature ?? null,
    printedName: primary?.printedName ?? fallback?.printedName ?? null,
    date: primary?.date ?? fallback?.date ?? null
  };
}

function getStep2PrefillContext(client: BaiodfClientContext) {
  if (!client.statementOfFinancialConditionOnboarding?.step1Data) {
    return {
      totalNetWorth: null,
      liquidNetWorth: null
    };
  }

  const sfcTotals = getSfcStep1Totals(
    normalizeSfcStep1Fields(client.statementOfFinancialConditionOnboarding.step1Data)
  );

  return {
    totalNetWorth: sfcTotals.totalNetWorth,
    liquidNetWorth: sfcTotals.totalPotentialLiquidity
  };
}

function getStep3PrefillContext(client: BaiodfClientContext, advisorName: string) {
  const sfcStep2Fields = normalizeSfcStep2Fields(client.statementOfFinancialConditionOnboarding?.step2Data ?? null);
  const step7Fields = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);

  const accountOwner = resolveSignatureBlock(
    sfcStep2Fields.signatures.accountOwner,
    step7Fields.signatures.accountOwner
  );
  const jointAccountOwner = resolveSignatureBlock(
    sfcStep2Fields.signatures.jointAccountOwner,
    step7Fields.signatures.jointAccountOwner
  );
  const financialProfessional = resolveSignatureBlock(
    sfcStep2Fields.signatures.financialProfessional,
    step7Fields.signatures.financialProfessional
  );

  if (!financialProfessional.printedName) {
    financialProfessional.printedName = advisorName;
  }

  return {
    requiresJointOwnerSignature: isStep4RequiredFromStep1(client.investorProfileOnboarding?.step1Data ?? null),
    accountOwner,
    jointAccountOwner,
    financialProfessional
  };
}

function getNextRouteAfterBaiodfCompletion(params: {
  clientId: string;
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
  if (!params.hasBaiv506c) {
    return null;
  }

  const base = `/clients/${params.clientId}/brokerage-accredited-investor-verification`;
  const onboarding = params.baiv506cOnboarding;

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
        requiresJointOwnerSignature: params.requiresJointOwnerSignature
      })
    ).length > 0
  ) {
    return `${base}/step-2`;
  }

  return null;
}

function toStep1Response(
  clientId: string,
  status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus,
  currentQuestionIndexValue: number,
  step1Data: Prisma.JsonValue | null | undefined,
  prefillContext: {
    rrName?: string | null;
    rrNo?: string | null;
    customerNames?: string | null;
  }
): BaiodfStep1Response {
  const fields = applyBaiodfStep1Prefill(normalizeBaiodfStep1Fields(step1Data), prefillContext);
  const visibleQuestionIds = getVisibleBaiodfStep1QuestionIds();
  const currentQuestionIndex = clampBaiodfStep1QuestionIndex(currentQuestionIndexValue, visibleQuestionIds);
  const currentQuestionId =
    visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step1.accountRegistration';

  return {
    onboarding: {
      clientId,
      status,
      step: {
        key: 'STEP_1_CUSTOMER_ACCOUNT_INFORMATION',
        label: BAIODF_STEP_1_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields
      }
    }
  };
}

function toStep2Response(
  clientId: string,
  status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus,
  currentQuestionIndexValue: number,
  step1Data: Prisma.JsonValue | null | undefined,
  step2Data: Prisma.JsonValue | null | undefined,
  prefillContext: {
    totalNetWorth?: number | null;
    liquidNetWorth?: number | null;
  }
): BaiodfStep2Response {
  const step1Fields = normalizeBaiodfStep1Fields(step1Data);
  const fields = applyBaiodfStep2Prefill(normalizeBaiodfStep2Fields(step2Data), prefillContext);
  const concentrations = getBaiodfStep2Concentrations(fields, step1Fields.orderBasics.proposedPrincipalAmount);
  const visibleQuestionIds = getVisibleBaiodfStep2QuestionIds();
  const currentQuestionIndex = clampBaiodfStep2QuestionIndex(currentQuestionIndexValue, visibleQuestionIds);
  const currentQuestionId =
    visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step2.custodianAndProduct';

  return {
    onboarding: {
      clientId,
      status,
      step: {
        key: 'STEP_2_CUSTOMER_ORDER_INFORMATION',
        label: BAIODF_STEP_2_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields,
        concentrations
      }
    }
  };
}

function toStep3Response(
  clientId: string,
  status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus,
  currentQuestionIndexValue: number,
  step3Data: Prisma.JsonValue | null | undefined,
  nextRouteAfterCompletion: string | null,
  prefillContext: {
    requiresJointOwnerSignature: boolean;
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
  }
): BaiodfStep3Response {
  const fields = applyBaiodfStep3Prefill(normalizeBaiodfStep3Fields(step3Data), prefillContext);
  const visibleQuestionIds = getVisibleBaiodfStep3QuestionIds();
  const currentQuestionIndex = clampBaiodfStep3QuestionIndex(currentQuestionIndexValue, visibleQuestionIds);
  const currentQuestionId =
    visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step3.acknowledgements';

  return {
    onboarding: {
      clientId,
      status,
      step: {
        key: 'STEP_3_DISCLOSURES_AND_SIGNATURES',
        label: BAIODF_STEP_3_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields,
        requiresJointOwnerSignature: prefillContext.requiresJointOwnerSignature,
        nextRouteAfterCompletion
      }
    }
  };
}

function withBaiodfReviewMeta<T extends object>(payload: T, stepNumber: number): T & {
  review: { stepNumber: number; totalSteps: number };
} {
  return {
    ...payload,
    review: {
      stepNumber,
      totalSteps: 3
    }
  };
}

function toBaiodfReviewResponse(
  clientId: string,
  stepNumber: number,
  onboarding: BaiodfReviewSelectableOnboarding,
  nextRouteAfterCompletion: string | null,
  step1PrefillContext: {
    rrName?: string | null;
    rrNo?: string | null;
    customerNames?: string | null;
  },
  step2PrefillContext: {
    totalNetWorth?: number | null;
    liquidNetWorth?: number | null;
  },
  step3PrefillContext: {
    requiresJointOwnerSignature: boolean;
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
  }
) {
  if (stepNumber === 1) {
    return withBaiodfReviewMeta(
      toStep1Response(
        clientId,
        onboarding.status,
        onboarding.step1CurrentQuestionIndex,
        onboarding.step1Data,
        step1PrefillContext
      ),
      stepNumber
    );
  }

  if (stepNumber === 2) {
    return withBaiodfReviewMeta(
      toStep2Response(
        clientId,
        onboarding.status,
        onboarding.step2CurrentQuestionIndex,
        onboarding.step1Data,
        onboarding.step2Data,
        step2PrefillContext
      ),
      stepNumber
    );
  }

  return withBaiodfReviewMeta(
    toStep3Response(
      clientId,
      onboarding.status,
      onboarding.step3CurrentQuestionIndex,
      onboarding.step3Data,
      nextRouteAfterCompletion,
      step3PrefillContext
    ),
    stepNumber
  );
}

export function createBaiodfRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  async function loadClientContext(clientId: string, ownerUserId: string): Promise<BaiodfClientContext | null> {
    return deps.prisma.client.findFirst({
      where: {
        id: clientId,
        ownerUserId
      },
      select: {
        id: true,
        name: true,
        formSelections: {
          select: {
            form: {
              select: {
                code: true
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
            step1Data: true,
            step7Data: true
          }
        },
        statementOfFinancialConditionOnboarding: {
          select: {
            step1Data: true,
            step2Data: true
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
  }

  router.get('/:clientId/brokerage-alternative-investment-order-disclosure/step-1', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await loadClientContext(clientId, authUser.id);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE)) {
        response.status(400).json({
          message: 'Brokerage Alternative Investment Order and Disclosure Form is not selected for this client.'
        });
        return;
      }

      const defaults = createDefaultBaiodfOnboardingPayload();
      const onboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.NOT_STARTED,
          ...defaults
        },
        select: {
          status: true,
          step1CurrentQuestionIndex: true,
          step1Data: true
        }
      });

      const investorStep1 = normalizeStep1Fields(client.investorProfileOnboarding?.step1Data ?? null, {
        step1RrName: client.investorProfileOnboarding?.step1RrName ?? null,
        step1RrNo: client.investorProfileOnboarding?.step1RrNo ?? null,
        step1CustomerNames: client.investorProfileOnboarding?.step1CustomerNames ?? null
      });

      response.json(
        toStep1Response(clientId, onboarding.status, onboarding.step1CurrentQuestionIndex, onboarding.step1Data, {
          rrName: investorStep1.accountRegistration.rrName || null,
          rrNo: investorStep1.accountRegistration.rrNo || null,
          customerNames: investorStep1.accountRegistration.customerNames || client.name || null
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/brokerage-alternative-investment-order-disclosure/step-1', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = baiodfStepOnePatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;
    if (!isBaiodfStep1QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as BaiodfStep1QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await loadClientContext(clientId, authUser.id);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE)) {
        response.status(400).json({
          message: 'Brokerage Alternative Investment Order and Disclosure Form is not selected for this client.'
        });
        return;
      }

      const existingOnboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step1CurrentQuestionIndex: true,
          step1Data: true
        }
      });

      const investorStep1 = normalizeStep1Fields(client.investorProfileOnboarding?.step1Data ?? null, {
        step1RrName: client.investorProfileOnboarding?.step1RrName ?? null,
        step1RrNo: client.investorProfileOnboarding?.step1RrNo ?? null,
        step1CustomerNames: client.investorProfileOnboarding?.step1CustomerNames ?? null
      });

      const prefillContext = {
        rrName: investorStep1.accountRegistration.rrName || null,
        rrNo: investorStep1.accountRegistration.rrNo || null,
        customerNames: investorStep1.accountRegistration.customerNames || client.name || null
      };

      const existingFields = applyBaiodfStep1Prefill(
        normalizeBaiodfStep1Fields(existingOnboarding?.step1Data ?? null),
        prefillContext
      );

      const answerValidation = validateBaiodfStep1Answer(questionId, parsedBody.data.answer);
      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applyBaiodfStep1Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleBaiodfStep1QuestionIds();
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const defaults = createDefaultBaiodfOnboardingPayload();

      const onboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert({
        where: { clientId },
        update: {
          status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.IN_PROGRESS,
          step1CurrentQuestionIndex: nextIndex,
          step1Data: serializeBaiodfStep1Fields(nextFields)
        },
        create: {
          clientId,
          status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.IN_PROGRESS,
          ...defaults,
          step1CurrentQuestionIndex: nextIndex,
          step1Data: serializeBaiodfStep1Fields(nextFields)
        },
        select: {
          status: true,
          step1CurrentQuestionIndex: true,
          step1Data: true
        }
      });

      response.json(
        toStep1Response(clientId, onboarding.status, onboarding.step1CurrentQuestionIndex, onboarding.step1Data, prefillContext)
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/brokerage-alternative-investment-order-disclosure/step-2', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await loadClientContext(clientId, authUser.id);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE)) {
        response.status(400).json({
          message: 'Brokerage Alternative Investment Order and Disclosure Form is not selected for this client.'
        });
        return;
      }

      const defaults = createDefaultBaiodfOnboardingPayload();
      const onboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.NOT_STARTED,
          ...defaults
        },
        select: {
          status: true,
          step1Data: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      response.json(
        toStep2Response(
          clientId,
          onboarding.status,
          onboarding.step2CurrentQuestionIndex,
          onboarding.step1Data,
          onboarding.step2Data,
          getStep2PrefillContext(client)
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/brokerage-alternative-investment-order-disclosure/step-2', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = baiodfStepTwoPatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;
    if (!isBaiodfStep2QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as BaiodfStep2QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await loadClientContext(clientId, authUser.id);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE)) {
        response.status(400).json({
          message: 'Brokerage Alternative Investment Order and Disclosure Form is not selected for this client.'
        });
        return;
      }

      const existingOnboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step1Data: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      const prefillContext = getStep2PrefillContext(client);
      const existingFields = applyBaiodfStep2Prefill(
        normalizeBaiodfStep2Fields(existingOnboarding?.step2Data ?? null),
        prefillContext
      );

      const answerValidation = validateBaiodfStep2Answer(questionId, parsedBody.data.answer);
      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applyBaiodfStep2Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleBaiodfStep2QuestionIds();
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const defaults = createDefaultBaiodfOnboardingPayload();

      const onboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert({
        where: { clientId },
        update: {
          status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.IN_PROGRESS,
          step2CurrentQuestionIndex: nextIndex,
          step2Data: serializeBaiodfStep2Fields(nextFields)
        },
        create: {
          clientId,
          status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.IN_PROGRESS,
          ...defaults,
          step2CurrentQuestionIndex: nextIndex,
          step2Data: serializeBaiodfStep2Fields(nextFields)
        },
        select: {
          status: true,
          step1Data: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      response.json(
        toStep2Response(
          clientId,
          onboarding.status,
          onboarding.step2CurrentQuestionIndex,
          onboarding.step1Data,
          onboarding.step2Data,
          prefillContext
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/brokerage-alternative-investment-order-disclosure/step-3', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await loadClientContext(clientId, authUser.id);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE)) {
        response.status(400).json({
          message: 'Brokerage Alternative Investment Order and Disclosure Form is not selected for this client.'
        });
        return;
      }

      const defaults = createDefaultBaiodfOnboardingPayload();
      const onboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.NOT_STARTED,
          ...defaults
        },
        select: {
          status: true,
          step3CurrentQuestionIndex: true,
          step3Data: true
        }
      });
      const requiresJointOwnerSignature = isStep4RequiredFromStep1(
        client.investorProfileOnboarding?.step1Data ?? null
      );
      const nextRouteAfterCompletion =
        onboarding.status === BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.COMPLETED
          ? getNextRouteAfterBaiodfCompletion({
              clientId,
              hasBaiv506c: client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE),
              baiv506cOnboarding: client.baiv506cOnboarding,
              requiresJointOwnerSignature
            })
          : null;

      response.json(
        toStep3Response(
          clientId,
          onboarding.status,
          onboarding.step3CurrentQuestionIndex,
          onboarding.step3Data,
          nextRouteAfterCompletion,
          getStep3PrefillContext(client, authUser.name)
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/brokerage-alternative-investment-order-disclosure/step-3', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = baiodfStepThreePatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;
    if (!isBaiodfStep3QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as BaiodfStep3QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await loadClientContext(clientId, authUser.id);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE)) {
        response.status(400).json({
          message: 'Brokerage Alternative Investment Order and Disclosure Form is not selected for this client.'
        });
        return;
      }

      const existingOnboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step1Data: true,
          step2Data: true,
          step3CurrentQuestionIndex: true,
          step3Data: true
        }
      });

      const prefillContext = getStep3PrefillContext(client, authUser.name);
      const validationContext = {
        requiresJointOwnerSignature: prefillContext.requiresJointOwnerSignature
      };
      const existingFields = applyBaiodfStep3Prefill(
        normalizeBaiodfStep3Fields(existingOnboarding?.step3Data ?? null),
        prefillContext
      );

      const answerValidation = validateBaiodfStep3Answer(questionId, parsedBody.data.answer, validationContext);
      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applyBaiodfStep3Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleBaiodfStep3QuestionIds();
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const defaults = createDefaultBaiodfOnboardingPayload();

      const prefilledStep1 = applyBaiodfStep1Prefill(
        normalizeBaiodfStep1Fields(existingOnboarding?.step1Data ?? null),
        {
          rrName: client.investorProfileOnboarding?.step1RrName ?? null,
          rrNo: client.investorProfileOnboarding?.step1RrNo ?? null,
          customerNames: client.investorProfileOnboarding?.step1CustomerNames ?? client.name ?? null
        }
      );
      const prefilledStep2 = applyBaiodfStep2Prefill(
        normalizeBaiodfStep2Fields(existingOnboarding?.step2Data ?? null),
        getStep2PrefillContext(client)
      );

      const step1Errors = validateBaiodfStep1Completion(prefilledStep1);
      const step2Errors = validateBaiodfStep2Completion(prefilledStep2);
      const step3Errors = validateBaiodfStep3Completion(nextFields, validationContext);
      const nextStatus =
        Object.keys(step1Errors).length === 0 &&
        Object.keys(step2Errors).length === 0 &&
        Object.keys(step3Errors).length === 0
          ? BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.COMPLETED
          : BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.IN_PROGRESS;

      const onboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert({
        where: { clientId },
        update: {
          status: nextStatus,
          step3CurrentQuestionIndex: nextIndex,
          step3Data: serializeBaiodfStep3Fields(nextFields)
        },
        create: {
          clientId,
          status: nextStatus,
          ...defaults,
          step3CurrentQuestionIndex: nextIndex,
          step3Data: serializeBaiodfStep3Fields(nextFields)
        },
        select: {
          status: true,
          step3CurrentQuestionIndex: true,
          step3Data: true
        }
      });
      const nextRouteAfterCompletion =
        onboarding.status === BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.COMPLETED
          ? getNextRouteAfterBaiodfCompletion({
              clientId,
              hasBaiv506c: client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE),
              baiv506cOnboarding: client.baiv506cOnboarding,
              requiresJointOwnerSignature: validationContext.requiresJointOwnerSignature
            })
          : null;

      response.json(
        toStep3Response(
          clientId,
          onboarding.status,
          onboarding.step3CurrentQuestionIndex,
          onboarding.step3Data,
          nextRouteAfterCompletion,
          prefillContext
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/:clientId/brokerage-alternative-investment-order-disclosure/review/step-:stepNumber',
    requireAuth(deps),
    async (request, response, next) => {
      const parsedParams = baiodfReviewStepParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        response.status(400).json({ message: 'Invalid review step request.' });
        return;
      }

      const authUser = request.authUser!;
      const { clientId, stepNumber } = parsedParams.data;

      try {
        const client = await loadClientContext(clientId, authUser.id);
        if (!client) {
          response.status(404).json({ message: 'Client not found.' });
          return;
        }

        if (!client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE)) {
          response.status(400).json({
            message: 'Brokerage Alternative Investment Order and Disclosure Form is not selected for this client.'
          });
          return;
        }

        const defaults = createDefaultBaiodfOnboardingPayload();
        const onboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert({
          where: { clientId },
          update: {},
          create: {
            clientId,
            status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.NOT_STARTED,
            ...defaults
          },
          select: baiodfReviewSelect
        });

        const investorStep1 = normalizeStep1Fields(client.investorProfileOnboarding?.step1Data ?? null, {
          step1RrName: client.investorProfileOnboarding?.step1RrName ?? null,
          step1RrNo: client.investorProfileOnboarding?.step1RrNo ?? null,
          step1CustomerNames: client.investorProfileOnboarding?.step1CustomerNames ?? null
        });
        const step1PrefillContext = {
          rrName: investorStep1.accountRegistration.rrName || null,
          rrNo: investorStep1.accountRegistration.rrNo || null,
          customerNames: investorStep1.accountRegistration.customerNames || client.name || null
        };
        const step2PrefillContext = getStep2PrefillContext(client);
        const step3PrefillContext = getStep3PrefillContext(client, authUser.name);

        const nextRouteAfterCompletion =
          onboarding.status === BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.COMPLETED
            ? getNextRouteAfterBaiodfCompletion({
                clientId,
                hasBaiv506c: client.formSelections.some(
                  (selection) => selection.form.code === BAIV_506C_FORM_CODE
                ),
                baiv506cOnboarding: client.baiv506cOnboarding,
                requiresJointOwnerSignature: step3PrefillContext.requiresJointOwnerSignature
              })
            : null;

        response.json(
          toBaiodfReviewResponse(
            clientId,
            stepNumber,
            onboarding,
            nextRouteAfterCompletion,
            step1PrefillContext,
            step2PrefillContext,
            step3PrefillContext
          )
        );
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/:clientId/brokerage-alternative-investment-order-disclosure/review/step-:stepNumber',
    requireAuth(deps),
    async (request, response, next) => {
      const parsedParams = baiodfReviewStepParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        response.status(400).json({ message: 'Invalid review step request.' });
        return;
      }

      const parsedBody = baiodfReviewStepUpdateSchema.safeParse(request.body);
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
        const client = await loadClientContext(clientId, authUser.id);
        if (!client) {
          response.status(404).json({ message: 'Client not found.' });
          return;
        }

        if (!client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE)) {
          response.status(400).json({
            message: 'Brokerage Alternative Investment Order and Disclosure Form is not selected for this client.'
          });
          return;
        }

        const defaults = createDefaultBaiodfOnboardingPayload();
        const existing = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.findUnique({
          where: { clientId },
          select: baiodfReviewSelect
        });

        const investorStep1 = normalizeStep1Fields(client.investorProfileOnboarding?.step1Data ?? null, {
          step1RrName: client.investorProfileOnboarding?.step1RrName ?? null,
          step1RrNo: client.investorProfileOnboarding?.step1RrNo ?? null,
          step1CustomerNames: client.investorProfileOnboarding?.step1CustomerNames ?? null
        });
        const step1PrefillContext = {
          rrName: investorStep1.accountRegistration.rrName || null,
          rrNo: investorStep1.accountRegistration.rrNo || null,
          customerNames: investorStep1.accountRegistration.customerNames || client.name || null
        };
        const step2PrefillContext = getStep2PrefillContext(client);
        const step3PrefillContext = getStep3PrefillContext(client, authUser.name);

        let nextStep1Data = (existing?.step1Data ?? defaults.step1Data) as Prisma.JsonValue | null;
        let nextStep2Data = (existing?.step2Data ?? defaults.step2Data) as Prisma.JsonValue | null;
        let nextStep3Data = (existing?.step3Data ?? defaults.step3Data) as Prisma.JsonValue | null;
        let stepFieldErrors: Record<string, string> = {};

        if (stepNumber === 1) {
          const fields = normalizeBaiodfStep1Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateBaiodfStep1Completion(fields);
          nextStep1Data = serializeBaiodfStep1Fields(fields) as Prisma.JsonValue;
        } else if (stepNumber === 2) {
          const fields = normalizeBaiodfStep2Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateBaiodfStep2Completion(fields);
          nextStep2Data = serializeBaiodfStep2Fields(fields) as Prisma.JsonValue;
        } else {
          const fields = normalizeBaiodfStep3Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateBaiodfStep3Completion(fields, {
            requiresJointOwnerSignature: step3PrefillContext.requiresJointOwnerSignature
          });
          nextStep3Data = serializeBaiodfStep3Fields(fields) as Prisma.JsonValue;
        }

        if (Object.keys(stepFieldErrors).length > 0) {
          response.status(400).json({
            message: 'Please correct the highlighted fields.',
            fieldErrors: stepFieldErrors
          });
          return;
        }

        const fullStep1 = applyBaiodfStep1Prefill(normalizeBaiodfStep1Fields(nextStep1Data), step1PrefillContext);
        const fullStep2 = applyBaiodfStep2Prefill(normalizeBaiodfStep2Fields(nextStep2Data), step2PrefillContext);
        const fullStep3 = applyBaiodfStep3Prefill(normalizeBaiodfStep3Fields(nextStep3Data), step3PrefillContext);
        const nextStatus =
          Object.keys(validateBaiodfStep1Completion(fullStep1)).length === 0 &&
          Object.keys(validateBaiodfStep2Completion(fullStep2)).length === 0 &&
          Object.keys(
            validateBaiodfStep3Completion(fullStep3, {
              requiresJointOwnerSignature: step3PrefillContext.requiresJointOwnerSignature
            })
          ).length === 0
            ? BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.COMPLETED
            : BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.IN_PROGRESS;

        const onboarding = await deps.prisma.brokerageAlternativeInvestmentOrderDisclosureOnboarding.upsert({
          where: { clientId },
          update: {
            status: nextStatus,
            ...(stepNumber === 1
              ? { step1Data: toNullableJsonInput(nextStep1Data) }
              : stepNumber === 2
                ? { step2Data: toNullableJsonInput(nextStep2Data) }
                : { step3Data: toNullableJsonInput(nextStep3Data) })
          },
          create: {
            clientId,
            status: nextStatus,
            ...defaults,
            ...(stepNumber === 1
              ? { step1Data: toNullableJsonInput(nextStep1Data) }
              : stepNumber === 2
                ? { step2Data: toNullableJsonInput(nextStep2Data) }
                : { step3Data: toNullableJsonInput(nextStep3Data) })
          },
          select: baiodfReviewSelect
        });

        const nextRouteAfterCompletion =
          onboarding.status === BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.COMPLETED
            ? getNextRouteAfterBaiodfCompletion({
                clientId,
                hasBaiv506c: client.formSelections.some(
                  (selection) => selection.form.code === BAIV_506C_FORM_CODE
                ),
                baiv506cOnboarding: client.baiv506cOnboarding,
                requiresJointOwnerSignature: step3PrefillContext.requiresJointOwnerSignature
              })
            : null;

        response.json(
          toBaiodfReviewResponse(
            clientId,
            stepNumber,
            onboarding,
            nextRouteAfterCompletion,
            step1PrefillContext,
            step2PrefillContext,
            step3PrefillContext
          )
        );
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
