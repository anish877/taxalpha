import type { NextFunction, Request, Response } from 'express';

import { AUTH_COOKIE_NAME, verifySessionToken } from '../lib/auth.js';
import type { RouteDeps } from '../types/deps.js';

export function requireAuth({ prisma, config }: RouteDeps) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const token = request.cookies?.[AUTH_COOKIE_NAME];

      if (!token || typeof token !== 'string') {
        response.status(401).json({ message: 'Authentication required.' });
        return;
      }

      const payload = verifySessionToken(token, config.jwtSecret);

      if (!payload) {
        response.status(401).json({ message: 'Session expired. Please sign in again.' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          name: true,
          email: true,
          isAdmin: true
        }
      });

      if (!user) {
        response.status(401).json({ message: 'User not found for this session.' });
        return;
      }

      request.authUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Gate a route to admins. Must run AFTER `requireAuth`, which populates
 * `request.authUser` (including `isAdmin`).
 */
export function requireAdmin() {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.authUser?.isAdmin) {
      response.status(403).json({ message: 'Admin access required.' });
      return;
    }
    next();
  };
}
