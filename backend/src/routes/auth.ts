import bcrypt from 'bcryptjs';
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';

import { clearSessionCookie, createSessionToken, setSessionCookie } from '../lib/auth.js';
import { zodFieldErrors } from '../lib/validation.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const signinSchema = z.object({
  email: z.string().trim().email('Enter a valid email.'),
  password: z.string().min(1, 'Password is required.')
});

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function createAuthRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

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
          isAdmin: true,
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
          email: user.email,
          isAdmin: user.isAdmin
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
