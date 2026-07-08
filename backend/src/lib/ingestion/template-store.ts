import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { RuntimeConfig, S3UploadConfig } from '../../types/deps.js';

/**
 * Persist the uploaded source PDF so a completed submission can be filled later.
 * Uses S3 when configured, otherwise a local directory for dev. The returned
 * string is stored as FormCatalog.templateUrl and understood by `loadTemplate`.
 */
const LOCAL_DIR = resolve(process.cwd(), '.local-storage', 'form-templates');
const FILLED_DIR = resolve(process.cwd(), '.local-storage', 'filled');

type ConfiguredS3 = S3UploadConfig & { bucket: string };

let cachedClient: { region: string; client: S3Client } | null = null;

function getClient(region: string): S3Client {
  if (!cachedClient || cachedClient.region !== region) {
    cachedClient = { region, client: new S3Client({ region }) };
  }

  return cachedClient.client;
}

function isS3Configured(config: RuntimeConfig | undefined): config is RuntimeConfig & { s3: ConfiguredS3 } {
  return typeof config?.s3?.bucket === 'string' && config.s3.bucket.length > 0;
}

function sanitizePathSegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 160);
}

function sanitizePathPrefix(value: string): string {
  return value
    .split('/')
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean)
    .join('/');
}

function isMissingS3Object(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate.name === 'NoSuchKey' || candidate.$metadata?.httpStatusCode === 404;
}

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  if (!uri.startsWith('s3://')) {
    return null;
  }

  const withoutScheme = uri.slice('s3://'.length);
  const slash = withoutScheme.indexOf('/');
  const bucket = slash >= 0 ? withoutScheme.slice(0, slash) : withoutScheme;
  const key = slash >= 0 ? withoutScheme.slice(slash + 1) : '';
  return bucket && key ? { bucket, key } : null;
}

export function buildFilledPdfS3Key(config: S3UploadConfig, key: string): string {
  const prefix = sanitizePathPrefix(config.filledPdfPrefix) || 'filled-pdfs';
  const fileSegment = sanitizePathSegment(key.replace(/\.pdf$/i, '')) || 'filled';
  return `${prefix}/${fileSegment}.pdf`;
}

export async function storeTemplate(
  id: string,
  bytes: Uint8Array,
  config: RuntimeConfig
): Promise<string> {
  if (isS3Configured(config)) {
    const key = `form-templates/${id}.pdf`;
    await getClient(config.s3.region).send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: 'application/pdf'
      })
    );
    return `s3://${config.s3.bucket}/${key}`;
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(resolve(LOCAL_DIR, `${id}.pdf`), Buffer.from(bytes));
  return `local:${id}`;
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body || typeof body !== 'object' || !('transformToByteArray' in body)) {
    throw new Error('Unsupported S3 body stream.');
  }
  const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  return Buffer.from(bytes);
}

/** Read back a stored template by its FormCatalog.templateUrl. */
export async function loadTemplate(templateUrl: string | null, config?: RuntimeConfig): Promise<Buffer | null> {
  if (!templateUrl) return null;
  if (templateUrl.startsWith('local:')) {
    const id = templateUrl.slice('local:'.length);
    const path = resolve(LOCAL_DIR, `${id}.pdf`);
    return existsSync(path) ? readFile(path) : null;
  }
  if (templateUrl.startsWith('s3://') && config?.s3?.bucket) {
    const parsed = parseS3Uri(templateUrl);
    if (!parsed || parsed.bucket !== config.s3.bucket) return null;
    const result = await getClient(config.s3.region).send(
      new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })
    );
    return streamToBuffer(result.Body);
  }
  return null;
}

/** Store a completed (filled) PDF; returns a reference accepted by `loadFilled`. */
export async function storeFilled(key: string, bytes: Uint8Array, config?: RuntimeConfig): Promise<string> {
  if (isS3Configured(config)) {
    const s3Key = buildFilledPdfS3Key(config.s3, key);
    await getClient(config.s3.region).send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: s3Key,
        Body: Buffer.from(bytes),
        ContentType: 'application/pdf',
        ContentLength: bytes.byteLength
      })
    );
    return `s3://${config.s3.bucket}/${s3Key}`;
  }

  await mkdir(FILLED_DIR, { recursive: true });
  await writeFile(resolve(FILLED_DIR, `${key}.pdf`), Buffer.from(bytes));
  return key;
}

export async function loadFilled(key: string, config?: RuntimeConfig): Promise<Buffer | null> {
  const parsed = parseS3Uri(key);
  if (parsed && isS3Configured(config) && parsed.bucket === config.s3.bucket) {
    try {
      const result = await getClient(config.s3.region).send(
        new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key })
      );
      return streamToBuffer(result.Body);
    } catch (error) {
      if (!isMissingS3Object(error)) {
        throw error;
      }
      return null;
    }
  }

  if (isS3Configured(config)) {
    try {
      const s3Key = buildFilledPdfS3Key(config.s3, key);
      const result = await getClient(config.s3.region).send(
        new GetObjectCommand({ Bucket: config.s3.bucket, Key: s3Key })
      );
      return streamToBuffer(result.Body);
    } catch (error) {
      if (!isMissingS3Object(error)) {
        throw error;
      }
    }
  }

  const path = resolve(FILLED_DIR, `${key}.pdf`);
  return existsSync(path) ? readFile(path) : null;
}
