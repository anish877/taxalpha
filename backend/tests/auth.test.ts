import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME } from '../src/lib/auth.js';

const config = {
  nodeEnv: 'test' as const,
  frontendUrl: 'http://localhost:5173',
  jwtSecret: 'test_secret_test_secret_test_secret_1234',
  jwtExpiresIn: '7d'
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
  it('creates user and self broker on signup', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user_1',
      name: 'Ada Lovelace',
      email: 'ada@example.com'
    });

    const app = createApp({
      prismaClient: prisma as unknown as PrismaClient,
      config
    });

    const response = await request(app).post('/api/auth/signup').send({
      name: 'Ada Lovelace',
      email: 'ADA@Example.com',
      password: 'SuperSecure123'
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({
      id: 'user_1',
      name: 'Ada Lovelace',
      email: 'ada@example.com'
    });

    const createArgs = prisma.user.create.mock.calls[0]?.[0];
    expect(createArgs?.data?.brokers?.create).toMatchObject({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      kind: 'SELF'
    });

    const cookies = response.get('set-cookie') ?? [];
    expect(cookies.some((cookie) => cookie.includes(`${AUTH_COOKIE_NAME}=`))).toBe(true);
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
