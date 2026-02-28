import {
  type InvestorProfileOnboardingStatus,
  Prisma,
  StatementOfFinancialConditionOnboardingStatus
} from '@prisma/client';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import {
  normalizeBaiodfStep1Fields,
  validateBaiodfStep1Completion
} from '../lib/baiodf-step1.js';
import {
  normalizeBaiodfStep2Fields,
  validateBaiodfStep2Completion
} from '../lib/baiodf-step2.js';
import {
  normalizeBaiodfStep3Fields,
  validateBaiodfStep3Completion
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
  SFC_STEP_1_LABEL,
  applySfcStep1Answer,
  applySfcStep1Prefill,
  clampSfcStep1QuestionIndex,
  defaultSfcStep1Fields,
  getSfcStep1Totals,
  getVisibleSfcStep1QuestionIds,
  isSfcStep1QuestionId,
  normalizeSfcStep1Fields,
  serializeSfcStep1Fields,
  validateSfcStep1Answer,
  validateSfcStep1Completion,
  type SfcStep1Fields,
  type SfcStep1QuestionId,
  type SfcStep1Totals
} from '../lib/statement-of-financial-condition-step1.js';
import {
  SFC_STEP_2_LABEL,
  applySfcStep2Answer,
  applySfcStep2Prefill,
  clampSfcStep2QuestionIndex,
  defaultSfcStep2Fields,
  getVisibleSfcStep2QuestionIds,
  isSfcStep2QuestionId,
  normalizeSfcStep2Fields,
  serializeSfcStep2Fields,
  validateSfcStep2Answer,
  validateSfcStep2Completion,
  type SfcStep2Fields,
  type SfcStep2QuestionId
} from '../lib/statement-of-financial-condition-step2.js';
import {
  normalizeStep1Fields,
  type PrimaryTypeKey
} from '../lib/investor-profile-step1.js';
import { normalizeStep7Fields } from '../lib/investor-profile-step7.js';
import { zodFieldErrors } from '../lib/validation.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const SFC_FORM_CODE = 'SFC';
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

const sfcReviewStepParamsSchema = z.object({
  clientId: z.string().trim().min(1),
  stepNumber: z.coerce.number().int().min(1).max(2)
});

const sfcStepOnePatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

const sfcReviewStepUpdateSchema = z.object({
  fields: z.unknown()
});

const sfcStepTwoPatchSchema = z.object({
  questionId: z.string().trim().min(1),
  answer: z.unknown(),
  clientCursor: z
    .object({
      currentQuestionId: z.string().trim().min(1).optional()
    })
    .optional()
});

interface SfcStep1Response {
  onboarding: {
    clientId: string;
    status: StatementOfFinancialConditionOnboardingStatus;
    step: {
      key: 'STEP_1_FINANCIALS';
      label: string;
      currentQuestionId: SfcStep1QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: SfcStep1QuestionId[];
      fields: SfcStep1Fields;
      totals: SfcStep1Totals;
    };
  };
}

interface SfcStep2Response {
  onboarding: {
    clientId: string;
    status: StatementOfFinancialConditionOnboardingStatus;
    step: {
      key: 'STEP_2_FINALIZATION';
      label: string;
      currentQuestionId: SfcStep2QuestionId;
      currentQuestionIndex: number;
      visibleQuestionIds: SfcStep2QuestionId[];
      fields: SfcStep2Fields;
      requiresJointOwnerSignature: boolean;
      nextRouteAfterCompletion: string | null;
    };
  };
}

interface SfcClientContext {
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
  baiodfOnboarding: {
    step1Data: Prisma.JsonValue | null;
    step2Data: Prisma.JsonValue | null;
    step3Data: Prisma.JsonValue | null;
  } | null;
  baiv506cOnboarding: {
    step1Data: Prisma.JsonValue | null;
    step2Data: Prisma.JsonValue | null;
  } | null;
}

const sfcReviewSelect = {
  status: true,
  step1CurrentQuestionIndex: true,
  step1Data: true,
  step2CurrentQuestionIndex: true,
  step2Data: true
} satisfies Prisma.StatementOfFinancialConditionOnboardingSelect;

type SfcReviewSelectableOnboarding = Prisma.StatementOfFinancialConditionOnboardingGetPayload<{
  select: typeof sfcReviewSelect;
}>;

