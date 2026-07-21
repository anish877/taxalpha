import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';

const config = {
  nodeEnv: 'test' as const,
  frontendUrl: 'http://localhost:5173',
  jwtSecret: 'test_secret_test_secret_test_secret_1234',
  jwtExpiresIn: '7d',
  n8nWebhooks: {
    investorProfileUrl: null,
    investorProfileAdditionalHolderUrl: null,
    statementOfFinancialConditionUrl: null,
    baiodfUrl: null,
    baiv506cUrl: null,
    timeoutMs: 5000
  }
};

function createMockPrisma() {
  return {
    user: {
      findUnique: vi.fn(),
      create: vi.fn()
    }
  };
}

describe('auth routes', () => {
  it('does not expose public signup', async () => {
    const prisma = createMockPrisma();

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).post('/api/auth/signup').send({
      name: 'Ada Lovelace',
      email: 'ADA@Example.com',
      password: 'SuperSecure123'
    });

    expect(response.status).toBe(404);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects signin with wrong password', async () => {
    const prisma = createMockPrisma();
    const hash = await bcrypt.hash('CorrectPassword123', 12);

    prisma.user.findUnique.mockResolvedValue({
      id: 'user_1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      passwordHash: hash
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).post('/api/auth/signin').send({
      email: 'ada@example.com',
      password: 'WrongPassword'
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password.');
  });

  it('blocks unauthenticated /me requests', async () => {
    const prisma = createMockPrisma();
    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
  });
});
