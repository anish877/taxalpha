import { Prisma } from '@prisma/client';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import {
  getCallbackFormTitle,
  getWorkspaceFormCode,
  PDF_CALLBACK_SECRET_HEADER,
  SUPPORTED_PDF_CALLBACK_FORM_CODES
} from '../lib/form-pdf-utils.js';
import { HttpError } from '../lib/http-error.js';
import type { RouteDeps } from '../types/deps.js';

const callbackParamsSchema = z.object({
  clientId: z.string().trim().min(1),
  formCode: z.string().trim().min(1)
});

export function createN8nRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  router.post('/clients/:clientId/forms/:formCode/pdfs', async (request, response, next) => {
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

    const { clientId, formCode } = parsedParams.data;
    if (!SUPPORTED_PDF_CALLBACK_FORM_CODES.has(formCode)) {
      response.status(400).json({ message: 'Unsupported form code.' });
      return;
    }

    const workspaceFormCode = getWorkspaceFormCode(formCode);

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

      const existingPdf = sourceRunId
        ? await deps.prisma.clientFormPdf.findFirst({
            where: {
              clientId,
              formCode,
              sourceRunId
            }
          })
        : await deps.prisma.clientFormPdf.findFirst({
            where: {
              clientId,
              formCode,
              pdfUrl: parsedPdfUrl.data
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

      const createdPdf = await deps.prisma.clientFormPdf.create({
        data: {
          clientId,
          formCode,
          workspaceFormCode,
          pdfUrl: parsedPdfUrl.data,
          documentTitle: fallbackDocumentTitle,
          fileName,
          sourceRunId,
          generatedAt:
            generatedAtRaw && !Number.isNaN(new Date(generatedAtRaw).getTime())
              ? new Date(generatedAtRaw)
              : null
        }
      });

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
  });

  return router;
}
