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
  type Step1Fields,
  type Step1QuestionId,
  validateStep1Answer
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
  validateStep2Answer
} from '../lib/investor-profile-step2.js';
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
      step1RrName: true
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toClientDto(client: HydratedClient) {
  const primaryLink = client.brokerLinks.find((item) => item.role === ClientBrokerRole.PRIMARY);

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
    hasInvestorProfile: client.formSelections.some((selection) => selection.form.code === INVESTOR_PROFILE_FORM_CODE),
    investorProfileOnboardingStatus:
      client.investorProfileOnboarding?.status ?? InvestorProfileOnboardingStatus.NOT_STARTED
  };
}

function createDefaultOnboardingPayload() {
  const step1Defaults = defaultStep1Fields();
  const step2Defaults = defaultStep2Fields();

  return {
    step1RrName: step1Defaults.accountRegistration.rrName,
    step1RrNo: step1Defaults.accountRegistration.rrNo,
    step1CustomerNames: step1Defaults.accountRegistration.customerNames,
    step1AccountNo: step1Defaults.accountRegistration.accountNo,
    step1AccountType: step1Defaults.accountRegistration.retailRetirement,
    step1CurrentQuestionIndex: 0,
    step1Data: serializeStep1Fields(step1Defaults),
    step2CurrentQuestionIndex: 0,
    step2Data: serializeStep2Fields(step2Defaults)
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

  return router;
}
