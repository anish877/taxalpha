import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { extractPdfStructure } from '../lib/ingestion/extract.js';
import { clientAccessWhere } from '../lib/client-access.js';
import {
  deleteFilled,
  deleteTemplate,
  loadFilled,
  loadTemplate,
  storeFilled,
  storeTemplate
} from '../lib/ingestion/template-store.js';
import { HttpError } from '../lib/http-error.js';
import { buildAiPdfFill } from '../lib/pdf-fill/ai-map.js';
import {
  generateFilledPdfFromSession,
  mergePdfFillOverrides,
  parseMappingLayout,
  parsePdfFillOverrides,
  publicPdfFillUrl,
  resolvePublicPdfFillLayout,
  type PdfFillOverrides,
  type PublicPdfFillLayout
} from '../lib/pdf-fill/engine.js';
import { getProfileLookup } from '../lib/profile/lookup.js';
import { requestBaseUrl } from '../lib/request-base-url.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const PDF_UPLOAD_WORKSPACE_CODE = 'PDF_UPLOAD';
const PDF_ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000;

const createFillBodySchema = z.object({
  fileName: z.string().trim().min(1).max(255).default('uploaded.pdf'),
  pdfBase64: z.string().min(1)
});

const updateValuesBodySchema = z.object({
  overrides: z.record(
    z.object({
      value: z.union([z.string(), z.boolean(), z.null()]).optional(),
      ignored: z.boolean().optional()
    })
  )
});

function decodePdfBase64(value: string): Uint8Array {
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES) {
    throw new HttpError(400, 'Upload a PDF smaller than 15 MB.');
  }
  if (!bytes.subarray(0, 5).toString('utf8').startsWith('%PDF')) {
    throw new HttpError(400, 'Uploaded file is not a valid PDF.');
  }
  return new Uint8Array(bytes);
}

function generatedStorageKey(fillId: string): string {
  return `pdf-fill-${fillId}`;
}

function asResolvedLayout(value: unknown): PublicPdfFillLayout | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as PublicPdfFillLayout;
  if (!Array.isArray(candidate.pages) || !Array.isArray(candidate.targets)) return null;
  return candidate;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function schedulePdfFillAnalysis(params: {
  deps: RouteDeps;
  fillId: string;
  clientId: string;
  originalPdfUrl: string;
  investmentId: string | null;
  analysisRunId: string;
}) {
  const { deps, fillId, clientId, originalPdfUrl, investmentId, analysisRunId } = params;

  void (async () => {
    try {
      const setStage = async (analysisStage: string) => {
        await deps.prisma.clientUploadedPdfFill.updateMany({
          where: { id: fillId, analysisRunId },
          data: { analysisStage }
        });
      };

      await setStage('READING_PDF');
      const original = await loadTemplate(originalPdfUrl, deps.config);
      if (!original) throw new HttpError(404, 'Original PDF is not available.');
      const structure = await extractPdfStructure(new Uint8Array(original));

      await setStage('MATCHING_CLIENT_DATA');
      const lookup = await getProfileLookup(deps.prisma, clientId, {
        investmentId: investmentId ?? undefined
      });

      await setStage('MAPPING_FIELDS');
      const built = await buildAiPdfFill(new Uint8Array(original), structure, lookup, requireOpenRouter(deps));

      await setStage('FINALIZING');
      await deps.prisma.clientUploadedPdfFill.updateMany({
        where: { id: fillId, analysisRunId },
        data: {
          status: 'DRAFT',
          analysisStartedAt: null,
          analysisRunId: null,
          analysisStage: null,
          analysisError: null,
          pdfFingerprint: built.fingerprint,
          mappingLayout: json(built.mappingLayout),
          resolvedLayout: json(built.resolvedLayout),
          warnings: json(built.warnings)
        }
      });
    } catch (analysisError) {
      console.error('Direct PDF fill analysis failed', { fillId, clientId, error: analysisError });
      await deps.prisma.clientUploadedPdfFill
        .updateMany({
          where: { id: fillId, analysisRunId },
          data: {
            status: 'ANALYSIS_FAILED',
            analysisStartedAt: null,
            analysisRunId: null,
            analysisStage: null,
            analysisError:
              analysisError instanceof HttpError
                ? analysisError.message.slice(0, 500)
                : 'PDF analysis did not complete. Retry analysis.'
          }
        })
        .catch(() => undefined);
    }
  })();
}

function requireOpenRouter(deps: RouteDeps) {
  const openrouter = deps.config.openrouter;
  if (!openrouter?.apiKey) {
    throw new HttpError(503, 'AI PDF re-analysis is not configured (missing OPENROUTER_API_KEY).');
  }
  return {
    apiKey: openrouter.apiKey,
    model: openrouter.model,
    baseUrl: openrouter.baseUrl,
    reasoningEffort: openrouter.reasoningEffort
  };
}

