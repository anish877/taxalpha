import type { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { resolveFieldValuesV2, type Fields } from '../src/lib/dynamic-step-engine.js';
import { FormSchemaV2 } from '../src/lib/ingestion/schema-v2.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';
import { getProfileLookup } from '../src/lib/profile/lookup.js';
import { HttpError } from '../src/lib/http-error.js';
import { createDynamicStepsRouter } from '../src/routes/dynamic-steps.js';
import type { ProfileLookup } from '../src/lib/dynamic-step-engine.js';
import type { RuntimeConfig } from '../src/types/deps.js';

const config = { nodeEnv: 'test', frontendUrl: 'x', jwtSecret: 'test_secret_test_secret_test_secret_1234', jwtExpiresIn: '7d',
  n8nWebhooks: { investorProfileUrl: null, investorProfileAdditionalHolderUrl: null, statementOfFinancialConditionUrl: null, baiodfUrl: null, baiv506cUrl: null, timeoutMs: 5000, callbackSecret: 'c' } } as unknown as RuntimeConfig;

describe('Phase 4 — getProfileLookup (read-time gold projection)', () => {
  it('projects Investor Profile onboarding data into canonical keys', async () => {
    const prisma = {
      clientBroker: { findFirst: vi.fn().mockResolvedValue(null) },
      investorProfileOnboarding: { findUnique: vi.fn().mockResolvedValue({
        step1Data: { rrName: 'Jane RR', rrNo: 'RR-1', typeOfAccount: { primaryType: { jointTenant: true, individual: false } } },
        step3Data: { holder: {
          name: 'Jane Doe',
          taxId: { ssn: '123456789', ein: null },
          contact: { email: 'jane@x.com', dateOfBirth: '1990-01-01' },
          legalAddress: { line1: '1 Main St', city: 'NYC', stateProvince: 'NY', postalCode: '10001', country: 'US' }
        } }
      }) },
      statementOfFinancialConditionOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      brokerageAlternativeInvestmentOrderDisclosureOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      brokerageAccreditedInvestorVerificationOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      clientProfileValue: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as PrismaClient;

    const lookup = await getProfileLookup(prisma, 'c1');
    expect(lookup['person.ssn']?.value).toBe('123456789');
    expect(lookup['person.email']?.value).toBe('jane@x.com');
    expect(lookup['person.dateOfBirth']?.value).toBe('1990-01-01');
    expect(lookup['address.legal.line1']?.value).toBe('1 Main St');
    expect(lookup['address.legal.country']?.value).toBe('US');
    expect(lookup['advisor.rrName']?.value).toBe('Jane RR');
    expect(lookup['account.registrationType']?.value).toEqual({ jointTenant: true, individual: false });
    expect(lookup['person.ssn']?.sourceFormCode).toBe('INVESTOR_PROFILE');
  });

  it('returns empty when no onboarding exists', async () => {
    const prisma = {
      clientBroker: { findFirst: vi.fn().mockResolvedValue(null) },
      investorProfileOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      statementOfFinancialConditionOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      brokerageAlternativeInvestmentOrderDisclosureOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      brokerageAccreditedInvestorVerificationOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      clientProfileValue: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as PrismaClient;
    expect(await getProfileLookup(prisma, 'c1')).toEqual({});
  });

  it('projects SFC, BAIODF, and BAIV 506(c) data into mapping variables', async () => {
    const prisma = {
      clientBroker: { findFirst: vi.fn().mockResolvedValue(null) },
      investorProfileOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      statementOfFinancialConditionOnboarding: { findUnique: vi.fn().mockResolvedValue({
        step1Data: {
          accountRegistration: { rrName: 'RR SFC', rrNo: 'SFC-7', customerNames: 'Blue Oak Growth LLC' },
          liquidNonQualifiedAssets: { cashMoneyMarketsCds: 100000, brokerageNonManaged: 50000 },
          liabilities: { creditCards: 10000 },
          illiquidNonQualifiedAssets: { primaryResidence: 750000, investmentRealEstate: 300000, privateBusiness: 200000 },
          liquidQualifiedAssets: { retirementPlans: 250000 },
          incomeSummary: { salaryCommissions: 180000, investmentIncome: 20000 },
          illiquidQualifiedAssets: { purchaseAmountValue: 50000 }
        }
      }) },
      brokerageAlternativeInvestmentOrderDisclosureOnboarding: { findUnique: vi.fn().mockResolvedValue({
        step1Data: { orderBasics: { proposedPrincipalAmount: 250000 } },
        step2Data: {
          custodianAndProduct: {
            nameOfProduct: 'RGP Income Fund II',
            sponsorIssuer: 'RGP',
            dateOfPpm: '2026-01-15',
            datePpmSent: '2026-01-20'
          },
          existingAltPositions: {
            existingIlliquidAltPositions: 10000,
            existingSemiLiquidAltPositions: 20000,
            existingTaxAdvantageAltPositions: 30000
          },
          netWorthAndConcentration: { totalNetWorth: 1250000, liquidNetWorth: 400000 }
        }
      }) },
      brokerageAccreditedInvestorVerificationOnboarding: { findUnique: vi.fn().mockResolvedValue({
        step1Data: { accountRegistration: { rrName: 'RR BAIV', rrNo: 'BAIV-1', customerNames: 'Blue Oak Growth LLC' } },
        step2Data: { acknowledgements: { rule506cGuidelineAcknowledged: true, documentationReviewed: true } }
      }) },
      clientProfileValue: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as PrismaClient;

    const lookup = await getProfileLookup(prisma, 'c1');
    expect(lookup['financial.totalNetWorth']?.value).toBe(1690000);
    expect(lookup['financial.netWorthExPrimaryResidence']?.value).toBe(940000);
    expect(lookup['financial.liquidNetWorth']?.value).toBe(400000);
    expect(lookup['financial.totalAnnualIncome']?.value).toBe(200000);
    expect(lookup['investment.amount']?.value).toBe(250000);
    expect(lookup['investment.productName']?.value).toBe('RGP Income Fund II');
    expect(lookup['accreditation.rule506cGuidelineAcknowledged']?.value).toBe(true);
  });

  it('uses the selected primary broker as authoritative subscription-agreement context', async () => {
    const prisma = {
      clientBroker: { findFirst: vi.fn().mockResolvedValue({
        broker: {
          name: 'Jordan Representative',
          email: 'jordan@example.com',
          firmName: 'Northstar Broker-Dealer',
          brokerDealerCrdNumber: 'BD-100',
          representativeCrdNumber: 'RR-200',
          branchAddressLine1: '10 Market Street',
          branchAddressLine2: null,
          branchCity: 'Austin',
          branchState: 'TX',
          branchPostalCode: '78701',
          branchPhone: '+1 512 555 0100'
        }
      }) },
      investorProfileOnboarding: { findUnique: vi.fn().mockResolvedValue({ step1Data: { rrName: 'Old RR', rrNo: 'OLD-1' } }) },
      statementOfFinancialConditionOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      brokerageAlternativeInvestmentOrderDisclosureOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      brokerageAccreditedInvestorVerificationOnboarding: { findUnique: vi.fn().mockResolvedValue(null) },
      clientProfileValue: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as PrismaClient;

    const lookup = await getProfileLookup(prisma, 'c1');
    expect(lookup['advisor.rrName']).toEqual({ value: 'Jordan Representative', sourceFormCode: 'PRIMARY_BROKER' });
    expect(lookup['advisor.rrNumber']?.value).toBe('RR-200');
    expect(lookup['broker.firmName']?.value).toBe('Northstar Broker-Dealer');
    expect(lookup['broker.branchCityStateZip']?.value).toBe('Austin, TX 78701');
  });
});

const RESOLVE_SCHEMA = FormSchemaV2.parse({
  version: 2, code: 'R', title: 'R',
  steps: [{ number: 1, key: 'S1', label: 'S1' }, { number: 2, key: 'S2', label: 'S2' }],
  items: [
    { id: 'investmentType', step: 1, order: 0, title: 'T', type: 'single-choice-cards', required: true,
      options: [{ label: 'Individual', value: 'individual', pdfField: 'CB3' }, { label: 'Trust', value: 'trust', pdfField: 'CB7' }] },
    { id: 'amount', step: 1, order: 1, title: 'Amt', type: 'currency', pdfField: 'Investment' },
    { id: 'primary.address', step: 1, order: 2, title: 'Addr', type: 'address-block',
      subFields: [{ key: 'line1', label: 'L1', type: 'text', pdfField: 'Addr' }, { key: 'country', label: 'C', type: 'text', pdfField: 'Cty' }] },
    { id: 'entity.taxForm', step: 2, order: 0, title: 'Tax', type: 'single-choice-cards', showIf: "investmentType == 'trust'",
      options: [{ label: '1065', value: 'f1065', pdfField: 'CB12' }] }
  ],
  pdfFieldCount: 5, unmappedFields: []
});

describe('Phase 4 — resolveFieldValuesV2', () => {
  it('maps choice→checkbox, composite sub-fields, scalar; excludes hidden', () => {
    const merged: Fields = {
      investmentType: { individual: true, trust: false },
      amount: '250000',
      primary: { address: { line1: '1 Main St', country: 'US' } },
      entity: { taxForm: { f1065: true } } // hidden (individual) -> must be excluded
    };
    const out = resolveFieldValuesV2(RESOLVE_SCHEMA, merged);
    expect(out).toEqual({ CB3: true, Investment: '250000', Addr: '1 Main St', Cty: 'US' });
    expect(out.CB12).toBeUndefined(); // hidden entity.taxForm not written
  });
});

// route-level prefill ---------------------------------------------------------
const PREFILL_SCHEMA = {
  version: 2, code: 'RGP_INCOME_FUND_II_SUB', title: 'RGP',
  steps: [{ number: 1, key: 'S1', label: 'S1' }],
  items: [
    { id: 'investmentType', step: 1, order: 0, title: 'Type', type: 'single-choice-cards', required: true,
      canonicalField: 'account.registrationType',
      options: [{ label: 'Individual', value: 'individual', pdfField: 'CB3' }, { label: 'Joint', value: 'joint', pdfField: 'CB4' }, { label: 'Trust', value: 'trust', pdfField: 'CB7' }] },
    { id: 'primary.ssn', step: 1, order: 1, title: 'SSN', type: 'ssn-ein', required: true, validation: { rule: 'ssnOrEin' }, canonicalField: 'person.ssn' }
  ],
  pdfFieldCount: 4, unmappedFields: []
};

function prefillApp(lookup: ProfileLookup) {
  const responses = new Map<string, { status: string; stepData: object; stepCursors: object }>();
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', name: 'A', email: 'a@x', isAdmin: false }) },
    client: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) => where.id === 'c1' ? { id: 'c1' } : null) },
    formCatalog: { findUnique: vi.fn().mockResolvedValue({ id: 'f', code: 'RGP_INCOME_FUND_II_SUB', schema: PREFILL_SCHEMA, status: 'PUBLISHED' }) },
    dynamicFormResponse: {
      upsert: vi.fn(async () => { if (!responses.has('k')) responses.set('k', { status: 'IN_PROGRESS', stepData: {}, stepCursors: {} }); return responses.get('k'); }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(responses.get('k')!, data); return responses.get('k'); })
    }
  } as unknown as PrismaClient;
  const app = express();
  app.use(cookieParser()); app.use(express.json());
  app.use('/api/clients', createDynamicStepsRouter({ prisma, config }, { profileLookup: async () => lookup }));
  app.use(((e, _q, res, _n) => { if (e instanceof HttpError) res.status(e.statusCode).json({ message: e.message, fieldErrors: e.fieldErrors }); else res.status(500).json({ message: (e as Error).message }); }) as ErrorRequestHandler);
  return app;
}
const cookie = () => `${AUTH_COOKIE_NAME}=${createSessionToken('u1', config.jwtSecret, config.jwtExpiresIn)}`;

