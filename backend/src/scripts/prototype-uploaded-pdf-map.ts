/**
 * Prototype uploaded-form PDF mapping/fill rehearsal.
 *
 * Reads a published uploaded FormSchemaV2, a real client, and a real fillable
 * PDF. It writes:
 * - a variable-overlay PDF showing mapped placeholders in AcroForm fields
 * - a value-filled PDF using saved dynamic answers plus conservative gold-form
 *   prefill heuristics from the client's existing onboarding data
 * - a JSON report with mapped/filled/skipped fields
 *
 * Usage:
 *   tsx src/scripts/prototype-uploaded-pdf-map.ts \
 *     --form-code REG_D_506C_SUBSCRIPTION \
 *     --pdf "/path/to/fillable.pdf" \
 *     --client-id <client id>
 */
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  type PDFPage,
  PDFRadioGroup,
  PDFTextField,
  rgb,
  StandardFonts
} from 'pdf-lib';
import type { Prisma } from '@prisma/client';

import {
  deriveContext,
  mergeStepData,
  resolveFieldValuesV2,
  type Fields
} from '../lib/dynamic-step-engine.js';
import {
  FormSchemaV2,
  isRepeatBlock,
  migrateV1ToV2,
  type FormQuestionV2,
  type FormSchemaV2 as FormSchemaV2Type
} from '../lib/ingestion/schema-v2.js';
import { prisma } from '../lib/prisma.js';
import { normalizeBaiodfStep1Fields } from '../lib/baiodf-step1.js';
import { normalizeBaiv506cStep2Fields } from '../lib/baiv-506c-step2.js';
import { normalizeBaiodfStep3Fields } from '../lib/baiodf-step3.js';
import { normalizeStep1Fields, type PrimaryTypeKey } from '../lib/investor-profile-step1.js';
import { normalizeStep3Fields } from '../lib/investor-profile-step3.js';
import { normalizeStep4Fields } from '../lib/investor-profile-step4.js';
import { normalizeStep7Fields } from '../lib/investor-profile-step7.js';
import { normalizeSfcStep2Fields } from '../lib/statement-of-financial-condition-step2.js';

const DEFAULT_OUT_DIR = 'output/pdf/uploaded-prototype';

type SignatureBlock = {
  typedSignature: string | null;
  printedName: string | null;
  date: string | null;
};

type ClientSnapshot = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  owner: { name: string; email: string };
  formSelections: Array<{ form: { code: string; title: string } }>;
  investorProfileOnboarding: {
    status: string;
    step1RrName: string | null;
    step1RrNo: string | null;
    step1CustomerNames: string | null;
    step1AccountNo: string | null;
    step1AccountType: Prisma.JsonValue | null;
    step1Data: Prisma.JsonValue | null;
    step3Data: Prisma.JsonValue | null;
    step4Data: Prisma.JsonValue | null;
    step7Data: Prisma.JsonValue | null;
  } | null;
  statementOfFinancialConditionOnboarding: {
    status: string;
    step2Data: Prisma.JsonValue | null;
  } | null;
  baiodfOnboarding: {
    status: string;
    step1Data: Prisma.JsonValue | null;
    step3Data: Prisma.JsonValue | null;
  } | null;
  baiv506cOnboarding: {
    status: string;
    step2Data: Prisma.JsonValue | null;
  } | null;
};

type ResolvedValue = {
  value: unknown;
  source: string;
  sourcePath: string | null;
  confidence: 'high' | 'medium' | 'low';
};

type FillResult = {
  applied: string[];
  skipped: Array<{ field: string; reason: string }>;
  labelApplied: string[];
  labelSkipped: Array<{ field: string; reason: string }>;
};

type OverlayPlan = {
  fieldValues: Record<string, string | boolean>;
  fieldLabels: Record<string, string>;
};

function getArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function requireArg(flag: string): string {
  const value = getArg(flag);
  if (!value) throw new Error(`Missing required ${flag}.`);
  return value;
}

function safeFileSegment(input: string): string {
  return input.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'output';
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.values(value as Record<string, unknown>).every((entry) => entry === false || entry === '' || entry == null))
  );
}

