import {
  BrokerageAccreditedInvestorVerificationOnboardingStatus,
  BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus,
  InvestorProfileOnboardingStatus,
  StatementOfFinancialConditionOnboardingStatus,
  type Prisma
} from '@prisma/client';

import {
  applyBaiv506cStep1Prefill,
  normalizeBaiv506cStep1Fields
} from './baiv-506c-step1.js';
import {
  applyBaiv506cStep2Prefill,
  normalizeBaiv506cStep2Fields
} from './baiv-506c-step2.js';
import {
  applyBaiodfStep1Prefill,
  normalizeBaiodfStep1Fields
} from './baiodf-step1.js';
import {
  applyBaiodfStep2Prefill,
  normalizeBaiodfStep2Fields
} from './baiodf-step2.js';
import {
  applyBaiodfStep3Prefill,
  normalizeBaiodfStep3Fields
} from './baiodf-step3.js';
import { HttpError } from './http-error.js';
import { normalizeStep1Fields, type PrimaryTypeKey } from './investor-profile-step1.js';
import { normalizeStep2Fields } from './investor-profile-step2.js';
import { normalizeStep3Fields } from './investor-profile-step3.js';
import { normalizeStep4Fields } from './investor-profile-step4.js';
import { normalizeStep5Fields } from './investor-profile-step5.js';
import { normalizeStep6Fields } from './investor-profile-step6.js';
import { applyStep7Prefill, normalizeStep7Fields } from './investor-profile-step7.js';
import {
  applySfcStep1Prefill,
  getSfcStep1Totals,
  normalizeSfcStep1Fields
} from './statement-of-financial-condition-step1.js';
import {
  applySfcStep2Prefill,
  normalizeSfcStep2Fields
} from './statement-of-financial-condition-step2.js';
import type { N8nWebhookConfig } from '../types/deps.js';

export const INVESTOR_PROFILE_FORM_CODE = 'INVESTOR_PROFILE';
export const INVESTOR_PROFILE_ADDITIONAL_HOLDER_FORM_CODE = 'INVESTOR_PROFILE_ADDITIONAL_HOLDER';
export const STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE = 'SFC';
export const BAIODF_FORM_CODE = 'BAIODF';
export const BAIV_506C_FORM_CODE = 'BAIV_506C';

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

const PERSON_ACCOUNT_TYPES = new Set<string>([
  'individual',
  'custodial',
  'jointTenant',
  'transferOnDeathIndividual',
  'transferOnDeathJoint'
]);

export interface FormWebhookClientSnapshot {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  formSelections: Array<{
    form: {
      code: string;
      title: string;
    };
  }>;
  investorProfileOnboarding: {
    status: InvestorProfileOnboardingStatus;
    step1RrName: string | null;
    step1RrNo: string | null;
    step1CustomerNames: string | null;
    step1AccountNo: string | null;
    step1AccountType: Prisma.JsonValue | null;
    step1Data: Prisma.JsonValue | null;
    step2Data: Prisma.JsonValue | null;
    step3Data: Prisma.JsonValue | null;
    step4Data: Prisma.JsonValue | null;
    step5Data: Prisma.JsonValue | null;
    step6Data: Prisma.JsonValue | null;
    step7Data: Prisma.JsonValue | null;
  } | null;
  statementOfFinancialConditionOnboarding: {
    status: StatementOfFinancialConditionOnboardingStatus;
    step1Data: Prisma.JsonValue | null;
    step2Data: Prisma.JsonValue | null;
  } | null;
  baiodfOnboarding: {
    status: BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus;
    step1Data: Prisma.JsonValue | null;
    step2Data: Prisma.JsonValue | null;
    step3Data: Prisma.JsonValue | null;
  } | null;
  baiv506cOnboarding: {
    status: BrokerageAccreditedInvestorVerificationOnboardingStatus;
    step1Data: Prisma.JsonValue | null;
    step2Data: Prisma.JsonValue | null;
  } | null;
}

interface SignatureBlock {
  typedSignature: string | null;
  printedName: string | null;
  date: string | null;
}

interface FormWebhookMetadata {
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  formCode: string;
  formTitle: string;
  sourceFormCode?: string;
  onboardingStatus?: string;
}

export interface FormWebhookPayload {
  metadata: FormWebhookMetadata;
  fields: unknown;
}

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

function resolveSignatureBlock(
  ...sources: Array<SignatureBlock | null | undefined>
): SignatureBlock {
  return {
    typedSignature: sources.find((source) => source?.typedSignature)?.typedSignature ?? null,
    printedName: sources.find((source) => source?.printedName)?.printedName ?? null,
    date: sources.find((source) => source?.date)?.date ?? null
  };
}

