import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import express, { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { clientAccessWhere } from '../lib/client-access.js';
import { loadClientDocumentBytes, resolveClientDocumentStoragePath } from '../lib/client-document-storage.js';
import {
  getGovernmentIdDocumentReferences,
  syncGovernmentIdDocuments
} from '../lib/government-id-documents.js';
import { loadFilled } from '../lib/ingestion/template-store.js';
import {
  buildClientDocumentS3Key,
  deleteClientDocumentFromS3,
  isClientDocumentsS3Configured,
  uploadClientDocumentToS3
} from '../lib/s3-client-documents.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const MAX_CLIENT_DOCUMENT_BYTES = 50 * 1024 * 1024;

const clientDocumentParamsSchema = z.object({
  clientId: z.string().trim().min(1)
});

const clientDocumentViewParamsSchema = clientDocumentParamsSchema.extend({
  documentId: z.string().trim().min(1)
});

const clientFormPdfViewParamsSchema = clientDocumentParamsSchema.extend({
  pdfId: z.string().trim().min(1)
});

function sanitizeFileName(value: string | undefined): string {
  const decoded = (() => {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  })();

  const baseName = path.basename(decoded).trim() || 'document';
  const sanitized = baseName
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, 180);

  return sanitized || 'document';
}

function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function toClientDocumentRecord(document: {
  id: string;
  clientId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedBy: {
    name: string;
  };
}) {
  return {
    id: document.id,
    clientId: document.clientId,
    fileName: document.fileName,
    contentType: document.contentType,
    sizeBytes: document.sizeBytes,
    uploadedByName: document.uploadedBy.name,
    createdAt: document.createdAt.toISOString(),
    viewUrl: `/api/clients/${document.clientId}/documents/${document.id}/view`
  };
}

async function ensureOwnedClient(deps: RouteDeps, clientId: string, ownerUserId: string): Promise<boolean> {
  const client = await deps.prisma.client.findFirst({
    where: {
      id: clientId,
      ...clientAccessWhere(ownerUserId)
    },
    select: {
      id: true
    }
  });

  return Boolean(client);
}

function uniqueStorageFileName(fileName: string): string {
  return `${randomUUID()}-${fileName}`;
}

