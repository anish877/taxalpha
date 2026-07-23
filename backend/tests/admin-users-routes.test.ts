import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME, createSessionToken } from '../src/lib/auth.js';

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

function cookie(userId = 'admin_1') {
  return `${AUTH_COOKIE_NAME}=${createSessionToken(userId, config.jwtSecret, config.jwtExpiresIn)}`;
}

describe('admin user and broker routes', () => {
  it('blocks non-admin users', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user_1', name: 'User', email: 'user@example.com', isAdmin: false
        })
      }
    };
    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app).get('/api/admin/users').set('Cookie', cookie('user_1'));
    expect(response.status).toBe(403);
  });

  it('creates a provisioned platform user without coupling a broker', async () => {
    const createdUser = {
      id: 'user_2',
      name: 'Advisor Two',
      email: 'advisor.two@example.com',
      isAdmin: false,
      createdAt: new Date('2026-07-21T00:00:00Z'),
      updatedAt: new Date('2026-07-21T00:00:00Z')
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'admin_1', name: 'Admin', email: 'admin@example.com', isAdmin: true }),
        create: vi.fn().mockResolvedValue(createdUser)
      }
    };
    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .post('/api/admin/users')
      .set('Cookie', cookie())
      .send({
        name: 'Advisor Two',
        email: 'ADVISOR.TWO@example.com',
        password: 'TemporaryPassword123'
      });

    expect(response.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Advisor Two',
        email: 'advisor.two@example.com',
        isAdmin: false,
        passwordHash: expect.any(String)
      }),
      select: expect.any(Object)
    });
  });

  it('creates an independent broker in the global directory', async () => {
    const broker = {
      id: 'broker_2', ownerUserId: 'admin_1', name: 'Jordan Broker', email: 'jordan@example.com',
      firmName: 'Northstar Broker-Dealer', representativeCrdNumber: 'RR-200', repCode: 'JBR-42'
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'admin_1', name: 'Admin', email: 'admin@example.com', isAdmin: true })
      },
      broker: { create: vi.fn().mockResolvedValue(broker) }
    };
    const app = createApp({ prismaClient: prisma as unknown as PrismaClient, config });
    const response = await request(app)
      .post('/api/admin/brokers')
      .set('Cookie', cookie())
      .send({
        representativeName: 'Jordan Broker',
        email: 'jordan@example.com',
        firmName: 'Northstar Broker-Dealer',
        representativeCrdNumber: 'RR-200',
        repCode: 'JBR-42'
      });

    expect(response.status).toBe(201);
    expect(response.body.broker.id).toBe('broker_2');
    expect(prisma.broker.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: 'admin_1',
        name: 'Jordan Broker',
        firmName: 'Northstar Broker-Dealer',
        repCode: 'JBR-42'
      })
    });
  });
});