function getFormTitle(client: FormWebhookClientSnapshot, formCode: string): string {
  if (formCode === INVESTOR_PROFILE_ADDITIONAL_HOLDER_FORM_CODE) {
    return 'Additional Holder';
  }

  return (
    client.formSelections.find((selection) => selection.form.code === formCode)?.form.title ??
    formCode
  );
}

function ensureNullFields(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => ensureNullFields(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, ensureNullFields(entryValue)])
    );
  }

  return value;
}

function createPayload(metadata: FormWebhookMetadata, fields: unknown): FormWebhookPayload {
  return {
    metadata: ensureNullFields(metadata) as FormWebhookMetadata,
    fields: ensureNullFields(fields)
  };
}

function getInvestorStep1Fields(client: FormWebhookClientSnapshot) {
  return normalizeStep1Fields(client.investorProfileOnboarding?.step1Data ?? null, {
    step1RrName: client.investorProfileOnboarding?.step1RrName ?? null,
    step1RrNo: client.investorProfileOnboarding?.step1RrNo ?? null,
    step1CustomerNames: client.investorProfileOnboarding?.step1CustomerNames ?? null,
    step1AccountNo: client.investorProfileOnboarding?.step1AccountNo ?? null,
    step1AccountType: client.investorProfileOnboarding?.step1AccountType ?? null
  });
}

function createBaseMetadata(
  client: FormWebhookClientSnapshot,
  formCode: string,
  onboardingStatus?: string
): FormWebhookMetadata {
  return {
    clientId: client.id,
    clientName: client.name,
    clientEmail: client.email,
    clientPhone: client.phone,
    formCode,
    formTitle: getFormTitle(client, formCode),
    onboardingStatus
  };
}

export function buildFormWebhookPayload(
  client: FormWebhookClientSnapshot,
  formCode: string,
  advisorName: string
): FormWebhookPayload {
  switch (formCode) {
    case INVESTOR_PROFILE_FORM_CODE:
      return buildInvestorProfilePayload(client, advisorName);
    case INVESTOR_PROFILE_ADDITIONAL_HOLDER_FORM_CODE:
      return buildAdditionalHolderPayload(client);
    case STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE:
      return buildStatementOfFinancialConditionPayload(client);
    case BAIODF_FORM_CODE:
      return buildBaiodfPayload(client, advisorName);
    case BAIV_506C_FORM_CODE:
      return buildBaiv506cPayload(client, advisorName);
    default:
      throw new HttpError(400, `Unsupported n8n webhook form code: ${formCode}.`);
  }
}

function buildInvestorProfilePayload(
  client: FormWebhookClientSnapshot,
  advisorName: string
): FormWebhookPayload {
  const step1Fields = getInvestorStep1Fields(client);
  const step3DefaultKind = inferDefaultHolderKindFromStep1(client.investorProfileOnboarding?.step1Data ?? null);
  const step3Fields = applyHolderKindDefault(
    normalizeStep3Fields(client.investorProfileOnboarding?.step3Data ?? null),
    step3DefaultKind
  );
  const step4Fields = applyHolderKindDefault(
    normalizeStep4Fields(client.investorProfileOnboarding?.step4Data ?? null),
    step3DefaultKind
  );
  const step7Fields = applyStep7Prefill(
    normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null),
    {
      accountOwnerPrintedName: step3Fields.holder.name || null,
      jointAccountOwnerPrintedName: step4Fields.holder.name || null,
      financialProfessionalPrintedName: advisorName,
      requiresJointOwnerSignature: isStep4RequiredFromStep1(client.investorProfileOnboarding?.step1Data ?? null)
    }
  );

  return {
    ...createPayload(
      createBaseMetadata(
        client,
        INVESTOR_PROFILE_FORM_CODE,
        client.investorProfileOnboarding?.status ?? InvestorProfileOnboardingStatus.NOT_STARTED
      ),
      {
        step1: step1Fields,
        step2: normalizeStep2Fields(client.investorProfileOnboarding?.step2Data ?? null),
        step3: step3Fields,
        step4: step4Fields,
        step5: normalizeStep5Fields(client.investorProfileOnboarding?.step5Data ?? null),
        step6: normalizeStep6Fields(client.investorProfileOnboarding?.step6Data ?? null),
        step7: step7Fields
      }
    )
  };
}

