import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import express, { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { defaultBaiodfStep1Fields, serializeBaiodfStep1Fields } from '../lib/baiodf-step1.js';
import { defaultBaiodfStep2Fields, serializeBaiodfStep2Fields } from '../lib/baiodf-step2.js';
import { defaultBaiodfStep3Fields, serializeBaiodfStep3Fields } from '../lib/baiodf-step3.js';
import { extractPdfStructure } from '../lib/ingestion/extract.js';
import { loadTemplate, storeTemplate } from '../lib/ingestion/template-store.js';
import { HttpError } from '../lib/http-error.js';
import { buildFormWebhookPayload } from '../lib/form-webhook-sync.js';
import { buildAiPdfFill } from '../lib/pdf-fill/ai-map.js';
import { getProfileLookup } from '../lib/profile/lookup.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const MAX_AGREEMENT_BYTES = 15 * 1024 * 1024;
const AGREEMENT_ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000;
const rawPdf = express.raw({ type: 'application/pdf', limit: MAX_AGREEMENT_BYTES });
const paramsSchema = z.object({ clientId: z.string().min(1), investmentId: z.string().min(1) });
const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });

function defaults(investmentName?: string) {
  const step2 = defaultBaiodfStep2Fields();
  if (investmentName) step2.custodianAndProduct.nameOfProduct = investmentName;
  return {
    step1CurrentQuestionIndex: 0,
    step1Data: serializeBaiodfStep1Fields(defaultBaiodfStep1Fields()),
    step2CurrentQuestionIndex: 0,
    step2Data: serializeBaiodfStep2Fields(step2),
    step3CurrentQuestionIndex: 0,
    step3Data: serializeBaiodfStep3Fields(defaultBaiodfStep3Fields())
  };
}

function warningCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function investmentDto(investment: any) {
  return {
    id: investment.id,
    clientId: investment.clientId,
    name: investment.name,
    position: investment.position,
    baiodfSyncRequestedAt: investment.baiodfSyncRequestedAt?.toISOString?.() ?? null,
    baiodfStatus: investment.baiodfOnboarding?.status ?? 'NOT_STARTED',
    agreement: investment.agreementPdfFill
      ? {
          fillId: investment.agreementPdfFill.id,
          fileName: investment.agreementPdfFill.fileName,
          status: investment.agreementPdfFill.status,
          warningCount: warningCount(investment.agreementPdfFill.warnings),
          generatedPdfUrl: investment.agreementPdfFill.generatedPdfUrl,
          generatedAt: investment.agreementPdfFill.generatedAt?.toISOString?.() ?? null,
          uploadedAt: investment.agreementPdfFill.createdAt?.toISOString?.() ?? null,
          analysisStartedAt: investment.agreementPdfFill.analysisStartedAt?.toISOString?.() ?? null,
          analysisStage: investment.agreementPdfFill.analysisStage,
          analysisError: investment.agreementPdfFill.analysisError,
          analysisAttempts: investment.agreementPdfFill.analysisAttempts
        }
      : null
  };
}

const investmentInclude = {
  baiodfOnboarding: true,
  agreementPdfFill: true
} as const;

async function ownerClient(deps: RouteDeps, clientId: string, userId: string) {
  const client = await deps.prisma.client.findFirst({
    where: { id: clientId, ownerUserId: userId },
    include: { investments: { include: investmentInclude, orderBy: { position: 'asc' } } }
  });
  if (!client) throw new HttpError(404, 'Client not found.');
  return client;
}

async function ownerInvestment(deps: RouteDeps, clientId: string, investmentId: string, userId: string) {
  await ownerClient(deps, clientId, userId);
  const investment = await deps.prisma.clientInvestment.findFirst({
    where: { id: investmentId, clientId },
    include: investmentInclude
  });
  if (!investment) throw new HttpError(404, 'Investment not found.');
  return investment;
}

