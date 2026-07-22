import { Router, type Router as ExpressRouter } from 'express';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';

import { clientAccessWhere } from '../lib/client-access.js';
import { loadClientDocumentBytes } from '../lib/client-document-storage.js';
import { loadClientFormPdfBytes } from '../lib/client-form-pdf-storage.js';
import { getWorkspaceFormTitle } from '../lib/form-pdf-utils.js';
import {
  getGovernmentIdDocumentReferences,
  syncGovernmentIdDocuments
} from '../lib/government-id-documents.js';
import { HttpError } from '../lib/http-error.js';
import { requireAuth } from '../middleware/require-auth.js';
import type { RouteDeps } from '../types/deps.js';

const DIRECT_PDF_WORKSPACE_CODE = 'PDF_UPLOAD';
const MAX_TICKET_PDFS = 25;
const MAX_TICKET_SOURCE_BYTES = 90 * 1024 * 1024;

const ticketOrderItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pdf'), id: z.string().trim().min(1) }),
  z.object({ kind: z.literal('investment'), id: z.string().trim().min(1) }),
  z.object({ kind: z.literal('investment-baiodf'), id: z.string().trim().min(1) }),
  z.object({ kind: z.literal('investment-agreement'), id: z.string().trim().min(1) }),
  z.object({ kind: z.literal('document'), id: z.string().trim().min(1) })
]);

const createTicketBodySchema = z.object({
  pdfIds: z.array(z.string().trim().min(1)).max(MAX_TICKET_PDFS).default([]),
  investmentIds: z.array(z.string().trim().min(1)).max(10).default([]),
  otherPdfIds: z.array(z.string().trim().min(1)).max(MAX_TICKET_PDFS).default([]),
  documentIds: z.array(z.string().trim().min(1)).max(MAX_TICKET_PDFS).default([]),
  items: z.array(ticketOrderItemSchema).max(MAX_TICKET_PDFS).default([])
}).refine((value) => value.pdfIds.length + value.investmentIds.length + value.otherPdfIds.length + value.documentIds.length + value.items.length > 0, {
  message: 'Select at least one PDF or investment pair.'
});

interface TicketPdf {
  id: string;
  clientId: string;
  investmentId?: string | null;
  formCode: string;
  workspaceFormCode: string;
  pdfUrl: string;
  documentTitle: string | null;
  fileName: string | null;
  sourceRunId: string | null;
  generatedAt: Date | null;
  receivedAt: Date;
  client: {
    name: string;
  };
  rawDocument?: {
    storageKey: string;
    storageProvider: string;
    contentType: string;
    fileName: string;
  };
}

function safeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._ -]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 120) || 'client'
  );
}

function displayTitle(pdf: TicketPdf): string {
  return pdf.documentTitle || pdf.fileName || `${pdf.workspaceFormCode}.pdf`;
}

function isPackageEligibleClientDocument(document: { fileName: string; contentType: string }): boolean {
  const contentType = document.contentType.toLowerCase();
  const fileName = document.fileName.toLowerCase();
  return (
    contentType === 'application/pdf' ||
    contentType === 'image/jpeg' ||
    contentType === 'image/png' ||
    fileName.endsWith('.pdf') ||
    fileName.endsWith('.jpg') ||
    fileName.endsWith('.jpeg') ||
    fileName.endsWith('.png')
  );
}

