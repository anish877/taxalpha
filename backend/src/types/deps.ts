import type { PrismaClient } from '@prisma/client';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface RuntimeConfig {
  nodeEnv: NodeEnvironment;
  frontendUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
}

export interface RouteDeps {
  prisma: PrismaClient;
  config: RuntimeConfig;
}
