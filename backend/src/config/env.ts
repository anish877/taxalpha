import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

import type { RuntimeConfig } from '../types/deps.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  BACKEND_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters.'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  N8N_INVESTOR_PROFILE_WEBHOOK_URL: z
    .string()
    .url()
    .default('https://n8n.srv891599.hstgr.cloud/webhook/8077a68e-05f4-40ca-bb66-e20b73808cdb'),
  N8N_INVESTOR_PROFILE_ADDITIONAL_HOLDER_WEBHOOK_URL: z
    .string()
    .url()
    .default('https://n8n.srv891599.hstgr.cloud/webhook/137ba27b-814e-4430-812f-c61979d0c086'),
  N8N_STATEMENT_OF_FINANCIAL_CONDITION_WEBHOOK_URL: z
    .string()
    .url()
    .default('https://n8n.srv891599.hstgr.cloud/webhook/7b947ec6-e173-45f9-aee9-a1c8f44ceae6'),
  N8N_BAIODF_WEBHOOK_URL: z
    .string()
    .url()
    .default('https://n8n.srv891599.hstgr.cloud/webhook/b47bbb12-d35c-4329-9973-45aa0b851913'),
  N8N_BAIV_506C_WEBHOOK_URL: z
    .string()
    .url()
    .default('https://n8n.srv891599.hstgr.cloud/webhook/b47bbb12-d35c-4329-9973-45aa0b851913'),
  N8N_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  N8N_CALLBACK_SECRET: z.string().min(1, 'N8N_CALLBACK_SECRET is required.').default('taxalpha-local-callback-secret')
});

export type Environment = z.infer<typeof envSchema>;

let cachedEnv: Environment | null = null;
let envFilesLoaded = false;

function loadEnvironmentFiles(): void {
  if (envFilesLoaded) {
    return;
  }

  const candidatePaths = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), 'backend/.env'),
    resolve(process.cwd(), 'backend/.env.local')
  ];

  for (const filePath of candidatePaths) {
    if (existsSync(filePath)) {
      loadDotenv({ path: filePath, override: false });
    }
  }

  envFilesLoaded = true;
}

export function getEnv(): Environment {
  if (!cachedEnv) {
    loadEnvironmentFiles();

    try {
      cachedEnv = envSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const missingVariables = [
          ...new Set(
            error.issues.flatMap((issue) =>
              issue.code === 'invalid_type' &&
              'received' in issue &&
              issue.received === 'undefined'
                ? [issue.path.join('.')]
                : []
            )
          )
        ];

        if (missingVariables.length > 0) {
          throw new Error(
            `Missing required environment variables: ${missingVariables.join(
              ', '
            )}. Copy backend/.env.example to backend/.env and fill in values.`,
            { cause: error }
          );
        }
      }

      throw error;
    }
  }

  return cachedEnv;
}

export function getRuntimeConfig(env: Environment = getEnv()): RuntimeConfig {
  return {
    nodeEnv: env.NODE_ENV,
    frontendUrl: env.FRONTEND_URL,
    backendPublicUrl: env.BACKEND_PUBLIC_URL,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    n8nWebhooks: {
      investorProfileUrl: env.N8N_INVESTOR_PROFILE_WEBHOOK_URL,
      investorProfileAdditionalHolderUrl: env.N8N_INVESTOR_PROFILE_ADDITIONAL_HOLDER_WEBHOOK_URL,
      statementOfFinancialConditionUrl: env.N8N_STATEMENT_OF_FINANCIAL_CONDITION_WEBHOOK_URL,
      baiodfUrl: env.N8N_BAIODF_WEBHOOK_URL,
      baiv506cUrl: env.N8N_BAIV_506C_WEBHOOK_URL,
      timeoutMs: env.N8N_WEBHOOK_TIMEOUT_MS,
      callbackSecret: env.N8N_CALLBACK_SECRET
    }
  };
}
