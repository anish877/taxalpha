import { describe, expect, it } from 'vitest';

import {
  buildObjectKey,
  isAllowedContentType,
  isKeyWithinPrefix,
  isUploadsConfigured
} from '../src/lib/s3-uploads.js';
import { buildFilledPdfS3Key, storeFilled } from '../src/lib/ingestion/template-store.js';
import { buildClientDocumentS3Key } from '../src/lib/s3-client-documents.js';
import type { RuntimeConfig, S3UploadConfig } from '../src/types/deps.js';

const baseConfig: S3UploadConfig = {
  region: 'us-east-1',
  bucket: 'gpt-alpha-905418209881',
  uploadPrefix: 'investor-profile/government-id',
  clientDocumentPrefix: 'client-documents',
  filledPdfPrefix: 'filled-pdfs'
};

describe('s3-uploads helpers', () => {
  it('accepts images and PDF, rejects everything else', () => {
    expect(isAllowedContentType('image/jpeg')).toBe(true);
    expect(isAllowedContentType('image/png')).toBe(true);
    expect(isAllowedContentType('application/pdf')).toBe(true);
    expect(isAllowedContentType('text/html')).toBe(false);
    expect(isAllowedContentType('application/x-msdownload')).toBe(false);
  });

  it('treats uploads as configured only when a bucket is set', () => {
    expect(isUploadsConfigured(baseConfig)).toBe(true);
    expect(isUploadsConfigured({ ...baseConfig, bucket: null })).toBe(false);
    expect(isUploadsConfigured(undefined)).toBe(false);
  });

  it('builds a namespaced, extension-correct, collision-resistant key', () => {
    const key = buildObjectKey({
      uploadPrefix: baseConfig.uploadPrefix,
      scope: 'step3.govId.photoId1',
      ownerId: 'user-123',
      contentType: 'application/pdf'
    });

    expect(key.startsWith('investor-profile/government-id/user-123/step3.govId.photoId1/')).toBe(true);
    expect(key.endsWith('.pdf')).toBe(true);

    const second = buildObjectKey({
      uploadPrefix: baseConfig.uploadPrefix,
      scope: 'step3.govId.photoId1',
      ownerId: 'user-123',
      contentType: 'application/pdf'
    });
    expect(second).not.toBe(key);
  });

  it('sanitizes unsafe characters out of the owner/scope segments', () => {
    const key = buildObjectKey({
      uploadPrefix: baseConfig.uploadPrefix,
      scope: '../weird scope!!',
      ownerId: 'a/b c',
      contentType: 'image/png'
    });

    expect(key).not.toContain('..');
    expect(key).not.toContain(' ');
    expect(key.endsWith('.png')).toBe(true);
  });

  it('guards view access to keys within the configured prefix', () => {
    expect(isKeyWithinPrefix(baseConfig, 'investor-profile/government-id/user-1/abc.pdf')).toBe(true);
    expect(isKeyWithinPrefix(baseConfig, 'some-other-prefix/secret.pdf')).toBe(false);
  });

  it('builds client document keys under the separate client document prefix', () => {
    const key = buildClientDocumentS3Key(baseConfig as S3UploadConfig & { bucket: string }, {
      clientId: 'client 123',
      uniqueFileName: 'uuid-Tax Letter.docx'
    });

    expect(key).toBe('client-documents/client-123/uuid-Tax-Letter.docx');
  });

  it('builds generated filled PDF keys under the filled PDF prefix', () => {
    expect(buildFilledPdfS3Key(baseConfig, 'pdf-fill-fill_123')).toBe('filled-pdfs/pdf-fill-fill_123.pdf');
    expect(buildFilledPdfS3Key({ ...baseConfig, filledPdfPrefix: '../generated pdfs' }, 'client/one__BAIODF')).toBe(
      'generated-pdfs/client-one__BAIODF.pdf'
    );
  });

  it('refuses local generated-PDF persistence in production', async () => {
    const runtimeConfig: RuntimeConfig = {
      nodeEnv: 'production',
      frontendUrl: 'https://app.example.com',
      jwtSecret: 'test_secret_test_secret_test_secret_1234',
      jwtExpiresIn: '7d',
      n8nWebhooks: {
        investorProfileUrl: null,
        investorProfileAdditionalHolderUrl: null,
        statementOfFinancialConditionUrl: null,
        baiodfUrl: null,
        baiv506cUrl: null,
        timeoutMs: 5000,
        callbackSecret: 'callback-secret'
      },
      s3: { ...baseConfig, bucket: null }
    };

    await expect(storeFilled('must-not-be-local', Buffer.from('%PDF-1.4'), runtimeConfig)).rejects.toThrow(
      'S3 storage is required in production'
    );
  });
});