async function imageDocumentToPdf(
  bytes: Buffer,
  document: { contentType: string; fileName: string },
  title: string
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const imageType = `${document.contentType} ${document.fileName}`.toLowerCase();

  try {
    const image = imageType.includes('png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 24;
    const scale = Math.min(
      (pageWidth - margin * 2) / image.width,
      (pageHeight - margin * 2) / image.height,
      1
    );
    const width = image.width * scale;
    const height = image.height * scale;
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawImage(image, {
      x: (pageWidth - width) / 2,
      y: (pageHeight - height) / 2,
      width,
      height
    });
    return Buffer.from(await pdf.save());
  } catch {
    throw new HttpError(422, `${title} is not a readable JPG or PNG image.`);
  }
}

function toTicketPdfRecord(pdf: TicketPdf) {
  return {
    id: pdf.id,
    clientId: pdf.clientId,
    clientName: pdf.client.name,
    formCode: pdf.formCode,
    workspaceFormCode: pdf.workspaceFormCode,
    workspaceFormTitle:
      pdf.workspaceFormCode === DIRECT_PDF_WORKSPACE_CODE ? 'Direct PDF Fill' : getWorkspaceFormTitle(pdf.formCode),
    pdfUrl: pdf.pdfUrl,
    viewUrl: `/api/clients/${encodeURIComponent(pdf.clientId)}/form-pdfs/${encodeURIComponent(pdf.id)}/file.pdf`,
    documentTitle: pdf.documentTitle,
    fileName: pdf.fileName,
    sourceRunId: pdf.sourceRunId,
    generatedAt: pdf.generatedAt?.toISOString() ?? null,
    receivedAt: pdf.receivedAt.toISOString()
  };
}

async function loadTicketPdfBytes(deps: RouteDeps, pdf: TicketPdf): Promise<Buffer> {
  if (pdf.rawDocument) {
    const bytes = await loadClientDocumentBytes(pdf.rawDocument, deps.config.s3);
    if (!bytes) throw new HttpError(404, `${displayTitle(pdf)} is not available.`);
    if (pdf.rawDocument.contentType.toLowerCase() !== 'application/pdf' && !pdf.rawDocument.fileName.toLowerCase().endsWith('.pdf')) {
      return imageDocumentToPdf(bytes, pdf.rawDocument, displayTitle(pdf));
    }
    if (!bytes.subarray(0, 5).toString('utf8').startsWith('%PDF')) {
      throw new HttpError(422, `${displayTitle(pdf)} is not a readable PDF.`);
    }
    return bytes;
  }
  return loadClientFormPdfBytes(pdf, deps.config);
}

async function mergeTicketPdfs(items: Array<{ pdf: TicketPdf; bytes: Buffer }>): Promise<Buffer> {
  const merged = await PDFDocument.create();

  for (const item of items) {
    let source: PDFDocument;
    try {
      source = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
    } catch {
      throw new HttpError(422, `${displayTitle(item.pdf)} could not be merged.`);
    }

    const copiedPages = await merged.copyPages(source, source.getPageIndices());
    for (const page of copiedPages) {
      merged.addPage(page);
    }
  }

  if (merged.getPageCount() === 0) {
    throw new HttpError(422, 'Selected PDFs did not contain any pages.');
  }

  return Buffer.from(await merged.save());
}

export function createClientPdfTicketsRouter(deps: RouteDeps): ExpressRouter {
  const router = Router();

  async function ownedClient(clientId: string, ownerUserId: string) {
    const client = await deps.prisma.client.findFirst({
      where: { id: clientId, ...clientAccessWhere(ownerUserId) },
      select: {
        id: true,
        name: true,
        investorProfileOnboarding: { select: { step3Data: true, step4Data: true } }
      }
    });
    if (!client) throw new HttpError(404, 'Client not found.');
    const governmentIdReferences = getGovernmentIdDocumentReferences(
      client.investorProfileOnboarding?.step3Data,
      client.investorProfileOnboarding?.step4Data
    );
    await syncGovernmentIdDocuments(deps.prisma, {
      clientId,
      uploadedByUserId: ownerUserId,
      next: governmentIdReferences
    });
    return {
      ...client,
      intakeDocumentKeys: new Set(
        governmentIdReferences
          .map((document) => document.documentKey)
          .filter((key): key is string => Boolean(key))
      )
    };
  }

  router.get('/:clientId/pdf-ticket/pdfs', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const client = await ownedClient(clientId, request.authUser!.id);

      const [pdfs, investments, documents] = await Promise.all([
        deps.prisma.clientFormPdf.findMany({
        where: { clientId, investmentId: null },
        include: {
          client: {
            select: {
              name: true
            }
          }
        },
        orderBy: [{ generatedAt: 'desc' }, { receivedAt: 'desc' }]
        }),
        deps.prisma.clientInvestment.findMany({
          where: { clientId },
          orderBy: { position: 'asc' },
          include: {
            baiodfOnboarding: { select: { status: true } },
            agreementPdfFill: { select: { id: true, status: true, fileName: true, generatedPdfUrl: true } },
            formPdfs: {
              where: { formCode: { in: ['BAIODF', 'PDF_UPLOAD'] } },
              orderBy: [{ generatedAt: 'desc' }, { receivedAt: 'desc' }]
            }
          }
        }),
        deps.prisma.clientDocument.findMany({
          where: {
            clientId,
            OR: [
              { contentType: 'application/pdf' },
              { contentType: 'image/jpeg' },
              { contentType: 'image/png' },
              { fileName: { endsWith: '.pdf', mode: 'insensitive' } },
              { fileName: { endsWith: '.jpg', mode: 'insensitive' } },
              { fileName: { endsWith: '.jpeg', mode: 'insensitive' } },
              { fileName: { endsWith: '.png', mode: 'insensitive' } }
            ]
          },
          include: { uploadedBy: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      response.json({
        clientId,
        pdfs: pdfs.map((pdf) => toTicketPdfRecord(pdf)),
        documents: documents.map((document) => ({
          id: document.id,
          clientId: document.clientId,
          fileName: document.fileName,
          contentType: document.contentType,
          sizeBytes: document.sizeBytes,
          uploadedByName: document.uploadedBy.name,
          source: client.intakeDocumentKeys.has(document.storageKey) ? 'INTAKE_FORM' : 'DOCUMENT_DRAWER',
          createdAt: document.createdAt.toISOString(),
          viewUrl: `/api/clients/${clientId}/documents/${document.id}/view`
        })),
        investmentPairs: investments.map((investment) => {
          const baiodfPdf = investment.formPdfs.find((pdf) => pdf.formCode === 'BAIODF') ?? null;
          const agreementPdf = investment.agreementPdfFill
            ? investment.formPdfs.find(
                (pdf) => pdf.formCode === 'PDF_UPLOAD' && pdf.sourceRunId === investment.agreementPdfFill?.id
              ) ?? null
            : null;
          return {
            investmentId: investment.id,
            name: investment.name,
            position: investment.position,
            baiodfPdf: baiodfPdf
              ? toTicketPdfRecord({ ...baiodfPdf, client: { name: client.name } })
              : null,
            agreement: investment.agreementPdfFill,
            agreementPdf: agreementPdf
              ? toTicketPdfRecord({ ...agreementPdf, client: { name: client.name } })
              : null,
            ready: Boolean(baiodfPdf && agreementPdf)
          };
        })
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/pdf-ticket', requireAuth(deps), async (request, response, next) => {
    try {
      const clientId = String(request.params.clientId);
      const client = await ownedClient(clientId, request.authUser!.id);
      const parsed = createTicketBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpError(400, 'Select at least one generated PDF.');
      }

      const requestedOrder = parsed.data.items;
      const requestedKeys = requestedOrder.map((item) => `${item.kind}:${item.id}`);
      if (new Set(requestedKeys).size !== requestedKeys.length) {
        throw new HttpError(400, 'A ticket document cannot be added more than once.');
      }
      const otherPdfIds = [...new Set(
        requestedOrder.length > 0
          ? requestedOrder.filter((item) => item.kind === 'pdf').map((item) => item.id)
          : parsed.data.otherPdfIds.length > 0 ? parsed.data.otherPdfIds : parsed.data.pdfIds
      )];
      const legacyInvestmentIds = [...new Set(
        requestedOrder.length > 0
          ? requestedOrder.filter((item) => item.kind === 'investment').map((item) => item.id)
          : parsed.data.investmentIds
      )];
      const baiodfInvestmentIds = [...new Set(
        requestedOrder.filter((item) => item.kind === 'investment-baiodf').map((item) => item.id)
      )];
      const agreementInvestmentIds = [...new Set(
        requestedOrder.filter((item) => item.kind === 'investment-agreement').map((item) => item.id)
      )];
      const investmentIds = [...new Set([
        ...legacyInvestmentIds,
        ...baiodfInvestmentIds,
        ...agreementInvestmentIds
      ])];
      const documentIds = [...new Set(
        requestedOrder.length > 0
          ? requestedOrder.filter((item) => item.kind === 'document').map((item) => item.id)
          : parsed.data.documentIds
      )];
      if (investmentIds.length > 10) {
        throw new HttpError(400, 'A ticket can contain documents from at most 10 investments.');
      }
      const pdfs = await deps.prisma.clientFormPdf.findMany({
        where: {
          clientId,
          investmentId: null,
          id: {
            in: otherPdfIds
          }
        },
        include: {
          client: {
            select: {
              name: true
            }
          }
        }
      });

      if (pdfs.length !== otherPdfIds.length) {
        throw new HttpError(404, 'One or more selected PDFs are unavailable.');
      }

      const documentRecords = documentIds.length > 0
        ? await deps.prisma.clientDocument.findMany({
            where: { clientId, id: { in: documentIds } }
          })
        : [];
      if (documentRecords.length !== documentIds.length) {
        throw new HttpError(404, 'One or more selected uploaded documents are unavailable.');
      }
      if (documentRecords.some((document) => !isPackageEligibleClientDocument(document))) {
        throw new HttpError(422, 'Only uploaded PDF, JPG, or PNG documents can be added to a ticket.');
      }
      const documentById = new Map(documentRecords.map((document) => [document.id, document]));
      const uploadedPdfs: TicketPdf[] = documentIds.map((documentId) => {
        const document = documentById.get(documentId)!;
        return {
          id: document.id,
          clientId,
          formCode: 'CLIENT_DOCUMENT',
          workspaceFormCode: 'CLIENT_DOCUMENT',
          pdfUrl: '',
          documentTitle: document.fileName,
          fileName: document.fileName,
          sourceRunId: null,
          generatedAt: null,
          receivedAt: document.createdAt,
          client: { name: client.name },
          rawDocument: {
            storageKey: document.storageKey,
            storageProvider: document.storageProvider,
            contentType: document.contentType,
            fileName: document.fileName
          }
        };
      });

      const investmentRecords = investmentIds.length > 0
        ? await deps.prisma.clientInvestment.findMany({
            where: { clientId, id: { in: investmentIds } },
            include: {
              agreementPdfFill: true,
              formPdfs: {
                where: { formCode: { in: ['BAIODF', 'PDF_UPLOAD'] } },
                orderBy: [{ generatedAt: 'desc' }, { receivedAt: 'desc' }]
              }
            }
          })
        : [];
      if (investmentRecords.length !== investmentIds.length) {
        throw new HttpError(404, 'One or more selected investments are unavailable.');
      }
      const investmentById = new Map(investmentRecords.map((investment) => [investment.id, investment]));
      const investments = investmentIds
        .map((investmentId) => investmentById.get(investmentId))
        .filter((investment): investment is (typeof investmentRecords)[number] => Boolean(investment));

      const baiodfPdfByInvestmentId = new Map<string, TicketPdf>();
      const agreementPdfByInvestmentId = new Map<string, TicketPdf>();
      for (const investment of investments) {
        const baiodfPdf = investment.formPdfs.find((pdf) => pdf.formCode === 'BAIODF');
        const agreement = investment.agreementPdfFill;
        const embeddedAgreementPdf = agreement
          ? investment.formPdfs.find(
              (pdf) => pdf.formCode === 'PDF_UPLOAD' && pdf.sourceRunId === agreement.id
            )
          : null;
        const agreementPdf = embeddedAgreementPdf ?? (agreement
          ? await deps.prisma.clientFormPdf.findFirst({
              where: { clientId, investmentId: investment.id, sourceRunId: agreement.id },
              include: { client: { select: { name: true } } },
              orderBy: [{ generatedAt: 'desc' }, { receivedAt: 'desc' }]
            })
          : null);

        if (baiodfPdf) {
          baiodfPdfByInvestmentId.set(investment.id, { ...baiodfPdf, client: { name: client.name } });
        }
        if (agreementPdf) {
          agreementPdfByInvestmentId.set(investment.id, { ...agreementPdf, client: { name: client.name } });
        }

        const needsBaiodf = legacyInvestmentIds.includes(investment.id) || baiodfInvestmentIds.includes(investment.id);
        const needsAgreement = legacyInvestmentIds.includes(investment.id) || agreementInvestmentIds.includes(investment.id);
        if (needsBaiodf && !baiodfPdf) {
          throw new HttpError(409, `${investment.name} brokerage alternative disclosure PDF is unavailable.`);
        }
        if (needsAgreement && !agreementPdf) {
          throw new HttpError(409, `${investment.name} subscription agreement PDF is unavailable.`);
        }
      }
      const pairPdfs = legacyInvestmentIds.flatMap((investmentId) => [
        baiodfPdfByInvestmentId.get(investmentId),
        agreementPdfByInvestmentId.get(investmentId)
      ].filter((pdf): pdf is TicketPdf => Boolean(pdf)));
      const selectedInvestmentPdfs = [
        ...baiodfInvestmentIds.map((id) => baiodfPdfByInvestmentId.get(id)),
        ...agreementInvestmentIds.map((id) => agreementPdfByInvestmentId.get(id))
      ].filter((pdf): pdf is TicketPdf => Boolean(pdf));

      if (pdfs.length + pairPdfs.length + selectedInvestmentPdfs.length + uploadedPdfs.length > MAX_TICKET_PDFS) {
        throw new HttpError(400, `A ticket can contain at most ${MAX_TICKET_PDFS} PDFs.`);
      }

      const byId = new Map<string, TicketPdf>(pdfs.map((pdf) => [pdf.id, pdf]));
      const selectedOtherPdfs: TicketPdf[] = [];
      for (const pdfId of otherPdfIds) {
        const pdf = byId.get(pdfId);
        if (pdf) {
          selectedOtherPdfs.push(pdf);
        }
      }
      const earlyCodes = new Set(['INVESTOR_PROFILE', 'INVESTOR_PROFILE_ADDITIONAL_HOLDER', 'SFC']);
      const lateCodes = new Set(['BAIV_506C']);
      const earlyRank = new Map([
        ['INVESTOR_PROFILE', 0],
        ['INVESTOR_PROFILE_ADDITIONAL_HOLDER', 1],
        ['SFC', 2]
      ]);
      const uploadedPdfById = new Map(uploadedPdfs.map((pdf) => [pdf.id, pdf]));
      const orderedPdfs: TicketPdf[] = requestedOrder.length > 0
        ? requestedOrder.flatMap((item) => {
            if (item.kind === 'investment') {
              return [
                baiodfPdfByInvestmentId.get(item.id),
                agreementPdfByInvestmentId.get(item.id)
              ].filter((pdf): pdf is TicketPdf => Boolean(pdf));
            }
            if (item.kind === 'investment-baiodf') {
              const pdf = baiodfPdfByInvestmentId.get(item.id);
              return pdf ? [pdf] : [];
            }
            if (item.kind === 'investment-agreement') {
              const pdf = agreementPdfByInvestmentId.get(item.id);
              return pdf ? [pdf] : [];
            }
            if (item.kind === 'document') {
              const document = uploadedPdfById.get(item.id);
              return document ? [document] : [];
            }
            const pdf = byId.get(item.id);
            return pdf ? [pdf] : [];
          })
        : [
            ...selectedOtherPdfs
              .filter((pdf) => earlyCodes.has(pdf.formCode))
              .sort((left, right) => (earlyRank.get(left.formCode) ?? 99) - (earlyRank.get(right.formCode) ?? 99)),
            ...pairPdfs,
            ...selectedOtherPdfs.filter((pdf) => lateCodes.has(pdf.formCode)),
            ...selectedOtherPdfs.filter((pdf) => !earlyCodes.has(pdf.formCode) && !lateCodes.has(pdf.formCode)),
            ...uploadedPdfs
          ];
      const loadedPdfs = await Promise.all(
        orderedPdfs.map(async (pdf) => ({
          pdf,
          bytes: await loadTicketPdfBytes(deps, pdf)
        }))
      );
      const totalBytes = loadedPdfs.reduce((sum, item) => sum + item.bytes.length, 0);
      if (totalBytes > MAX_TICKET_SOURCE_BYTES) {
        throw new HttpError(413, 'Selected PDFs are too large to package together.');
      }

      const ticket = await mergeTicketPdfs(loadedPdfs);
      const fileName = `${safeFileName(client.name)}-docusign-ticket.pdf`;

      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      response.setHeader('X-TaxAlpha-Pdf-Count', String(orderedPdfs.length));
      response.send(ticket);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