export function createClientDocumentsRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();
  const rawUpload = express.raw({
    type: '*/*',
    limit: MAX_CLIENT_DOCUMENT_BYTES
  });

  router.get('/:clientId/documents', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientDocumentParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const { clientId } = parsedParams.data;

    try {
      const client = await deps.prisma.client.findFirst({
        where: { id: clientId, ...clientAccessWhere(authUser.id) },
        select: {
          id: true,
          investorProfileOnboarding: { select: { step3Data: true, step4Data: true } }
        }
      });
      if (!client) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      await syncGovernmentIdDocuments(deps.prisma, {
        clientId,
        uploadedByUserId: authUser.id,
        next: getGovernmentIdDocumentReferences(
          client.investorProfileOnboarding?.step3Data,
          client.investorProfileOnboarding?.step4Data
        )
      });

      const documents = await deps.prisma.clientDocument.findMany({
        where: {
          clientId
        },
        include: {
          uploadedBy: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      response.json({ documents: documents.map(toClientDocumentRecord) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/documents', requireAuth(deps), rawUpload, async (request, response, next) => {
    const parsedParams = clientDocumentParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid client identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const { clientId } = parsedParams.data;
    const body = request.body;

    if (!Buffer.isBuffer(body) || body.length === 0) {
      response.status(400).json({ message: 'Choose a non-empty document to upload.' });
      return;
    }

    const fileName = sanitizeFileName(request.header('x-file-name'));
    const contentType = request.header('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
    const uniqueFileName = uniqueStorageFileName(fileName);

    try {
      if (!(await ensureOwnedClient(deps, clientId, authUser.id))) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

      if (isClientDocumentsS3Configured(deps.config.s3)) {
        const storageKey = buildClientDocumentS3Key(deps.config.s3, {
          clientId,
          uniqueFileName
        });

        await uploadClientDocumentToS3(deps.config.s3, {
          key: storageKey,
          body,
          contentType,
          fileName
        });

        try {
          const document = await deps.prisma.clientDocument.create({
            data: {
              clientId,
              uploadedByUserId: authUser.id,
              fileName,
              contentType,
              sizeBytes: body.length,
              storageKey,
              storageProvider: 'S3'
            },
            include: {
              uploadedBy: {
                select: {
                  name: true
                }
              }
            }
          });

          response.status(201).json({ document: toClientDocumentRecord(document) });
        } catch (error) {
          await deleteClientDocumentFromS3(deps.config.s3, { key: storageKey });
          throw error;
        }

        return;
      }

      const storageKey = `${clientId}/${uniqueFileName}`;
      const storagePath = resolveClientDocumentStoragePath(storageKey);

      await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
      await fs.promises.writeFile(storagePath, body);

      try {
        const document = await deps.prisma.clientDocument.create({
          data: {
            clientId,
            uploadedByUserId: authUser.id,
            fileName,
            contentType,
            sizeBytes: body.length,
            storageKey,
            storageProvider: 'LOCAL'
          },
          include: {
            uploadedBy: {
              select: {
                name: true
              }
            }
          }
        });

        response.status(201).json({ document: toClientDocumentRecord(document) });
      } catch (error) {
        await fs.promises.rm(storagePath, { force: true });
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/documents/:documentId/view', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientDocumentViewParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid document identifier.' });
      return;
    }

    const authUser = request.authUser!;
    const { clientId, documentId } = parsedParams.data;

    try {
      const document = await deps.prisma.clientDocument.findFirst({
        where: {
          id: documentId,
          clientId,
          client: clientAccessWhere(authUser.id)
        }
      });

      if (!document) {
        response.status(404).json({ message: 'Document not found.' });
        return;
      }

      const bytes = await loadClientDocumentBytes(document, deps.config.s3);
      if (!bytes) {
        response.status(404).json({ message: 'Stored document file not found.' });
        return;
      }

      response.setHeader('Content-Type', document.contentType);
      response.setHeader('Content-Length', String(bytes.length));
      response.setHeader('Content-Disposition', contentDisposition(document.fileName));
      response.send(bytes);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId/form-pdfs/:pdfId/file.pdf', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientFormPdfViewParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid PDF identifier.' });
      return;
    }

    const { clientId, pdfId } = parsedParams.data;
    try {
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

      const bytes = await loadFilled(`n8n-callback-${pdf.id}`, deps.config);
      if (!bytes) {
        response.status(404).json({ message: 'PDF file is not available.' });
        return;
      }

      const requestedName = sanitizeFileName(pdf.fileName || pdf.documentTitle || 'generated-document.pdf');
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Length', String(bytes.length));
      response.setHeader('Content-Disposition', contentDisposition(requestedName.endsWith('.pdf') ? requestedName : `${requestedName}.pdf`));
      response.send(bytes);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:clientId/documents/:documentId', requireAuth(deps), async (request, response, next) => {
    const parsedParams = clientDocumentViewParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      response.status(400).json({ message: 'Invalid document identifier.' });
      return;
    }

    const { clientId, documentId } = parsedParams.data;
    try {
      const document = await deps.prisma.clientDocument.findFirst({
        where: { id: documentId, clientId, client: clientAccessWhere(request.authUser!.id) }
      });
      if (!document) {
        response.status(404).json({ message: 'Document not found.' });
        return;
      }

      await deps.prisma.clientDocument.delete({ where: { id: document.id } });
      if (document.storageProvider === 'S3') {
        if (isClientDocumentsS3Configured(deps.config.s3)) {
          await deleteClientDocumentFromS3(deps.config.s3, { key: document.storageKey }).catch(() => undefined);
        }
      } else {
        await fs.promises.rm(resolveClientDocumentStoragePath(document.storageKey), { force: true }).catch(() => undefined);
      }
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
