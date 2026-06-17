import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import {
  buildObjectKey,
  createPresignedDownload,
  createPresignedUpload,
  isAllowedContentType,
  isKeyWithinPrefix,
  isUploadsConfigured,
  UPLOAD_LIMITS
} from '../lib/s3-uploads.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const presignRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(128),
  scope: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Scope may only contain letters, numbers, dots, dashes, and underscores.')
    .default('document')
});

export function createUploadsRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();
  const { config } = deps;

  // Issue a short-lived presigned PUT URL so the browser can upload straight to S3.
  router.post('/presign', requireAuth(deps), async (request, response, next) => {
    try {
      if (!isUploadsConfigured(config.s3)) {
        response.status(503).json({ message: 'Document uploads are not configured.' });
        return;
      }

      const parsed = presignRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({ message: 'Invalid upload request.' });
        return;
      }

      const { fileName, contentType, scope } = parsed.data;
      if (!isAllowedContentType(contentType)) {
        response.status(415).json({
          message: 'Unsupported file type. Upload a JPG, PNG, WEBP, HEIC, or PDF.'
        });
        return;
      }

      const key = buildObjectKey({
        uploadPrefix: config.s3.uploadPrefix,
        scope,
        ownerId: request.authUser!.id,
        contentType
      });

      const { uploadUrl, expiresIn } = await createPresignedUpload(config.s3, { key, contentType });

      response.json({
        uploadUrl,
        key,
        fileName,
        contentType,
        expiresIn,
        maxBytes: UPLOAD_LIMITS.maxBytes
      });
    } catch (error) {
      next(error);
    }
  });

  // Exchange a stored object key for a short-lived presigned GET URL to view the file.
  router.get('/view', requireAuth(deps), async (request, response, next) => {
    try {
      if (!isUploadsConfigured(config.s3)) {
        response.status(503).json({ message: 'Document uploads are not configured.' });
        return;
      }

      const key = typeof request.query.key === 'string' ? request.query.key : '';
      if (!key || !isKeyWithinPrefix(config.s3, key)) {
        response.status(400).json({ message: 'Invalid object key.' });
        return;
      }

      const { url, expiresIn } = await createPresignedDownload(config.s3, { key });
      response.json({ url, expiresIn });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
