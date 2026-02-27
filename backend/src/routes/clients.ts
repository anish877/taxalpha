import { ClientBrokerRole, InvestorProfileOnboardingStatus, Prisma } from '@prisma/client';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { HttpError } from '../lib/http-error.js';
import { zodFieldErrors } from '../lib/validation.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const INVESTOR_PROFILE_FORM_CODE = 'INVESTOR_PROFILE';
const STEP_1_LABEL = 'STEP 1. ACCOUNT REGISTRATION';
const STEP_1_MAX_QUESTION_INDEX = 4;
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

const accountTypeSchema = z.object({
  retirement: z.boolean(),
  retail: z.boolean()
});

const investorProfileStepOneSchema = z
  .object({
    rrName: z.string().trim().min(1, 'RR Name is required.').optional(),
    rrNo: z.string().trim().min(1, 'RR No. is required.').optional(),
    customerNames: z.string().trim().min(1, 'Customer Name(s) is required.').optional(),
    accountNo: z.string().trim().min(1, 'Account No. is required.').optional(),
    accountType: accountTypeSchema.optional(),
    currentQuestionIndex: z.number().int().min(0).max(STEP_1_MAX_QUESTION_INDEX).optional()
  })
  .superRefine((value, ctx) => {
    const hasQuestionUpdate =
      value.rrName !== undefined ||
      value.rrNo !== undefined ||
      value.customerNames !== undefined ||
      value.accountNo !== undefined ||
      value.accountType !== undefined;

    if (!hasQuestionUpdate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['update'],
        message: 'At least one question value is required.'
      });
    }

    if (
      value.accountType !== undefined &&
      Number(value.accountType.retirement) + Number(value.accountType.retail) !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountType'],
        message: 'Select exactly one account type.'
      });
    }
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

interface Step1Response {
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

interface AccountTypeValue {
  retirement: boolean;
  retail: boolean;
}

interface Step1FieldValue {
  rrName: string;
  rrNo: string;
  customerNames: string;
  accountNo: string;
  accountType: AccountTypeValue;
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

function defaultAccountType(): AccountTypeValue {
  return {
    retirement: false,
    retail: false
  };
}

function normalizeAccountType(value: Prisma.JsonValue | null | undefined): AccountTypeValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultAccountType();
  }

  const objectValue = value as Record<string, unknown>;
  const retirement = typeof objectValue.retirement === 'boolean' ? objectValue.retirement : false;
  const retail = typeof objectValue.retail === 'boolean' ? objectValue.retail : false;

  return {
    retirement,
    retail
  };
}

function clampQuestionIndex(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > STEP_1_MAX_QUESTION_INDEX) {
    return STEP_1_MAX_QUESTION_INDEX;
  }

  return value;
}

function buildStep1Data(fields: Step1FieldValue): Prisma.InputJsonValue {
  return {
    rrName: fields.rrName,
    rrNo: fields.rrNo,
    customerNames: fields.customerNames,
    accountNo: fields.accountNo,
    accountType: fields.accountType
  };
}