function buildAdditionalHolderPayload(client: FormWebhookClientSnapshot): FormWebhookPayload {
  const defaultKind = inferDefaultHolderKindFromStep1(client.investorProfileOnboarding?.step1Data ?? null);
  const step4Fields = applyHolderKindDefault(
    normalizeStep4Fields(client.investorProfileOnboarding?.step4Data ?? null),
    defaultKind
  );

  return {
    ...createPayload(
      {
        ...createBaseMetadata(
          client,
          INVESTOR_PROFILE_ADDITIONAL_HOLDER_FORM_CODE,
          client.investorProfileOnboarding?.status ?? InvestorProfileOnboardingStatus.NOT_STARTED
        ),
        sourceFormCode: INVESTOR_PROFILE_FORM_CODE
      },
      step4Fields
    )
  };
}

function buildStatementOfFinancialConditionPayload(client: FormWebhookClientSnapshot): FormWebhookPayload {
  const investorStep1 = getInvestorStep1Fields(client);
  const investorStep7 = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);
  const requiresJointOwnerSignature = isStep4RequiredFromStep1(
    client.investorProfileOnboarding?.step1Data ?? null
  );

  return {
    ...createPayload(
      createBaseMetadata(
        client,
        STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE,
        client.statementOfFinancialConditionOnboarding?.status ??
          StatementOfFinancialConditionOnboardingStatus.NOT_STARTED
      ),
      {
        step1: applySfcStep1Prefill(
          normalizeSfcStep1Fields(client.statementOfFinancialConditionOnboarding?.step1Data ?? null),
          {
            rrName: investorStep1.accountRegistration.rrName || null,
            rrNo: investorStep1.accountRegistration.rrNo || null,
            customerNames: investorStep1.accountRegistration.customerNames || client.name || null
          }
        ),
        step2: applySfcStep2Prefill(
          normalizeSfcStep2Fields(client.statementOfFinancialConditionOnboarding?.step2Data ?? null),
          {
            requiresJointOwnerSignature,
            accountOwner: investorStep7.signatures.accountOwner,
            jointAccountOwner: investorStep7.signatures.jointAccountOwner,
            financialProfessional: investorStep7.signatures.financialProfessional,
            registeredPrincipal: investorStep7.signatures.supervisorPrincipal
          }
        )
      }
    )
  };
}

function buildBaiodfPayload(
  client: FormWebhookClientSnapshot,
  advisorName: string
): FormWebhookPayload {
  const investorStep1 = getInvestorStep1Fields(client);
  const investorStep7 = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);
  const sfcStep2 = normalizeSfcStep2Fields(client.statementOfFinancialConditionOnboarding?.step2Data ?? null);
  const sfcStep1 = normalizeSfcStep1Fields(client.statementOfFinancialConditionOnboarding?.step1Data ?? null);
  const sfcTotals = getSfcStep1Totals(sfcStep1);
  const requiresJointOwnerSignature = isStep4RequiredFromStep1(
    client.investorProfileOnboarding?.step1Data ?? null
  );

  const financialProfessional = resolveSignatureBlock(
    sfcStep2.signatures.financialProfessional,
    investorStep7.signatures.financialProfessional
  );

  if (!financialProfessional.printedName) {
    financialProfessional.printedName = advisorName;
  }

  return {
    ...createPayload(
      createBaseMetadata(
        client,
        BAIODF_FORM_CODE,
        client.baiodfOnboarding?.status ??
          BrokerageAlternativeInvestmentOrderDisclosureOnboardingStatus.NOT_STARTED
      ),
      {
        step1: applyBaiodfStep1Prefill(
          normalizeBaiodfStep1Fields(client.baiodfOnboarding?.step1Data ?? null),
          {
            rrName: investorStep1.accountRegistration.rrName || null,
            rrNo: investorStep1.accountRegistration.rrNo || null,
            customerNames: investorStep1.accountRegistration.customerNames || client.name || null
          }
        ),
        step2: applyBaiodfStep2Prefill(
          normalizeBaiodfStep2Fields(client.baiodfOnboarding?.step2Data ?? null),
          {
            totalNetWorth: client.statementOfFinancialConditionOnboarding?.step1Data
              ? sfcTotals.totalNetWorth
              : null,
            liquidNetWorth: client.statementOfFinancialConditionOnboarding?.step1Data
              ? sfcTotals.totalPotentialLiquidity
              : null
          }
        ),
        step3: applyBaiodfStep3Prefill(
          normalizeBaiodfStep3Fields(client.baiodfOnboarding?.step3Data ?? null),
          {
            requiresJointOwnerSignature,
            accountOwner: resolveSignatureBlock(
              sfcStep2.signatures.accountOwner,
              investorStep7.signatures.accountOwner
            ),
            jointAccountOwner: resolveSignatureBlock(
              sfcStep2.signatures.jointAccountOwner,
              investorStep7.signatures.jointAccountOwner
            ),
            financialProfessional
          }
        )
      }
    )
  };
}

