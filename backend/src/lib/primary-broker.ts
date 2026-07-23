import type { PrismaClient } from '@prisma/client';

export interface PrimaryBrokerIdentity {
  name: string;
  repCode: string | null;
}

export async function getPrimaryBrokerIdentity(
  prisma: PrismaClient,
  clientId: string
): Promise<PrimaryBrokerIdentity | null> {
  const link = await prisma.clientBroker.findFirst({
    where: { clientId, role: 'PRIMARY' },
    orderBy: { position: 'asc' },
    select: {
      broker: {
        select: {
          name: true,
          repCode: true
        }
      }
    }
  });

  return link?.broker ?? null;
}
