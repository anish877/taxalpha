import { randomUUID } from 'node:crypto';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { S3UploadConfig } from '../types/deps.js';

// Document uploads are restricted to identity documents: images or PDF.
const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf'
};

// Hard cap surfaced to the client; the bucket policy should enforce its own limit too.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const PRESIGN_EXPIRES_SECONDS = 300;

export const UPLOAD_LIMITS = {
  maxBytes: MAX_UPLOAD_BYTES,
  allowedContentTypes: Object.keys(ALLOWED_CONTENT_TYPES)
} as const;

type ConfiguredS3 = S3UploadConfig & { bucket: string };

/** True once a target bucket is configured; otherwise uploads stay disabled. */
export function isUploadsConfigured(config: S3UploadConfig | undefined): config is ConfiguredS3 {
  return typeof config?.bucket === 'string' && config.bucket.length > 0;
}

export function isAllowedContentType(contentType: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_CONTENT_TYPES, contentType);
}

function extensionFor(contentType: string): string {
  return ALLOWED_CONTENT_TYPES[contentType] ?? 'bin';
}

function sanitizeSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
}

// A prefix is a path ("a/b/c"); sanitize each segment but keep the slashes.
function sanitizePathPrefix(value: string): string {
  return value
    .split('/')
    .map((segment) => sanitizeSegment(segment))
    .filter(Boolean)
    .join('/');
}

let cachedClient: { region: string; client: S3Client } | null = null;
function getClient(region: string): S3Client {
  if (!cachedClient || cachedClient.region !== region) {
    cachedClient = { region, client: new S3Client({ region }) };
  }
  return cachedClient.client;
}

export interface BuildKeyInput {
  uploadPrefix: string;
  /** Logical bucket for the document, e.g. "photo-id-1". */
  scope: string;
  /** Authenticated owner id, used to namespace + trace the object. */
  ownerId?: string | null;
  contentType: string;
}

/** Build a collision-free, path-safe object key under the configured prefix. */
export function buildObjectKey({ uploadPrefix, scope, ownerId, contentType }: BuildKeyInput): string {
  return [
    sanitizePathPrefix(uploadPrefix) || 'uploads',
    ownerId ? sanitizeSegment(ownerId) : null,
    sanitizeSegment(scope) || 'document',
    `${randomUUID()}.${extensionFor(contentType)}`
  ]
    .filter((segment): segment is string => Boolean(segment))
    .join('/');
}

/** True when a key belongs to this app's configured prefix (guards view access). */
export function isKeyWithinPrefix(config: S3UploadConfig, key: string): boolean {
  const prefix = sanitizePathPrefix(config.uploadPrefix) || 'uploads';
  return key.startsWith(`${prefix}/`);
}

export async function createPresignedUpload(
  config: ConfiguredS3,
  input: { key: string; contentType: string }
): Promise<{ uploadUrl: string; expiresIn: number }> {
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: input.key,
    ContentType: input.contentType
  });

  const uploadUrl = await getSignedUrl(getClient(config.region), command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS
  });

  return { uploadUrl, expiresIn: PRESIGN_EXPIRES_SECONDS };
}

/**
 * Upload from the API server. This avoids requiring the browser's origin to
 * be allowed by the S3 bucket CORS policy.
 */
export async function uploadDocumentToS3(
  config: ConfiguredS3,
  input: { key: string; body: Buffer; contentType: string }
): Promise<void> {
  await getClient(config.region).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType
    })
  );
}

export async function createPresignedDownload(
  config: ConfiguredS3,
  input: { key: string }
): Promise<{ url: string; expiresIn: number }> {
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: input.key
  });

  const url = await getSignedUrl(getClient(config.region), command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS
  });

  return { url, expiresIn: PRESIGN_EXPIRES_SECONDS };
}
