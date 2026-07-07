import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

import type { CloudinaryConfig } from '../types/deps.js';

type ConfiguredCloudinary = CloudinaryConfig & {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

let configuredKey: string | null = null;

export function isCloudinaryConfigured(config: CloudinaryConfig | undefined): config is ConfiguredCloudinary {
  return Boolean(config?.cloudName && config.apiKey && config.apiSecret);
}

function configureCloudinary(config: ConfiguredCloudinary): void {
  const nextKey = `${config.cloudName}:${config.apiKey}`;
  if (configuredKey === nextKey) return;

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true
  });
  configuredKey = nextKey;
}

export function cloudinaryPublicId(config: ConfiguredCloudinary, clientId: string, uniqueFileName: string): string {
  const folder = config.folder.replace(/^\/+|\/+$/g, '') || 'taxalpha/client-documents';
  return `${folder}/${clientId}/${uniqueFileName}`;
}

export async function uploadRawDocumentToCloudinary(
  config: ConfiguredCloudinary,
  input: {
    buffer: Buffer;
    publicId: string;
  }
): Promise<{
  publicId: string;
  resourceType: string;
  deliveryType: string;
  bytes: number;
}> {
  configureCloudinary(config);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        type: 'authenticated',
        public_id: input.publicId,
        overwrite: false
      },
      (error, result?: UploadApiResponse) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed.'));
          return;
        }

        resolve({
          publicId: result.public_id,
          resourceType: result.resource_type,
          deliveryType: result.type,
          bytes: result.bytes
        });
      }
    );

    stream.end(input.buffer);
  });
}

export async function deleteRawDocumentFromCloudinary(
  config: ConfiguredCloudinary,
  input: {
    publicId: string;
    resourceType: string;
    deliveryType: string;
  }
): Promise<void> {
  configureCloudinary(config);
  await cloudinary.uploader.destroy(input.publicId, {
    resource_type: input.resourceType,
    type: input.deliveryType
  });
}

export function signedRawDocumentUrl(
  config: ConfiguredCloudinary,
  input: {
    publicId: string;
    resourceType: string;
    deliveryType: string;
  }
): string {
  configureCloudinary(config);
  return cloudinary.url(input.publicId, {
    resource_type: input.resourceType,
    type: input.deliveryType,
    sign_url: true,
    secure: true
  });
}
