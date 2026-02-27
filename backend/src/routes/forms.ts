import { Router, type Router as ExpressRouter } from 'express';

import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

export function createFormsRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  router.get('/', requireAuth(deps), async (request, response, next) => {
    try {
      const forms = await deps.prisma.formCatalog.findMany({
        where: { active: true },
        select: {
          id: true,
          code: true,
          title: true
        },
        orderBy: {
          title: 'asc'
        }
      });

      response.json({ forms });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
