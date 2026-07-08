import { Router, type Router as ExpressRouter } from 'express';

import {
  applyDynamicAnswer,
  applyDynamicPrefill,
  buildDynamicEnvelope,
  clampDynamicQuestionIndex,
  defaultDynamicFields,
  deriveContext,
  deriveDynamicFormStatus,
  getDynamicStepQuestionIds,
  getVisibleDynamicQuestionIds,
  isDynamicQuestionId,
  mergeStepData,
  normalizeDynamicFields,
  resolveFieldValuesV2,
  serializeDynamicFields,
  validateDynamicAnswer,
  validateDynamicStepCompletion,
  type Fields,
  type ProfileLookup
} from '../lib/dynamic-step-engine.js';
import { clientAccessWhere } from '../lib/client-access.js';
import { HttpError } from '../lib/http-error.js';
import { drawPdfTextOverlays, fillPdf } from '../lib/ingestion/fill.js';
import { resolveMappedPdfValues } from '../lib/ingestion/pdf-map.js';
import { FormSchemaV2 } from '../lib/ingestion/schema-v2.js';
import { loadFilled, loadTemplate, storeFilled } from '../lib/ingestion/template-store.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

type StepDataMap = Record<string, Fields>;
type CursorMap = Record<string, number>;

/**
 * Generic step-wise runtime for schema-driven (uploaded) forms — the dynamic
 * counterpart to the gold per-form step routes. New namespace
 * `/:clientId/forms/:code/...`. Phase 2: profileLookup is empty (Phase 4 wires
 * cross-form auto-fill). Server owns visibility + cursor (load-bearing).
 */