async function assertUniqueName(deps: RouteDeps, clientId: string, name: string, excludeId?: string) {
  const investments = await deps.prisma.clientInvestment.findMany({
    where: { clientId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { name: true }
  });
  if (investments.some((investment) => investment.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new HttpError(409, 'Investment names must be unique.', { name: 'Use a unique investment name.' });
  }
}

export function createClientInvestmentsRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  router.get('/:clientId/setup', requireAuth(deps), async (request, response, next) => {
    try {
      const client = await ownerClient(deps, String(request.params.clientId), request.authUser!.id);
      response.json({
        setup: {
          clientId: client.id,
          setupStatus: client.setupStatus,
          investments: client.investments.map(investmentDto)
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/setup/finalize', requireAuth(deps), async (request, response, next) => {
    try {
      const client = await ownerClient(deps, String(request.params.clientId), request.authUser!.id);
      if (client.investments.length === 0 || client.investments.some((item) => !item.agreementPdfFill?.originalPdfUrl)) {
        throw new HttpError(409, 'Upload an agreement PDF for every investment before activation.');
      }
      await deps.prisma.client.update({ where: { id: client.id }, data: { setupStatus: 'ACTIVE' } });
      response.json({
        setupStatus: 'ACTIVE',
        nextOnboardingRoute: `/clients/${client.id}/investor-profile/step-1`
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/investments', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const parsed = nameSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Enter an investment name.');
      const client = await ownerClient(deps, clientId, request.authUser!.id);
      if (client.investments.length >= 10) throw new HttpError(409, 'A client can have at most 10 investments.');
      await assertUniqueName(deps, clientId, parsed.data.name);
      const form = await deps.prisma.formCatalog.findFirst({ where: { code: 'BAIODF', active: true } });
      if (!form) throw new HttpError(409, 'Brokerage Alternative is unavailable.');
      const investment = await deps.prisma.$transaction(async (tx) => {
        await tx.clientFormSelection.upsert({
          where: { clientId_formId: { clientId, formId: form.id } },
          update: {},
          create: { clientId, formId: form.id }
        });
        const created = await tx.clientInvestment.create({
          data: { clientId, name: parsed.data.name, position: client.investments.length + 1 }
        });
        await tx.investmentBaiodfOnboarding.create({
          data: { clientId, investmentId: created.id, status: 'NOT_STARTED', ...defaults(parsed.data.name) }
        });
        return tx.clientInvestment.findUniqueOrThrow({ where: { id: created.id }, include: investmentInclude });
      });
      response.status(201).json({ investment: investmentDto(investment) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:clientId/investments/:investmentId', requireAuth(deps), async (request, response, next) => {
    try {
      const parsedParams = paramsSchema.safeParse(request.params);
      const parsed = nameSchema.safeParse(request.body);
      if (!parsedParams.success || !parsed.success) throw new HttpError(400, 'Enter a valid investment name.');
      await ownerInvestment(deps, parsedParams.data.clientId, parsedParams.data.investmentId, request.authUser!.id);
      await assertUniqueName(deps, parsedParams.data.clientId, parsed.data.name, parsedParams.data.investmentId);
      const investment = await deps.prisma.clientInvestment.update({
        where: { id: parsedParams.data.investmentId },
        data: { name: parsed.data.name },
        include: investmentInclude
      });
      response.json({ investment: investmentDto(investment) });
    } catch (error) {
      next(error);
    }
  });

  router.put(
    '/:clientId/investments/:investmentId/agreement',
    requireAuth(deps),
    rawPdf,
    async (request, response, next) => {
      try {
        const parsedParams = paramsSchema.safeParse(request.params);
        if (!parsedParams.success) throw new HttpError(400, 'Invalid investment.');
        const body = request.body;
        if (!Buffer.isBuffer(body) || body.length === 0 || !body.subarray(0, 5).toString().startsWith('%PDF')) {
          throw new HttpError(400, 'Upload a valid PDF agreement.');
        }
        const investment = await ownerInvestment(
          deps,
          parsedParams.data.clientId,
          parsedParams.data.investmentId,
          request.authUser!.id
        );
        if (investment.agreementPdfFill?.generatedAt || investment.agreementPdfFill?.generatedPdfUrl) {
          throw new HttpError(409, 'The agreement is locked after its filled PDF is generated.');
        }
        const fillId = investment.agreementPdfFill?.id ?? randomUUID();
        const stored = await storeTemplate(`pdf-fill-original-${fillId}`, new Uint8Array(body), deps.config);
        const encodedFileName = String(request.header('x-file-name') || `${investment.name}-agreement.pdf`);
        let fileName = encodedFileName;
        try {
          fileName = decodeURIComponent(encodedFileName);
        } catch {
          // Keep the original header value when it is not URI encoded.
        }
        fileName = fileName.slice(0, 255);
        const fill = await deps.prisma.clientUploadedPdfFill.upsert({
          where: { id: fillId },
          update: {
            originalPdfUrl: stored,
            fileName,
            status: 'UPLOADED',
            analysisStartedAt: null,
            analysisRunId: null,
            analysisStage: null,
            analysisError: null,
            pdfFingerprint: null,
            mappingLayout: Prisma.DbNull,
            resolvedLayout: Prisma.DbNull,
            valueOverrides: {},
            warnings: [],
            generatedPdfUrl: null,
            generatedAt: null
          },
          create: {
            id: fillId,
            clientId: investment.clientId,
            investmentId: investment.id,
            ownerUserId: request.authUser!.id,
            originalPdfUrl: stored,
            fileName,
            status: 'UPLOADED',
            valueOverrides: {},
            warnings: []
          }
        });
        response.json({ agreement: { fillId: fill.id, fileName: fill.fileName, status: fill.status } });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/:clientId/investments/:investmentId/agreement/analyze',
    requireAuth(deps),
    async (request, response, next) => {
      try {
        const parsedParams = paramsSchema.safeParse(request.params);
        if (!parsedParams.success) throw new HttpError(400, 'Invalid investment.');
        const investment = await ownerInvestment(
          deps,
          parsedParams.data.clientId,
          parsedParams.data.investmentId,
          request.authUser!.id
        );
        const fill = investment.agreementPdfFill;
        if (!fill?.originalPdfUrl) throw new HttpError(409, 'Upload an agreement before filling it.');
        if (!deps.config.openrouter?.apiKey) throw new HttpError(503, 'AI PDF analysis is not configured.');
        const analysisStartedAt = fill.analysisStartedAt ?? fill.updatedAt;
        const analysisIsStale = Date.now() - analysisStartedAt.getTime() >= AGREEMENT_ANALYSIS_TIMEOUT_MS;
        if (fill.status === 'ANALYZING' && !analysisIsStale) {
          throw new HttpError(409, 'Agreement analysis is already running.');
        }
        if (!['UPLOADED', 'ANALYSIS_FAILED', 'ANALYZING'].includes(fill.status)) {
          throw new HttpError(409, 'This agreement is already ready for review.');
        }
        const analysisRunId = randomUUID();
        const startedAt = new Date();
        await deps.prisma.clientUploadedPdfFill.update({
          where: { id: fill.id },
          data: {
            status: 'ANALYZING',
            analysisStartedAt: startedAt,
            analysisRunId,
            analysisStage: 'QUEUED',
            analysisError: null,
            analysisAttempts: { increment: 1 }
          }
        });

        response.status(202).json({ fillId: fill.id, status: 'ANALYZING', warningCount: 0 });

        void (async () => {
          try {
            const setAnalysisStage = async (analysisStage: string) => {
              await deps.prisma.clientUploadedPdfFill.updateMany({
                where: { id: fill.id, analysisRunId },
                data: { analysisStage }
              });
            };

            await setAnalysisStage('READING_PDF');
            const original = await loadTemplate(fill.originalPdfUrl!, deps.config);
            if (!original) throw new HttpError(404, 'Original agreement PDF is unavailable.');
            const structure = await extractPdfStructure(new Uint8Array(original));

            await setAnalysisStage('MATCHING_CLIENT_DATA');
            const lookup = await getProfileLookup(deps.prisma, investment.clientId, {
              investmentId: investment.id
            });

            await setAnalysisStage('MAPPING_FIELDS');
            const built = await buildAiPdfFill(new Uint8Array(original), structure, lookup, {
              apiKey: deps.config.openrouter!.apiKey!,
              model: deps.config.openrouter!.model,
              baseUrl: deps.config.openrouter!.baseUrl,
              reasoningEffort: deps.config.openrouter!.reasoningEffort,
              timeoutMs: AGREEMENT_ANALYSIS_TIMEOUT_MS
            });

            await setAnalysisStage('FINALIZING');
            await deps.prisma.clientUploadedPdfFill.updateMany({
              where: { id: fill.id, analysisRunId },
              data: {
                status: 'DRAFT',
                analysisStartedAt: null,
                analysisRunId: null,
                analysisStage: null,
                analysisError: null,
                pdfFingerprint: built.fingerprint,
                mappingLayout: built.mappingLayout as any,
                resolvedLayout: built.resolvedLayout as any,
                warnings: built.warnings as any
              }
            });
          } catch (analysisError) {
            console.error('Investment agreement analysis failed', {
              fillId: fill.id,
              investmentId: investment.id,
              error: analysisError
            });
            await deps.prisma.clientUploadedPdfFill.updateMany({
              where: { id: fill.id, analysisRunId },
              data: {
                status: 'ANALYSIS_FAILED',
                analysisStartedAt: null,
                analysisRunId: null,
                analysisStage: null,
                analysisError: analysisError instanceof HttpError
                  ? analysisError.message.slice(0, 500)
                  : 'Agreement analysis did not complete. Retry analysis.'
              }
            }).catch(() => undefined);
          }
        })();
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/:clientId/investments/:investmentId/baiodf/generate',
    requireAuth(deps),
    async (request, response, next) => {
      try {
        const parsedParams = paramsSchema.safeParse(request.params);
        if (!parsedParams.success) throw new HttpError(400, 'Invalid investment.');
        const investment = await ownerInvestment(
          deps,
          parsedParams.data.clientId,
          parsedParams.data.investmentId,
          request.authUser!.id
        );
        if (investment.baiodfOnboarding?.status !== 'COMPLETED') {
          throw new HttpError(409, 'Complete this investment’s BAIODF before generating its PDF.');
        }
        const client = await deps.prisma.client.findUnique({
          where: { id: investment.clientId },
          include: {
            formSelections: { include: { form: { select: { code: true, title: true } } } },
            investorProfileOnboarding: true,
            statementOfFinancialConditionOnboarding: true,
            baiodfOnboarding: true,
            baiv506cOnboarding: true
          }
        });
        if (!client) throw new HttpError(404, 'Client not found.');
        const webhookUrl = deps.config.n8nWebhooks.baiodfUrl;
        if (!webhookUrl) throw new HttpError(503, 'BAIODF PDF generation is not configured.');
        const backendPublicUrl = deps.config.backendPublicUrl;
        if (!backendPublicUrl) {
          throw new HttpError(503, 'The public callback URL is not configured.');
        }
        const payload = buildFormWebhookPayload(
          { ...client, baiodfOnboarding: investment.baiodfOnboarding } as any,
          'BAIODF',
          request.authUser!.name,
          backendPublicUrl
        );
        Object.assign(payload.metadata as any, {
          investmentId: investment.id,
          investmentName: investment.name,
          investmentPosition: investment.position,
          callbackUrl: `${backendPublicUrl.replace(/\/+$/, '')}/api/n8n/clients/${encodeURIComponent(
            client.id
          )}/investments/${encodeURIComponent(investment.id)}/forms/BAIODF/pdfs`,
          callbackSecret: deps.config.n8nWebhooks.callbackSecret
        });
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(deps.config.n8nWebhooks.timeoutMs)
        });
        if (!webhookResponse.ok) throw new HttpError(502, 'Unable to start BAIODF PDF generation.');
        const requestedAt = new Date();
        await deps.prisma.clientInvestment.update({
          where: { id: investment.id },
          data: { baiodfSyncRequestedAt: requestedAt }
        });
        response.json({ ok: true, requestedAt: requestedAt.toISOString() });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
