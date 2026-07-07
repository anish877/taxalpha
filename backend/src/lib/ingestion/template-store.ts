import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { RuntimeConfig } from '../../types/deps.js';

/**
 * Persist the uploaded source PDF so a completed submission can be filled later.
 * Uses S3 when configured, otherwise a local directory for dev. The returned
 * string is stored as FormCatalog.templateUrl and understood by `loadTemplate`.
 */
const LOCAL_DIR = resolve(process.cwd(), '.local-storage', 'form-templates');

export async function storeTemplate(
  id: string,
  bytes: Uint8Array,
  config: RuntimeConfig
): Promise<string> {
  if (config.s3?.bucket) {
    const key = `form-templates/${id}.pdf`;
    const client = new S3Client({ region: config.s3.region });
    await client.send(
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
    const withoutScheme = templateUrl.slice('s3://'.length);
    const slash = withoutScheme.indexOf('/');
    const bucket = slash >= 0 ? withoutScheme.slice(0, slash) : withoutScheme;
    const key = slash >= 0 ? withoutScheme.slice(slash + 1) : '';
    if (!key || bucket !== config.s3.bucket) return null;
    const client = new S3Client({ region: config.s3.region });
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return streamToBuffer(result.Body);
  }
  return null;
}

const FILLED_DIR = resolve(process.cwd(), '.local-storage', 'filled');

/** Store a completed (filled) PDF; returns a key for `loadFilled`. */
export async function storeFilled(key: string, bytes: Uint8Array): Promise<string> {
  await mkdir(FILLED_DIR, { recursive: true });
  await writeFile(resolve(FILLED_DIR, `${key}.pdf`), Buffer.from(bytes));
  return key;
}

export async function loadFilled(key: string): Promise<Buffer | null> {
  const path = resolve(FILLED_DIR, `${key}.pdf`);
  return existsSync(path) ? readFile(path) : null;
}