export function createDynamicStepsRouter(
  deps: RouteDeps,
  opts: { profileLookup?: (clientId: string) => Promise<ProfileLookup> } = {}
): ExpressRouter {
  const router = Router();
  const lookupFn = opts.profileLookup ?? (async () => ({}));

  async function ownedClient(clientId: string, userId: string) {
    const client = await deps.prisma.client.findFirst({
      where: { id: clientId, ...clientAccessWhere(userId) }
    });
    if (!client) throw new HttpError(404, 'Client not found.');
    return client;
  }

  async function loadSchema(code: string): Promise<FormSchemaV2> {
    const form = await deps.prisma.formCatalog.findUnique({ where: { code } });
    if (!form || !form.schema) throw new HttpError(404, 'Form not found.');
    const parsed = FormSchemaV2.safeParse(form.schema);
    if (!parsed.success) throw new HttpError(400, 'This form does not have a step-wise (v2) schema.');
    return parsed.data;
  }

  async function loadResponse(clientId: string, code: string) {
    return deps.prisma.dynamicFormResponse.upsert({
      where: { clientId_formCode: { clientId, formCode: code } },
      update: {},
      create: { clientId, formCode: code }
    });
  }

  const parseStep = (raw: string): number => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'Invalid step number.');
    return n;
  };

  function envelopeFor(
    schema: FormSchemaV2,
    step: number,
    stepData: StepDataMap,
    cursors: CursorMap,
    lookup: ProfileLookup
  ) {
    const ctx = deriveContext();
    const base = normalizeDynamicFields(schema, step, stepData[String(step)]);
    const { fields, autoFilled } = applyDynamicPrefill(schema, step, base, lookup, schema.code);
    const storedCursor = cursors[String(step)];
    // Fresh pre-filled form with no stored cursor: land on first visible (review).
    const cursor = typeof storedCursor === 'number' ? storedCursor : 0;
    // Cross-step merged fields (current step overridden with prefilled values) drive showIf.
    const evalFields = mergeStepData(schema, { ...stepData, [String(step)]: fields });
    return { ctx, fields, env: buildDynamicEnvelope(schema, step, fields, cursor, autoFilled, ctx, evalFields) };
  }

  // GET schema (presentation metadata for the wizard) ------------------------
  router.get('/:clientId/forms/:code/schema', requireAuth(deps), async (req, res, next) => {
    try {
      await ownedClient(String(req.params.clientId), req.authUser!.id);
      const schema = await loadSchema(String(req.params.code));
      res.json({ schema });
    } catch (e) {
      next(e);
    }
  });

  // GET step -----------------------------------------------------------------
  router.get('/:clientId/forms/:code/step-:n', requireAuth(deps), async (req, res, next) => {
    try {
      const clientId = String(req.params.clientId);
      const code = String(req.params.code);
      const step = parseStep(String(req.params.n));
      await ownedClient(clientId, req.authUser!.id);
      const schema = await loadSchema(code);
      const resp = await loadResponse(clientId, code);
      const stepData = (resp.stepData ?? {}) as StepDataMap;
      const cursors = (resp.stepCursors ?? {}) as CursorMap;
      const lookup = await lookupFn(clientId);
      const { env } = envelopeFor(schema, step, stepData, cursors, lookup);
      res.json({ onboarding: { clientId, status: resp.status, totalSteps: schema.steps.length, step: env } });
    } catch (e) {
      next(e);
    }
  });

  // POST step ----------------------------------------------------------------
  router.post('/:clientId/forms/:code/step-:n', requireAuth(deps), async (req, res, next) => {
    try {
      const clientId = String(req.params.clientId);
      const code = String(req.params.code);
      const step = parseStep(String(req.params.n));
      await ownedClient(clientId, req.authUser!.id);
      const schema = await loadSchema(code);

      const { questionId, answer } = (req.body ?? {}) as { questionId?: string; answer?: unknown };
      // clientCursor is accepted-but-ignored (matches gold).
      if (typeof questionId !== 'string') {
        throw new HttpError(400, 'Please correct the highlighted fields.', { questionId: 'Unsupported onboarding question.' });
      }

      const resp = await loadResponse(clientId, code);
      const stepData = (resp.stepData ?? {}) as StepDataMap;
      const cursors = (resp.stepCursors ?? {}) as CursorMap;
      const lookup = await lookupFn(clientId);

      const base = normalizeDynamicFields(schema, step, stepData[String(step)]);
      const { fields: existing } = applyDynamicPrefill(schema, step, base, lookup, schema.code);
      const ctx = deriveContext();
      const evalBefore = mergeStepData(schema, { ...stepData, [String(step)]: existing });

      if (!isDynamicQuestionId(schema, step, questionId, existing)) {
        throw new HttpError(400, 'Please correct the highlighted fields.', { questionId: 'Unsupported onboarding question.' });
      }

      const validation = validateDynamicAnswer(schema, questionId, answer);
      if (!validation.success) {
        throw new HttpError(400, 'Please correct the highlighted fields.', validation.fieldErrors);
      }

      // Active-path guard: the question must currently be visible (cross-step eval).
      const visibleBefore = getVisibleDynamicQuestionIds(schema, step, evalBefore, ctx);
      if (!visibleBefore.includes(questionId)) {
        throw new HttpError(400, 'Please correct the highlighted fields.', {
          questionId: 'This question is not active for the selected account path.'
        });
      }

      const nextFields = applyDynamicAnswer(schema, existing, questionId, validation.value, ctx);
      const evalAfter = mergeStepData(schema, { ...stepData, [String(step)]: nextFields });
      const visibleAfter = getVisibleDynamicQuestionIds(schema, step, evalAfter, ctx);
      const answeredIdx = visibleAfter.indexOf(questionId);
      const nextIndex = Math.min(answeredIdx + 1, visibleAfter.length - 1);

      stepData[String(step)] = serializeDynamicFields(nextFields);
      cursors[String(step)] = nextIndex;

      // Per-step POST writes IN_PROGRESS only; whole-form completion is a
      // separate derivation.
      await deps.prisma.dynamicFormResponse.update({
        where: { clientId_formCode: { clientId, formCode: code } },
        data: {
          stepData: stepData as object,
          stepCursors: cursors as object,
          status: 'IN_PROGRESS'
        }
      });

      const env = buildDynamicEnvelope(schema, step, nextFields, nextIndex, [], ctx, evalAfter);
      const derived = deriveDynamicFormStatus(schema, numericKeyed(stepData), ctx);
      res.json({ onboarding: { clientId, status: derived, totalSteps: schema.steps.length, step: env } });
    } catch (e) {
      next(e);
    }
  });

  // Review family (whole-step edit) ------------------------------------------
  router.get('/:clientId/forms/:code/review/step-:n', requireAuth(deps), async (req, res, next) => {
    try {
      const clientId = String(req.params.clientId);
      const code = String(req.params.code);
      const step = parseStep(String(req.params.n));
      await ownedClient(clientId, req.authUser!.id);
      const schema = await loadSchema(code);
      const resp = await loadResponse(clientId, code);
      const stepData = (resp.stepData ?? {}) as StepDataMap;
      const fields = normalizeDynamicFields(schema, step, stepData[String(step)]);
      const ctx = deriveContext();
      res.json({
        review: { stepNumber: step, totalSteps: schema.steps.length },
        fields,
        visibleQuestionIds: getVisibleDynamicQuestionIds(schema, step, fields, ctx)
      });
    } catch (e) {
      next(e);
    }
  });

  router.put('/:clientId/forms/:code/review/step-:n', requireAuth(deps), async (req, res, next) => {
    try {
      const clientId = String(req.params.clientId);
      const code = String(req.params.code);
      const step = parseStep(String(req.params.n));
      await ownedClient(clientId, req.authUser!.id);
      const schema = await loadSchema(code);
      const incoming = ((req.body ?? {}) as { fields?: Fields }).fields ?? {};
      const merged = normalizeDynamicFields(schema, step, incoming);
      const ctx = deriveContext();

      // Validate every visible required field in the step.
      const { complete, fieldErrors } = validateDynamicStepCompletion(schema, step, merged, ctx);
      if (!complete) {
        throw new HttpError(400, 'Please correct the highlighted fields.', fieldErrors);
      }

      const resp = await loadResponse(clientId, code);
      const stepData = (resp.stepData ?? {}) as StepDataMap;
      stepData[String(step)] = serializeDynamicFields(merged);
      await deps.prisma.dynamicFormResponse.update({
        where: { clientId_formCode: { clientId, formCode: code } },
        data: { stepData: stepData as object, status: 'IN_PROGRESS' }
      });
      res.json({ review: { stepNumber: step, totalSteps: schema.steps.length }, fields: merged });
    } catch (e) {
      next(e);
    }
  });

  // POST generate — fill the stored template PDF from all step answers --------
  router.post('/:clientId/forms/:code/generate', requireAuth(deps), async (req, res, next) => {
    try {
      const clientId = String(req.params.clientId);
      const code = String(req.params.code);
      await ownedClient(clientId, req.authUser!.id);
      const schema = await loadSchema(code);
      const form = await deps.prisma.formCatalog.findUnique({ where: { code } });
      if (!form) throw new HttpError(404, 'Form not found.');
      const selection = await deps.prisma.clientFormSelection.findFirst({
        where: { clientId, form: { code } },
        select: { clientId: true }
      });
      if (!selection) throw new HttpError(404, 'Form not selected for client.');
      if (form.source === 'UPLOAD' && !schema.mappingLayout) {
        throw new HttpError(400, 'This PDF template has not been mapped yet. Ask an admin to publish its mapping.');
      }
      const template = await loadTemplate(form?.templateUrl ?? null, deps.config);
      if (!template) throw new HttpError(400, 'The original PDF for this form is not stored. Re-upload it in the Form Library.');

      const resp = await loadResponse(clientId, code);
      const stepData = (resp.stepData ?? {}) as StepDataMap;
      const merged = mergeStepData(schema, stepData as unknown as Record<number, Fields>);
      const ctx = deriveContext();
      const lookup = await lookupFn(clientId);
      const mapped = schema.mappingLayout
        ? resolveMappedPdfValues(schema, schema.mappingLayout, merged, lookup, ctx)
        : { fieldValues: resolveFieldValuesV2(schema, merged, ctx), overlays: [], warnings: [] };
      const acroFilled = await fillPdf(new Uint8Array(template), mapped.fieldValues, { flatten: true });
      const filled = await drawPdfTextOverlays(acroFilled, mapped.overlays);
      await storeFilled(`${clientId}__${code}`, filled, deps.config);
      const pdfUrl = `${deps.config.backendPublicUrl ?? ''}/api/clients/${clientId}/forms/${code}/filled.pdf`;
      await deps.prisma.clientFormPdf.upsert({
        where: {
          clientId_formCode_pdfUrl: {
            clientId,
            formCode: code,
            pdfUrl
          }
        },
        update: {
          workspaceFormCode: code,
          documentTitle: form?.title ?? schema.title,
          fileName: `${code}.pdf`,
          generatedAt: new Date()
        },
        create: {
          clientId,
          formCode: code,
          workspaceFormCode: code,
          pdfUrl,
          documentTitle: form?.title ?? schema.title,
          fileName: `${code}.pdf`,
          sourceRunId: 'taxalpha-mapping',
          generatedAt: new Date()
        }
      });
      await deps.prisma.dynamicFormResponse.update({
        where: { clientId_formCode: { clientId, formCode: code } },
        data: { status: 'COMPLETED' }
      });
      res.json({
        ok: true,
        fieldsFilled: Object.keys(mapped.fieldValues).length + mapped.overlays.length,
        pdfUrl,
        warnings: mapped.warnings
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:clientId/forms/:code/filled.pdf', requireAuth(deps), async (req, res, next) => {
    try {
      const clientId = String(req.params.clientId);
      const code = String(req.params.code);
      await ownedClient(clientId, req.authUser!.id);
      const bytes = await loadFilled(`${clientId}__${code}`, deps.config);
      if (!bytes) throw new HttpError(404, 'No generated PDF yet.');
      res.setHeader('Content-Type', 'application/pdf');
      res.send(bytes);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

// keys come back from JSON as strings; engine reads stepData[number] — JS coerces.
function numericKeyed(stepData: StepDataMap): Record<number, Fields> {
  return stepData as unknown as Record<number, Fields>;
}

// re-exports used by tests
export { defaultDynamicFields, getDynamicStepQuestionIds, mergeStepData, clampDynamicQuestionIndex };
