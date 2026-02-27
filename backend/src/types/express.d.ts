import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      authUser?: Pick<User, 'id' | 'name' | 'email'>;
    }
  }
}

export {};
