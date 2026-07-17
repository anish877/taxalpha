import { createHash, randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { clientAccessWhere } from '../lib/client-access.js';
import {
  getCallbackFormTitle,
  getWorkspaceFormCode,
  PDF_CALLBACK_SECRET_HEADER,
  SUPPORTED_PDF_CALLBACK_FORM_CODES
} from '../lib/form-pdf-utils.js';
import { HttpError } from '../lib/http-error.js';
import { deleteFilled, loadFilled, storeFilled } from '../lib/ingestion/template-store.js';
import { requestBaseUrl } from '../lib/request-base-url.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const MAX_CALLBACK_PDF_BYTES = 30 * 1024 * 1024;
const CALLBACK_DOWNLOAD_TIMEOUT_MS = 15_000;

const callbackParamsSchema = z.object({
  clientId: z.string().trim().min(1),
  investmentId: z.string().trim().min(1).optional(),
  formCode: z.string().trim().min(1)
});

function callbackPdfStorageKey(pdfId: string): string {
  return `n8n-callback-${pdfId}`;
}

function callbackPdfUrl(request: any, clientId: string, pdfId: string): string {
  return `${requestBaseUrl(request)}/api/n8n/clients/${encodeURIComponent(clientId)}/form-pdfs/${encodeURIComponent(pdfId)}/file.pdf`;
}

function effectiveSourceRunId(sourceRunId: string | null, pdfUrl: string): string {
  if (sourceRunId) return sourceRunId;
  return `url-${createHash('sha256').update(pdfUrl).digest('hex')}`;
}

async function downloadCallbackPdf(pdfUrl: string): Promise<Buffer> {
  const url = new URL(pdfUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'PDF URL must use HTTP or HTTPS.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALLBACK_DOWNLOAD_TIMEOUT_MS);

  try {
    const result = await fetch(url, { signal: controller.signal });
    if (!result.ok) {
      throw new HttpError(422, 'Generated PDF could not be downloaded from n8n.');
    }

    const contentLength = Number(result.headers.get('content-length') ?? '0');
    if (contentLength > MAX_CALLBACK_PDF_BYTES) {
      throw new HttpError(413, 'Generated PDF is larger than 30 MB.');
    }

    const bytes = Buffer.from(await result.arrayBuffer());
    if (bytes.length === 0 || !bytes.subarray(0, 5).toString('utf8').startsWith('%PDF')) {
      throw new HttpError(422, 'n8n returned a file that is not a readable PDF.');
    }
    if (bytes.length > MAX_CALLBACK_PDF_BYTES) {
      throw new HttpError(413, 'Generated PDF is larger than 30 MB.');
    }

    return bytes;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'Generated PDF could not be downloaded from n8n.');
  } finally {
    clearTimeout(timeout);
  }
}

export function createN8nRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  const handlePdfCallback = async (request: any, response: any, next: any) => {
    const parsedParams = callbackParamsSchema.safeParse(request.params);
    const body = request.body as Record<string, unknown> | null;

    if (!parsedParams.success || !body || Array.isArray(body)) {
      response.status(400).json({ message: 'Invalid PDF callback payload.' });
      return;
    }

    const parsedPdfUrl = z.string().trim().url('PDF URL must be a valid URL.').safeParse(body.pdfUrl);
    if (!parsedPdfUrl.success) {
      response.status(400).json({ message: 'Invalid PDF callback payload.' });
      return;
    }

    const documentTitle = typeof body.documentTitle === 'string' && body.documentTitle.trim()
      ? body.documentTitle.trim()
      : null;
    const fileName = typeof body.fileName === 'string' && body.fileName.trim() ? body.fileName.trim() : null;
    const sourceRunId =
      typeof body.sourceRunId === 'string' && body.sourceRunId.trim() ? body.sourceRunId.trim() : null;
    const generatedAtRaw =
      typeof body.generatedAt === 'string' && body.generatedAt.trim() ? body.generatedAt.trim() : null;

    const callbackSecret = request.header(PDF_CALLBACK_SECRET_HEADER);
    if (!deps.config.n8nWebhooks.callbackSecret || callbackSecret !== deps.config.n8nWebhooks.callbackSecret) {
      response.status(401).json({ message: 'Invalid callback secret.' });
      return;
    }

    const { clientId, investmentId, formCode } = parsedParams.data;
    if (!SUPPORTED_PDF_CALLBACK_FORM_CODES.has(formCode)) {
      response.status(400).json({ message: 'Unsupported form code.' });
      return;
    }

    const workspaceFormCode = getWorkspaceFormCode(formCode);

    if (investmentId && formCode !== 'BAIODF') {
      response.status(400).json({ message: 'Investment callbacks only support BAIODF.' });
      return;
    }

    try {
      const client = await deps.prisma.client.findFirst({
        where: {
          id: clientId
        },
        include: {
          formSelections: {
            include: {
              form: {
                select: {
                  code: true
                }
              }
            }
          }
        }
      });

      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (!client.formSelections.some((selection) => selection.form.code === workspaceFormCode)) {
        response.status(404).json({ message: 'Form not selected for client.' });
        return;
      }

      if (investmentId) {
        const investment = await deps.prisma.clientInvestment.findFirst({
          where: { id: investmentId, clientId },
          select: { id: true }
        });
        if (!investment) {
          response.status(404).json({ message: 'Investment not found.' });
          return;
        }
      }

      const dedupeSourceRunId = effectiveSourceRunId(sourceRunId, parsedPdfUrl.data);
      const existingPdf = await deps.prisma.clientFormPdf.findFirst({
        where: {
          clientId,
          formCode,
          investmentId: investmentId ?? null,
          OR: [{ sourceRunId: dedupeSourceRunId }, { pdfUrl: parsedPdfUrl.data }]
        }
      });

      if (existingPdf) {
        response.status(200).json({
          message: 'PDF already recorded.',
          pdfId: existingPdf.id
        });
        return;
      }

      const fallbackDocumentTitle = documentTitle || getCallbackFormTitle(formCode);
      const pdfBytes = await downloadCallbackPdf(parsedPdfUrl.data);
      const pdfId = randomUUID();
      const storageKey = callbackPdfStorageKey(pdfId);
      await storeFilled(storageKey, pdfBytes, deps.config);

      let createdPdf;
      try {
        createdPdf = await deps.prisma.clientFormPdf.create({
          data: {
            id: pdfId,
            clientId,
            investmentId: investmentId ?? null,
            formCode,
            workspaceFormCode,
            pdfUrl: callbackPdfUrl(request, clientId, pdfId),
            documentTitle: fallbackDocumentTitle,
            fileName,
            sourceRunId: dedupeSourceRunId,
            generatedAt:
              generatedAtRaw && !Number.isNaN(new Date(generatedAtRaw).getTime())
                ? new Date(generatedAtRaw)
                : null
          }
        });
      } catch (error) {
        await deleteFilled(storageKey, deps.config).catch(() => undefined);
        throw error;
      }

      response.status(201).json({
        message: 'PDF recorded.',
        pdfId: createdPdf.id
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        response.status(200).json({
          message: 'PDF already recorded.'
        });
        return;
      }

      if (error instanceof HttpError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }

      next(error);
    }
  };

  router.post('/clients/:clientId/forms/:formCode/pdfs', handlePdfCallback);
  router.post('/clients/:clientId/investments/:investmentId/forms/:formCode/pdfs', handlePdfCallback);
  router.get(
    '/clients/:clientId/form-pdfs/:pdfId/file.pdf',
    requireAuth(deps),
    async (request, response, next) => {
      try {
        const clientId = String(request.params.clientId);
        const pdfId = String(request.params.pdfId);
        const pdf = await deps.prisma.clientFormPdf.findFirst({
          where: {
            id: pdfId,
            clientId,
            client: clientAccessWhere(request.authUser!.id)
          },
          select: { id: true, fileName: true, documentTitle: true }
        });

        if (!pdf) {
          response.status(404).json({ message: 'PDF not found.' });
          return;
        }

        const bytes = await loadFilled(callbackPdfStorageKey(pdf.id), deps.config);
        if (!bytes) {
          response.status(404).json({ message: 'PDF file is not available.' });
          return;
        }

        const requestedName = pdf.fileName || pdf.documentTitle || 'generated-document.pdf';
        const safeName = requestedName.replace(/[\r\n"\\]/g, '-');
        response.setHeader('Content-Type', 'application/pdf');
        response.setHeader('Content-Disposition', `inline; filename="${safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`}"`);
        response.send(bytes);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
