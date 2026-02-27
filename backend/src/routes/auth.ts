import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { clearSessionCookie, createSessionToken, setSessionCookie } from '../lib/auth.js';
import { zodFieldErrors } from '../lib/validation.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(8, 'Password must be at least 8 characters.')
});

const signinSchema = z.object({
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(1, 'Password is required.')
});

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function createAuthRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  router.post('/signup', async (request, response, next) => {
    const parsed = signupSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsed.error)
      });
      return;
    }

    const { name, password } = parsed.data;
    const email = normalizeEmail(parsed.data.email);

    try {
      const existingUser = await deps.prisma.user.findUnique({ where: { email } });

      if (existingUser) {
        response.status(409).json({
          message: 'An account with this email already exists.',
          fieldErrors: { email: 'Email is already in use.' }
        });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await deps.prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          brokers: {
            create: {
              name,
              email,
              kind: 'SELF'
            }
          }
        },
        select: {
          id: true,
          name: true,
          email: true
        }
      });

      const token = createSessionToken(user.id, deps.config.jwtSecret, deps.config.jwtExpiresIn);
      setSessionCookie(response, token, deps.config.nodeEnv === 'production');

      response.status(201).json({ user });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        response.status(409).json({
          message: 'An account with this email already exists.',
          fieldErrors: { email: 'Email is already in use.' }
        });
        return;
      }

      next(error);
    }
  });

  router.post('/signin', async (request, response, next) => {
    const parsed = signinSchema.safeParse(request.body);

    if (!parsed.success) {
      response.status(400).json({
        message: 'Please correct the highlighted fields.',
        fieldErrors: zodFieldErrors(parsed.error)
      });
      return;
    }

    const email = normalizeEmail(parsed.data.email);

    try {
      const user = await deps.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true
        }
      });

      if (!user) {
        response.status(401).json({
          message: 'Invalid email or password.',
          fieldErrors: { email: 'Invalid email or password.' }
        });
        return;
      }

      const passwordValid = await bcrypt.compare(parsed.data.password, user.passwordHash);

      if (!passwordValid) {
        response.status(401).json({
          message: 'Invalid email or password.',
          fieldErrors: { email: 'Invalid email or password.' }
        });
        return;
      }

      const token = createSessionToken(user.id, deps.config.jwtSecret, deps.config.jwtExpiresIn);
      setSessionCookie(response, token, deps.config.nodeEnv === 'production');

      response.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/signout', (request, response) => {
    clearSessionCookie(response, deps.config.nodeEnv === 'production');
    response.json({ message: 'Signed out successfully.' });
  });

  router.get('/me', requireAuth(deps), (request, response) => {
    response.json({ user: request.authUser });
  });

  return router;
}
