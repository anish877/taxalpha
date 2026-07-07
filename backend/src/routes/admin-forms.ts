import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import express, { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { HttpError } from '../lib/http-error.js';
import { ingestFormV2Paged } from '../lib/ingestion/ingest-paged.js';
import { extractPdfStructure } from '../lib/ingestion/extract.js';
import {
  buildAvailableVariables,
  buildMappingLayoutFromFields,
  shouldSkipPdfMappingField,
  skippedSignatureFields,
  validateMappingLayout
} from '../lib/ingestion/pdf-map.js';
import {
  FormSchemaV2,
  PdfMappingLayout,
  type FormSchemaV2 as FormSchemaV2Type
} from '../lib/ingestion/schema-v2.js';
import { loadTemplate, storeTemplate } from '../lib/ingestion/template-store.js';
import { requireAdmin, requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

export interface IngestRouteResult {
  schema: FormSchemaV2Type;
  stats: Record<string, number>;
}
export interface IngestProgress {
  percent: number;
  label: string;
  stage: string;
}
export type IngestFn = (
  pdf: Uint8Array,
  hint?: string,
  vision?: boolean,
  onProgress?: (progress: IngestProgress) => void
) => Promise<IngestRouteResult>;
export type StoreFn = (id: string, bytes: Uint8Array) => Promise<string>;

type JobKind = 'UPLOAD' | 'REANALYZE';
type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

interface AdminIngestionJob {
  id: string;
  ownerUserId: string;
  kind: JobKind;
  status: JobStatus;
  percent: number;
  label: string;
  stage: string;
  createdAt: string;
  updatedAt: string;
  formId?: string;
  result?: unknown;
  error?: string;
}

const ingestionJobs = new Map<string, AdminIngestionJob>();

export interface AdminFormsOptions {
  /** Injectable for tests so the route can run without OpenRouter / S3. */
  ingest?: IngestFn;
  storeTemplate?: StoreFn;
  loadTemplate?: (templateUrl: string | null) => Promise<Buffer | null>;
}

function slugCode(s: string): string {
  return (
    s
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50) || 'UPLOADED_FORM'
  );
}

const isDuplicateKey = (e: unknown): boolean =>
  Boolean(e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002');

const updateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  schema: FormSchemaV2.optional()
});

const reanalyzeSchema = z.object({
  hint: z.string().trim().optional(),
  vision: z.boolean().optional()
});

const updatePdfMapSchema = z.object({
  mappingLayout: PdfMappingLayout
});

function statsWithPercent(stats: Record<string, number>): Record<string, number> {
  if (typeof stats.mappedPercent === 'number') return stats;
  const total = stats.totalFields;
  const mapped = stats.mapped;
  return {
    ...stats,
    mappedPercent: total > 0 && mapped >= 0 ? Math.round((mapped / total) * 1000) / 10 : 100
  };
}

function publicJob(job: AdminIngestionJob): Omit<AdminIngestionJob, 'ownerUserId'> {
  const { ownerUserId: _ownerUserId, ...rest } = job;
  return rest;
}

