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

export interface RuntimeConfig {
  nodeEnv: NodeEnvironment;
  frontendUrl: string;
  backendPublicUrl?: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  n8nWebhooks: N8nWebhookConfig;
}

export interface RouteDeps {
  prisma: PrismaClient;
  config: RuntimeConfig;
}