function getPath(obj: unknown, dotted: string): unknown {
  let cur = obj;
  for (const seg of dotted.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function setPath(obj: Fields, dotted: string, value: unknown): void {
  const segs = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const seg = segs[i]!;
    if (!cur[seg] || typeof cur[seg] !== 'object') cur[seg] = {};
    cur = cur[seg] as Fields;
  }
  cur[segs[segs.length - 1]!] = value;
}

function createOneHot(keys: readonly string[], selected: string | null): Record<string, boolean> {
  return Object.fromEntries(keys.map((key) => [key, key === selected]));
}

function selectedOneHot(value: Record<string, boolean> | null | undefined): string | null {
  if (!value) return null;
  const hit = Object.entries(value).find(([, selected]) => selected === true);
  return hit?.[0] ?? null;
}

function primaryTypeToSubscriptionType(type: PrimaryTypeKey | null): string | null {
  switch (type) {
    case 'individual':
    case 'transferOnDeathIndividual':
    case 'custodial':
      return 'individual';
    case 'jointTenant':
    case 'transferOnDeathJoint':
      return 'joint_survivorship';
    case 'trust':
      return 'trust';
    case 'partnership':
      return 'partnership';
    case 'limitedLiabilityCompany':
    case 'individualSingleMemberLlc':
      return 'llc';
    case 'corporation':
    case 'corporatePensionProfitSharing':
      return 'corporation';
    default:
      return null;
  }
}

function combineCityStateZip(address: {
  city?: string | null;
  stateProvince?: string | null;
  postalCode?: string | null;
}): string | null {
  const city = address.city?.trim();
  const state = address.stateProvince?.trim();
  const postal = address.postalCode?.trim();
  const left = [city, state].filter(Boolean).join(', ');
  return [left, postal].filter(Boolean).join(' ') || null;
}

function formatDateUs(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value.trim() || null;
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function dateParts(value: unknown): { day: string | null; month: string | null; year: string | null } {
  if (typeof value !== 'string') return { day: null, month: null, year: null };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return { day: null, month: null, year: null };
  return { day: match[3]!, month: match[2]!, year: match[1]! };
}

function firstSignaturePart(
  part: keyof SignatureBlock,
  sources: Array<{ block: SignatureBlock; source: string; sourcePath: string }>
): ResolvedValue | null {
  for (const source of sources) {
    const value = source.block[part];
    if (typeof value === 'string' && value.trim()) {
      return {
        value: value.trim(),
        source: source.source,
        sourcePath: `${source.sourcePath}.${part}`,
        confidence: 'high'
      };
    }
  }
  return null;
}

function resolveGoldValues(client: ClientSnapshot): Record<string, ResolvedValue> {
  const step1 = normalizeStep1Fields(client.investorProfileOnboarding?.step1Data ?? null, {
    step1RrName: client.investorProfileOnboarding?.step1RrName ?? null,
    step1RrNo: client.investorProfileOnboarding?.step1RrNo ?? null,
    step1CustomerNames: client.investorProfileOnboarding?.step1CustomerNames ?? null,
    step1AccountNo: client.investorProfileOnboarding?.step1AccountNo ?? null,
    step1AccountType: client.investorProfileOnboarding?.step1AccountType ?? null,
    clientName: client.name
  });
  const step3 = normalizeStep3Fields(client.investorProfileOnboarding?.step3Data ?? null);
  const step4 = normalizeStep4Fields(client.investorProfileOnboarding?.step4Data ?? null);
  const step7 = normalizeStep7Fields(client.investorProfileOnboarding?.step7Data ?? null);
  const sfcStep2 = normalizeSfcStep2Fields(client.statementOfFinancialConditionOnboarding?.step2Data ?? null);
  const baiodfStep1 = normalizeBaiodfStep1Fields(client.baiodfOnboarding?.step1Data ?? null);
  const baiodfStep3 = normalizeBaiodfStep3Fields(client.baiodfOnboarding?.step3Data ?? null);
  const baivStep2 = normalizeBaiv506cStep2Fields(client.baiv506cOnboarding?.step2Data ?? null);
  const primaryType = selectedOneHot(step1.typeOfAccount.primaryType);
  const subscriptionType = primaryTypeToSubscriptionType(primaryType as PrimaryTypeKey | null);

  const signatures = [
    { block: step7.signatures.accountOwner, source: 'INVESTOR_PROFILE', sourcePath: 'step7.signatures.accountOwner' },
    { block: baivStep2.signatures.accountOwner, source: 'BAIV_506C', sourcePath: 'step2.signatures.accountOwner' },
    { block: baiodfStep3.signatures.accountOwner, source: 'BAIODF', sourcePath: 'step3.signatures.accountOwner' },
    { block: sfcStep2.signatures.accountOwner, source: 'SFC', sourcePath: 'step2.signatures.accountOwner' }
  ];
  const signerName = firstSignaturePart('printedName', signatures);
  const signerDate = firstSignaturePart('date', signatures);
  const date = signerDate?.value ?? null;
  const splitDate = dateParts(date);

  const map: Record<string, ResolvedValue> = {};
  const put = (id: string, value: unknown, source: string, sourcePath: string, confidence: ResolvedValue['confidence'] = 'high') => {
    if (isEmpty(value)) return;
    map[id] = { value, source, sourcePath, confidence };
  };

  put('investment.amount', baiodfStep1.orderBasics.proposedPrincipalAmount || null, 'BAIODF', 'step1.orderBasics.proposedPrincipalAmount');
  if (subscriptionType) {
    put(
      'investmentType',
      createOneHot(['individual', 'community', 'joint_survivorship', 'tenants_common', 'trust', 'partnership', 'llc', 'corporation'], subscriptionType),
      'INVESTOR_PROFILE',
      'step1.typeOfAccount.primaryType'
    );
  }

  put('person.fullName', step3.holder.name, 'INVESTOR_PROFILE', 'step3.holder.name');
  put('person.address.line1', step3.holder.legalAddress.line1, 'INVESTOR_PROFILE', 'step3.holder.legalAddress.line1');
  put('person.address.cityStateZip', combineCityStateZip(step3.holder.legalAddress), 'INVESTOR_PROFILE', 'step3.holder.legalAddress');
  put('person.phone.business', step3.holder.contact.phones.business, 'INVESTOR_PROFILE', 'step3.holder.contact.phones.business');
  put('person.phone.home', step3.holder.contact.phones.home ?? step3.holder.contact.phones.mobile, 'INVESTOR_PROFILE', 'step3.holder.contact.phones');
  put('person.state', step3.holder.legalAddress.stateProvince, 'INVESTOR_PROFILE', 'step3.holder.legalAddress.stateProvince');
  put('person.dob', formatDateUs(step3.holder.contact.dateOfBirth), 'INVESTOR_PROFILE', 'step3.holder.contact.dateOfBirth');
  put('person.tin', step3.holder.taxId.ssn ?? step3.holder.taxId.ein, 'INVESTOR_PROFILE', 'step3.holder.taxId');
  put('person.email', step3.holder.contact.email || client.email, 'INVESTOR_PROFILE', 'step3.holder.contact.email');

  put('joint.fullName', step4.holder.name, 'INVESTOR_PROFILE', 'step4.holder.name');
  put('joint.address.line1', step4.holder.legalAddress.line1, 'INVESTOR_PROFILE', 'step4.holder.legalAddress.line1');
  put('joint.address.cityStateZip', combineCityStateZip(step4.holder.legalAddress), 'INVESTOR_PROFILE', 'step4.holder.legalAddress');
  put('joint.phone.business', step4.holder.contact.phones.business, 'INVESTOR_PROFILE', 'step4.holder.contact.phones.business');
  put('joint.phone.home', step4.holder.contact.phones.home ?? step4.holder.contact.phones.mobile, 'INVESTOR_PROFILE', 'step4.holder.contact.phones');
  put('joint.state', step4.holder.legalAddress.stateProvince, 'INVESTOR_PROFILE', 'step4.holder.legalAddress.stateProvince');
  put('joint.dob', formatDateUs(step4.holder.contact.dateOfBirth), 'INVESTOR_PROFILE', 'step4.holder.contact.dateOfBirth');
  put('joint.tin', step4.holder.taxId.ssn ?? step4.holder.taxId.ein, 'INVESTOR_PROFILE', 'step4.holder.taxId');
  put('joint.email', step4.holder.contact.email, 'INVESTOR_PROFILE', 'step4.holder.contact.email');

  if (['trust', 'partnership', 'llc', 'corporation'].includes(subscriptionType ?? '')) {
    put('controlPerson.fullName', step4.holder.name, 'INVESTOR_PROFILE', 'step4.holder.name', 'medium');
    put('controlPerson.address.line1', step4.holder.legalAddress.line1, 'INVESTOR_PROFILE', 'step4.holder.legalAddress.line1', 'medium');
    put('controlPerson.address.cityStateZip', combineCityStateZip(step4.holder.legalAddress), 'INVESTOR_PROFILE', 'step4.holder.legalAddress', 'medium');
    put('controlPerson.phone.business', step4.holder.contact.phones.business, 'INVESTOR_PROFILE', 'step4.holder.contact.phones.business', 'medium');
    put('controlPerson.phone.home', step4.holder.contact.phones.home ?? step4.holder.contact.phones.mobile, 'INVESTOR_PROFILE', 'step4.holder.contact.phones', 'medium');
    put('controlPerson.state', step4.holder.legalAddress.stateProvince, 'INVESTOR_PROFILE', 'step4.holder.legalAddress.stateProvince', 'medium');
    put('controlPerson.dob', formatDateUs(step4.holder.contact.dateOfBirth), 'INVESTOR_PROFILE', 'step4.holder.contact.dateOfBirth', 'medium');
    put('controlPerson.tin', step4.holder.taxId.ssn ?? step4.holder.taxId.ein, 'INVESTOR_PROFILE', 'step4.holder.taxId', 'medium');
  }

  put('signature.investorName', signerName?.value ?? step3.holder.name, signerName?.source ?? 'INVESTOR_PROFILE', signerName?.sourcePath ?? 'step3.holder.name');
  put('signature.date', formatDateUs(date), signerDate?.source ?? 'INVESTOR_PROFILE', signerDate?.sourcePath ?? 'step7.signatures.accountOwner.date');
  put('signature.dateDay', splitDate.day, signerDate?.source ?? 'INVESTOR_PROFILE', signerDate?.sourcePath ?? 'step7.signatures.accountOwner.date');
  put('signature.dateMonth', splitDate.month, signerDate?.source ?? 'INVESTOR_PROFILE', signerDate?.sourcePath ?? 'step7.signatures.accountOwner.date');
  put('broker.repName', client.owner.name, 'USER', 'owner.name', 'medium');
  put('broker.email', client.owner.email, 'USER', 'owner.email', 'medium');

  return map;
}

function schemaQuestions(schema: FormSchemaV2Type): FormQuestionV2[] {
  const questions: FormQuestionV2[] = [];
  for (const item of schema.items) {
    if (isRepeatBlock(item)) {
      questions.push(...item.fields);
    } else {
      questions.push(item);
    }
  }
  return questions;
}

function overlayValues(schema: FormSchemaV2Type): OverlayPlan {
  const fieldValues: Record<string, string | boolean> = {};
  const fieldLabels: Record<string, string> = {};
  const label = (id: string) => `{${id.split('.').slice(-2).join('.')}}`.slice(0, 32);
  const compactLabel = (id: string) => `{${id.split('.').slice(-1)[0]}}`.slice(0, 24);
  const optionLabel = (value: string) => `{${value}}`.slice(0, 24);

  for (const q of schemaQuestions(schema)) {
    if (q.options) {
      for (const option of q.options) {
        if (option.pdfField) fieldLabels[option.pdfField] = optionLabel(option.value);
      }
      continue;
    }
    if (q.type === 'checkbox') {
      if (q.pdfField) fieldLabels[q.pdfField] = compactLabel(q.id);
      continue;
    }
    if (q.type === 'signature') {
      if (q.pdfField) fieldLabels[q.pdfField] = label(q.id);
      continue;
    }
    if (q.pdfField) fieldValues[q.pdfField] = label(q.id);
  }
  return { fieldValues, fieldLabels };
}

function collectFieldLabelPlacements(
  form: ReturnType<PDFDocument['getForm']>,
  fieldLabels: Record<string, string>
): { placements: Array<{ page: PDFPage; x: number; y: number; size: number; text: string }>; skipped: Array<{ field: string; reason: string }> } {
  const placements: Array<{ page: PDFPage; x: number; y: number; size: number; text: string }> = [];
  const skipped: Array<{ field: string; reason: string }> = [];
  const formWithInternals = form as unknown as { findWidgetPage(widget: unknown): PDFPage };

  for (const [name, text] of Object.entries(fieldLabels)) {
    let field;
    try {
      field = form.getField(name);
    } catch {
      skipped.push({ field: name, reason: 'not found in PDF' });
      continue;
    }

    const widgets = (field as unknown as { acroField?: { getWidgets(): Array<{ getRectangle(): { x: number; y: number; width: number; height: number } }> } }).acroField?.getWidgets() ?? [];
    if (widgets.length === 0) {
      skipped.push({ field: name, reason: 'field has no visible widget' });
      continue;
    }

    for (const widget of widgets) {
      const page = formWithInternals.findWidgetPage(widget);
      const rectangle = widget.getRectangle();
      const isSmallWidget = rectangle.width <= 28 && rectangle.height <= 28;
      const fontSize = isSmallWidget ? 4 : 5.5;
      const rightSideFits = rectangle.x + rectangle.width + (isSmallWidget ? 52 : 96) < page.getWidth();
      placements.push({
        page,
        x: rightSideFits ? rectangle.x + rectangle.width + 2 : rectangle.x,
        y: isSmallWidget
          ? rectangle.y + Math.max(0, rectangle.height - fontSize)
          : rightSideFits
            ? rectangle.y + Math.max(0, (rectangle.height - fontSize) / 2)
            : rectangle.y + rectangle.height + 1,
        size: fontSize,
        text
      });
    }
  }

  return { placements, skipped };
}

async function fillPdf(
  inputPdfPath: string,
  outputPdfPath: string,
  values: Record<string, string | boolean>,
  fieldLabels: Record<string, string> = {}
): Promise<FillResult> {
  const doc = await PDFDocument.load(await readFile(inputPdfPath));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const applied: string[] = [];
  const skipped: Array<{ field: string; reason: string }> = [];
  const labelPlan = collectFieldLabelPlacements(form, fieldLabels);

  for (const [name, value] of Object.entries(values)) {
    let field;
    try {
      field = form.getField(name);
    } catch {
      skipped.push({ field: name, reason: 'not found in PDF' });
      continue;
    }

    try {
      if (field instanceof PDFCheckBox) {
        value ? field.check() : field.uncheck();
      } else if (field instanceof PDFTextField) {
        field.setText(String(value));
        field.setFontSize(String(value).startsWith('{') ? 7 : 9);
      } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
        field.select(String(value));
      } else {
        skipped.push({ field: name, reason: `unsupported field type ${field.constructor.name}` });
        continue;
      }
      applied.push(name);
    } catch (error) {
      skipped.push({ field: name, reason: error instanceof Error ? error.message : 'failed to write field' });
    }
  }

  form.updateFieldAppearances(font);
  form.flatten();
  for (const placement of labelPlan.placements) {
    placement.page.drawText(placement.text, {
      x: placement.x,
      y: placement.y,
      size: placement.size,
      font,
      color: rgb(0.05, 0.18, 0.75)
    });
  }
  await writeFile(outputPdfPath, await doc.save());
  return {
    applied,
    skipped,
    labelApplied: labelPlan.placements.map((placement) => placement.text),
    labelSkipped: labelPlan.skipped
  };
}

async function loadClient(clientId: string | null, email: string | null): Promise<ClientSnapshot> {
  const client = await prisma.client.findFirst({
    where: clientId ? { id: clientId } : email ? { email } : undefined,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      owner: { select: { name: true, email: true } },
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
          step3Data: true,
          step4Data: true,
          step7Data: true
        }
      },
      statementOfFinancialConditionOnboarding: { select: { status: true, step2Data: true } },
      baiodfOnboarding: { select: { status: true, step1Data: true, step3Data: true } },
      baiv506cOnboarding: { select: { status: true, step2Data: true } }
    }
  });
  if (!client) throw new Error('No matching client found.');
  return client as ClientSnapshot;
}

