/**
 * Prototype BAIV 506(c) PDF mapping/fill rehearsal.
 *
 * Reads one real client from the local TaxAlpha DB, resolves the current
 * production-style BAIV payload, fills the real Realta 506(c) PDF, and writes:
 * - a variable-overlay PDF for admin mapping review
 * - a value-filled PDF for output QA
 * - a JSON report showing value/source/confidence for each PDF field
 *
 * Usage:
 *   tsx src/scripts/prototype-baiv506c-pdf-map.ts \
 *     --pdf /Users/anishsuman/Downloads/506c-Policy-and-Accreditation-Form-v20240101.pdf
 *
 * Optional:
 *   --client-id <id>
 *   --email <client email>
 *   --out-dir output/pdf/baiv506c-prototype
 */
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PDFDocument, PDFTextField, StandardFonts } from 'pdf-lib';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import {
  BAIV_506C_FORM_CODE,
  buildFormWebhookPayload,
  type FormWebhookClientSnapshot
} from '../lib/form-webhook-sync.js';
import { normalizeBaiv506cStep1Fields } from '../lib/baiv-506c-step1.js';
import { normalizeBaiv506cStep2Fields } from '../lib/baiv-506c-step2.js';
import { normalizeBaiodfStep2Fields } from '../lib/baiodf-step2.js';
import { normalizeBaiodfStep3Fields } from '../lib/baiodf-step3.js';
import { normalizeStep1Fields, type PrimaryTypeKey } from '../lib/investor-profile-step1.js';
import { normalizeStep7Fields } from '../lib/investor-profile-step7.js';
import {
  getSfcStep1Totals,
  normalizeSfcStep1Fields
} from '../lib/statement-of-financial-condition-step1.js';
import { normalizeSfcStep2Fields } from '../lib/statement-of-financial-condition-step2.js';

const DEFAULT_OUT_DIR = 'output/pdf/baiv506c-prototype';
const DEFAULT_BACKEND_PUBLIC_URL = 'http://localhost:4000';

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

type SignatureBlock = {
  typedSignature: string | null;
  printedName: string | null;
  date: string | null;
};

type SourceValue = {
  value: string | null;
  source: string;
  sourcePath: string | null;
  confidence: 'high' | 'medium' | 'low' | 'empty';
};

type PdfMapping = {
  pdfField: string;
  variable: string;
  placeholder: string;
  transform?: 'usDate';
  adminOnly?: boolean;
};

