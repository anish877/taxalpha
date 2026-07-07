import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { clientAccessWhere } from '../lib/client-access.js';
import {
  cloudinaryPublicId,
  deleteRawDocumentFromCloudinary,
  isCloudinaryConfigured,
  signedRawDocumentUrl,
  uploadRawDocumentToCloudinary
} from '../lib/cloudinary-documents.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const MAX_CLIENT_DOCUMENT_BYTES = 50 * 1024 * 1024;
const STORAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.local-storage/client-documents'
);

const clientDocumentParamsSchema = z.object({
  clientId: z.string().trim().min(1)
});

const clientDocumentViewParamsSchema = clientDocumentParamsSchema.extend({
  documentId: z.string().trim().min(1)
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

function resolveStoragePath(storageKey: string): string {
  const resolved = path.resolve(STORAGE_ROOT, storageKey);
  const rootWithSeparator = `${STORAGE_ROOT}${path.sep}`;

  if (resolved !== STORAGE_ROOT && !resolved.startsWith(rootWithSeparator)) {
    throw new Error('Invalid document storage key.');
  }

  return resolved;
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
      if (!(await ensureOwnedClient(deps, clientId, authUser.id))) {
        response.status(404).json({ message: 'Client not found.' });
        return;
      }

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

      if (isCloudinaryConfigured(deps.config.cloudinary)) {
        const upload = await uploadRawDocumentToCloudinary(deps.config.cloudinary, {
          buffer: body,
          publicId: cloudinaryPublicId(deps.config.cloudinary, clientId, uniqueFileName)
        });

        try {
          const document = await deps.prisma.clientDocument.create({
            data: {
              clientId,
              uploadedByUserId: authUser.id,
              fileName,
              contentType,
              sizeBytes: upload.bytes || body.length,
              storageKey: `cloudinary:${upload.publicId}`,
              storageProvider: 'CLOUDINARY',
              cloudinaryPublicId: upload.publicId,
              cloudinaryResourceType: upload.resourceType,
              cloudinaryDeliveryType: upload.deliveryType
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
          await deleteRawDocumentFromCloudinary(deps.config.cloudinary, {
            publicId: upload.publicId,
            resourceType: upload.resourceType,
            deliveryType: upload.deliveryType
          });
          throw error;
        }

        return;
      }

      const storageKey = `${clientId}/${uniqueFileName}`;
      const storagePath = resolveStoragePath(storageKey);

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

      if (document.storageProvider === 'CLOUDINARY') {
        if (!isCloudinaryConfigured(deps.config.cloudinary)) {
          response.status(503).json({ message: 'Cloudinary document storage is not configured.' });
          return;
        }

        if (!document.cloudinaryPublicId) {
          response.status(404).json({ message: 'Stored document file not found.' });
          return;
        }

        response.redirect(
          signedRawDocumentUrl(deps.config.cloudinary, {
            publicId: document.cloudinaryPublicId,
            resourceType: document.cloudinaryResourceType ?? 'raw',
            deliveryType: document.cloudinaryDeliveryType ?? 'authenticated'
          })
        );
        return;
      }

      const storagePath = resolveStoragePath(document.storageKey);
      try {
        await fs.promises.access(storagePath, fs.constants.R_OK);
      } catch {
        response.status(404).json({ message: 'Stored document file not found.' });
        return;
      }

      response.setHeader('Content-Type', document.contentType);
      response.setHeader('Content-Length', String(document.sizeBytes));
      response.setHeader('Content-Disposition', contentDisposition(document.fileName));

      fs.createReadStream(storagePath).on('error', next).pipe(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