async function main(): Promise<void> {
  const formCode = requireArg('--form-code');
  const inputPdfPath = requireArg('--pdf');
  const outDir = getArg('--out-dir') ?? DEFAULT_OUT_DIR;
  const client = await loadClient(getArg('--client-id'), getArg('--email'));

  const form = await prisma.formCatalog.findUnique({
    where: { code: formCode },
    select: { code: true, title: true, schema: true, unmappedCount: true }
  });
  if (!form?.schema) throw new Error(`Form ${formCode} does not have a stored schema.`);
  const parsedSchema = FormSchemaV2.safeParse(form.schema);
  const schema = parsedSchema.success ? parsedSchema.data : migrateV1ToV2(form.schema as never);

  const response = await prisma.dynamicFormResponse.findUnique({
    where: { clientId_formCode: { clientId: client.id, formCode } },
    select: { status: true, stepData: true }
  });

  const stepData = (response?.stepData ?? {}) as Record<number, Fields>;
  const mergedFromSaved = mergeStepData(schema, stepData);
  const goldValues = resolveGoldValues(client);
  const rehearsalFields: Fields = JSON.parse(JSON.stringify(mergedFromSaved)) as Fields;

  for (const [id, resolved] of Object.entries(goldValues)) {
    if (isEmpty(getPath(rehearsalFields, id))) {
      setPath(rehearsalFields, id, resolved.value);
    }
  }

  const ctx = deriveContext();
  const filledValues = resolveFieldValuesV2(schema, rehearsalFields, ctx);
  const variables = overlayValues(schema);

  const outputDir = path.resolve(outDir, `${safeFileSegment(formCode)}-${safeFileSegment(`${client.name}-${client.id}`)}`);
  await mkdir(outputDir, { recursive: true });
  const variablePdfPath = path.join(outputDir, 'variable-overlay.pdf');
  const filledPdfPath = path.join(outputDir, 'filled-rehearsal.pdf');
  const reportPath = path.join(outputDir, 'mapping-report.json');

  const variableFill = await fillPdf(inputPdfPath, variablePdfPath, variables.fieldValues, variables.fieldLabels);
  const valueFill = await fillPdf(inputPdfPath, filledPdfPath, filledValues);

  const mappedPdfFields = new Set<string>();
  for (const q of schemaQuestions(schema)) {
    if (q.pdfField) mappedPdfFields.add(q.pdfField);
    for (const option of q.options ?? []) if (option.pdfField) mappedPdfFields.add(option.pdfField);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    form: {
      code: form.code,
      title: form.title,
      schemaWasMigrated: !parsedSchema.success,
      schemaItems: schema.items.length,
      pdfFieldCount: schema.pdfFieldCount,
      unmappedCount: form.unmappedCount,
      schemaUnmappedFields: schema.unmappedFields
    },
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      selectedFormCodes: client.formSelections.map((selection) => selection.form.code),
      dynamicResponseStatus: response?.status ?? null
    },
    outputs: {
      variablePdfPath,
      filledPdfPath,
      reportPath
    },
    summary: {
      mappedBySchema: mappedPdfFields.size,
      variableOverlayApplied: variableFill.applied.length,
      variableOverlaySkipped: variableFill.skipped.length,
      variableOverlayLabelsApplied: variableFill.labelApplied.length,
      variableOverlayLabelsSkipped: variableFill.labelSkipped.length,
      filledFromSavedAndGoldData: Object.keys(filledValues).length,
      valueFillApplied: valueFill.applied.length,
      valueFillSkipped: valueFill.skipped.length,
      goldHeuristicValuesAvailable: Object.keys(goldValues).length,
      hasSavedDynamicResponse: Boolean(response)
    },
    filledValues,
    goldHeuristicValues: goldValues,
    skipped: {
      variableOverlay: variableFill.skipped,
      variableOverlayLabels: variableFill.labelSkipped,
      valueFill: valueFill.skipped
    }
  };

  await writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`Client: ${client.name} (${client.id})`);
  console.log(`Form: ${formCode} - ${form.title}`);
  console.log(`Variable overlay PDF: ${variablePdfPath}`);
  console.log(`Filled rehearsal PDF: ${filledPdfPath}`);
  console.log(`Mapping report:       ${reportPath}`);
  console.log(`Schema mapped fields: ${mappedPdfFields.size}/${schema.pdfFieldCount}`);
  console.log(`Filled rehearsal values applied: ${valueFill.applied.length}`);
  console.log(`Saved dynamic response: ${response ? response.status : 'none'}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