async function ownedClient(deps: RouteDeps, clientId: string, ownerUserId: string) {
  const client = await deps.prisma.client.findFirst({
    where: { id: clientId, ...clientAccessWhere(ownerUserId) },
    select: { id: true, name: true, ownerUserId: true }
  });
  if (!client) throw new HttpError(404, 'Client not found.');
  return client;
}

async function ownedFill(deps: RouteDeps, clientId: string, fillId: string, ownerUserId: string) {
  await ownedClient(deps, clientId, ownerUserId);
  const fill = await deps.prisma.clientUploadedPdfFill.findFirst({
    where: { id: fillId, clientId }
  });
  if (!fill) throw new HttpError(404, 'PDF fill session not found.');
  return fill;
}

export function createClientPdfFillsRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  router.get('/:clientId/pdf-fills', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      await ownedClient(deps, clientId, request.authUser!.id);
      const fills = await deps.prisma.clientUploadedPdfFill.findMany({
        where: { clientId, investmentId: null },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          fileName: true,
          status: true,
          generatedPdfUrl: true,
          generatedAt: true,
          createdAt: true,
          updatedAt: true,
          warnings: true,
          analysisStartedAt: true,
          analysisStage: true,
          analysisError: true,
          analysisAttempts: true
        }
      });

      response.json({
        fills: fills.map((fill) => {
          const analysisIsStale = Boolean(
            fill.status === 'ANALYZING' &&
            Date.now() - (fill.analysisStartedAt ?? fill.updatedAt).getTime() >= PDF_ANALYSIS_TIMEOUT_MS
          );
          return {
            id: fill.id,
            fileName: fill.fileName,
            status: analysisIsStale ? 'ANALYSIS_FAILED' : fill.status,
            generatedPdfUrl: fill.generatedPdfUrl,
            generatedAt: fill.generatedAt?.toISOString() ?? null,
            createdAt: fill.createdAt.toISOString(),
            updatedAt: fill.updatedAt.toISOString(),
            warningCount: Array.isArray(fill.warnings) ? fill.warnings.length : 0,
            analysisStartedAt: fill.analysisStartedAt?.toISOString() ?? null,
            analysisStage: fill.analysisStage,
            analysisError: analysisIsStale
              ? 'Analysis was interrupted or timed out. Retry analysis.'
              : fill.analysisError,
            analysisAttempts: fill.analysisAttempts
          };
        })
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:clientId/pdf-fills/:fillId', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const fillId = String(request.params.fillId);
      await ownedClient(deps, clientId, request.authUser!.id);
      const fill = await deps.prisma.clientUploadedPdfFill.findFirst({
        where: { id: fillId, clientId, investmentId: null },
        select: { id: true, originalPdfUrl: true }
      });
      if (!fill) throw new HttpError(404, 'Direct PDF fill session not found.');

      await deps.prisma.$transaction([
        deps.prisma.clientFormPdf.deleteMany({
          where: { clientId, investmentId: null, sourceRunId: fill.id }
        }),
        deps.prisma.clientUploadedPdfFill.delete({ where: { id: fill.id } })
      ]);

      await Promise.allSettled([
        deleteTemplate(fill.originalPdfUrl, deps.config),
        deleteFilled(`pdf-fill-${fill.id}`, deps.config)
      ]);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/pdf-fills', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      await ownedClient(deps, clientId, request.authUser!.id);
      const parsed = createFillBodySchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Upload a valid PDF.');

      const pdf = decodePdfBase64(parsed.data.pdfBase64);
      requireOpenRouter(deps);
      const fillId = randomUUID();
      const originalPdfUrl = await storeTemplate(`pdf-fill-original-${fillId}`, pdf, deps.config);
      const originalUrl = publicPdfFillUrl(requestBaseUrl(request), clientId, fillId, 'original');
      const analysisRunId = randomUUID();
      const startedAt = new Date();

      await deps.prisma.clientUploadedPdfFill.create({
        data: {
          id: fillId,
          clientId,
          ownerUserId: request.authUser!.id,
          originalPdfUrl,
          fileName: parsed.data.fileName,
          valueOverrides: json({}),
          warnings: json([]),
          status: 'ANALYZING',
          analysisStartedAt: startedAt,
          analysisRunId,
          analysisStage: 'QUEUED',
          analysisAttempts: 1
        }
      });

      response.status(202).json({
        fill: {
          id: fillId,
          fileName: parsed.data.fileName,
          status: 'ANALYZING',
          originalPdfUrl: originalUrl,
          generatedPdfUrl: null,
          generatedAt: null,
          resolvedLayout: { pages: [], targets: [] },
          warnings: []
        }
      });

      schedulePdfFillAnalysis({
        deps,
        fillId,
        clientId,
        originalPdfUrl,
        investmentId: null,
        analysisRunId
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/pdf-fills/:fillId/analyze', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const fillId = String(request.params.fillId);
      const fill = await ownedFill(deps, clientId, fillId, request.authUser!.id);
      if (!fill.originalPdfUrl) throw new HttpError(409, 'Original PDF is not available.');
      requireOpenRouter(deps);

      const analysisStartedAt = fill.analysisStartedAt ?? fill.updatedAt;
      const analysisIsStale = Date.now() - analysisStartedAt.getTime() >= PDF_ANALYSIS_TIMEOUT_MS;
      if (fill.status === 'ANALYZING' && !analysisIsStale) {
        throw new HttpError(409, 'PDF analysis is already running.');
      }
      if (!['UPLOADED', 'ANALYSIS_FAILED', 'ANALYZING'].includes(fill.status)) {
        throw new HttpError(409, 'This PDF is already ready for review.');
      }

      const analysisRunId = randomUUID();
      await deps.prisma.clientUploadedPdfFill.update({
        where: { id: fill.id },
        data: {
          status: 'ANALYZING',
          analysisStartedAt: new Date(),
          analysisRunId,
          analysisStage: 'QUEUED',
          analysisError: null,
          analysisAttempts: { increment: 1 }
        }
      });

      response.status(202).json({ fillId: fill.id, status: 'ANALYZING' });
      schedulePdfFillAnalysis({
        deps,
        fillId: fill.id,
        clientId,
        originalPdfUrl: fill.originalPdfUrl,
        investmentId: fill.investmentId,
        analysisRunId
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/pdf-fills/:fillId', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const fillId = String(request.params.fillId);
      const fill = await ownedFill(deps, clientId, fillId, request.authUser!.id);
      if (fill.status === 'ANALYZING') {
        throw new HttpError(409, 'PDF analysis is still running.');
      }
      if (fill.status === 'ANALYSIS_FAILED') {
        throw new HttpError(409, fill.analysisError ?? 'PDF analysis failed. Retry analysis from the PDF Fill tab.');
      }
      const lookup = await getProfileLookup(deps.prisma, clientId, {
        investmentId: fill.investmentId ?? undefined
      });
      const previous = asResolvedLayout(fill.resolvedLayout);
      const layout = parseMappingLayout(fill.mappingLayout);
      const overrides = parsePdfFillOverrides(fill.valueOverrides);
      const { resolvedLayout, warnings } = resolvePublicPdfFillLayout(previous?.pages ?? [], layout, lookup, {
        overrides,
        previous
      });

      response.json({
        fill: {
          id: fill.id,
          fileName: fill.fileName,
          status: fill.status,
          originalPdfUrl: publicPdfFillUrl(requestBaseUrl(request), clientId, fill.id, 'original'),
          generatedPdfUrl: fill.generatedPdfUrl
            ? publicPdfFillUrl(requestBaseUrl(request), clientId, fill.id, 'filled')
            : null,
          generatedAt: fill.generatedAt?.toISOString() ?? null,
          resolvedLayout,
          warnings
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:clientId/pdf-fills/:fillId/values', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const fillId = String(request.params.fillId);
      const fill = await ownedFill(deps, clientId, fillId, request.authUser!.id);
      const parsed = updateValuesBodySchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid PDF field update.');

      const existing = parsePdfFillOverrides(fill.valueOverrides);
      const nextOverrides = mergePdfFillOverrides(existing, parsed.data.overrides as PdfFillOverrides);
      const lookup = await getProfileLookup(deps.prisma, clientId, {
        investmentId: fill.investmentId ?? undefined
      });
      const previous = asResolvedLayout(fill.resolvedLayout);
      const layout = parseMappingLayout(fill.mappingLayout);
      const { resolvedLayout, warnings } = resolvePublicPdfFillLayout(previous?.pages ?? [], layout, lookup, {
        overrides: nextOverrides,
        previous
      });

      await deps.prisma.clientUploadedPdfFill.update({
        where: { id: fill.id },
        data: {
          valueOverrides: json(nextOverrides),
          resolvedLayout: json(resolvedLayout),
          warnings: json(warnings),
          // A previously generated file remains available, but it no longer
          // represents the saved field values until the user generates again.
          status: 'DRAFT'
        }
      });

      response.json({ resolvedLayout, warnings, status: 'DRAFT' });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/pdf-fills/:fillId/reanalyze', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const fillId = String(request.params.fillId);
      const fill = await ownedFill(deps, clientId, fillId, request.authUser!.id);
      const original = await loadTemplate(fill.originalPdfUrl, deps.config);
      if (!original) throw new HttpError(404, 'Original PDF is not available.');
      const overrides = parsePdfFillOverrides(fill.valueOverrides);
      const [structure, lookup] = await Promise.all([
        extractPdfStructure(new Uint8Array(original)),
        getProfileLookup(deps.prisma, clientId, { investmentId: fill.investmentId ?? undefined })
      ]);
      const built = await buildAiPdfFill(new Uint8Array(original), structure, lookup, requireOpenRouter(deps));
      const { resolvedLayout, warnings } = resolvePublicPdfFillLayout(structure.pages, built.mappingLayout, lookup, {
        fields: structure.fields,
        overrides,
        previous: asResolvedLayout(fill.resolvedLayout)
      });

      await deps.prisma.clientUploadedPdfFill.update({
        where: { id: fill.id },
        data: {
          pdfFingerprint: built.fingerprint,
          mappingLayout: json(built.mappingLayout),
          resolvedLayout: json(resolvedLayout),
          warnings: json(warnings),
          status: 'DRAFT'
        }
      });

      response.json({ resolvedLayout, warnings });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/pdf-fills/:fillId/generate', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const fillId = String(request.params.fillId);
      await ownedClient(deps, clientId, request.authUser!.id);
      const fill = await ownedFill(deps, clientId, fillId, request.authUser!.id);
      const original = await loadTemplate(fill.originalPdfUrl, deps.config);
      if (!original) throw new HttpError(404, 'Original PDF is not available.');

      const previous = asResolvedLayout(fill.resolvedLayout);
      const layout = parseMappingLayout(fill.mappingLayout);
      const overrides = parsePdfFillOverrides(fill.valueOverrides);
      const lookup = await getProfileLookup(deps.prisma, clientId, {
        investmentId: fill.investmentId ?? undefined
      });
      const generated = await generateFilledPdfFromSession(
        new Uint8Array(original),
        previous?.pages ?? [],
        layout,
        lookup,
        overrides,
        previous
      );
      await storeFilled(generatedStorageKey(fill.id), generated.bytes, deps.config);
      const generatedPdfUrl = publicPdfFillUrl(requestBaseUrl(request), clientId, fill.id, 'filled');
      const now = new Date();

      await deps.prisma.$transaction([
        deps.prisma.clientUploadedPdfFill.update({
          where: { id: fill.id },
          data: {
            status: 'GENERATED',
            generatedPdfUrl,
            generatedAt: now,
            resolvedLayout: json(generated.resolvedLayout),
            warnings: json(generated.warnings)
          }
        }),
        deps.prisma.clientFormPdf.upsert({
          where: {
            clientId_formCode_pdfUrl: {
              clientId,
              formCode: PDF_UPLOAD_WORKSPACE_CODE,
              pdfUrl: generatedPdfUrl
            }
          },
          update: {
            investmentId: fill.investmentId,
            workspaceFormCode: PDF_UPLOAD_WORKSPACE_CODE,
            documentTitle: fill.fileName ?? 'Uploaded PDF',
            fileName: fill.fileName ?? `${fill.id}.pdf`,
            sourceRunId: fill.id,
            generatedAt: now
          },
          create: {
            clientId,
            investmentId: fill.investmentId,
            formCode: PDF_UPLOAD_WORKSPACE_CODE,
            workspaceFormCode: PDF_UPLOAD_WORKSPACE_CODE,
            pdfUrl: generatedPdfUrl,
            documentTitle: fill.fileName ?? 'Uploaded PDF',
            fileName: fill.fileName ?? `${fill.id}.pdf`,
            sourceRunId: fill.id,
            generatedAt: now
          }
        })
      ]);

      response.json({
        ok: true,
        pdfUrl: generatedPdfUrl,
        fieldsFilled: Object.keys(generated.fieldValues).length + generated.overlays.length,
        resolvedLayout: generated.resolvedLayout,
        warnings: generated.warnings
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/pdf-fills/:fillId/original.pdf', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const fill = await ownedFill(deps, clientId, String(request.params.fillId), request.authUser!.id);
      const original = await loadTemplate(fill.originalPdfUrl, deps.config);
      if (!original) throw new HttpError(404, 'Original PDF is not available.');
      response.setHeader('Content-Type', 'application/pdf');
      response.send(original);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/pdf-fills/:fillId/filled.pdf', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const fill = await ownedFill(deps, clientId, String(request.params.fillId), request.authUser!.id);
      const bytes = await loadFilled(generatedStorageKey(fill.id), deps.config);
      if (!bytes) throw new HttpError(404, 'Generated PDF is not available.');
      response.setHeader('Content-Type', 'application/pdf');
      response.send(bytes);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