function createJob(id: string | undefined, ownerUserId: string, kind: JobKind): AdminIngestionJob {
  const jobId = (id?.trim() || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const now = new Date().toISOString();
  const existing = ingestionJobs.get(jobId);
  if (existing && existing.ownerUserId === ownerUserId && existing.status !== 'FAILED') {
    throw new HttpError(409, 'This ingestion job is already running. Refresh the page to reconnect to it.');
  }
  const job: AdminIngestionJob = {
    id: jobId,
    ownerUserId,
    kind,
    status: 'QUEUED',
    percent: 1,
    label: 'Queued',
    stage: 'QUEUED',
    createdAt: now,
    updatedAt: now
  };
  ingestionJobs.set(jobId, job);
  return job;
}

function updateJob(job: AdminIngestionJob, patch: Partial<AdminIngestionJob>): void {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
}

export function createAdminFormsRouter(
  deps: RouteDeps,
  options: AdminFormsOptions = {}
): ExpressRouter {
  const router = Router();
  const auth = [requireAuth(deps), requireAdmin()] as const;

  const ingest: IngestFn =
    options.ingest ??
    ((pdf, hint, vision, onProgress) => {
      const or = deps.config.openrouter;
      if (!or?.apiKey) {
        throw new HttpError(503, 'AI PDF mapping is not configured (missing OPENROUTER_API_KEY).');
      }
      return ingestFormV2Paged(pdf, {
        apiKey: or.apiKey,
        model: or.model,
        baseUrl: or.baseUrl,
        reasoningEffort: or.reasoningEffort,
        hint,
        vision,
        onProgress
      });
    });

  const store: StoreFn = options.storeTemplate ?? ((id, bytes) => storeTemplate(id, bytes, deps.config));
  const loadTpl = options.loadTemplate ?? loadTemplate;

  const loadFormSchema = async (id: string): Promise<{ form: Awaited<ReturnType<typeof deps.prisma.formCatalog.findUnique>>; schema: FormSchemaV2Type }> => {
    const form = await deps.prisma.formCatalog.findUnique({ where: { id } });
    if (!form?.schema) throw new HttpError(404, 'Form not found or has no schema.');
    const parsed = FormSchemaV2.safeParse(form.schema);
    if (!parsed.success) throw new HttpError(400, 'This form does not have a valid step-wise (v2) schema.');
    return { form, schema: parsed.data };
  };

  const buildPdfMapResponse = async (id: string) => {
    const { form, schema } = await loadFormSchema(id);
    if (!form?.templateUrl) throw new HttpError(404, 'No stored template for this form.');
    const bytes = await loadTpl(form.templateUrl);
    if (!bytes) throw new HttpError(404, 'Template not available.');
    const structure = await extractPdfStructure(Uint8Array.from(bytes));
    const mappingLayout = buildMappingLayoutFromFields(schema, structure.fields, schema.mappingLayout);
    return {
      templateUrl: `/api/admin/forms/${id}/template`,
      pages: structure.pages,
      fields: structure.fields
        .filter((field) => !shouldSkipPdfMappingField(field))
        .map((field, index) => ({
          id: `field:${field.fieldName ?? 'unnamed'}:${field.page}:${index}`,
          page: field.page,
          fieldName: field.fieldName,
          type: field.type,
          rect: {
            x: Math.min(field.rect[0], field.rect[2]),
            y: Math.min(field.rect[1], field.rect[3]),
            width: Math.max(1, Math.abs(field.rect[2] - field.rect[0])),
            height: Math.max(1, Math.abs(field.rect[3] - field.rect[1]))
          },
          label: field.inferredLabel ?? field.tooltip ?? field.fieldName ?? 'PDF field',
          nearbyText: field.nearbyText,
          exportValue: field.exportValue ?? null,
          required: field.flags?.required ?? false
        })),
      skippedSignatureFields: skippedSignatureFields(structure.fields),
      mappingLayout,
      variables: buildAvailableVariables(schema)
    };
  };

  const finishUpload = async (
    body: Buffer,
    params: Record<string, string | undefined>,
    onProgress?: (progress: IngestProgress) => void
  ) => {
    const { title, code, hint, vision } = params;
    // Keep an untouched copy for storage: pdfjs (in ingest) detaches the
    // ArrayBuffer it parses, which would otherwise leave us storing 0 bytes.
    const templateBytes = Uint8Array.from(body);
    const result = await ingest(new Uint8Array(body), hint, vision === 'true', onProgress);
    const stats = statsWithPercent(result.stats);

    const finalTitle = (title ?? result.schema.title ?? 'Uploaded form').trim();
    const finalCode = slugCode(code ?? result.schema.code ?? finalTitle);
    const schemaToStore = { ...result.schema, code: finalCode, title: finalTitle };

    const form = await deps.prisma.formCatalog.create({
      data: {
        code: finalCode,
        title: finalTitle,
        active: true,
        source: 'UPLOAD',
        status: 'DRAFT',
        schema: schemaToStore as unknown as Prisma.InputJsonValue,
        ingestionState: {
          hint: hint ?? null,
          vision: vision === 'true',
          stats,
          report: schemaToStore.analysisReport ?? null,
          analyzedAt: new Date().toISOString()
        } as unknown as Prisma.InputJsonValue,
        unmappedCount: result.schema.unmappedFields.length
      },
      select: { id: true, code: true, title: true, status: true, source: true }
    });

    // Persist the source PDF (best-effort; failure shouldn't lose the schema).
    let templateUrl: string | null = null;
    try {
      templateUrl = await store(form.id, templateBytes);
      await deps.prisma.formCatalog.update({ where: { id: form.id }, data: { templateUrl } });
    } catch (storeError) {
      console.warn(`[admin-forms] template store failed for ${form.id}:`, storeError);
    }

    return {
      form: { ...form, templateUrl },
      stats,
      report: schemaToStore.analysisReport ?? null,
      unmappedFields: result.schema.unmappedFields
    };
  };

  const finishReanalysis = async (
    formId: string,
    body: unknown,
    query: Record<string, unknown>,
    onProgress?: (progress: IngestProgress) => void
  ) => {
    const form = await deps.prisma.formCatalog.findUnique({ where: { id: formId } });
    if (!form) throw new HttpError(404, 'Form not found.');
    if (!form.templateUrl) {
      throw new HttpError(400, 'No stored PDF to reanalyze — re-upload the form.');
    }
    const bytes = await loadTpl(form.templateUrl);
    if (!bytes) throw new HttpError(400, 'Stored PDF is unavailable. Re-upload the form.');

    const parsed = reanalyzeSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid reanalyze payload.', {
        body: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
      });
    }
    const queryHint = typeof query.hint === 'string' ? query.hint.trim() : '';
    const hint = parsed.data.hint || queryHint || form.title;
    const vision =
      parsed.data.vision ?? (typeof query.vision === 'string' ? query.vision === 'true' : false);

    const result = await ingest(new Uint8Array(bytes), hint, vision, onProgress);
    const stats = statsWithPercent(result.stats);
    const schemaToStore = { ...result.schema, code: form.code, title: form.title };
    const updated = await deps.prisma.formCatalog.update({
      where: { id: formId },
      data: {
        schema: schemaToStore as unknown as Prisma.InputJsonValue,
        ingestionState: {
          hint,
          vision,
          stats,
          report: schemaToStore.analysisReport ?? null,
          analyzedAt: new Date().toISOString()
        } as unknown as Prisma.InputJsonValue,
        unmappedCount: result.schema.unmappedFields.length
      },
      select: { id: true, code: true, title: true, status: true, source: true, unmappedCount: true }
    });
    return {
      form: updated,
      stats,
      report: schemaToStore.analysisReport ?? null,
      unmappedFields: result.schema.unmappedFields
    };
  };

  /**
   * POST /api/admin/forms — body: raw PDF. Query: title?, code?, hint?
   * Ingests the PDF, stores the source template, adds the form as a DRAFT.
   */
  router.post(
    '/forms',
    ...auth,
    express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '25mb' }),
    async (request, response, next) => {
      try {
        const body = request.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          throw new HttpError(400, 'Request body must be the raw PDF (Content-Type: application/pdf).');
        }
        if (body.subarray(0, 5).toString('latin1') !== '%PDF-') {
          throw new HttpError(400, 'Uploaded file does not look like a PDF.');
        }

        const payload = await finishUpload(body, request.query as Record<string, string | undefined>);
        response.status(201).json(payload);
      } catch (error) {
        if (isDuplicateKey(error)) {
          next(new HttpError(409, 'A form with this code or title already exists.'));
          return;
        }
        next(error);
      }
    }
  );

  /**
   * POST /api/admin/forms/ingestion-jobs/:jobId — upload the PDF and run AI
   * in a server-side job so the browser can reconnect after refresh.
   */
  router.post(
    '/forms/ingestion-jobs/:jobId',
    ...auth,
    express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: '25mb' }),
    async (request, response, next) => {
      try {
        const body = request.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          throw new HttpError(400, 'Request body must be the raw PDF (Content-Type: application/pdf).');
        }
        if (body.subarray(0, 5).toString('latin1') !== '%PDF-') {
          throw new HttpError(400, 'Uploaded file does not look like a PDF.');
        }
        const job = createJob(String(request.params.jobId), request.authUser!.id, 'UPLOAD');
        updateJob(job, { status: 'RUNNING', percent: 38, label: 'PDF uploaded. AI mapping has started.', stage: 'STARTED' });
        response.status(202).json({ job: publicJob(job) });

        void finishUpload(
          body,
          request.query as Record<string, string | undefined>,
          (progress) => updateJob(job, { status: 'RUNNING', ...progress })
        )
          .then((result) => {
            updateJob(job, {
              status: 'COMPLETED',
              percent: 100,
              label: result.report?.headline ?? 'Mapping complete.',
              stage: 'COMPLETED',
              formId: result.form.id,
              result
            });
          })
          .catch((error) => {
            const message = error instanceof HttpError ? error.message : error instanceof Error ? error.message : 'Mapping failed.';
            updateJob(job, { status: 'FAILED', percent: 100, label: message, stage: 'FAILED', error: message });
          });
      } catch (error) {
        next(error);
      }
    }
  );

  /** GET /api/admin/forms/ingestion-jobs/:jobId — reconnect to an active/completed job. */
  router.get('/forms/ingestion-jobs/:jobId', ...auth, async (request, response, next) => {
    try {
      const job = ingestionJobs.get(String(request.params.jobId));
      if (!job || job.ownerUserId !== request.authUser!.id) {
        throw new HttpError(404, 'Ingestion job was not found. If the page was refreshed during upload, choose the PDF again.');
      }
      response.json({ job: publicJob(job) });
    } catch (error) {
      next(error);
    }
  });

  /** GET /api/admin/forms — list all catalog entries (incl. drafts). */
  router.get('/forms', ...auth, async (_request, response, next) => {
    try {
      const forms = await deps.prisma.formCatalog.findMany({
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          source: true,
          unmappedCount: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' }
      });
      response.json({ forms });
    } catch (error) {
      next(error);
    }
  });

  /** GET /api/admin/forms/:id — full record incl. schema for the review screen. */
  router.get('/forms/:id', ...auth, async (request, response, next) => {
    try {
      const form = await deps.prisma.formCatalog.findUnique({ where: { id: String(request.params.id) } });
      if (!form) throw new HttpError(404, 'Form not found.');
      response.json({ form });
    } catch (error) {
      next(error);
    }
  });

  /** GET /api/admin/forms/:id/template — stream the stored source PDF (dev/local). */
  router.get('/forms/:id/template', ...auth, async (request, response, next) => {
    try {
      const form = await deps.prisma.formCatalog.findUnique({
        where: { id: String(request.params.id) },
        select: { templateUrl: true }
      });
      if (!form?.templateUrl) throw new HttpError(404, 'No stored template for this form.');
      const bytes = await loadTemplate(form.templateUrl);
      if (!bytes) throw new HttpError(404, 'Template not available (stored remotely).');
      response.setHeader('Content-Type', 'application/pdf');
      response.send(bytes);
    } catch (error) {
      next(error);
    }
  });

  /** GET /api/admin/forms/:id/pdf-map — visual PDF targets + editable mapping layout. */
  router.get('/forms/:id/pdf-map', ...auth, async (request, response, next) => {
    try {
      response.json(await buildPdfMapResponse(String(request.params.id)));
    } catch (error) {
      next(error);
    }
  });

  /** PUT /api/admin/forms/:id/pdf-map — save admin-edited visual PDF mappings. */
  router.put('/forms/:id/pdf-map', ...auth, express.json(), async (request, response, next) => {
    try {
      const parsed = updatePdfMapSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpError(400, 'Invalid PDF mapping payload.', {
          mappingLayout: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
        });
      }
      const { schema } = await loadFormSchema(String(request.params.id));
      const errors = validateMappingLayout(schema, parsed.data.mappingLayout);
      if (errors.length > 0) throw new HttpError(400, 'Cannot save PDF mapping.', { mappingLayout: errors.join('; ') });
      const nextSchema = { ...schema, mappingLayout: parsed.data.mappingLayout };
      await deps.prisma.formCatalog.update({
        where: { id: String(request.params.id) },
        data: { schema: nextSchema as unknown as Prisma.InputJsonValue }
      });
      response.json({ mappingLayout: parsed.data.mappingLayout });
    } catch (error) {
      next(error);
    }
  });

  /** PATCH /api/admin/forms/:id — save admin edits to title/schema. */
  router.patch('/forms/:id', ...auth, express.json(), async (request, response, next) => {
    try {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpError(400, 'Invalid update payload.', {
          schema: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        });
      }
      const data: Prisma.FormCatalogUpdateInput = {};
      if (parsed.data.title) data.title = parsed.data.title;
      if (parsed.data.schema) {
        data.schema = parsed.data.schema as unknown as Prisma.InputJsonValue;
        data.unmappedCount = parsed.data.schema.unmappedFields.length;
      }
      const form = await deps.prisma.formCatalog.update({
        where: { id: String(request.params.id) },
        data,
        select: { id: true, code: true, title: true, status: true, source: true, unmappedCount: true }
      });
      response.json({ form });
    } catch (error) {
      if (isDuplicateKey(error)) {
        next(new HttpError(409, 'A form with this title already exists.'));
        return;
      }
      next(error);
    }
  });

  /**
   * POST /api/admin/forms/:id/reanalyze — re-run ingestion on the STORED PDF
   * (applies the latest pipeline, e.g. repeat-block recovery) without re-upload.
   */
  router.post('/forms/:id/reanalyze', ...auth, async (request, response, next) => {
    try {
      const id = String(request.params.id);
      response.json(await finishReanalysis(id, request.body, request.query));
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/admin/forms/:id/reanalyze-jobs/:jobId — rerun AI in a job so
   * refreshes can reconnect to the progress/result.
   */
  router.post('/forms/:id/reanalyze-jobs/:jobId', ...auth, async (request, response, next) => {
    try {
      const id = String(request.params.id);
      const job = createJob(String(request.params.jobId), request.authUser!.id, 'REANALYZE');
      updateJob(job, { status: 'RUNNING', percent: 5, label: 'Mapping refresh started.', stage: 'STARTED', formId: id });
      response.status(202).json({ job: publicJob(job) });

      void finishReanalysis(id, request.body, request.query, (progress) =>
        updateJob(job, { status: 'RUNNING', ...progress })
      )
        .then((result) => {
          updateJob(job, {
            status: 'COMPLETED',
            percent: 100,
            label: result.report?.headline ?? 'Mapping refresh complete.',
            stage: 'COMPLETED',
            formId: result.form.id,
            result
          });
        })
        .catch((error) => {
          const message = error instanceof HttpError ? error.message : error instanceof Error ? error.message : 'Mapping refresh failed.';
          updateJob(job, { status: 'FAILED', percent: 100, label: message, stage: 'FAILED', error: message });
        });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/admin/forms/:id/preview-session — create an admin-owned ephemeral
   * preview client so the admin can drive the SAME investor wizard before publish.
   */
  router.post('/forms/:id/preview-session', ...auth, async (request, response, next) => {
    try {
      const id = String(request.params.id);
      const form = await deps.prisma.formCatalog.findUnique({ where: { id } });
      if (!form?.schema) throw new HttpError(404, 'Form not found or has no schema.');
      const email = `preview.${id}@preview.local`;
      const client = await deps.prisma.client.upsert({
        where: { ownerUserId_email: { ownerUserId: request.authUser!.id, email } },
        update: {},
        create: { ownerUserId: request.authUser!.id, name: `[preview] ${form.title}`, email, isPreview: true }
      });
      response.json({ previewClientId: client.id, code: form.code });
    } catch (error) {
      next(error);
    }
  });

  /** POST /api/admin/forms/:id/publish — gate on a valid v2 schema, then PUBLISH. */
  router.post('/forms/:id/publish', ...auth, async (request, response, next) => {
    try {
      const id = String(request.params.id);
      const existing = await deps.prisma.formCatalog.findUnique({ where: { id } });
      if (!existing) throw new HttpError(404, 'Form not found.');
      const parsed = FormSchemaV2.safeParse(existing.schema);
      if (!parsed.success) {
        throw new HttpError(400, 'Cannot publish: this PDF template does not have valid mapping metadata.');
      }
      if (existing.source === 'UPLOAD' && !parsed.data.mappingLayout) {
        throw new HttpError(400, 'Cannot publish: save the visual PDF mapping first.');
      }
      const mappingErrors = validateMappingLayout(parsed.data, parsed.data.mappingLayout);
      if (mappingErrors.length > 0) {
        throw new HttpError(400, 'Cannot publish: the PDF mapping has invalid variable bindings.', {
          mappingLayout: mappingErrors.join('; ')
        });
      }
      const form = await deps.prisma.formCatalog.update({
        where: { id },
        data: { status: 'PUBLISHED', active: true },
        select: { id: true, code: true, title: true, status: true, source: true }
      });
      response.json({ form });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