const PDF_MAPPINGS: PdfMapping[] = [
  { pdfField: 'RR Name', variable: 'advisor.rrName', placeholder: '{rrName}' },
  { pdfField: 'RR No', variable: 'advisor.rrNumber', placeholder: '{rrNo}' },
  { pdfField: 'Customer Names', variable: 'account.customerNames', placeholder: '{customerNames}' },
  {
    pdfField: 'Acct Owner Name',
    variable: 'signature.accountOwner.printedName',
    placeholder: '{ownerName}'
  },
  {
    pdfField: 'Acct Owner Date',
    variable: 'signature.accountOwner.date',
    placeholder: '{ownerDate}',
    transform: 'usDate'
  },
  {
    pdfField: 'Jt Acct Owner Name',
    variable: 'signature.jointAccountOwner.printedName',
    placeholder: '{jointName}'
  },
  {
    pdfField: 'Jt Acct Owner Date',
    variable: 'signature.jointAccountOwner.date',
    placeholder: '{jointDate}',
    transform: 'usDate'
  },
  {
    pdfField: 'FP Name',
    variable: 'signature.financialProfessional.printedName',
    placeholder: '{fpName}'
  },
  {
    pdfField: 'FP Date',
    variable: 'signature.financialProfessional.date',
    placeholder: '{fpDate}',
    transform: 'usDate'
  },
  {
    pdfField: 'Supervisor Name',
    variable: 'signature.registeredPrincipal.printedName',
    placeholder: '{principalName}',
    adminOnly: true
  },
  {
    pdfField: 'Supervisor Date',
    variable: 'signature.registeredPrincipal.date',
    placeholder: '{principalDate}',
    transform: 'usDate',
    adminOnly: true
  }
];

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function requireArg(flag: string): string {
  const value = getArg(flag);
  if (!value) {
    throw new Error(`Missing required ${flag}.`);
  }
  return value;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asJson(value: unknown): Prisma.JsonValue | null {
  return (value ?? null) as Prisma.JsonValue | null;
}

function selectedPrimaryType(step1Data: Prisma.JsonValue | null | undefined): PrimaryTypeKey | null {
  const step1 = normalizeStep1Fields(step1Data ?? null);
  const selected = Object.entries(step1.typeOfAccount.primaryType)
    .filter(([, isSelected]) => isSelected)
    .map(([key]) => key as PrimaryTypeKey);
  return selected.length === 1 ? selected[0] : null;
}

function requiresJointOwnerSignature(step1Data: Prisma.JsonValue | null | undefined): boolean {
  const primaryType = selectedPrimaryType(step1Data);
  return primaryType ? STEP4_REQUIRED_ACCOUNT_TYPES.has(primaryType) : false;
}

function resolveString(
  candidates: Array<{ value: string | null | undefined; source: string; sourcePath: string; confidence?: SourceValue['confidence'] }>,
  fallback?: { value: string | null | undefined; source: string; sourcePath: string; confidence?: SourceValue['confidence'] }
): SourceValue {
  for (const candidate of candidates) {
    if (isNonEmpty(candidate.value)) {
      return {
        value: candidate.value.trim(),
        source: candidate.source,
        sourcePath: candidate.sourcePath,
        confidence: candidate.confidence ?? 'high'
      };
    }
  }

  if (fallback && isNonEmpty(fallback.value)) {
    return {
      value: fallback.value.trim(),
      source: fallback.source,
      sourcePath: fallback.sourcePath,
      confidence: fallback.confidence ?? 'low'
    };
  }

  return {
    value: null,
    source: 'empty',
    sourcePath: null,
    confidence: 'empty'
  };
}

function resolveSignatureValue(
  part: keyof SignatureBlock,
  sources: Array<{ block: SignatureBlock; source: string; sourcePath: string }>,
  fallback?: { value: string | null | undefined; source: string; sourcePath: string; confidence?: SourceValue['confidence'] }
): SourceValue {
  return resolveString(
    sources.map((source) => ({
      value: source.block[part],
      source: source.source,
      sourcePath: `${source.sourcePath}.${part}`
    })),
    fallback
  );
}

function transformValue(value: string | null, transform: PdfMapping['transform']): string {
  if (!value) return '';
  if (transform !== 'usDate') return value;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function safeFileSegment(input: string): string {
  return input.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'client';
}

function valueForPdfField(mapping: PdfMapping, sourceValue: SourceValue): string {
  return transformValue(sourceValue.value, mapping.transform);
}

async function fillPdf(params: {
  inputPdfPath: string;
  outputPdfPath: string;
  mappings: PdfMapping[];
  values: Record<string, SourceValue>;
  mode: 'variables' | 'values';
}): Promise<void> {
  const pdf = await PDFDocument.load(await readFile(params.inputPdfPath));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();

  for (const mapping of params.mappings) {
    const field = form.getFieldMaybe(mapping.pdfField);
    if (!(field instanceof PDFTextField)) {
      continue;
    }

    const rawValue =
      params.mode === 'variables'
        ? mapping.placeholder
        : valueForPdfField(mapping, params.values[mapping.variable] ?? {
            value: null,
            source: 'empty',
            sourcePath: null,
            confidence: 'empty'
          });

    field.setText(rawValue);
    field.setFontSize(params.mode === 'variables' ? 8 : 10);
  }

  form.updateFieldAppearances(font);
  form.flatten();
  await writeFile(params.outputPdfPath, await pdf.save());
}

async function loadClient(clientId: string | null, email: string | null): Promise<FormWebhookClientSnapshot & {
  owner: { name: string };
}> {
  const select = {
    id: true,
    name: true,
    email: true,
    phone: true,
    owner: { select: { name: true } },
    formSelections: { select: { form: { select: { code: true, title: true } } } },
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
  } satisfies Prisma.ClientSelect;

  const where = clientId
    ? { id: clientId }
    : email
      ? { email }
      : {
          formSelections: {
            some: {
              form: {
                code: BAIV_506C_FORM_CODE
              }
            }
          }
        };

  const client = await prisma.client.findFirst({
    where,
    orderBy: { updatedAt: 'desc' },
    select
  });

  if (!client) {
    throw new Error(
      clientId || email
        ? 'No client matched the requested selector.'
        : `No client with ${BAIV_506C_FORM_CODE} selected was found.`
    );
  }

  return client as unknown as FormWebhookClientSnapshot & { owner: { name: string } };
}

function buildSourceValues(client: FormWebhookClientSnapshot & { owner: { name: string } }): {
  values: Record<string, SourceValue>;
  evidence: Record<string, unknown>;
} {
  const investorStep1 = normalizeStep1Fields(client.investorProfileOnboarding?.step1Data ?? null, {
    step1RrName: client.investorProfileOnboarding?.step1RrName ?? null,
    step1RrNo: client.investorProfileOnboarding?.step1RrNo ?? null,
    step1CustomerNames: client.investorProfileOnboarding?.step1CustomerNames ?? null,
    clientName: client.name
  });
  const baivStep1 = normalizeBaiv506cStep1Fields(client.baiv506cOnboarding?.step1Data ?? null);
  const baivStep2 = normalizeBaiv506cStep2Fields(client.baiv506cOnboarding?.step2Data ?? null);
  const baiodfStep2 = normalizeBaiodfStep2Fields(client.baiodfOnboarding?.step2Data ?? null);
  const baiodfStep3 = normalizeBaiodfStep3Fields(client.baiodfOnboarding?.step3Data ?? null);
  const sfcStep1 = normalizeSfcStep1Fields(client.statementOfFinancialConditionOnboarding?.step1Data ?? null);
  const sfcStep2 = normalizeSfcStep2Fields(client.statementOfFinancialConditionOnboarding?.step2Data ?? null);
  const investorStep7 = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);
  const sfcTotals = getSfcStep1Totals(sfcStep1);
  const jointRequired = requiresJointOwnerSignature(client.investorProfileOnboarding?.step1Data ?? null);

  const accountOwnerSources = [
    {
      block: baivStep2.signatures.accountOwner,
      source: 'BAIV_506C',
      sourcePath: 'step2.signatures.accountOwner'
    },
    {
      block: baiodfStep3.signatures.accountOwner,
      source: 'BAIODF',
      sourcePath: 'step3.signatures.accountOwner'
    },
    {
      block: sfcStep2.signatures.accountOwner,
      source: 'SFC',
      sourcePath: 'step2.signatures.accountOwner'
    },
    {
      block: investorStep7.signatures.accountOwner,
      source: 'INVESTOR_PROFILE',
      sourcePath: 'step7.signatures.accountOwner'
    }
  ];

  const jointAccountOwnerSources = [
    {
      block: baivStep2.signatures.jointAccountOwner,
      source: 'BAIV_506C',
      sourcePath: 'step2.signatures.jointAccountOwner'
    },
    {
      block: baiodfStep3.signatures.jointAccountOwner,
      source: 'BAIODF',
      sourcePath: 'step3.signatures.jointAccountOwner'
    },
    {
      block: sfcStep2.signatures.jointAccountOwner,
      source: 'SFC',
      sourcePath: 'step2.signatures.jointAccountOwner'
    },
    {
      block: investorStep7.signatures.jointAccountOwner,
      source: 'INVESTOR_PROFILE',
      sourcePath: 'step7.signatures.jointAccountOwner'
    }
  ];

  const financialProfessionalSources = [
    {
      block: baivStep2.signatures.financialProfessional,
      source: 'BAIV_506C',
      sourcePath: 'step2.signatures.financialProfessional'
    },
    {
      block: baiodfStep3.signatures.financialProfessional,
      source: 'BAIODF',
      sourcePath: 'step3.signatures.financialProfessional'
    },
    {
      block: sfcStep2.signatures.financialProfessional,
      source: 'SFC',
      sourcePath: 'step2.signatures.financialProfessional'
    },
    {
      block: investorStep7.signatures.financialProfessional,
      source: 'INVESTOR_PROFILE',
      sourcePath: 'step7.signatures.financialProfessional'
    }
  ];

  const registeredPrincipalSources = [
    {
      block: sfcStep2.signatures.registeredPrincipal,
      source: 'SFC',
      sourcePath: 'step2.signatures.registeredPrincipal'
    },
    {
      block: investorStep7.signatures.supervisorPrincipal,
      source: 'INVESTOR_PROFILE',
      sourcePath: 'step7.signatures.supervisorPrincipal'
    }
  ];

  const values: Record<string, SourceValue> = {
    'advisor.rrName': resolveString([
      {
        value: baivStep1.accountRegistration.rrName,
        source: 'BAIV_506C',
        sourcePath: 'step1.accountRegistration.rrName'
      },
      {
        value: investorStep1.accountRegistration.rrName,
        source: 'INVESTOR_PROFILE',
        sourcePath: 'step1.accountRegistration.rrName'
      }
    ]),
    'advisor.rrNumber': resolveString([
      {
        value: baivStep1.accountRegistration.rrNo,
        source: 'BAIV_506C',
        sourcePath: 'step1.accountRegistration.rrNo'
      },
      {
        value: investorStep1.accountRegistration.rrNo,
        source: 'INVESTOR_PROFILE',
        sourcePath: 'step1.accountRegistration.rrNo'
      }
    ]),
    'account.customerNames': resolveString(
      [
        {
          value: baivStep1.accountRegistration.customerNames,
          source: 'BAIV_506C',
          sourcePath: 'step1.accountRegistration.customerNames'
        },
        {
          value: investorStep1.accountRegistration.customerNames,
          source: 'INVESTOR_PROFILE',
          sourcePath: 'step1.accountRegistration.customerNames'
        }
      ],
      {
        value: client.name,
        source: 'CLIENT',
        sourcePath: 'name',
        confidence: 'low'
      }
    ),
    'signature.accountOwner.printedName': resolveSignatureValue('printedName', accountOwnerSources),
    'signature.accountOwner.date': resolveSignatureValue('date', accountOwnerSources),
    'signature.jointAccountOwner.printedName': jointRequired
      ? resolveSignatureValue('printedName', jointAccountOwnerSources)
      : {
          value: null,
          source: 'not-required',
          sourcePath: null,
          confidence: 'empty'
        },
    'signature.jointAccountOwner.date': jointRequired
      ? resolveSignatureValue('date', jointAccountOwnerSources)
      : {
          value: null,
          source: 'not-required',
          sourcePath: null,
          confidence: 'empty'
        },
    'signature.financialProfessional.printedName': resolveSignatureValue('printedName', financialProfessionalSources, {
      value: client.owner.name,
      source: 'USER',
      sourcePath: 'owner.name',
      confidence: 'medium'
    }),
    'signature.financialProfessional.date': resolveSignatureValue('date', financialProfessionalSources),
    'signature.registeredPrincipal.printedName': resolveSignatureValue('printedName', registeredPrincipalSources),
    'signature.registeredPrincipal.date': resolveSignatureValue('date', registeredPrincipalSources)
  };

  const annualIncomeThreshold = jointRequired ? 300_000 : 200_000;
  const evidence = {
    primaryAccountType: selectedPrimaryType(client.investorProfileOnboarding?.step1Data ?? null),
    requiresJointOwnerSignature: jointRequired,
    baivAcknowledgements: baivStep2.acknowledgements,
    allBaivAcknowledgementsAccepted: Object.values(baivStep2.acknowledgements).every(Boolean),
    sfcTotals,
    baiodfNetWorthAndConcentration: baiodfStep2.netWorthAndConcentration,
    accreditationHeuristics: {
      naturalPersonIncomeCandidate: sfcTotals.totalAnnualIncome >= annualIncomeThreshold,
      incomeThresholdUsed: annualIncomeThreshold,
      naturalPersonNetWorthCandidate:
        sfcTotals.totalNetWorthAssetsLessPrimaryResidenceLiabilities >= 1_000_000,
      netWorthExPrimaryResidenceThresholdUsed: 1_000_000,
      documentEvidenceCapturedInCurrentForms: false,
      note:
        'This prototype can identify financial candidates from entered form data, but documentary proof review is currently only captured as an acknowledgement.'
    }
  };

  return { values, evidence };
}

async function main(): Promise<void> {
  const inputPdfPath = requireArg('--pdf');
  const outDir = getArg('--out-dir') ?? DEFAULT_OUT_DIR;
  const client = await loadClient(getArg('--client-id'), getArg('--email'));
  const advisorName = client.owner.name;

  const payload = buildFormWebhookPayload(
    client,
    BAIV_506C_FORM_CODE,
    advisorName,
    process.env.BACKEND_PUBLIC_URL ?? DEFAULT_BACKEND_PUBLIC_URL
  );
  const payloadFields = payload.fields as Record<string, unknown>;

  const { values, evidence } = buildSourceValues(client);
  const pdfBytes = await readFile(inputPdfPath);
  const pdf = await PDFDocument.load(pdfBytes);
  const availablePdfFields = pdf.getForm().getFields().map((field) => field.getName());
  const missingPdfFields = PDF_MAPPINGS.filter((mapping) => !availablePdfFields.includes(mapping.pdfField)).map(
    (mapping) => mapping.pdfField
  );

  const clientSegment = safeFileSegment(`${client.name}-${client.id}`);
  const outputDir = path.resolve(outDir, clientSegment);
  await mkdir(outputDir, { recursive: true });

  const variablePdfPath = path.join(outputDir, 'baiv-506c-variable-overlay.pdf');
  const filledPdfPath = path.join(outputDir, 'baiv-506c-filled-values.pdf');
  const reportPath = path.join(outputDir, 'baiv-506c-mapping-report.json');

  await fillPdf({
    inputPdfPath,
    outputPdfPath: variablePdfPath,
    mappings: PDF_MAPPINGS,
    values,
    mode: 'variables'
  });

  await fillPdf({
    inputPdfPath,
    outputPdfPath: filledPdfPath,
    mappings: PDF_MAPPINGS,
    values,
    mode: 'values'
  });

  const report = {
    generatedAt: new Date().toISOString(),
    inputPdfPath,
    outputs: {
      variablePdfPath,
      filledPdfPath,
      reportPath
    },
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      selectedFormCodes: client.formSelections.map((selection) => selection.form.code),
      statuses: {
        investorProfile: client.investorProfileOnboarding?.status ?? null,
        statementOfFinancialCondition: client.statementOfFinancialConditionOnboarding?.status ?? null,
        baiodf: client.baiodfOnboarding?.status ?? null,
        baiv506c: client.baiv506cOnboarding?.status ?? null
      }
    },
    availablePdfFields,
    missingPdfFields,
    mappings: PDF_MAPPINGS.map((mapping) => {
      const sourceValue = values[mapping.variable] ?? {
        value: null,
        source: 'empty',
        sourcePath: null,
        confidence: 'empty'
      };

      return {
        ...mapping,
        value: valueForPdfField(mapping, sourceValue),
        rawValue: sourceValue.value,
        source: sourceValue.source,
        sourcePath: sourceValue.sourcePath,
        confidence: sourceValue.confidence
      };
    }),
    evidence,
    productionBaivPayload: payloadFields
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`Client: ${client.name} (${client.id})`);
  console.log(`Variable overlay PDF: ${variablePdfPath}`);
  console.log(`Filled values PDF:    ${filledPdfPath}`);
  console.log(`Mapping report:       ${reportPath}`);
  console.log(
    `Mapped ${PDF_MAPPINGS.length - missingPdfFields.length}/${PDF_MAPPINGS.length} configured PDF fields.`
  );
  if (missingPdfFields.length > 0) {
    console.log(`Missing PDF fields: ${missingPdfFields.join(', ')}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