describe('Phase 4 — route prefill (shown, never skipped, enum remap)', () => {
  it('pre-fills canonical fields, keeps them visible, flags autoFilled, remaps enum', async () => {
    const app = prefillApp({
      'person.ssn': { value: '123456789', sourceFormCode: 'INVESTOR_PROFILE' },
      'account.registrationType': { value: { jointTenant: true, individual: false }, sourceFormCode: 'INVESTOR_PROFILE' }
    });
    const r = await request(app).get('/api/clients/c1/forms/RGP_INCOME_FUND_II_SUB/step-1').set('Cookie', cookie());
    expect(r.status).toBe(200);
    const step = r.body.onboarding.step;
    // never skipped — both questions still visible
    expect(step.visibleQuestionIds).toEqual(['investmentType', 'primary.ssn']);
    // ssn pre-filled + flagged
    expect((step.fields.primary as Record<string, unknown>).ssn).toBe('123456789');
    expect(step.autoFilled).toContain('primary.ssn');
    // enum remap: gold jointTenant -> RGPIF 'joint'
    expect(step.fields.investmentType).toEqual({ joint: true });
    expect(step.autoFilled).toContain('investmentType');
  });

  it('over-fill guard: an invalid stored SSN is NOT pre-filled', async () => {
    const app = prefillApp({ 'person.ssn': { value: '12', sourceFormCode: 'INVESTOR_PROFILE' } });
    const r = await request(app).get('/api/clients/c1/forms/RGP_INCOME_FUND_II_SUB/step-1').set('Cookie', cookie());
    expect(r.body.onboarding.step.autoFilled).not.toContain('primary.ssn');
  });
});
