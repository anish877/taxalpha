import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

import type { RuntimeConfig } from '../types/deps.js';

// n8n webhook endpoints are fixed per form on the shared n8n instance, so they
// are hardcoded here (not read from env) to guarantee each form's PDF is routed
// to the correct workflow regardless of host environment configuration.
const N8N_WEBHOOK_BASE = 'https://n8n.srv891599.hstgr.cloud/webhook';
const N8N_WEBHOOKS = {
  investorProfile: `${N8N_WEBHOOK_BASE}/8077a68e-05f4-40ca-bb66-e20b73808cdb`,
  investorProfileAdditionalHolder: `${N8N_WEBHOOK_BASE}/137ba27b-814e-4430-812f-c61979d0c086`,
  statementOfFinancialCondition: `${N8N_WEBHOOK_BASE}/7b947ec6-e173-45f9-aee9-a1c8f44ceae6`,
  baiodf: `${N8N_WEBHOOK_BASE}/cbe7fd24-f355-450d-86cb-5306101e8a82`,
  baiv506c: `${N8N_WEBHOOK_BASE}/b47bbb12-d35c-4329-9973-45aa0b851913`
} as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  BACKEND_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters.'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  N8N_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  N8N_CALLBACK_SECRET: z.string().min(1, 'N8N_CALLBACK_SECRET is required.').default('taxalpha-local-callback-secret'),
  // Document uploads (AWS S3). AWS credentials are read by the SDK's default
  // provider chain (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars or an IAM
  // role). Uploads stay disabled unless S3_BUCKET is set.
  AWS_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).optional(),
  S3_UPLOAD_PREFIX: z.string().default('investor-profile/government-id'),
  S3_CLIENT_DOCUMENT_PREFIX: z.string().default('client-documents'),
  // AI form-ingestion (OpenRouter, OpenAI-compatible). Ingestion stays disabled
  // unless OPENROUTER_API_KEY is set.
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().default('openai/gpt-5.5'),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_REASONING_EFFORT: z.enum(['low', 'medium', 'high']).default('high')
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
      investorProfileUrl: N8N_WEBHOOKS.investorProfile,
      investorProfileAdditionalHolderUrl: N8N_WEBHOOKS.investorProfileAdditionalHolder,
      statementOfFinancialConditionUrl: N8N_WEBHOOKS.statementOfFinancialCondition,
      baiodfUrl: N8N_WEBHOOKS.baiodf,
      baiv506cUrl: N8N_WEBHOOKS.baiv506c,
      timeoutMs: env.N8N_WEBHOOK_TIMEOUT_MS,
      callbackSecret: env.N8N_CALLBACK_SECRET
    },
    s3: {
      region: env.AWS_REGION,
      bucket: env.S3_BUCKET ?? null,
      uploadPrefix: env.S3_UPLOAD_PREFIX.replace(/^\/+|\/+$/g, ''),
      clientDocumentPrefix: env.S3_CLIENT_DOCUMENT_PREFIX.replace(/^\/+|\/+$/g, '')
    },
    openrouter: {
      apiKey: env.OPENROUTER_API_KEY ?? null,
      model: env.OPENROUTER_MODEL,
      baseUrl: env.OPENROUTER_BASE_URL,
      reasoningEffort: env.OPENROUTER_REASONING_EFFORT
    }
  };
}
