import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { S3UploadConfig } from '../types/deps.js';

const PRESIGN_EXPIRES_SECONDS = 300;

type ConfiguredS3 = S3UploadConfig & { bucket: string };

let cachedClient: { region: string; client: S3Client } | null = null;

function getClient(region: string): S3Client {
  if (!cachedClient || cachedClient.region !== region) {
    cachedClient = { region, client: new S3Client({ region }) };
  }

  return cachedClient.client;
}

function sanitizePathSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 180);
}

function sanitizePathPrefix(value: string): string {
  return value
    .split('/')
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean)
    .join('/');
}

function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function isClientDocumentsS3Configured(config: S3UploadConfig | undefined): config is ConfiguredS3 {
  return typeof config?.bucket === 'string' && config.bucket.length > 0;
}

export function buildClientDocumentS3Key(
  config: ConfiguredS3,
  input: {
    clientId: string;
    uniqueFileName: string;
  }
): string {
  const prefix = sanitizePathPrefix(config.clientDocumentPrefix) || 'client-documents';
  const clientSegment = sanitizePathSegment(input.clientId) || 'client';
  const fileSegment = sanitizePathSegment(input.uniqueFileName) || 'document';
  return `${prefix}/${clientSegment}/${fileSegment}`;
}

export async function uploadClientDocumentToS3(
  config: ConfiguredS3,
  input: {
    key: string;
    body: Buffer;
    contentType: string;
    fileName: string;
  }
): Promise<void> {
  await getClient(config.region).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.body.length,
      ContentDisposition: contentDisposition(input.fileName)
    })
  );
}

export async function deleteClientDocumentFromS3(
  config: ConfiguredS3,
  input: {
    key: string;
  }
): Promise<void> {
  await getClient(config.region).send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: input.key
    })
  );
}

export async function downloadClientDocumentFromS3(
  config: ConfiguredS3,
  input: { key: string }
): Promise<Buffer | null> {
  const result = await getClient(config.region).send(
    new GetObjectCommand({ Bucket: config.bucket, Key: input.key })
  );
  if (!result.Body) return null;
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function createClientDocumentViewUrl(
  config: ConfiguredS3,
  input: {
    key: string;
    contentType: string;
    fileName: string;
  }
): Promise<string> {
  return getSignedUrl(
    getClient(config.region),
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: contentDisposition(input.fileName)
    }),
    { expiresIn: PRESIGN_EXPIRES_SECONDS }
  );
}
