import type { PrismaClient } from '@prisma/client';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface N8nWebhookConfig {
  investorProfileUrl: string | null;
  investorProfileAdditionalHolderUrl: string | null;
  statementOfFinancialConditionUrl: string | null;
  baiodfUrl: string | null;
  baiv506cUrl: string | null;
  timeoutMs: number;
  callbackSecret?: string | null;
}

export interface S3UploadConfig {
  region: string;
  /** Target bucket. When null, document uploads are disabled. */
  bucket: string | null;
  /** Key prefix (folder) under which uploaded documents are stored. */
  uploadPrefix: string;
}

export interface RuntimeConfig {
  nodeEnv: NodeEnvironment;
  frontendUrl: string;
  backendPublicUrl?: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  n8nWebhooks: N8nWebhookConfig;
  /** Present when the app is configured; absent disables document uploads. */
  s3?: S3UploadConfig;
}

export interface RouteDeps {
  prisma: PrismaClient;
  config: RuntimeConfig;
}
