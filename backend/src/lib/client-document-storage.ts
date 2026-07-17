import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  downloadClientDocumentFromS3,
  isClientDocumentsS3Configured
} from './s3-client-documents.js';
import type { S3UploadConfig } from '../types/deps.js';

const STORAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.local-storage/client-documents'
);

export function resolveClientDocumentStoragePath(storageKey: string): string {
  const resolved = path.resolve(STORAGE_ROOT, storageKey);
  const rootWithSeparator = `${STORAGE_ROOT}${path.sep}`;
  if (resolved !== STORAGE_ROOT && !resolved.startsWith(rootWithSeparator)) {
    throw new Error('Invalid document storage key.');
  }
  return resolved;
}

export async function loadClientDocumentBytes(
  document: { storageKey: string; storageProvider: string },
  s3Config: S3UploadConfig | undefined
): Promise<Buffer | null> {
  if (document.storageProvider === 'S3') {
    if (!isClientDocumentsS3Configured(s3Config)) return null;
    return downloadClientDocumentFromS3(s3Config, { key: document.storageKey });
  }

  try {
    return await fs.promises.readFile(resolveClientDocumentStoragePath(document.storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