function toStepOneResponse(
  clientId: string,
  onboarding: {
    status: InvestorProfileOnboardingStatus;
    step1RrName: string | null;
    step1RrNo: string | null;
    step1CustomerNames: string | null;
    step1AccountNo: string | null;
    step1AccountType: Prisma.JsonValue | null;
    step1CurrentQuestionIndex: number;
  }
): Step1Response {
  const accountType = normalizeAccountType(onboarding.step1AccountType);

  return {
    onboarding: {
      clientId,
      status: onboarding.status,
      step: {
        key: 'STEP_1_ACCOUNT_REGISTRATION',
        label: STEP_1_LABEL,
        currentQuestionIndex: clampQuestionIndex(onboarding.step1CurrentQuestionIndex),
        fields: {
          rrName: onboarding.step1RrName ?? '',
          rrNo: onboarding.step1RrNo ?? '',
          customerNames: onboarding.step1CustomerNames ?? '',
          accountNo: onboarding.step1AccountNo ?? '',
          accountType
        }
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

        await transactionClient.investorProfileOnboarding.create({
          data: {
            clientId: createdClient.id,
            status: InvestorProfileOnboardingStatus.NOT_STARTED,
            step1AccountType: defaultAccountType(),
            step1CurrentQuestionIndex: 0,
            step1Data: buildStep1Data({
              rrName: '',
              rrNo: '',
              customerNames: '',
              accountNo: '',
              accountType: defaultAccountType()
            })
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

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {},
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.NOT_STARTED,
          step1AccountType: defaultAccountType(),
          step1CurrentQuestionIndex: 0,
          step1Data: buildStep1Data({
            rrName: '',
            rrNo: '',
            customerNames: '',
            accountNo: '',
            accountType: defaultAccountType()
          })
        },
        select: {
          status: true,
          step1RrName: true,
          step1RrNo: true,
          step1CustomerNames: true,
          step1AccountNo: true,
          step1AccountType: true,
          step1CurrentQuestionIndex: true
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

    const parsedBody = investorProfileStepOneSchema.safeParse(request.body);

    if (!parsedBody.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsedBody.error)
      });
      return;
    }

    const authUser = request.authUser!;
    const clientId = parsedParams.data.clientId;
    const updatePayload = parsedBody.data;

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
          step1RrName: true,
          step1RrNo: true,
          step1CustomerNames: true,
          step1AccountNo: true,
          step1AccountType: true,
          step1CurrentQuestionIndex: true
        }
      });

      const mergedStepOne: Step1FieldValue = {
        rrName: existingOnboarding?.step1RrName ?? '',
        rrNo: existingOnboarding?.step1RrNo ?? '',
        customerNames: existingOnboarding?.step1CustomerNames ?? '',
        accountNo: existingOnboarding?.step1AccountNo ?? '',
        accountType: normalizeAccountType(existingOnboarding?.step1AccountType)
      };

      if (updatePayload.rrName !== undefined) {
        mergedStepOne.rrName = updatePayload.rrName.trim();
      }

      if (updatePayload.rrNo !== undefined) {
        mergedStepOne.rrNo = updatePayload.rrNo.trim();
      }

      if (updatePayload.customerNames !== undefined) {
        mergedStepOne.customerNames = updatePayload.customerNames.trim();
      }

      if (updatePayload.accountNo !== undefined) {
        mergedStepOne.accountNo = updatePayload.accountNo.trim();
      }

      if (updatePayload.accountType !== undefined) {
        mergedStepOne.accountType = updatePayload.accountType;
      }

      const currentQuestionIndex = clampQuestionIndex(
        updatePayload.currentQuestionIndex ?? existingOnboarding?.step1CurrentQuestionIndex ?? 0
      );

      const onboarding = await deps.prisma.investorProfileOnboarding.upsert({
        where: { clientId },
        update: {
          status: InvestorProfileOnboardingStatus.IN_PROGRESS,
          step1RrName: mergedStepOne.rrName,
          step1RrNo: mergedStepOne.rrNo,
          step1CustomerNames: mergedStepOne.customerNames,
          step1AccountNo: mergedStepOne.accountNo,
          step1AccountType: mergedStepOne.accountType,
          step1CurrentQuestionIndex: currentQuestionIndex,
          step1Data: buildStep1Data(mergedStepOne)
        },
        create: {
          clientId,
          status: InvestorProfileOnboardingStatus.IN_PROGRESS,
          step1RrName: mergedStepOne.rrName,
          step1RrNo: mergedStepOne.rrNo,
          step1CustomerNames: mergedStepOne.customerNames,
          step1AccountNo: mergedStepOne.accountNo,
          step1AccountType: mergedStepOne.accountType,
          step1CurrentQuestionIndex: currentQuestionIndex,
          step1Data: buildStep1Data(mergedStepOne)
        },
        select: {
          status: true,
          step1RrName: true,
          step1RrNo: true,
          step1CustomerNames: true,
          step1AccountNo: true,
          step1AccountType: true,
          step1CurrentQuestionIndex: true
        }
      });

      response.json(toStepOneResponse(clientId, onboarding));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
