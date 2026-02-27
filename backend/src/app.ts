import type { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';

import { getRuntimeConfig } from './config/env.js';
import { HttpError } from './lib/http-error.js';
import { prisma } from './lib/prisma.js';
import { createAuthRouter } from './routes/auth.js';
import { createClientsRouter } from './routes/clients.js';
import { createFormsRouter } from './routes/forms.js';
import type { RuntimeConfig } from './types/deps.js';

interface CreateAppOptions {
  prismaClient?: PrismaClient;
  config?: RuntimeConfig;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const config = options.config ?? getRuntimeConfig();
  const prismaClient = options.prismaClient ?? prisma;

  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter({ prisma: prismaClient, config }));
  app.use('/api/forms', createFormsRouter({ prisma: prismaClient, config }));
  app.use('/api/clients', createClientsRouter({ prisma: prismaClient, config }));

  app.use('/api/*', (_request, response) => {
    response.status(404).json({ message: 'Endpoint not found.' });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.statusCode).json({
        message: error.message,
        fieldErrors: error.fieldErrors
      });
      return;
    }

    if (config.nodeEnv !== 'test') {
      console.error(error);
    }

    response.status(500).json({ message: 'Internal server error.' });
  };

  app.use(errorHandler);

  return app;
}
