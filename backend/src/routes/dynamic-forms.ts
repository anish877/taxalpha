import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { clientAccessWhere } from '../lib/client-access.js';
import { HttpError } from '../lib/http-error.js';
import { fillPdf } from '../lib/ingestion/fill.js';
import { resolveFieldValues, type Answers } from '../lib/ingestion/resolve.js';
import { FormSchema } from '../lib/ingestion/schema.js';
import { loadFilled, loadTemplate, storeFilled } from '../lib/ingestion/template-store.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

/**
 * Client-facing runtime for AI-ingested (schema-driven) forms — the generic
 * counterpart to the bespoke per-form onboarding routes. Renders/saves answers
 * keyed by question id and fills the stored template PDF on demand.
 */
export function createDynamicFormsRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();
  const filledKey = (clientId: string, code: string) => `${clientId}__${code}`;

  async function ownedClient(clientId: string, userId: string) {
    const client = await deps.prisma.client.findFirst({
      where: { id: clientId, ...clientAccessWhere(userId) }
    });
    if (!client) throw new HttpError(404, 'Client not found.');
    return client;
  }

  async function loadForm(code: string) {
    const form = await deps.prisma.formCatalog.findUnique({ where: { code } });
    if (!form) throw new HttpError(404, 'Form not found.');
    if (!form.schema) throw new HttpError(400, 'This form has no schema (not an uploaded form).');
    return form;
  }

  /** GET — schema + any saved answers. */
  router.get('/:clientId/forms/:code/dynamic', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const code = String(request.params.code);
      await ownedClient(clientId, request.authUser!.id);
      const form = await loadForm(code);
      const saved = await deps.prisma.dynamicFormResponse.findUnique({
        where: { clientId_formCode: { clientId, formCode: code } }
      });
      response.json({
        form: { id: form.id, code: form.code, title: form.title, status: form.status, schema: form.schema },
        answers: saved?.answers ?? {},
        responseStatus: saved?.status ?? 'IN_PROGRESS'
      });
    } catch (error) {
      next(error);
    }
  });

  /** PUT — save answers (partial allowed). */
  router.put('/:clientId/forms/:code/dynamic', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const code = String(request.params.code);
      await ownedClient(clientId, request.authUser!.id);
      await loadForm(code);

      const parsed = z.object({ answers: z.record(z.any()), status: z.string().optional() }).safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, 'Invalid answers payload.');

      const saved = await deps.prisma.dynamicFormResponse.upsert({
        where: { clientId_formCode: { clientId, formCode: code } },
        update: { answers: parsed.data.answers, ...(parsed.data.status ? { status: parsed.data.status } : {}) },
        create: {
          clientId,
          formCode: code,
          answers: parsed.data.answers,
          status: parsed.data.status ?? 'IN_PROGRESS'
        }
      });
      response.json({ ok: true, status: saved.status });
    } catch (error) {
      next(error);
    }
  });

  /** POST generate — fill the template PDF from saved + posted answers. */
  router.post('/:clientId/forms/:code/dynamic/generate', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const code = String(request.params.code);
      await ownedClient(clientId, request.authUser!.id);
      const form = await loadForm(code);

      const template = await loadTemplate(form.templateUrl);
      if (!template) {
        throw new HttpError(400, 'The original PDF for this form is not stored. Re-upload it in the Form Library.');
      }

      // Use posted answers if present, else the saved ones.
      const posted = (request.body?.answers ?? null) as Answers | null;
      const saved = await deps.prisma.dynamicFormResponse.findUnique({
        where: { clientId_formCode: { clientId, formCode: code } }
      });
      const answers = posted ?? ((saved?.answers as Answers) ?? {});

      const schema = FormSchema.parse(form.schema);
      const values = resolveFieldValues(schema, answers);
      const filled = await fillPdf(new Uint8Array(template), values, { flatten: true });
      await storeFilled(filledKey(clientId, code), filled);

      // Persist answers + mark completed.
      await deps.prisma.dynamicFormResponse.upsert({
        where: { clientId_formCode: { clientId, formCode: code } },
        update: { answers, status: 'COMPLETED' },
        create: { clientId, formCode: code, answers, status: 'COMPLETED' }
      });

      response.json({
        ok: true,
        fieldsFilled: Object.keys(values).length,
        pdfUrl: `${deps.config.backendPublicUrl ?? ''}/api/clients/${clientId}/forms/${code}/dynamic/filled.pdf`
      });
    } catch (error) {
      next(error);
    }
  });

  /** GET the generated PDF. */
  router.get('/:clientId/forms/:code/dynamic/filled.pdf', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const code = String(request.params.code);
      await ownedClient(clientId, request.authUser!.id);
      const bytes = await loadFilled(filledKey(clientId, code));
      if (!bytes) throw new HttpError(404, 'No generated PDF yet.');
      response.setHeader('Content-Type', 'application/pdf');
      response.send(bytes);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
