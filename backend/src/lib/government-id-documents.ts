import type { Prisma, PrismaClient } from '@prisma/client';

export interface GovernmentIdDocumentReference {
  documentKey: string | null;
  documentFileName: string | null;
}

function toRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function documentReference(value: unknown): GovernmentIdDocumentReference {
  const record = toRecord(value as Prisma.JsonValue);
  return {
    documentKey: typeof record.documentKey === 'string' && record.documentKey.trim() ? record.documentKey : null,
    documentFileName:
      typeof record.documentFileName === 'string' && record.documentFileName.trim()
        ? record.documentFileName
        : null
  };
}

export function getGovernmentIdDocumentReferences(
  ...stepData: Array<Prisma.JsonValue | null | undefined>
): GovernmentIdDocumentReference[] {
  return stepData.flatMap((data) => {
    const root = toRecord(data);
    const governmentIdentification = toRecord(root.governmentIdentification as Prisma.JsonValue);
    return [
      documentReference(governmentIdentification.photoId1),
      documentReference(governmentIdentification.photoId2)
    ];
  });
}

function governmentIdContentType(fileName: string, storageKey: string): string {
  const value = `${fileName} ${storageKey}`.toLowerCase();
  if (value.includes('.pdf')) return 'application/pdf';
  if (value.includes('.png')) return 'image/png';
  if (value.includes('.webp')) return 'image/webp';
  if (value.includes('.heic')) return 'image/heic';
  return 'image/jpeg';
}

export async function syncGovernmentIdDocuments(
  prisma: PrismaClient,
  input: {
    clientId: string;
    uploadedByUserId: string;
    previous?: GovernmentIdDocumentReference[];
    next: GovernmentIdDocumentReference[];
  }
): Promise<void> {
  const nextDocuments = input.next.filter(
    (document): document is { documentKey: string; documentFileName: string | null } =>
      document.documentKey !== null
  );
  const nextKeys = new Set(nextDocuments.map((document) => document.documentKey));
  const removedKeys = (input.previous ?? [])
    .map((document) => document.documentKey)
    .filter((key): key is string => key !== null && !nextKeys.has(key));

  if (removedKeys.length > 0) {
    await prisma.clientDocument.deleteMany({
      where: { clientId: input.clientId, storageKey: { in: removedKeys } }
    });
  }

  for (const document of nextDocuments) {
    const fileName = document.documentFileName?.trim() || 'Government ID';
    await prisma.clientDocument.upsert({
      where: { storageKey: document.documentKey },
      update: {
        clientId: input.clientId,
        uploadedByUserId: input.uploadedByUserId,
        fileName,
        contentType: governmentIdContentType(fileName, document.documentKey),
        storageProvider: 'S3'
      },
      create: {
        clientId: input.clientId,
        uploadedByUserId: input.uploadedByUserId,
        fileName,
        contentType: governmentIdContentType(fileName, document.documentKey),
        sizeBytes: 0,
        storageKey: document.documentKey,
        storageProvider: 'S3'
      }
    });
  }
}