function createDefaultSfcOnboardingPayload() {
  const step1Defaults = defaultSfcStep1Fields();
  const step2Defaults = defaultSfcStep2Fields();

  return {
    step1CurrentQuestionIndex: 0,
    step1Data: serializeSfcStep1Fields(step1Defaults),
    step2CurrentQuestionIndex: 0,
    step2Data: serializeSfcStep2Fields(step2Defaults)
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

function toStep1Response(
  clientId: string,
  status: StatementOfFinancialConditionOnboardingStatus,
  currentQuestionIndexValue: number,
  step1Data: Prisma.JsonValue | null | undefined,
  prefillContext: {
    rrName?: string | null;
    rrNo?: string | null;
    customerNames?: string | null;
  }
): SfcStep1Response {
  const fields = applySfcStep1Prefill(normalizeSfcStep1Fields(step1Data), prefillContext);
  const visibleQuestionIds = getVisibleSfcStep1QuestionIds();
  const currentQuestionIndex = clampSfcStep1QuestionIndex(currentQuestionIndexValue, visibleQuestionIds);
  const currentQuestionId =
    visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step1.accountRegistration';
  const totals = getSfcStep1Totals(fields);

  return {
    onboarding: {
      clientId,
      status,
      step: {
        key: 'STEP_1_FINANCIALS',
        label: SFC_STEP_1_LABEL,
        currentQuestionId,
        currentQuestionIndex,
        visibleQuestionIds,
        fields,
        totals
      }
    }
  };
}

function toStep2Response(
  clientId: string,
  status: StatementOfFinancialConditionOnboardingStatus,
  currentQuestionIndexValue: number,
  step2Data: Prisma.JsonValue | null | undefined,
  nextRouteAfterCompletion: string | null,
  prefillContext: {
    requiresJointOwnerSignature: boolean;
    accountOwner?: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    } | null;
    jointAccountOwner?: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    } | null;
    financialProfessional?: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    } | null;
    registeredPrincipal?: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    } | null;
  }
): SfcStep2Response {
  const fields = applySfcStep2Prefill(normalizeSfcStep2Fields(step2Data), prefillContext);
  const visibleQuestionIds = getVisibleSfcStep2QuestionIds();
  const currentQuestionIndex = clampSfcStep2QuestionIndex(currentQuestionIndexValue, visibleQuestionIds);
  const currentQuestionId = visibleQuestionIds[currentQuestionIndex] ?? visibleQuestionIds[0] ?? 'step2.notes';

  return {
    onboarding: {
      clientId,
      status,
      step: {
        key: 'STEP_2_FINALIZATION',
        label: SFC_STEP_2_LABEL,
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

function withSfcReviewMeta<T extends object>(payload: T, stepNumber: number): T & {
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

function toSfcReviewResponse(
  clientId: string,
  stepNumber: number,
  onboarding: SfcReviewSelectableOnboarding,
  nextRouteAfterCompletion: string | null,
  prefillContext: {
    rrName?: string | null;
    rrNo?: string | null;
    customerNames?: string | null;
  },
  step2PrefillContext: {
    requiresJointOwnerSignature: boolean;
    accountOwner?: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    } | null;
    jointAccountOwner?: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    } | null;
    financialProfessional?: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    } | null;
    registeredPrincipal?: {
      typedSignature: string | null;
      printedName: string | null;
      date: string | null;
    } | null;
  }
) {
  if (stepNumber === 1) {
    return withSfcReviewMeta(
      toStep1Response(
        clientId,
        onboarding.status,
        onboarding.step1CurrentQuestionIndex,
        onboarding.step1Data,
        prefillContext
      ),
      stepNumber
    );
  }

  return withSfcReviewMeta(
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

function getNextRouteAfterSfcCompletion(params: {
  clientId: string;
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

export function createStatementOfFinancialConditionRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  async function loadClientContext(clientId: string, ownerUserId: string): Promise<SfcClientContext | null> {
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
  }

  router.get('/:clientId/statement-of-financial-condition/step-1', requireAuth(deps), async (request, response, next) => {
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

      if (!client.formSelections.some((selection) => selection.form.code === SFC_FORM_CODE)) {
        response.status(400).json({
          message: 'Statement of Financial Condition is not selected for this client.'
        });
        return;
      }

      const defaults = createDefaultSfcOnboardingPayload();
      const onboarding = await deps.prisma.statementOfFinancialConditionOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: StatementOfFinancialConditionOnboardingStatus.NOT_STARTED,
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
        toStep1Response(
          clientId,
          onboarding.status,
          onboarding.step1CurrentQuestionIndex,
          onboarding.step1Data,
          {
            rrName: investorStep1.accountRegistration.rrName || null,
            rrNo: investorStep1.accountRegistration.rrNo || null,
            customerNames: investorStep1.accountRegistration.customerNames || client.name || null
          }
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/statement-of-financial-condition/step-1', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = sfcStepOnePatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;
    if (!isSfcStep1QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as SfcStep1QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await loadClientContext(clientId, authUser.id);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === SFC_FORM_CODE)) {
        response.status(400).json({
          message: 'Statement of Financial Condition is not selected for this client.'
        });
        return;
      }

      const existingOnboarding = await deps.prisma.statementOfFinancialConditionOnboarding.findUnique({
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

      const existingFields = applySfcStep1Prefill(
        normalizeSfcStep1Fields(existingOnboarding?.step1Data ?? null),
        prefillContext
      );

      const answerValidation = validateSfcStep1Answer(questionId, parsedBody.data.answer);

      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applySfcStep1Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleSfcStep1QuestionIds();
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const nextStatus = StatementOfFinancialConditionOnboardingStatus.IN_PROGRESS;
      const defaults = createDefaultSfcOnboardingPayload();

      const onboarding = await deps.prisma.statementOfFinancialConditionOnboarding.upsert({
        where: { clientId },
        update: {
          status: nextStatus,
          step1CurrentQuestionIndex: nextIndex,
          step1Data: serializeSfcStep1Fields(nextFields)
        },
        create: {
          clientId,
          status: nextStatus,
          ...defaults,
          step1CurrentQuestionIndex: nextIndex,
          step1Data: serializeSfcStep1Fields(nextFields)
        },
        select: {
          status: true,
          step1CurrentQuestionIndex: true,
          step1Data: true
        }
      });

      response.json(
        toStep1Response(
          clientId,
          onboarding.status,
          onboarding.step1CurrentQuestionIndex,
          onboarding.step1Data,
          prefillContext
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/statement-of-financial-condition/step-2', requireAuth(deps), async (request, response, next) => {
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

      if (!client.formSelections.some((selection) => selection.form.code === SFC_FORM_CODE)) {
        response.status(400).json({
          message: 'Statement of Financial Condition is not selected for this client.'
        });
        return;
      }

      const defaults = createDefaultSfcOnboardingPayload();
      const onboarding = await deps.prisma.statementOfFinancialConditionOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: StatementOfFinancialConditionOnboardingStatus.NOT_STARTED,
          ...defaults
        },
        select: {
          status: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      const step7Fields = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);
      const requiresJointOwnerSignature = isStep4RequiredFromStep1(
        client.investorProfileOnboarding?.step1Data ?? null
      );
      const nextRouteAfterCompletion =
        onboarding.status === StatementOfFinancialConditionOnboardingStatus.COMPLETED
          ? getNextRouteAfterSfcCompletion({
              clientId,
              hasBaiodf: client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE),
              baiodfOnboarding: client.baiodfOnboarding,
              hasBaiv506c: client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE),
              baiv506cOnboarding: client.baiv506cOnboarding,
              requiresJointOwnerSignature
            })
          : null;

      response.json(
        toStep2Response(
          clientId,
          onboarding.status,
          onboarding.step2CurrentQuestionIndex,
          onboarding.step2Data,
          nextRouteAfterCompletion,
          {
            requiresJointOwnerSignature,
            accountOwner: step7Fields.signatures.accountOwner,
            jointAccountOwner: step7Fields.signatures.jointAccountOwner,
            financialProfessional: step7Fields.signatures.financialProfessional,
            registeredPrincipal: step7Fields.signatures.supervisorPrincipal
          }
        )
      );
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/statement-of-financial-condition/step-2', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientIdParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const parsedBody = sfcStepTwoPatchSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const questionIdValue = parsedBody.data.questionId;
    if (!isSfcStep2QuestionId(questionIdValue)) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: { questionId: 'Unsupported onboarding question.' }
      });
      return;
    }

    const questionId = questionIdValue as SfcStep2QuestionId;
    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;

    try {
      const client = await loadClientContext(clientId, authUser.id);

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === SFC_FORM_CODE)) {
        response.status(400).json({
          message: 'Statement of Financial Condition is not selected for this client.'
        });
        return;
      }

      const existingOnboarding = await deps.prisma.statementOfFinancialConditionOnboarding.findUnique({
        where: { clientId },
        select: {
          status: true,
          step1Data: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });

      const step7Fields = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);
      const requiresJointOwnerSignature = isStep4RequiredFromStep1(
        client.investorProfileOnboarding?.step1Data ?? null
      );
      const context = {
        requiresJointOwnerSignature
      };
      const prefillContext = {
        requiresJointOwnerSignature,
        accountOwner: step7Fields.signatures.accountOwner,
        jointAccountOwner: step7Fields.signatures.jointAccountOwner,
        financialProfessional: step7Fields.signatures.financialProfessional,
        registeredPrincipal: step7Fields.signatures.supervisorPrincipal
      };

      const existingFields = applySfcStep2Prefill(
        normalizeSfcStep2Fields(existingOnboarding?.step2Data ?? null),
        prefillContext
      );

      const answerValidation = validateSfcStep2Answer(questionId, parsedBody.data.answer, context);
      if (!answerValidation.success) {
        response.status(400).json({
          message: 'Please correct the highlighted fields.',
          fieldErrors: answerValidation.fieldErrors
        });
        return;
      }

      const nextFields = applySfcStep2Answer(existingFields, questionId, answerValidation.value);
      const visibleAfter = getVisibleSfcStep2QuestionIds();
      const currentAnsweredIndex = visibleAfter.indexOf(questionId);
      const safeAnsweredIndex = currentAnsweredIndex >= 0 ? currentAnsweredIndex : 0;
      const nextIndex = Math.min(safeAnsweredIndex + 1, Math.max(visibleAfter.length - 1, 0));
      const defaults = createDefaultSfcOnboardingPayload();

      const prefilledStep1Fields = applySfcStep1Prefill(
        normalizeSfcStep1Fields(existingOnboarding?.step1Data ?? null),
        {
          rrName: client.investorProfileOnboarding?.step1RrName ?? null,
          rrNo: client.investorProfileOnboarding?.step1RrNo ?? null,
          customerNames:
            client.investorProfileOnboarding?.step1CustomerNames ?? client.name ?? null
        }
      );

      const step1Errors = validateSfcStep1Completion(prefilledStep1Fields);
      const step2Errors = validateSfcStep2Completion(nextFields, context);
      const nextStatus =
        Object.keys(step1Errors).length === 0 && Object.keys(step2Errors).length === 0
          ? StatementOfFinancialConditionOnboardingStatus.COMPLETED
          : StatementOfFinancialConditionOnboardingStatus.IN_PROGRESS;

      const onboarding = await deps.prisma.statementOfFinancialConditionOnboarding.upsert({
        where: { clientId },
        update: {
          status: nextStatus,
          step2CurrentQuestionIndex: nextIndex,
          step2Data: serializeSfcStep2Fields(nextFields)
        },
        create: {
          clientId,
          status: nextStatus,
          ...defaults,
          step2CurrentQuestionIndex: nextIndex,
          step2Data: serializeSfcStep2Fields(nextFields)
        },
        select: {
          status: true,
          step2CurrentQuestionIndex: true,
          step2Data: true
        }
      });
      const nextRouteAfterCompletion =
        onboarding.status === StatementOfFinancialConditionOnboardingStatus.COMPLETED
          ? getNextRouteAfterSfcCompletion({
              clientId,
              hasBaiodf: client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE),
              baiodfOnboarding: client.baiodfOnboarding,
              hasBaiv506c: client.formSelections.some((selection) => selection.form.code === BAIV_506C_FORM_CODE),
              baiv506cOnboarding: client.baiv506cOnboarding,
              requiresJointOwnerSignature
            })
          : null;

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
    '/:clientId/statement-of-financial-condition/review/step-:stepNumber',
    requireAuth(deps),
    async (request, response, next) => {
      const parsedParams = sfcReviewStepParamsSchema.safeParse(request.params);
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

        if (!client.formSelections.some((selection) => selection.form.code === SFC_FORM_CODE)) {
          response.status(400).json({
            message: 'Statement of Financial Condition is not selected for this client.'
          });
          return;
        }

        const defaults = createDefaultSfcOnboardingPayload();
        const onboarding = await deps.prisma.statementOfFinancialConditionOnboarding.upsert({
          where: { clientId },
          update: {},
          create: {
            clientId,
            status: StatementOfFinancialConditionOnboardingStatus.NOT_STARTED,
            ...defaults
          },
          select: sfcReviewSelect
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

        const step7Fields = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);
        const requiresJointOwnerSignature = isStep4RequiredFromStep1(
          client.investorProfileOnboarding?.step1Data ?? null
        );
        const step2PrefillContext = {
          requiresJointOwnerSignature,
          accountOwner: step7Fields.signatures.accountOwner,
          jointAccountOwner: step7Fields.signatures.jointAccountOwner,
          financialProfessional: step7Fields.signatures.financialProfessional,
          registeredPrincipal: step7Fields.signatures.supervisorPrincipal
        };
        const nextRouteAfterCompletion =
          onboarding.status === StatementOfFinancialConditionOnboardingStatus.COMPLETED
            ? getNextRouteAfterSfcCompletion({
                clientId,
                hasBaiodf: client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE),
                baiodfOnboarding: client.baiodfOnboarding,
                hasBaiv506c: client.formSelections.some(
                  (selection) => selection.form.code === BAIV_506C_FORM_CODE
                ),
                baiv506cOnboarding: client.baiv506cOnboarding,
                requiresJointOwnerSignature
              })
            : null;

        response.json(
          toSfcReviewResponse(
            clientId,
            stepNumber,
            onboarding,
            nextRouteAfterCompletion,
            prefillContext,
            step2PrefillContext
          )
        );
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/:clientId/statement-of-financial-condition/review/step-:stepNumber',
    requireAuth(deps),
    async (request, response, next) => {
      const parsedParams = sfcReviewStepParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        response.status(400).json({ message: 'Invalid review step request.' });
        return;
      }

      const parsedBody = sfcReviewStepUpdateSchema.safeParse(request.body);
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

        if (!client.formSelections.some((selection) => selection.form.code === SFC_FORM_CODE)) {
          response.status(400).json({
            message: 'Statement of Financial Condition is not selected for this client.'
          });
          return;
        }

        const defaults = createDefaultSfcOnboardingPayload();
        const existing = await deps.prisma.statementOfFinancialConditionOnboarding.findUnique({
          where: { clientId },
          select: sfcReviewSelect
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

        const step7Fields = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);
        const requiresJointOwnerSignature = isStep4RequiredFromStep1(
          client.investorProfileOnboarding?.step1Data ?? null
        );
        const step2PrefillContext = {
          requiresJointOwnerSignature,
          accountOwner: step7Fields.signatures.accountOwner,
          jointAccountOwner: step7Fields.signatures.jointAccountOwner,
          financialProfessional: step7Fields.signatures.financialProfessional,
          registeredPrincipal: step7Fields.signatures.supervisorPrincipal
        };

        let nextStep1Data = (existing?.step1Data ?? defaults.step1Data) as Prisma.JsonValue | null;
        let nextStep2Data = (existing?.step2Data ?? defaults.step2Data) as Prisma.JsonValue | null;
        let stepFieldErrors: Record<string, string> = {};

        if (stepNumber === 1) {
          const fields = normalizeSfcStep1Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateSfcStep1Completion(fields);
          nextStep1Data = serializeSfcStep1Fields(fields) as Prisma.JsonValue;
        } else {
          const fields = normalizeSfcStep2Fields(parsedBody.data.fields as Prisma.JsonValue);
          stepFieldErrors = validateSfcStep2Completion(fields, {
            requiresJointOwnerSignature
          });
          nextStep2Data = serializeSfcStep2Fields(fields) as Prisma.JsonValue;
        }

        if (Object.keys(stepFieldErrors).length > 0) {
          response.status(400).json({
            message: 'Please correct the highlighted fields.',
            fieldErrors: stepFieldErrors
          });
          return;
        }

        const fullStep1Fields = applySfcStep1Prefill(normalizeSfcStep1Fields(nextStep1Data), step1PrefillContext);
        const fullStep2Fields = applySfcStep2Prefill(normalizeSfcStep2Fields(nextStep2Data), step2PrefillContext);
        const nextStatus =
          Object.keys(validateSfcStep1Completion(fullStep1Fields)).length === 0 &&
          Object.keys(validateSfcStep2Completion(fullStep2Fields, { requiresJointOwnerSignature })).length === 0
            ? StatementOfFinancialConditionOnboardingStatus.COMPLETED
            : StatementOfFinancialConditionOnboardingStatus.IN_PROGRESS;

        const onboarding = await deps.prisma.statementOfFinancialConditionOnboarding.upsert({
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
          select: sfcReviewSelect
        });

        const nextRouteAfterCompletion =
          onboarding.status === StatementOfFinancialConditionOnboardingStatus.COMPLETED
            ? getNextRouteAfterSfcCompletion({
                clientId,
                hasBaiodf: client.formSelections.some((selection) => selection.form.code === BAIODF_FORM_CODE),
                baiodfOnboarding: client.baiodfOnboarding,
                hasBaiv506c: client.formSelections.some(
                  (selection) => selection.form.code === BAIV_506C_FORM_CODE
                ),
                baiv506cOnboarding: client.baiv506cOnboarding,
                requiresJointOwnerSignature
              })
            : null;

        response.json(
          toSfcReviewResponse(
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
