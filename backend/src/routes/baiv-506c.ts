import {
  BrokerageAccreditedInvestorVerificationOnboardingStatus,
  type InvestorProfileOnboardingStatus,
  Prisma
} from '@prisma/client';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import {
  BAIV_506C_STEP_1_LABEL,
  applyBaiv506cStep1Answer,
  applyBaiv506cStep1Prefill,
  clampBaiv506cStep1QuestionIndex,
  defaultBaiv506cStep1Fields,
  getVisibleBaiv506cStep1QuestionIds,
  isBaiv506cStep1QuestionId,
  normalizeBaiv506cStep1Fields,
  serializeBaiv506cStep1Fields,
  validateBaiv506cStep1Answer,
  validateBaiv506cStep1Completion,
  type Baiv506cStep1Fields,
  type Baiv506cStep1QuestionId
} from '../lib/baiv-506c-step1.js';
import {
  BAIV_506C_STEP_2_LABEL,
  applyBaiv506cStep2Answer,
  applyBaiv506cStep2Prefill,
  clampBaiv506cStep2QuestionIndex,
  defaultBaiv506cStep2Fields,
  getVisibleBaiv506cStep2QuestionIds,
  isBaiv506cStep2QuestionId,
  normalizeBaiv506cStep2Fields,
  serializeBaiv506cStep2Fields,
  validateBaiv506cStep2Answer,
  validateBaiv506cStep2Completion,
  type Baiv506cStep2Fields,
  type Baiv506cStep2QuestionId
} from '../lib/baiv-506c-step2.js';
import { normalizeBaiodfStep3Fields } from '../lib/baiodf-step3.js';
import { normalizeStep1Fields, type PrimaryTypeKey } from '../lib/investor-profile-step1.js';
import { normalizeStep7Fields } from '../lib/investor-profile-step7.js';
import { normalizeSfcStep2Fields } from '../lib/statement-of-financial-condition-step2.js';
import { zodFieldErrors } from '../lib/validation.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

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

const baiv506cReviewStepParamsSchema = z.object({
  clientId: z.string().trim().min(1),
  stepNumber: z.coerce.number().int().min(1).max(2)
});

const baiv506cStepOnePatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const baiv506cStepTwoPatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const baiv506cReviewStepUpdateSchema = z.object({
  fields: z.unknown()
});

interface Baiv506cStep1Response {
  onboarding: {
    clientId: string;
    status: BrokerageAccreditedInvestorVerificationOnboardingStatus;
    step: {
      key: 'STEP_1_CLIENT_ACCOUNT_INFORMATION';
      label: string;
      currentQuestionId: Baiv506cStep1QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Baiv506cStep1QuestionId[];
      fields: Baiv506cStep1Fields;
    };
  };
}

interface Baiv506cStep2Response {
  onboarding: {
    clientId: string;
    status: BrokerageAccreditedInvestorVerificationOnboardingStatus;
    step: {
      key: 'STEP_2_ACKNOWLEDGEMENTS_AND_SIGNATURES';
      label: string;
      currentQuestionId: Baiv506cStep2QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: Baiv506cStep2QuestionId[];
      fields: Baiv506cStep2Fields;
      requiresJointOwnerSignature: boolean;
      nextRouteAfterCompletion: string | null;
    };
  };
}

interface Baiv506cClientContext {
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
    step2Data: Prisma.JsonValue | null;
  } | null;
  baiodfOnboarding: {
    step3Data: Prisma.JsonValue | null;
  } | null;
}

const baiv506cReviewSelect = {
  status: true,
  step1CurrentQuestionIndex: true,
  step1Data: true,
  step2CurrentQuestionIndex: true,
  step2Data: true
} satisfies Prisma.BrokerageAccreditedInvestorVerificationOnboardingSelect;

type Baiv506cReviewSelectableOnboarding = Prisma.BrokerageAccreditedInvestorVerificationOnboardingGetPayload<{
  select: typeof baiv506cReviewSelect;
}>;

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
  fallback: { typedSignature: string | null; printedName: string | null; date: string | null } | null | undefined,
  tertiary: { typedSignature: string | null; printedName: string | null; date: string | null } | null | undefined
) {
  return {
    typedSignature: primary?.typedSignature ?? fallback?.typedSignature ?? tertiary?.typedSignature ?? null,
    printedName: primary?.printedName ?? fallback?.printedName ?? tertiary?.printedName ?? null,
    date: primary?.date ?? fallback?.date ?? tertiary?.date ?? null
  };
}

