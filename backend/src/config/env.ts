import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

import type { RuntimeConfig } from '../types/deps.js';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters.'),
  JWT_EXPIRES_IN: z.string().default('7d')
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
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN
  };
}
