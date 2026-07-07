import type { Prisma } from '@prisma/client';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { extractPdfStructure } from '../lib/ingestion/extract.js';
import { clientAccessWhere } from '../lib/client-access.js';
import { loadFilled, loadTemplate, storeFilled, storeTemplate } from '../lib/ingestion/template-store.js';
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
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const PDF_UPLOAD_WORKSPACE_CODE = 'PDF_UPLOAD';

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
        where: { clientId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          fileName: true,
          status: true,
          generatedPdfUrl: true,
          generatedAt: true,
          createdAt: true,
          updatedAt: true,
          warnings: true
        }
      });

      response.json({
        fills: fills.map((fill) => ({
          id: fill.id,
          fileName: fill.fileName,
          status: fill.status,
          generatedPdfUrl: fill.generatedPdfUrl,
          generatedAt: fill.generatedAt?.toISOString() ?? null,
          createdAt: fill.createdAt.toISOString(),
          updatedAt: fill.updatedAt.toISOString(),
          warningCount: Array.isArray(fill.warnings) ? fill.warnings.length : 0
        }))
      });
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
      const ai = requireOpenRouter(deps);
      const [structure, lookup] = await Promise.all([
        extractPdfStructure(new Uint8Array(pdf)),
        getProfileLookup(deps.prisma, clientId)
      ]);
      const built = await buildAiPdfFill(pdf, structure, lookup, ai);
      const originalPdfUrl = await storeTemplate(`pdf-fill-original-${built.id}`, pdf, deps.config);
      const originalUrl = publicPdfFillUrl(deps.config.backendPublicUrl, clientId, built.id, 'original');

      await deps.prisma.clientUploadedPdfFill.create({
        data: {
          id: built.id,
          clientId,
          ownerUserId: request.authUser!.id,
          originalPdfUrl,
          fileName: parsed.data.fileName,
          pdfFingerprint: built.fingerprint,
          mappingLayout: json(built.mappingLayout),
          resolvedLayout: json(built.resolvedLayout),
          valueOverrides: json({}),
          warnings: json(built.warnings),
          status: 'DRAFT'
        }
      });

      response.status(201).json({
        fill: {
          id: built.id,
          fileName: parsed.data.fileName,
          status: 'DRAFT',
          originalPdfUrl: originalUrl,
          generatedPdfUrl: null,
          profileTitle: built.profileTitle,
          resolvedLayout: built.resolvedLayout,
          warnings: built.warnings
        }
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
      const lookup = await getProfileLookup(deps.prisma, clientId);
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
          originalPdfUrl: publicPdfFillUrl(deps.config.backendPublicUrl, clientId, fill.id, 'original'),
          generatedPdfUrl: fill.generatedPdfUrl,
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
      const lookup = await getProfileLookup(deps.prisma, clientId);
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
          warnings: json(warnings)
        }
      });

      response.json({ resolvedLayout, warnings });
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
        getProfileLookup(deps.prisma, clientId)
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
      const lookup = await getProfileLookup(deps.prisma, clientId);
      const generated = await generateFilledPdfFromSession(
        new Uint8Array(original),
        previous?.pages ?? [],
        layout,
        lookup,
        overrides,
        previous
      );
      await storeFilled(generatedStorageKey(fill.id), generated.bytes);
      const generatedPdfUrl = publicPdfFillUrl(deps.config.backendPublicUrl, clientId, fill.id, 'filled');
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
            workspaceFormCode: PDF_UPLOAD_WORKSPACE_CODE,
            documentTitle: fill.fileName ?? 'Uploaded PDF',
            fileName: fill.fileName ?? `${fill.id}.pdf`,
            sourceRunId: fill.id,
            generatedAt: now
          },
          create: {
            clientId,
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
      const bytes = await loadFilled(generatedStorageKey(fill.id));
      if (!bytes) throw new HttpError(404, 'Generated PDF is not available.');
      response.setHeader('Content-Type', 'application/pdf');
      response.send(bytes);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
