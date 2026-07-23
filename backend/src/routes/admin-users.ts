import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { zodFieldErrors } from '../lib/validation.js';
import { requireAdmin, requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional()
);

const brokerSchema = z.object({
  representativeName: z.string().trim().min(1, 'Registered representative name is required.'),
  email: z.string().trim().email('Enter a valid broker email.'),
  firmName: z.string().trim().min(1, 'Broker-dealer firm name is required.'),
  brokerDealerCrdNumber: optionalText,
  representativeCrdNumber: optionalText,
  repCode: optionalText,
  branchAddressLine1: optionalText,
  branchAddressLine2: optionalText,
  branchCity: optionalText,
  branchState: optionalText,
  branchPostalCode: optionalText,
  branchPhone: optionalText
});

const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(8, 'Temporary password must be at least 8 characters.'),
  isAdmin: z.boolean().default(false)
});

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').optional(),
    email: z.string().trim().email('Enter a valid email.').optional(),
    password: z.string().min(8, 'Password must be at least 8 characters.').optional(),
    isAdmin: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one user field to update.');

const userParamsSchema = z.object({ userId: z.string().trim().min(1) });
const brokerParamsSchema = z.object({ brokerId: z.string().trim().min(1) });

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function brokerData(ownerUserId: string, value: z.infer<typeof brokerSchema>) {
  return {
    ownerUserId,
    name: value.representativeName,
    email: normalizeEmail(value.email),
    kind: 'EXTERNAL' as const,
    firmName: value.firmName,
    brokerDealerCrdNumber: value.brokerDealerCrdNumber ?? null,
    representativeCrdNumber: value.representativeCrdNumber ?? null,
    repCode: value.repCode ?? null,
    branchAddressLine1: value.branchAddressLine1 ?? null,
    branchAddressLine2: value.branchAddressLine2 ?? null,
    branchCity: value.branchCity ?? null,
    branchState: value.branchState ?? null,
    branchPostalCode: value.branchPostalCode ?? null,
    branchPhone: value.branchPhone ?? null
  };
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  isAdmin: true,
  createdAt: true,
  updatedAt: true
};

export function createAdminUsersRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();
  const auth = [requireAuth(deps), requireAdmin()];

  router.get('/users', ...auth, async (_request, response, next) => {
    try {
      const users = await deps.prisma.user.findMany({
        select: userSelect,
        orderBy: [{ name: 'asc' }, { email: 'asc' }]
      });
      response.json({ users });
    } catch (error) {
      next(error);
    }
  });

  router.post('/users', ...auth, async (request, response, next) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsed.error)
      });
      return;
    }

    try {
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const user = await deps.prisma.user.create({
        data: {
          name: parsed.data.name,
          email: normalizeEmail(parsed.data.email),
          passwordHash,
          isAdmin: parsed.data.isAdmin
        },
        select: userSelect
      });
      response.status(201).json({ user });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        response.status(409).json({
          message: 'A user with that email already exists.',
          fieldErrors: { email: 'Email is already in use.' }
        });
        return;
      }
      next(error);
    }
  });

  router.patch('/users/:userId', ...auth, async (request, response, next) => {
    const params = userParamsSchema.safeParse(request.params);
    const parsed = updateUserSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: parsed.success ? {} : zodFieldErrors(parsed.error)
      });
      return;
    }

    try {
      const passwordHash = parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : undefined;
      const user = await deps.prisma.user.update({
        where: { id: params.data.userId },
        data: {
          name: parsed.data.name,
          email: parsed.data.email ? normalizeEmail(parsed.data.email) : undefined,
          isAdmin: parsed.data.isAdmin,
          passwordHash
        },
        select: userSelect
      });
      response.json({ user });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        response.status(409).json({ message: 'That user email is already in use.', fieldErrors: { email: 'Email is already in use.' } });
        return;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        response.status(404).json({ message: 'User not found.' });
        return;
      }
      next(error);
    }
  });

  router.get('/brokers', ...auth, async (_request, response, next) => {
    try {
      const brokers = await deps.prisma.broker.findMany({
        orderBy: [{ name: 'asc' }, { email: 'asc' }]
      });
      response.json({ brokers });
    } catch (error) {
      next(error);
    }
  });

  router.post('/brokers', ...auth, async (request, response, next) => {
    const parsed = brokerSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsed.error)
      });
      return;
    }

    try {
      const broker = await deps.prisma.broker.create({
        data: brokerData(request.authUser!.id, parsed.data)
      });
      response.status(201).json({ broker });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        response.status(409).json({ message: 'A broker with that email already exists.', fieldErrors: { email: 'Broker email is already in use.' } });
        return;
      }
      next(error);
    }
  });

  router.patch('/brokers/:brokerId', ...auth, async (request, response, next) => {
    const params = brokerParamsSchema.safeParse(request.params);
    const parsed = brokerSchema.safeParse(request.body);
    if (!params.success || !parsed.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: parsed.success ? {} : zodFieldErrors(parsed.error)
      });
      return;
    }

    try {
      const current = await deps.prisma.broker.findUnique({ where: { id: params.data.brokerId }, select: { ownerUserId: true } });
      if (!current) {
        response.status(404).json({ message: 'Broker not found.' });
        return;
      }
      const { ownerUserId: _ownerUserId, ...data } = brokerData(current.ownerUserId, parsed.data);
      const broker = await deps.prisma.broker.update({ where: { id: params.data.brokerId }, data });
      response.json({ broker });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        response.status(409).json({ message: 'A broker with that email already exists.', fieldErrors: { email: 'Broker email is already in use.' } });
        return;
      }
      next(error);
    }
  });

  return router;
}
