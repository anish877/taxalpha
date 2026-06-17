import { describe, expect, it } from 'vitest';

import {
  buildObjectKey,
  isAllowedContentType,
  isKeyWithinPrefix,
  isUploadsConfigured
} from '../src/lib/s3-uploads.js';
import type { S3UploadConfig } from '../src/types/deps.js';

const baseConfig: S3UploadConfig = {
  region: 'us-east-1',
  bucket: 'gpt-alpha-905418209881',
  uploadPrefix: 'investor-profile/government-id'
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
});