function buildBaiv506cPayload(
  client: FormWebhookClientSnapshot,
  advisorName: string
): FormWebhookPayload {
  const investorStep1 = getInvestorStep1Fields(client);
  const investorStep7 = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);
  const baiodfStep3 = normalizeBaiodfStep3Fields(client.baiodfOnboarding?.step3Data ?? null);
  const sfcStep2 = normalizeSfcStep2Fields(client.statementOfFinancialConditionOnboarding?.step2Data ?? null);
  const requiresJointOwnerSignature = isStep4RequiredFromStep1(
    client.investorProfileOnboarding?.step1Data ?? null
  );

  const financialProfessional = resolveSignatureBlock(
    baiodfStep3.signatures.financialProfessional,
    sfcStep2.signatures.financialProfessional,
    investorStep7.signatures.financialProfessional
  );

  if (!financialProfessional.printedName) {
    financialProfessional.printedName = advisorName;
  }

  return {
    ...createPayload(
      createBaseMetadata(
        client,
        BAIV_506C_FORM_CODE,
        client.baiv506cOnboarding?.status ??
          BrokerageAccreditedInvestorVerificationOnboardingStatus.NOT_STARTED
      ),
      {
        step1: applyBaiv506cStep1Prefill(
          normalizeBaiv506cStep1Fields(client.baiv506cOnboarding?.step1Data ?? null),
          {
            rrName: investorStep1.accountRegistration.rrName || null,
            rrNo: investorStep1.accountRegistration.rrNo || null,
            customerNames: investorStep1.accountRegistration.customerNames || client.name || null
          }
        ),
        step2: applyBaiv506cStep2Prefill(
          normalizeBaiv506cStep2Fields(client.baiv506cOnboarding?.step2Data ?? null),
          {
            requiresJointOwnerSignature,
            accountOwner: resolveSignatureBlock(
              baiodfStep3.signatures.accountOwner,
              sfcStep2.signatures.accountOwner,
              investorStep7.signatures.accountOwner
            ),
            jointAccountOwner: resolveSignatureBlock(
              baiodfStep3.signatures.jointAccountOwner,
              sfcStep2.signatures.jointAccountOwner,
              investorStep7.signatures.jointAccountOwner
            ),
            financialProfessional
          }
        )
      }
    )
  };
}

function getWebhookUrl(formCode: string, config: N8nWebhookConfig | undefined): string | null {
  switch (formCode) {
    case INVESTOR_PROFILE_FORM_CODE:
      return config?.investorProfileUrl ?? null;
    case INVESTOR_PROFILE_ADDITIONAL_HOLDER_FORM_CODE:
      return config?.investorProfileAdditionalHolderUrl ?? null;
    case STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE:
      return config?.statementOfFinancialConditionUrl ?? null;
    case BAIODF_FORM_CODE:
      return config?.baiodfUrl ?? null;
    case BAIV_506C_FORM_CODE:
      return config?.baiv506cUrl ?? null;
    default:
      return null;
  }
}

export async function syncFormsToN8n(params: {
  client: FormWebhookClientSnapshot;
  formCodes: string[];
  advisorName: string;
  config: N8nWebhookConfig | undefined;
  fetchFn?: typeof fetch;
  skipWhenUnconfigured?: boolean;
}): Promise<void> {
  const fetchFn = params.fetchFn ?? globalThis.fetch;
  if (!fetchFn) {
    throw new HttpError(500, 'Fetch is unavailable for n8n form sync.');
  }

  const timeoutMs = params.config?.timeoutMs ?? 5000;

  for (const formCode of params.formCodes) {
    const webhookUrl = getWebhookUrl(formCode, params.config);

    if (!webhookUrl) {
      if (params.skipWhenUnconfigured) {
        continue;
      }

      throw new HttpError(500, `Missing n8n webhook URL for form ${formCode}.`);
    }

    const payload = buildFormWebhookPayload(params.client, formCode, params.advisorName);

    let response: Response;
    try {
      response = await fetchFn(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      console.error(error);
      throw new HttpError(502, `Unable to sync ${payload.metadata.formTitle} to n8n.`);
    }

    if (!response.ok) {
      throw new HttpError(502, `Unable to sync ${payload.metadata.formTitle} to n8n.`);
    }
  }
}