function getStep2PrefillContext(client: Baiv506cClientContext, advisorName: string) {
  const baiodfStep3Fields = normalizeBaiodfStep3Fields(client.baiodfOnboarding?.step3Data ?? null);
  const sfcStep2Fields = normalizeSfcStep2Fields(client.statementOfFinancialConditionOnboarding?.step2Data ?? null);
  const step7Fields = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);

  const accountOwner = resolveSignatureBlock(
    baiodfStep3Fields.signatures.accountOwner,
    sfcStep2Fields.signatures.accountOwner,
    step7Fields.signatures.accountOwner
  );
  const jointAccountOwner = resolveSignatureBlock(
    baiodfStep3Fields.signatures.jointAccountOwner,
    sfcStep2Fields.signatures.jointAccountOwner,
    step7Fields.signatures.jointAccountOwner
  );
  const financialProfessional = resolveSignatureBlock(
    baiodfStep3Fields.signatures.financialProfessional,
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

function toStep1Response(
  clientId: string,
  status: BrokerageAccreditedInvestorVerificationOnboardingStatus,
  currentQuestionIndexValue: number,
  step1Data: Prisma.JsonValue | null | undefined,
  prefillContext: {
    rrName?: string | null;
    rrNo?: string | null;
    customerNames?: string | null;
  }
): Baiv506cStep1Response {
  const fields = applyBaiv506cStep1Prefill(normalizeBaiv506cStep1Fields(step1Data), prefillContext);
  const visibleQuestionIds = getVisibleBaiv506cStep1QuestionIds();
  const currentQuestionIndex = clampBaiv506cStep1QuestionIndex(currentQuestionIndexValue, visibleQuestionIds);
  const currentQuestionId = visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step1.accountRegistration';

  return {
    onboarding: {
      clientId,
      status,
      step: {
        key: 'STEP_1_CLIENT_ACCOUNT_INFORMATION',
        label: BAIV_506C_STEP_1_LABEL,
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
  status: BrokerageAccreditedInvestorVerificationOnboardingStatus,
  currentQuestionIndexValue: number,
  step2Data: Prisma.JsonValue | null | undefined,
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
): Baiv506cStep2Response {
  const fields = applyBaiv506cStep2Prefill(normalizeBaiv506cStep2Fields(step2Data), prefillContext);
  const visibleQuestionIds = getVisibleBaiv506cStep2QuestionIds();
  const currentQuestionIndex = clampBaiv506cStep2QuestionIndex(currentQuestionIndexValue, visibleQuestionIds);
  const currentQuestionId = visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step2.acknowledgements';

  return {
    onboarding: {
      clientId,
      status,
      step: {
        key: 'STEP_2_ACKNOWLEDGEMENTS_AND_SIGNATURES',
        label: BAIV_506C_STEP_2_LABEL,
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

function withBaiv506cReviewMeta<T extends object>(payload: T, stepNumber: number): T & {
  review: { stepNumber: number; totalSteps: number };
} {
  return {
    ...payload,
    review: {
      stepNumber,
      totalSteps: 2
    }
  };
}

function toBaiv506cReviewResponse(
  clientId: string,
  stepNumber: number,
  onboarding: Baiv506cReviewSelectableOnboarding,
  nextRouteAfterCompletion: string | null,
  step1PrefillContext: {
    rrName?: string | null;
    rrNo?: string | null;
    customerNames?: string | null;
  },
  step2PrefillContext: {
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
    return withBaiv506cReviewMeta(
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

  return withBaiv506cReviewMeta(
    toStep2Response(
      clientId,
      onboarding.status,
      onboarding.step2CurrentQuestionIndex,
      onboarding.step2Data,
      nextRouteAfterCompletion,
      step2PrefillContext
    ),
    stepNumber
  );
}

export function createBaiv506cRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  async function loadClientContext(clientId: string, ownerUserId: string): Promise<Baiv506cClientContext | null> {
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
            step2Data: true
          }
        },
        baiodfOnboarding: {
          select: {
            step3Data: true
          }
        }
      }
    });
  }

  router.get('/:clientId/brokerage-accredited-investor-verification/step-1', requireAuth(deps), async (request, response, next) => {
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

      if (!client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE)) {
        response.status(400).json({
          message: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c) is not selected for this client.'
        });
        return;
      }

      const defaults = createDefaultBaiv506cOnboardingPayload();
      const onboarding = await deps.prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: BrokerageAccreditedInvestorVerificationOnboardingStatus.NOT_STARTED,
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

  router.post('/:clientId/brokerage-accredited-investor-verification/step-1', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = baiv506cStepOnePatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;
    if (!isBaiv506cStep1QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as Baiv506cStep1QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await loadClientContext(clientId, authUser.id);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE)) {
        response.status(400).json({
          message: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c) is not selected for this client.'
        });
        return;
      }

      const existingOnboarding = await deps.prisma.brokerageAccreditedInvestorVerificationOnboarding.findUnique({
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

      const existingFields = applyBaiv506cStep1Prefill(
        normalizeBaiv506cStep1Fields(existingOnboarding?.step1Data ?? null),
        prefillContext
      );

      const answerValidation = validateBaiv506cStep1Answer(questionId, parsedBody.data.answer);
      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applyBaiv506cStep1Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleBaiv506cStep1QuestionIds();
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const defaults = createDefaultBaiv506cOnboardingPayload();

      const onboarding = await deps.prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert({
        where: { clientId },
        update: {
          status: BrokerageAccreditedInvestorVerificationOnboardingStatus.IN_PROGRESS,
          step1CurrentQuestionIndex: nextIndex,
          step1Data: serializeBaiv506cStep1Fields(nextFields)
        },
        create: {
          clientId,
          status: BrokerageAccreditedInvestorVerificationOnboardingStatus.IN_PROGRESS,
          ...defaults,
          step1CurrentQuestionIndex: nextIndex,
          step1Data: serializeBaiv506cStep1Fields(nextFields)
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

  router.get('/:clientId/brokerage-accredited-investor-verification/step-2', requireAuth(deps), async (request, response, next) => {
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

      if (!client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE)) {
        response.status(400).json({
          message: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c) is not selected for this client.'
        });
        return;
      }

      const defaults = createDefaultBaiv506cOnboardingPayload();
      const onboarding = await deps.prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: BrokerageAccreditedInvestorVerificationOnboardingStatus.NOT_STARTED,
          ...defaults
        },
        select: {
          status: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      const prefillContext = getStep2PrefillContext(client, authUser.name);
      const nextRouteAfterCompletion =
        onboarding.status === BrokerageAccreditedInvestorVerificationOnboardingStatus.COMPLETED ? null : null;

      response.json(
        toStep2Response(
          clientId,
          onboarding.status,
          onboarding.step2CurrentQuestionIndex,
          onboarding.step2Data,
          nextRouteAfterCompletion,
          prefillContext
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/brokerage-accredited-investor-verification/step-2', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = baiv506cStepTwoPatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;
    if (!isBaiv506cStep2QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as Baiv506cStep2QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await loadClientContext(clientId, authUser.id);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE)) {
        response.status(400).json({
          message: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c) is not selected for this client.'
        });
        return;
      }

      const existingOnboarding = await deps.prisma.brokerageAccreditedInvestorVerificationOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step1Data: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      const prefillContext = getStep2PrefillContext(client, authUser.name);
      const context = {
        requiresJointOwnerSignature: prefillContext.requiresJointOwnerSignature
      };

      const existingFields = applyBaiv506cStep2Prefill(
        normalizeBaiv506cStep2Fields(existingOnboarding?.step2Data ?? null),
        prefillContext
      );

      const answerValidation = validateBaiv506cStep2Answer(questionId, parsedBody.data.answer, context);
      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applyBaiv506cStep2Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleBaiv506cStep2QuestionIds();
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const defaults = createDefaultBaiv506cOnboardingPayload();

      const prefilledStep1Fields = applyBaiv506cStep1Prefill(
        normalizeBaiv506cStep1Fields(existingOnboarding?.step1Data ?? null),
        {
          rrName: client.investorProfileOnboarding?.step1RrName ?? null,
          rrNo: client.investorProfileOnboarding?.step1RrNo ?? null,
          customerNames: client.investorProfileOnboarding?.step1CustomerNames ?? client.name ?? null
        }
      );

      const step1Errors = validateBaiv506cStep1Completion(prefilledStep1Fields);
      const step2Errors = validateBaiv506cStep2Completion(nextFields, context);
      const nextStatus =
        Object.keys(step1Errors).length === 0 && Object.keys(step2Errors).length === 0
          ? BrokerageAccreditedInvestorVerificationOnboardingStatus.COMPLETED
          : BrokerageAccreditedInvestorVerificationOnboardingStatus.IN_PROGRESS;

      const onboarding = await deps.prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert({
        where: { clientId },
        update: {
          status: nextStatus,
          step2CurrentQuestionIndex: nextIndex,
          step2Data: serializeBaiv506cStep2Fields(nextFields)
        },
        create: {
          clientId,
          status: nextStatus,
          ...defaults,
          step2CurrentQuestionIndex: nextIndex,
          step2Data: serializeBaiv506cStep2Fields(nextFields)
        },
        select: {
          status: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      const nextRouteAfterCompletion =
        onboarding.status === BrokerageAccreditedInvestorVerificationOnboardingStatus.COMPLETED ? null : null;

      response.json(
        toStep2Response(
          clientId,
          onboarding.status,
          onboarding.step2CurrentQuestionIndex,
          onboarding.step2Data,
          nextRouteAfterCompletion,
          prefillContext
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/:clientId/brokerage-accredited-investor-verification/review/step-:stepNumber',
    requireAuth(deps),
    async (request, response, next) => {
      const parsedParams = baiv506cReviewStepParamsSchema.safeParse(request.params);
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

        if (!client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE)) {
          response.status(400).json({
            message: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c) is not selected for this client.'
          });
          return;
        }

        const defaults = createDefaultBaiv506cOnboardingPayload();
        const onboarding = await deps.prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert({
          where: { clientId },
          update: {},
          create: {
            clientId,
            status: BrokerageAccreditedInvestorVerificationOnboardingStatus.NOT_STARTED,
            ...defaults
          },
          select: baiv506cReviewSelect
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
        const step2PrefillContext = getStep2PrefillContext(client, authUser.name);

        const nextRouteAfterCompletion = null;

        response.json(
          toBaiv506cReviewResponse(
            clientId,
            stepNumber,
            onboarding,
            nextRouteAfterCompletion,
            step1PrefillContext,
            step2PrefillContext
          )
        );
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/:clientId/brokerage-accredited-investor-verification/review/step-:stepNumber',
    requireAuth(deps),
    async (request, response, next) => {
      const parsedParams = baiv506cReviewStepParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        response.status(400).json({ message: 'Invalid review step request.' });
        return;
      }

      const parsedBody = baiv506cReviewStepUpdateSchema.safeParse(request.body);
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

        if (!client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE)) {
          response.status(400).json({
            message: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c) is not selected for this client.'
          });
          return;
        }

        const defaults = createDefaultBaiv506cOnboardingPayload();
        const existing = await deps.prisma.brokerageAccreditedInvestorVerificationOnboarding.findUnique({
          where: { clientId },
          select: baiv506cReviewSelect
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
        const step2PrefillContext = getStep2PrefillContext(client, authUser.name);
        const validationContext = {
          requiresJointOwnerSignature: step2PrefillContext.requiresJointOwnerSignature
        };

        let nextStep1Data = (existing?.step1Data ?? defaults.step1Data) as Prisma.JsonValue | null;
        let nextStep2Data = (existing?.step2Data ?? defaults.step2Data) as Prisma.JsonValue | null;
        let stepFieldErrors: Record<string, string> = {};

        if (stepNumber === 1) {
          const fields = normalizeBaiv506cStep1Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateBaiv506cStep1Completion(fields);
          nextStep1Data = serializeBaiv506cStep1Fields(fields) as Prisma.JsonValue;
        } else {
          const fields = normalizeBaiv506cStep2Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateBaiv506cStep2Completion(fields, validationContext);
          nextStep2Data = serializeBaiv506cStep2Fields(fields) as Prisma.JsonValue;
        }

        if (Object.keys(stepFieldErrors).length > 0) {
          response.status(400).json({
            message: 'Please correct the highlighted fields.',
            fieldErrors: stepFieldErrors
          });
          return;
        }

        const fullStep1 = applyBaiv506cStep1Prefill(normalizeBaiv506cStep1Fields(nextStep1Data), step1PrefillContext);
        const fullStep2 = applyBaiv506cStep2Prefill(normalizeBaiv506cStep2Fields(nextStep2Data), step2PrefillContext);
        const nextStatus =
          Object.keys(validateBaiv506cStep1Completion(fullStep1)).length === 0 &&
          Object.keys(validateBaiv506cStep2Completion(fullStep2, validationContext)).length === 0
            ? BrokerageAccreditedInvestorVerificationOnboardingStatus.COMPLETED
            : BrokerageAccreditedInvestorVerificationOnboardingStatus.IN_PROGRESS;

        const onboarding = await deps.prisma.brokerageAccreditedInvestorVerificationOnboarding.upsert({
          where: { clientId },
          update: {
            status: nextStatus,
            ...(stepNumber === 1
              ? { step1Data: toNullableJsonInput(nextStep1Data) }
              : { step2Data: toNullableJsonInput(nextStep2Data) })
          },
          create: {
            clientId,
            status: nextStatus,
            ...defaults,
            ...(stepNumber === 1
              ? { step1Data: toNullableJsonInput(nextStep1Data) }
              : { step2Data: toNullableJsonInput(nextStep2Data) })
          },
          select: baiv506cReviewSelect
        });

        const nextRouteAfterCompletion = null;

        response.json(
          toBaiv506cReviewResponse(
            clientId,
            stepNumber,
            onboarding,
            nextRouteAfterCompletion,
            step1PrefillContext,
            step2PrefillContext
          )
        );
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
