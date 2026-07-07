import type { Prisma } from '@prisma/client';

export function clientAccessWhere(userId: string): Prisma.ClientWhereInput {
  return {
    OR: [
      { ownerUserId: userId },
      {
        brokerLinks: {
          some: {
            broker: {
              ownerUserId: userId
            }
          }
        }
      }
    ]
  };
}

export function clientAccessRelationWhere(userId: string): Prisma.ClientWhereInput {
  return clientAccessWhere(userId);
}
