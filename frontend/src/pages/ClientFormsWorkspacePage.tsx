import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import {
  MAX_CLIENT_DOCUMENT_BYTES,
  clientDocumentViewUrl,
  deleteClientDocument,
  listClientDocuments,
  uploadClientDocument
} from '../api/clientDocuments';
import { generatePdf } from '../api/dynamicSteps';
import { analyzePdfFill, createPdfFill, deletePdfFill, listPdfFills } from '../api/pdfFills';
import {
  createPdfTicket,
  deleteGeneratedPdf,
  generatedPdfFileUrl,
  generatedPdfViewUrl,
  listPdfTicketPdfs,
  type PdfTicketOrderItem
} from '../api/pdfTickets';
import {
  addInvestment,
  analyzeInvestmentAgreement,
  finalizeClientSetup,
  generateInvestmentBaiodf,
  renameInvestment,
  uploadInvestmentAgreement
} from '../api/investments';
import { useAuth } from '../context/AuthContext';
import { usePdfUpdates } from '../context/PdfUpdatesContext';
import { useToast } from '../context/ToastContext';
import { GUIDED_CLIENT_WORKSPACE } from '../config/features';
import { formDisplayName, formShortDescription } from '../lib/formDisplayNames';
import type {
  ClientFormPdfRecord,
  ClientDocumentRecord,
  FormPdfListResponse,
  InvestmentTicketPair,
  PdfFillSummary,
  FormWorkspaceItem,
  FormWorkspaceRecord,
  SelectClientFormsResponse
} from '../types/api';

function statusLabel(status: FormWorkspaceRecord['forms'][number]['onboardingStatus']): string {
  if (!status) {
    return 'Not Selected';
  }

  if (status === 'COMPLETED') {
    return 'Completed';
  }

  if (status === 'IN_PROGRESS') {
    return 'In Progress';
  }

  return 'Not Started';
}

function statusPillClass(status: FormWorkspaceRecord['forms'][number]['onboardingStatus']): string {
  if (status === 'COMPLETED') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
  }

  if (status === 'IN_PROGRESS') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
  }

  return 'border-line bg-fog text-mute';
}

function statusSortWeight(status: FormWorkspaceRecord['forms'][number]['onboardingStatus']): number {
  if (status === 'IN_PROGRESS') {
    return 0;
  }

  if (status === 'NOT_STARTED') {
    return 1;
  }

  if (status === 'COMPLETED') {
    return 2;
  }

  return 3;
}

function resumeLabel(route: string | null): string {
  if (!route) {
    return '—';
  }

  const match = route.match(/step[-/](\d+)/i);
  if (match) {
    return `Step ${match[1]}`;
  }

  return 'Available';
}

function progressLabel(form: FormWorkspaceItem): string {
  if (!form.selected || !form.totalSteps || form.totalSteps <= 0) {
    return 'Not started';
  }

  const resume = resumeLabel(form.resumeRoute);
  if (resume === '—' || resume === 'Available') {
    return `${form.totalSteps} steps`;
  }

  return `${resume} of ${form.totalSteps}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString();
}

function pdfDisplayTitle(pdf: ClientFormPdfRecord): string {
  return pdf.documentTitle || pdf.fileName || `${pdf.workspaceFormTitle} PDF`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return 'Stored document';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function isPackageEligibleDocument(document: ClientDocumentRecord): boolean {
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

type InvestmentDocumentKind = 'investment-baiodf' | 'investment-agreement';

function investmentDocumentKey(kind: InvestmentDocumentKind, investmentId: string): string {
  return `${kind}:${investmentId}`;
}

const ANALYSIS_STAGES = {
  QUEUED: { label: 'Preparing analysis', step: 1, progress: 10 },
  READING_PDF: { label: 'Reading PDF fields', step: 2, progress: 30 },
  MATCHING_CLIENT_DATA: { label: 'Matching client data', step: 3, progress: 50 },
  MAPPING_FIELDS: { label: 'Mapping agreement fields', step: 4, progress: 78 },
  FINALIZING: { label: 'Finalizing review draft', step: 5, progress: 94 }
} as const;

function formatElapsedTime(startedAt: string | null | undefined, now: number): string {
  if (!startedAt) return 'In progress';
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s elapsed`;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s elapsed`;
}

type TicketOrderReviewItem = PdfTicketOrderItem & {
  key: string;
  title: string;
  detail: string;
  pdfCount: number;
};

function moveTicketOrderItem(
  items: TicketOrderReviewItem[],
  sourceKey: string,
  targetKey: string
): TicketOrderReviewItem[] {
  const sourceIndex = items.findIndex((item) => item.key === sourceKey);
  const targetIndex = items.findIndex((item) => item.key === targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

type WorkspaceToolsDrawerMode = 'documents' | 'pdf-fill' | 'ticket';
const FIXED_ONBOARDING_FORM_CODES = new Set(['INVESTOR_PROFILE', 'SFC', 'BAIODF', 'BAIV_506C']);

export function ClientFormsWorkspacePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { pushToast } = useToast();
  const { subscribe } = usePdfUpdates();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const clientDocumentInputRef = useRef<HTMLInputElement | null>(null);

  const [workspace, setWorkspace] = useState<FormWorkspaceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagedCodes, setStagedCodes] = useState<Set<string>>(new Set());
  const [pdfDrawerForm, setPdfDrawerForm] = useState<FormWorkspaceItem | null>(null);
  const [pdfs, setPdfs] = useState<ClientFormPdfRecord[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);
  const [pdfFills, setPdfFills] = useState<PdfFillSummary[]>([]);
  const [pdfFillsLoading, setPdfFillsLoading] = useState(false);
  const [uploadingPdfFill, setUploadingPdfFill] = useState(false);
  const [pdfFillActionId, setPdfFillActionId] = useState<string | null>(null);
  const [clientDocuments, setClientDocuments] = useState<ClientDocumentRecord[]>([]);
  const [clientDocumentsLoading, setClientDocumentsLoading] = useState(false);
  const [clientDocumentsError, setClientDocumentsError] = useState<string | null>(null);
  const [uploadingClientDocument, setUploadingClientDocument] = useState(false);
  const [deletingClientDocumentId, setDeletingClientDocumentId] = useState<string | null>(null);
  const [deletingPdfFillId, setDeletingPdfFillId] = useState<string | null>(null);
  const [workspaceToolsDrawerMode, setWorkspaceToolsDrawerMode] = useState<WorkspaceToolsDrawerMode | null>(null);
  const [ticketPdfs, setTicketPdfs] = useState<ClientFormPdfRecord[]>([]);
  const [ticketDocuments, setTicketDocuments] = useState<ClientDocumentRecord[]>([]);
  const [ticketPairs, setTicketPairs] = useState<InvestmentTicketPair[]>([]);
  const [ticketPdfsLoading, setTicketPdfsLoading] = useState(false);
  const [ticketPdfsError, setTicketPdfsError] = useState<string | null>(null);
  const [selectedTicketPdfIds, setSelectedTicketPdfIds] = useState<Set<string>>(new Set());
  const [selectedTicketDocumentIds, setSelectedTicketDocumentIds] = useState<Set<string>>(new Set());
  const [selectedTicketInvestmentDocumentKeys, setSelectedTicketInvestmentDocumentKeys] = useState<Set<string>>(new Set());
  const [ticketOrderItems, setTicketOrderItems] = useState<TicketOrderReviewItem[]>([]);
  const [ticketOrderDialogOpen, setTicketOrderDialogOpen] = useState(false);
  const [draggedTicketOrderKey, setDraggedTicketOrderKey] = useState<string | null>(null);
  const draggedTicketOrderKeyRef = useRef<string | null>(null);
  const [pdfFillDropActive, setPdfFillDropActive] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [deletingGeneratedPdfId, setDeletingGeneratedPdfId] = useState<string | null>(null);
  const [investmentActionId, setInvestmentActionId] = useState<string | null>(null);
  const [newInvestmentName, setNewInvestmentName] = useState('');
  const [newInvestmentAgreement, setNewInvestmentAgreement] = useState<File | null>(null);
  const [processingClock, setProcessingClock] = useState(() => Date.now());

  const stagedCount = stagedCodes.size;
  const selectedCount = workspace?.forms.filter((form) => form.selected).length ?? 0;
  const inProgressCount =
    workspace?.forms.filter((form) => form.selected && form.onboardingStatus === 'IN_PROGRESS').length ?? 0;
  const completedCount =
    workspace?.forms.filter((form) => form.selected && form.onboardingStatus === 'COMPLETED').length ?? 0;

  const handleUnauthorized = useCallback(async () => {
    await signOut();
    navigate('/signin', { replace: true });
  }, [navigate, signOut]);

  const loadWorkspace = useCallback(
    async (options?: { preserveStage?: boolean; silent?: boolean }) => {
      if (!clientId) {
        setError('Invalid client identifier.');
        setLoading(false);
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }

      setError(null);

      try {
        const response = await apiRequest<{ workspace: FormWorkspaceRecord }>(
          `/api/clients/${clientId}/forms/workspace`
        );
        setWorkspace(response.workspace);
        if (!options?.preserveStage) {
          setStagedCodes(new Set());
        }
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.statusCode === 401) {
          await handleUnauthorized();
          return;
        }

        if (requestError instanceof ApiError && requestError.statusCode === 404) {
          setError('Client not found.');
        } else {
          setError('Unable to load forms workspace.');
        }
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [clientId, handleUnauthorized]
  );

  const loadFormPdfs = useCallback(
    async (formCode: string, options?: { silent?: boolean }) => {
      if (!clientId) {
        return;
      }

      if (!options?.silent) {
        setPdfLoading(true);
      }

      setPdfError(null);

      try {
        const response = await apiRequest<FormPdfListResponse>(`/api/clients/${clientId}/forms/${formCode}/pdfs`);
        setPdfs(response.pdfs);
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.statusCode === 401) {
          await handleUnauthorized();
          return;
        }

        setPdfError(requestError instanceof ApiError ? requestError.message : 'Unable to load PDFs.');
      } finally {
        if (!options?.silent) {
          setPdfLoading(false);
        }
      }
    },
    [clientId, handleUnauthorized]
  );

  const loadPdfFills = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!clientId) return;
      if (!options?.silent) setPdfFillsLoading(true);
      try {
        setPdfFills(await listPdfFills(clientId));
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.statusCode === 401) {
          await handleUnauthorized();
          return;
        }
        if (!options?.silent) {
          pushToast(requestError instanceof ApiError ? requestError.message : 'Unable to load uploaded PDFs.', 'error');
        }
      } finally {
        if (!options?.silent) setPdfFillsLoading(false);
      }
    },
    [clientId, handleUnauthorized, pushToast]
  );

  const loadClientDocuments = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!clientId) return;

      if (!options?.silent) {
        setClientDocumentsLoading(true);
      }

      setClientDocumentsError(null);

      try {
        setClientDocuments(await listClientDocuments(clientId));
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.statusCode === 401) {
          await handleUnauthorized();
          return;
        }

        setClientDocumentsError(
          requestError instanceof ApiError ? requestError.message : 'Unable to load client documents.'
        );
      } finally {
        if (!options?.silent) {
          setClientDocumentsLoading(false);
        }
      }
    },
    [clientId, handleUnauthorized]
  );

  const loadTicketPdfs = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!clientId) return;

      if (!options?.silent) {
        setTicketPdfsLoading(true);
      }

      setTicketPdfsError(null);

      try {
        const ticketResponse = await listPdfTicketPdfs(clientId);
        const nextTicketPdfs = ticketResponse.pdfs;
        setTicketPdfs(nextTicketPdfs);
        const nextTicketDocuments = ticketResponse.documents ?? [];
        setTicketDocuments(nextTicketDocuments);
        setTicketPairs((current) => {
          const nextById = new Map(ticketResponse.investmentPairs.map((pair) => [pair.investmentId, pair]));
          const preserved = current
            .map((pair) => nextById.get(pair.investmentId))
            .filter((pair): pair is InvestmentTicketPair => Boolean(pair));
          const preservedIds = new Set(preserved.map((pair) => pair.investmentId));
          return [
            ...preserved,
            ...ticketResponse.investmentPairs.filter((pair) => !preservedIds.has(pair.investmentId))
          ];
        });
        setSelectedTicketPdfIds((current) => {
          const availableIds = new Set(nextTicketPdfs.map((pdf) => pdf.id));
          return new Set([...current].filter((pdfId) => availableIds.has(pdfId)));
        });
        setSelectedTicketDocumentIds((current) => {
          const availableIds = new Set(nextTicketDocuments.map((document) => document.id));
          return new Set([...current].filter((documentId) => availableIds.has(documentId)));
        });
        setSelectedTicketInvestmentDocumentKeys((current) => {
          const availableKeys = new Set(
            ticketResponse.investmentPairs.flatMap((pair) => [
              ...(pair.baiodfPdf ? [investmentDocumentKey('investment-baiodf', pair.investmentId)] : []),
              ...(pair.agreementPdf ? [investmentDocumentKey('investment-agreement', pair.investmentId)] : [])
            ])
          );
          return new Set([...current].filter((key) => availableKeys.has(key)));
        });
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.statusCode === 401) {
          await handleUnauthorized();
          return;
        }

        setTicketPdfsError(requestError instanceof ApiError ? requestError.message : 'Unable to load generated PDFs.');
      } finally {
        if (!options?.silent) {
          setTicketPdfsLoading(false);
        }
      }
    },
    [clientId, handleUnauthorized]
  );

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    void loadPdfFills();
  }, [loadPdfFills]);

  useEffect(() => {
    void loadClientDocuments();
  }, [loadClientDocuments]);

  useEffect(() => {
    const interval = window.setInterval(() => setProcessingClock(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const hasActiveWork = workspace?.investments?.some(
      (investment) => investment.agreement?.status === 'ANALYZING' || Boolean(
        investment.baiodfSyncRequestedAt &&
        (!investment.baiodfPdf?.generatedAt || investment.baiodfSyncRequestedAt > investment.baiodfPdf.generatedAt)
      )
    );
    const hasDirectPdfAnalysis = pdfFills.some((fill) => fill.status === 'ANALYZING');
    if (!hasActiveWork && !hasDirectPdfAnalysis) return;
    const interval = window.setInterval(() => {
      void loadWorkspace({ preserveStage: true, silent: true });
      void loadPdfFills({ silent: true });
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [loadPdfFills, loadWorkspace, pdfFills, workspace?.investments]);

  useEffect(() => {
    if (workspaceToolsDrawerMode === 'ticket') {
      void loadTicketPdfs();
    }
  }, [loadTicketPdfs, workspaceToolsDrawerMode]);

  useEffect(() => {
    return subscribe((affectedClientIds) => {
      if (!clientId || !affectedClientIds.includes(clientId)) {
        return;
      }

      void loadWorkspace({ preserveStage: true, silent: true });
      void loadPdfFills({ silent: true });

      if (workspaceToolsDrawerMode === 'ticket') {
        void loadTicketPdfs({ silent: true });
      }

      if (pdfDrawerForm) {
        void loadFormPdfs(pdfDrawerForm.code, { silent: true });
      }
    });
  }, [
    clientId,
    loadFormPdfs,
    loadPdfFills,
    loadTicketPdfs,
    loadWorkspace,
    pdfDrawerForm,
    subscribe,
    workspaceToolsDrawerMode
  ]);

  const stagedTitles = useMemo(() => {
    if (!workspace) {
      return [] as string[];
    }

    return workspace.forms.filter((form) => stagedCodes.has(form.code)).map((form) => form.title);
  }, [stagedCodes, workspace]);

  const stagedAvailableCodes = useMemo(() => {
    if (!workspace) {
      return [] as string[];
    }

    return workspace.forms
      .filter((form) => stagedCodes.has(form.code) && !form.selected)
      .map((form) => form.code);
  }, [stagedCodes, workspace]);

  const stagedCompletedCodes = useMemo(() => {
    if (!workspace) {
      return [] as string[];
    }

    return workspace.forms
      .filter((form) => stagedCodes.has(form.code) && form.selected && form.onboardingStatus === 'COMPLETED')
      .map((form) => form.code);
  }, [stagedCodes, workspace]);

  const sortedForms = useMemo(() => {
    if (!workspace) {
      return [] as FormWorkspaceItem[];
    }

    return workspace.forms
      .filter((form) => FIXED_ONBOARDING_FORM_CODES.has(form.code))
      .map((form, index) => ({ form, index }))
      .sort((left, right) => {
        if (left.form.selected !== right.form.selected) {
          return left.form.selected ? -1 : 1;
        }

        if (left.form.selected && right.form.selected) {
          const statusCompare =
            statusSortWeight(left.form.onboardingStatus) - statusSortWeight(right.form.onboardingStatus);
          if (statusCompare !== 0) {
            return statusCompare;
          }
        }

        return left.index - right.index;
      })
      .map((entry) => entry.form);
  }, [workspace]);

  const selectedTicketPdfCount =
    selectedTicketPdfIds.size + selectedTicketDocumentIds.size + selectedTicketInvestmentDocumentKeys.size;
  const allTicketPdfIds = useMemo(() => ticketPdfs.map((pdf) => pdf.id), [ticketPdfs]);
  const allTicketDocumentIds = useMemo(
    () => ticketDocuments.map((document) => document.id),
    [ticketDocuments]
  );
  const availableTicketInvestmentDocumentKeys = useMemo(
    () => ticketPairs.flatMap((pair) => [
      ...(pair.baiodfPdf ? [investmentDocumentKey('investment-baiodf', pair.investmentId)] : []),
      ...(pair.agreementPdf ? [investmentDocumentKey('investment-agreement', pair.investmentId)] : [])
    ]),
    [ticketPairs]
  );
  const allSelectableTicketPdfCount =
    ticketPdfs.length + ticketDocuments.length + availableTicketInvestmentDocumentKeys.length;
  const allTicketPdfsSelected =
    allSelectableTicketPdfCount > 0 &&
    selectedTicketPdfIds.size === ticketPdfs.length &&
    selectedTicketDocumentIds.size === ticketDocuments.length &&
    selectedTicketInvestmentDocumentKeys.size === availableTicketInvestmentDocumentKeys.length;
  const intakeTicketDocuments = useMemo(
    () => ticketDocuments.filter((document) => document.source === 'INTAKE_FORM'),
    [ticketDocuments]
  );
  const drawerTicketDocuments = useMemo(
    () => ticketDocuments.filter((document) => document.source !== 'INTAKE_FORM'),
    [ticketDocuments]
  );
  const directFillTicketPdfs = useMemo(
    () => ticketPdfs.filter((pdf) => pdf.workspaceFormCode === 'PDF_UPLOAD'),
    [ticketPdfs]
  );
  const generatedFormGroups = useMemo(() => {
    const groups = new Map<string, { title: string; pdfs: ClientFormPdfRecord[] }>();
    for (const pdf of ticketPdfs.filter((item) => item.workspaceFormCode !== 'PDF_UPLOAD')) {
      const key = pdf.workspaceFormCode || pdf.formCode;
      const existing = groups.get(key);
      if (existing) existing.pdfs.push(pdf);
      else groups.set(key, { title: pdf.workspaceFormTitle, pdfs: [pdf] });
    }
    const preferredOrder = ['INVESTOR_PROFILE', 'INVESTOR_PROFILE_ADDITIONAL_HOLDER', 'SFC', 'BAIV_506C'];
    return [...groups.entries()]
      .map(([code, group]) => ({ code, ...group }))
      .sort((left, right) => {
        const leftRank = preferredOrder.indexOf(left.code);
        const rightRank = preferredOrder.indexOf(right.code);
        return (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank);
      });
  }, [ticketPdfs]);

  const handleToggleStage = (formCode: string) => {
    setStagedCodes((current) => {
      const next = new Set(current);
      if (next.has(formCode)) {
        next.delete(formCode);
      } else {
        next.add(formCode);
      }
      return next;
    });
  };

  const handleSubmitFormCodes = async (formCodes: string[], action: 'add' | 'sync') => {
    if (!clientId || formCodes.length === 0 || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await apiRequest<SelectClientFormsResponse>(
        `/api/clients/${clientId}/forms/select`,
        {
          method: 'POST',
          body: JSON.stringify({ formCodes })
        }
      );

      setWorkspace(response.workspace);
      setStagedCodes((current) => {
        const next = new Set(current);
        for (const formCode of formCodes) {
          next.delete(formCode);
        }
        return next;
      });

      if (action === 'sync') {
        pushToast(`Sent ${formCodes.length} form${formCodes.length > 1 ? 's' : ''} for document generation.`);
        return;
      }

      pushToast(
        response.addedFormCodes.length > 0
          ? `${response.addedFormCodes.length} form${response.addedFormCodes.length > 1 ? 's' : ''} added.`
          : 'No new forms were added.'
      );

      if (response.nextOnboardingRoute) {
        navigate(response.nextOnboardingRoute);
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }

      setError(requestError instanceof ApiError ? requestError.message : 'Unable to add selected forms.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateMappedPdf = async (form: FormWorkspaceItem) => {
    if (!clientId || generatingCode) return;
    setGeneratingCode(form.code);
    try {
      const result = await generatePdf(clientId, form.code);
      const warningCount = result.warnings?.length ?? 0;
      pushToast(
        warningCount > 0
          ? `Generated PDF with ${result.fieldsFilled} mapped value${result.fieldsFilled === 1 ? '' : 's'} and ${warningCount} smart fact warning${warningCount === 1 ? '' : 's'}.`
          : `Generated PDF with ${result.fieldsFilled} mapped value${result.fieldsFilled === 1 ? '' : 's'}.`
      );
      await loadWorkspace({ preserveStage: true, silent: true });
      if (pdfDrawerForm?.code === form.code) {
        await loadFormPdfs(form.code, { silent: true });
      }
      if (workspaceToolsDrawerMode === 'ticket') {
        await loadTicketPdfs({ silent: true });
      }
      if (result.pdfUrl) {
        window.open(result.pdfUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }
      pushToast(requestError instanceof ApiError ? requestError.message : 'Unable to generate PDF.', 'error');
    } finally {
      setGeneratingCode(null);
    }
  };

  const handleGenerateOnboardingPdf = async (form: FormWorkspaceItem) => {
    if (generatingCode || submitting || form.onboardingStatus !== 'COMPLETED') return;
    setGeneratingCode(form.code);
    try {
      await handleSubmitFormCodes([form.code], 'sync');
    } finally {
      setGeneratingCode(null);
    }
  };

  const handleOpenPdfDrawer = async (form: FormWorkspaceItem) => {
    setPdfDrawerForm(form);
    setPdfs([]);
    await loadFormPdfs(form.code);
  };

  const handleUploadPdfFill = async (file: File | null | undefined) => {
    if (!clientId || !file || uploadingPdfFill) return;
    setUploadingPdfFill(true);
    try {
      const fill = await createPdfFill(clientId, file);
      pushToast('PDF analysis started. You can continue working while it runs.');
      await loadPdfFills({ silent: true });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }
      pushToast(requestError instanceof Error ? requestError.message : 'Unable to upload PDF.', 'error');
    } finally {
      setUploadingPdfFill(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    }
  };

  const handleDirectPdfFillAction = async (fill: PdfFillSummary) => {
    if (!clientId || pdfFillActionId) return;
    if (fill.status === 'DRAFT' || fill.status === 'GENERATED') {
      navigate(`/clients/${clientId}/pdf-fills/${fill.id}`);
      return;
    }
    if (fill.status !== 'ANALYSIS_FAILED') return;

    setPdfFillActionId(fill.id);
    try {
      await analyzePdfFill(clientId, fill.id);
      pushToast('PDF analysis restarted.');
      await loadPdfFills({ silent: true });
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : 'Unable to restart PDF analysis.', 'error');
    } finally {
      setPdfFillActionId(null);
    }
  };

  const handlePdfFillDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setPdfFillDropActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleUploadPdfFill(file);
  };

  const handleUploadClientDocument = async (file: File | null | undefined) => {
    if (!clientId || !file || uploadingClientDocument) return;

    if (file.size > MAX_CLIENT_DOCUMENT_BYTES) {
      pushToast('Document is too large. Maximum size is 50 MB.', 'error');
      if (clientDocumentInputRef.current) clientDocumentInputRef.current.value = '';
      return;
    }

    setUploadingClientDocument(true);
    setClientDocumentsError(null);

    try {
      const document = await uploadClientDocument(clientId, file);
      setClientDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]);
      pushToast('Document uploaded.');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }

      pushToast(requestError instanceof Error ? requestError.message : 'Unable to upload document.', 'error');
    } finally {
      setUploadingClientDocument(false);
      if (clientDocumentInputRef.current) clientDocumentInputRef.current.value = '';
    }
  };

  const handleDeleteClientDocument = async (document: ClientDocumentRecord) => {
    if (!clientId || deletingClientDocumentId) return;
    if (!window.confirm(`Delete ${document.fileName}? This removes the uploaded file from the client workspace.`)) return;

    setDeletingClientDocumentId(document.id);
    try {
      await deleteClientDocument(clientId, document.id);
      setClientDocuments((current) => current.filter((item) => item.id !== document.id));
      setTicketDocuments((current) => current.filter((item) => item.id !== document.id));
      setSelectedTicketDocumentIds((current) => {
        const next = new Set(current);
        next.delete(document.id);
        return next;
      });
      pushToast('Document deleted.');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }
      pushToast(requestError instanceof Error ? requestError.message : 'Unable to delete document.', 'error');
    } finally {
      setDeletingClientDocumentId(null);
    }
  };

  const handleDeletePdfFill = async (fill: PdfFillSummary) => {
    if (!clientId || deletingPdfFillId) return;
    const name = fill.fileName ?? 'this PDF fill';
    if (!window.confirm(`Delete ${name}? Its original file and any generated PDF will be removed.`)) return;

    setDeletingPdfFillId(fill.id);
    try {
      await deletePdfFill(clientId, fill.id);
      setPdfFills((current) => current.filter((item) => item.id !== fill.id));
      await loadTicketPdfs({ silent: true });
      pushToast('PDF fill deleted.');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }
      pushToast(requestError instanceof Error ? requestError.message : 'Unable to delete PDF fill.', 'error');
    } finally {
      setDeletingPdfFillId(null);
    }
  };

  const handleDeleteGeneratedPdf = async (pdfId: string, title: string) => {
    if (!clientId || deletingGeneratedPdfId) return;
    if (!window.confirm(`Delete ${title}? The generated PDF will be removed.`)) return;

    setDeletingGeneratedPdfId(pdfId);
    try {
      await deleteGeneratedPdf(clientId, pdfId);
      setPdfs((current) => current.filter((item) => item.id !== pdfId));
      setTicketPdfs((current) => current.filter((item) => item.id !== pdfId));
      setTicketPairs((current) => current.map((pair) => ({
        ...pair,
        baiodfPdf: pair.baiodfPdf?.id === pdfId ? null : pair.baiodfPdf,
        agreementPdf: pair.agreementPdf?.id === pdfId ? null : pair.agreementPdf,
        ready:
          Boolean(pair.baiodfPdf?.id === pdfId ? null : pair.baiodfPdf) &&
          Boolean(pair.agreementPdf?.id === pdfId ? null : pair.agreementPdf)
      })));
      setSelectedTicketPdfIds((current) => {
        const next = new Set(current);
        next.delete(pdfId);
        return next;
      });
      await Promise.all([
        loadWorkspace({ preserveStage: true, silent: true }),
        loadTicketPdfs({ silent: true }),
        loadPdfFills({ silent: true }),
        pdfDrawerForm ? loadFormPdfs(pdfDrawerForm.code, { silent: true }) : Promise.resolve()
      ]);
      pushToast('Generated PDF deleted.');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }
      pushToast(requestError instanceof Error ? requestError.message : 'Unable to delete generated PDF.', 'error');
    } finally {
      setDeletingGeneratedPdfId(null);
    }
  };

  const handleToggleTicketPdf = (pdfId: string) => {
    setSelectedTicketPdfIds((current) => {
      const next = new Set(current);
      if (next.has(pdfId)) {
        next.delete(pdfId);
      } else {
        next.add(pdfId);
      }
      return next;
    });
  };

  const handleToggleTicketInvestmentDocument = (kind: InvestmentDocumentKind, investmentId: string) => {
    const key = investmentDocumentKey(kind, investmentId);
    setSelectedTicketInvestmentDocumentKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleToggleTicketDocument = (documentId: string) => {
    setSelectedTicketDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  };

  const handleToggleAllTicketPdfs = () => {
    setSelectedTicketPdfIds(allTicketPdfsSelected ? new Set() : new Set(allTicketPdfIds));
    setSelectedTicketDocumentIds(
      allTicketPdfsSelected ? new Set() : new Set(allTicketDocumentIds)
    );
    setSelectedTicketInvestmentDocumentKeys(
      allTicketPdfsSelected ? new Set() : new Set(availableTicketInvestmentDocumentKeys)
    );
  };

  const handleOpenTicketOrderDialog = () => {
    const selectedPdfs = ticketPdfs.filter((pdf) => selectedTicketPdfIds.has(pdf.id));
    const earlyRank = new Map([
      ['INVESTOR_PROFILE', 0],
      ['INVESTOR_PROFILE_ADDITIONAL_HOLDER', 1],
      ['SFC', 2]
    ]);
    const earlyPdfs = selectedPdfs
      .filter((pdf) => earlyRank.has(pdf.formCode))
      .sort((left, right) => (earlyRank.get(left.formCode) ?? 99) - (earlyRank.get(right.formCode) ?? 99));
    const latePdfs = selectedPdfs.filter((pdf) => pdf.formCode === 'BAIV_506C');
    const remainingPdfs = selectedPdfs.filter(
      (pdf) => !earlyRank.has(pdf.formCode) && pdf.formCode !== 'BAIV_506C'
    );
    const toPdfItem = (pdf: ClientFormPdfRecord): TicketOrderReviewItem => ({
      key: `pdf:${pdf.id}`,
      kind: 'pdf',
      id: pdf.id,
      title: pdfDisplayTitle(pdf),
      detail: 'Generated PDF',
      pdfCount: 1
    });
    const order: TicketOrderReviewItem[] = [
      ...earlyPdfs.map(toPdfItem),
      ...ticketPairs.flatMap((pair) => {
        const items: TicketOrderReviewItem[] = [];
        if (selectedTicketInvestmentDocumentKeys.has(investmentDocumentKey('investment-baiodf', pair.investmentId))) {
          items.push({
            key: `investment-baiodf:${pair.investmentId}`,
            kind: 'investment-baiodf',
            id: pair.investmentId,
            title: `${pair.name} — Brokerage Alternative Disclosure`,
            detail: 'Investment disclosure form',
            pdfCount: 1
          });
        }
        if (selectedTicketInvestmentDocumentKeys.has(investmentDocumentKey('investment-agreement', pair.investmentId))) {
          items.push({
            key: `investment-agreement:${pair.investmentId}`,
            kind: 'investment-agreement',
            id: pair.investmentId,
            title: `${pair.name} — Subscription Agreement`,
            detail: 'Subscription agreement',
            pdfCount: 1
          });
        }
        return items;
      }),
      ...latePdfs.map(toPdfItem),
      ...remainingPdfs.map(toPdfItem),
      ...ticketDocuments
        .filter((document) => selectedTicketDocumentIds.has(document.id))
        .map((document) => ({
          key: `document:${document.id}`,
          kind: 'document' as const,
          id: document.id,
          title: document.fileName,
          detail: 'Original uploaded PDF',
          pdfCount: 1
        }))
    ];
    setTicketOrderItems(order);
    setTicketOrderDialogOpen(true);
  };

  const handleTicketOrderDrop = (event: DragEvent<HTMLElement>, targetKey: string) => {
    event.preventDefault();
    const sourceKey = draggedTicketOrderKeyRef.current || event.dataTransfer.getData('text/plain');
    if (sourceKey) {
      setTicketOrderItems((current) => moveTicketOrderItem(current, sourceKey, targetKey));
    }
    draggedTicketOrderKeyRef.current = null;
    setDraggedTicketOrderKey(null);
  };

  const handleTicketOrderDragEnter = (event: DragEvent<HTMLElement>, targetKey: string) => {
    event.preventDefault();
    const sourceKey = draggedTicketOrderKeyRef.current;
    if (sourceKey && sourceKey !== targetKey) {
      setTicketOrderItems((current) => moveTicketOrderItem(current, sourceKey, targetKey));
    }
  };

  const handleTicketOrderMove = (itemKey: string, offset: -1 | 1) => {
    setTicketOrderItems((current) => {
      const sourceIndex = current.findIndex((item) => item.key === itemKey);
      const target = current[sourceIndex + offset];
      return target ? moveTicketOrderItem(current, itemKey, target.key) : current;
    });
  };

  const handleTicketOrderKeyboardMove = (
    event: KeyboardEvent<HTMLButtonElement>,
    itemKey: string,
    offset: -1 | 1
  ) => {
    if ((offset === -1 && event.key !== 'ArrowUp') || (offset === 1 && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    handleTicketOrderMove(itemKey, offset);
  };

  const handleCreateTicket = async () => {
    if (!clientId || ticketOrderItems.length === 0 || creatingTicket) {
      return;
    }

    setCreatingTicket(true);
    try {
      const { blob, fileName } = await createPdfTicket(
        clientId,
        [...selectedTicketPdfIds],
        [],
        ticketDocuments
          .filter((document) => selectedTicketDocumentIds.has(document.id))
          .map((document) => document.id),
        ticketOrderItems.map(({ kind, id }) => ({ kind, id }))
      );
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      pushToast(`Created ticket with ${selectedTicketPdfCount} PDF${selectedTicketPdfCount === 1 ? '' : 's'}.`);
      setTicketOrderDialogOpen(false);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }

      pushToast(requestError instanceof Error ? requestError.message : 'Unable to create ticket.', 'error');
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleAgreementUpload = async (investmentId: string, file: File | null | undefined) => {
    if (!clientId || !file) return;
    setInvestmentActionId(investmentId);
    try {
      await uploadInvestmentAgreement(clientId, investmentId, file);
      pushToast('Agreement PDF uploaded.');
      await loadWorkspace({ preserveStage: true, silent: true });
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : 'Unable to upload agreement.', 'error');
    } finally {
      setInvestmentActionId(null);
    }
  };

  const handleFillAgreement = async (investmentId: string, fillId: string, status: string) => {
    if (!clientId) return;
    setInvestmentActionId(investmentId);
    try {
      if (status === 'UPLOADED' || status === 'ANALYSIS_FAILED') {
        await analyzeInvestmentAgreement(clientId, investmentId);
        pushToast('Agreement analysis started.');
        await loadWorkspace({ preserveStage: true, silent: true });
        return;
      }
      if (status === 'DRAFT' || status === 'GENERATED') {
        navigate(`/clients/${clientId}/pdf-fills/${fillId}`);
      }
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : 'Unable to analyze agreement.', 'error');
      await loadWorkspace({ preserveStage: true, silent: true });
    } finally {
      setInvestmentActionId(null);
    }
  };

  const handleGenerateInvestmentBaiodf = async (investmentId: string) => {
    if (!clientId) return;
    setInvestmentActionId(investmentId);
    try {
      await generateInvestmentBaiodf(clientId, investmentId);
      pushToast('Brokerage Alternative Investment Order and Disclosure Form document generation started.');
      await loadWorkspace({ preserveStage: true, silent: true });
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : 'Unable to generate the Brokerage Alternative Investment Order and Disclosure Form document.', 'error');
    } finally {
      setInvestmentActionId(null);
    }
  };

  const handleAddInvestment = async () => {
    if (!clientId || !newInvestmentName.trim() || !newInvestmentAgreement) return;
    let createdInvestmentId: string | null = null;
    try {
      const investment = await addInvestment(clientId, newInvestmentName.trim());
      createdInvestmentId = investment.id;
      await uploadInvestmentAgreement(clientId, investment.id, newInvestmentAgreement);
      setNewInvestmentName('');
      setNewInvestmentAgreement(null);
      pushToast('Investment and agreement added.');
      await loadWorkspace({ preserveStage: true, silent: true });
    } catch (requestError) {
      if (createdInvestmentId) {
        setNewInvestmentName('');
        setNewInvestmentAgreement(null);
        pushToast('Investment was added, but its agreement upload failed. Retry from the investment card.', 'error');
        await loadWorkspace({ preserveStage: true, silent: true });
      } else {
        pushToast(requestError instanceof Error ? requestError.message : 'Unable to add investment.', 'error');
      }
    }
  };

  const handleRenameInvestment = async (investmentId: string, currentName: string) => {
    if (!clientId) return;
    const name = window.prompt('Investment name', currentName)?.trim();
    if (!name || name === currentName) return;
    try {
      await renameInvestment(clientId, investmentId, name);
      await loadWorkspace({ preserveStage: true, silent: true });
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : 'Unable to rename investment.', 'error');
    }
  };

  const handleFinalizeSetup = async () => {
    if (!clientId) return;
    try {
      const result = await finalizeClientSetup(clientId);
      pushToast('Client setup completed.');
      navigate(result.nextOnboardingRoute);
    } catch (requestError) {
      pushToast(requestError instanceof Error ? requestError.message : 'Upload every agreement first.', 'error');
    }
  };

  const handleClosePdfDrawer = () => {
    setPdfDrawerForm(null);
    setPdfs([]);
    setPdfError(null);
    setPdfLoading(false);
  };

  const handleCloseWorkspaceToolsDrawer = () => {
    setWorkspaceToolsDrawerMode(null);
  };

  const guidedForms = ['INVESTOR_PROFILE', 'SFC', 'BAIV_506C']
    .map((code) => workspace?.forms.find((form) => form.code === code) ?? null)
    .filter((form): form is FormWorkspaceItem => Boolean(form));
  const guidedInvestments = workspace?.investments ?? [];
  const guidedTotalTasks =
    guidedForms.filter((form) => form.selected).length + guidedInvestments.length * 2;
  const guidedCompletedTasks =
    guidedForms.filter((form) => form.selected && form.onboardingStatus === 'COMPLETED').length +
    guidedInvestments.reduce(
      (total, investment) =>
        total + Number(investment.baiodfStatus === 'COMPLETED') + Number(investment.agreement?.status === 'GENERATED'),
      0
    );
  const guidedProgress = guidedTotalTasks > 0
    ? Math.round((guidedCompletedTasks / guidedTotalTasks) * 100)
    : 0;
  const guidedNextForm = ['INVESTOR_PROFILE', 'SFC']
    .map((code) => workspace?.forms.find((form) => form.code === code))
    .find((form) => form?.selected && form.onboardingStatus !== 'COMPLETED' && form.resumeRoute);
  const guidedNextInvestment = !guidedNextForm
    ? guidedInvestments.find((investment) => investment.baiodfStatus !== 'COMPLETED')
    : undefined;
  const guidedNextVerification = !guidedNextForm && !guidedNextInvestment
    ? workspace?.forms.find(
      (form) => form.code === 'BAIV_506C' && form.selected && form.onboardingStatus !== 'COMPLETED' && form.resumeRoute
    )
    : undefined;
  const guidedNextDocumentInvestment = !guidedNextForm && !guidedNextInvestment && !guidedNextVerification
    ? guidedInvestments.find(
      (investment) => !investment.baiodfPdf || investment.agreement?.status !== 'GENERATED'
    )
    : undefined;
  const guidedNextDocumentGenerating = Boolean(
    guidedNextDocumentInvestment &&
    !guidedNextDocumentInvestment.baiodfPdf &&
    guidedNextDocumentInvestment.baiodfSyncRequestedAt
  );
  const guidedNextGenerationRetryAvailable = Boolean(
    guidedNextDocumentGenerating &&
    guidedNextDocumentInvestment?.baiodfSyncRequestedAt &&
    processingClock - new Date(guidedNextDocumentInvestment.baiodfSyncRequestedAt).getTime() >= 60_000
  );

  const handleGuidedNextAction = () => {
    if (guidedNextForm?.resumeRoute) {
      navigate(guidedNextForm.resumeRoute);
      return;
    }
    if (guidedNextInvestment) {
      navigate(guidedNextInvestment.baiodfResumeRoute);
      return;
    }
    if (guidedNextVerification?.resumeRoute) {
      navigate(guidedNextVerification.resumeRoute);
      return;
    }
    if (!guidedNextDocumentInvestment) {
      setWorkspaceToolsDrawerMode('ticket');
      return;
    }
    if (!guidedNextDocumentInvestment.baiodfPdf) {
      if (guidedNextDocumentGenerating && !guidedNextGenerationRetryAvailable) return;
      void handleGenerateInvestmentBaiodf(guidedNextDocumentInvestment.id);
      return;
    }
    const agreement = guidedNextDocumentInvestment.agreement;
    if (agreement && agreement.status !== 'ANALYZING') {
      void handleFillAgreement(guidedNextDocumentInvestment.id, agreement.fillId, agreement.status);
      return;
    }
    document.getElementById(`investment-${guidedNextDocumentInvestment.id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  };

  const guidedNextLabel = guidedNextForm
    ? `Continue ${formDisplayName(guidedNextForm.code, guidedNextForm.title)}`
    : guidedNextInvestment
      ? `Continue ${guidedNextInvestment.name}`
      : guidedNextVerification
        ? `Continue ${formDisplayName(guidedNextVerification.code, guidedNextVerification.title)}`
        : guidedNextDocumentInvestment
          ? !guidedNextDocumentInvestment.baiodfPdf
            ? guidedNextDocumentGenerating && !guidedNextGenerationRetryAvailable
              ? `Creating the disclosure document for ${guidedNextDocumentInvestment.name}`
              : `Create the disclosure document for ${guidedNextDocumentInvestment.name}`
            : guidedNextDocumentInvestment.agreement?.status === 'ANALYZING'
              ? `Analyzing the agreement for ${guidedNextDocumentInvestment.name}`
              : `Complete the agreement for ${guidedNextDocumentInvestment.name}`
          : 'Create the final document package';

  const renderTicketDocumentRows = (documents: ClientDocumentRecord[]) => (
    <div className="divide-y divide-black/[0.055] border-t border-black/[0.055]">
      {documents.map((document) => (
        <div key={document.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <label className="flex min-w-0 cursor-pointer items-center gap-3">
            <input
              aria-label={`Select uploaded ${document.fileName}`}
              checked={selectedTicketDocumentIds.has(document.id)}
              className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
              type="checkbox"
              onChange={() => handleToggleTicketDocument(document.id)}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm text-ink">{document.fileName}</span>
              <span className="mt-1 block text-xs text-mute">
                {formatFileSize(document.sizeBytes)} · Uploaded {formatTimestamp(document.createdAt)}
              </span>
            </span>
          </label>
          <a className="shrink-0 text-xs text-mute underline decoration-line underline-offset-4 hover:text-ink" href={clientDocumentViewUrl(document)} target="_blank" rel="noreferrer">Open</a>
        </div>
      ))}
    </div>
  );

  const renderTicketPdfRows = (generatedPdfs: ClientFormPdfRecord[]) => (
    <div className="divide-y divide-black/[0.055] border-t border-black/[0.055]">
      {generatedPdfs.map((pdf) => (
        <div key={pdf.id} className="flex items-center gap-3 px-4 py-3">
          <input
            aria-label={`Select ${pdfDisplayTitle(pdf)}`}
            checked={selectedTicketPdfIds.has(pdf.id)}
            className="h-4 w-4 shrink-0 rounded border-line text-accent focus:ring-accent"
            type="checkbox"
            onChange={() => handleToggleTicketPdf(pdf.id)}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink" title={pdfDisplayTitle(pdf)}>{pdfDisplayTitle(pdf)}</p>
            <p className="mt-1 truncate text-xs text-mute">Generated {formatTimestamp(pdf.generatedAt)}</p>
          </div>
          <a className="shrink-0 text-xs text-mute underline decoration-line underline-offset-4 hover:text-ink" href={generatedPdfViewUrl(pdf)} rel="noreferrer" target="_blank">Open</a>
          <button
            className="shrink-0 text-xs text-mute underline decoration-line underline-offset-4 hover:text-red-700 disabled:opacity-45"
            disabled={deletingGeneratedPdfId === pdf.id}
            type="button"
            onClick={() => void handleDeleteGeneratedPdf(pdf.id, pdfDisplayTitle(pdf))}
          >
            {deletingGeneratedPdfId === pdf.id ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <main className={GUIDED_CLIENT_WORKSPACE ? 'workspace-premium min-h-screen px-4 py-5 sm:px-8 sm:py-8 lg:py-10' : 'min-h-screen bg-fog px-4 py-6 sm:px-8 sm:py-8'}>
        <div className={`mx-auto flex flex-col ${GUIDED_CLIENT_WORKSPACE ? 'max-w-6xl' : 'max-w-7xl'}`}>
          <header className={GUIDED_CLIENT_WORKSPACE ? 'premium-header rounded-[2rem] px-6 py-6 sm:px-9 sm:py-8' : 'rounded-3xl border border-black/10 bg-paper px-5 py-5 shadow-hairline sm:px-8 sm:py-6'}>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className={GUIDED_CLIENT_WORKSPACE ? 'text-sm font-medium text-[#86868b]' : 'text-xs uppercase tracking-[0.2em] text-mute'}>
                  {GUIDED_CLIENT_WORKSPACE ? 'Client checklist' : 'Client Workspace'}
                </p>
                <h1 className={GUIDED_CLIENT_WORKSPACE ? 'mt-2 text-[2.35rem] font-semibold leading-[1.08] tracking-[-0.035em] text-[#1d1d1f] sm:text-[2.75rem]' : 'mt-2 text-3xl font-light tracking-tight text-ink'}>
                  {workspace?.clientName ?? 'Loading client...'}
                </h1>
                <p className={GUIDED_CLIENT_WORKSPACE ? 'mt-3 max-w-xl text-[15px] leading-6 text-[#6e6e73]' : 'mt-2 text-sm text-mute'}>
                  {GUIDED_CLIENT_WORKSPACE
                    ? 'Complete the next clear task, then prepare the final document package.'
                    : 'Select base forms, generate mapped PDFs, and review document history.'}
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                {!GUIDED_CLIENT_WORKSPACE && <div className="flex items-center gap-6 border-b border-line pb-4 text-[10px] sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4 sm:text-xs">
                  <div>
                    <p className="uppercase tracking-[0.2em] text-mute">Selected</p>
                    <p className="mt-1 text-lg font-light text-ink">{selectedCount}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.2em] text-mute">In Progress</p>
                    <p className="mt-1 text-lg font-light text-ink">{inProgressCount}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.2em] text-mute">Completed</p>
                    <p className="mt-1 text-lg font-light text-ink">{completedCount}</p>
                  </div>
                </div>}
                <input
                  ref={uploadInputRef}
                  className="hidden"
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => {
                    void handleUploadPdfFill(event.target.files?.[0]);
                  }}
                />
                <input
                  ref={clientDocumentInputRef}
                  aria-label="Client document upload"
                  className="hidden"
                  type="file"
                  onChange={(event) => {
                    void handleUploadClientDocument(event.target.files?.[0]);
                  }}
                />
                <button
                  className={`${GUIDED_CLIENT_WORKSPACE ? 'premium-secondary' : 'bg-accent text-white hover:bg-accent/90'} whitespace-nowrap rounded-full px-5 py-2 text-sm transition`}
                  type="button"
                  onClick={() => setWorkspaceToolsDrawerMode('documents')}
                >
                  {GUIDED_CLIENT_WORKSPACE ? 'Client files' : 'Files & PDF Fill'}
                </button>
                <button
                  className={`${GUIDED_CLIENT_WORKSPACE ? 'premium-primary' : 'bg-ink hover:bg-black/80'} whitespace-nowrap rounded-full px-5 py-2 text-sm text-white transition`}
                  type="button"
                  onClick={() => setWorkspaceToolsDrawerMode('ticket')}
                >
                  {GUIDED_CLIENT_WORKSPACE ? 'Create package' : 'Create Ticket'}
                </button>
                <button
                  className={`${GUIDED_CLIENT_WORKSPACE ? 'premium-secondary' : 'border border-line hover:border-black'} whitespace-nowrap rounded-full px-5 py-2 text-sm text-mute transition hover:text-ink`}
                  type="button"
                  onClick={() => navigate('/dashboard')}
                >
                  Dashboard
                </button>
              </div>
            </div>
          </header>

          {!GUIDED_CLIENT_WORKSPACE && stagedCount > 0 && (
            <section className="sticky top-6 z-20 mt-8 rounded-2xl border border-accent/20 bg-white/80 p-5 shadow-panel backdrop-blur-md sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-accent">Staged Forms</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stagedTitles.map((title) => (
                      <span
                        key={title}
                        className="max-w-[16rem] truncate rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-ink shadow-sm"
                        title={title}
                      >
                        {title}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="shrink-0 rounded-full border border-line bg-white px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-ink shadow-sm transition hover:border-black disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={submitting || stagedAvailableCodes.length === 0}
                    type="button"
                    onClick={() => {
                      void handleSubmitFormCodes(stagedAvailableCodes, 'add');
                    }}
                  >
                    {submitting && stagedAvailableCodes.length > 0
                      ? 'Working...'
                      : `Add (${stagedAvailableCodes.length})`}
                  </button>
                  <button
                    className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/45"
                    disabled={submitting || stagedCompletedCodes.length === 0}
                    type="button"
                    onClick={() => {
                      void handleSubmitFormCodes(stagedCompletedCodes, 'sync');
                    }}
                  >
                    {submitting && stagedCompletedCodes.length > 0
                      ? 'Working...'
                      : GUIDED_CLIENT_WORKSPACE
                        ? `Generate documents (${stagedCompletedCodes.length})`
                        : `Send to n8n (${stagedCompletedCodes.length})`}
                  </button>
                </div>
              </div>
            </section>
          )}

          {GUIDED_CLIENT_WORKSPACE && loading && (
            <section className="mt-8 space-y-4" aria-label="Loading client checklist">
              <div className="h-36 animate-pulse rounded-3xl bg-white/60" />
              <div className="h-72 animate-pulse rounded-3xl bg-white/60" />
            </section>
          )}

          {GUIDED_CLIENT_WORKSPACE && !loading && error && (
            <section className="mt-8 rounded-3xl border border-red-200 bg-white p-6 shadow-hairline">
              <h2 className="text-lg font-medium text-ink">We could not load this client</h2>
              <p className="mt-2 text-sm text-red-700">{error}</p>
              <button
                className="mt-5 rounded-xl bg-ink px-4 py-2.5 text-sm text-white"
                type="button"
                onClick={() => void loadWorkspace()}
              >
                Try again
              </button>
            </section>
          )}

          {GUIDED_CLIENT_WORKSPACE && !loading && !error && workspace && (
            <div className="order-1 mt-7 space-y-6 sm:mt-8 sm:space-y-7">
              <section className="premium-card rounded-[2rem] p-6 sm:p-8">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-4">
                      <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#1d1d1f]">Overall progress</h2>
                      <span className="shrink-0 text-[13px] font-medium text-[#86868b]">
                        {guidedCompletedTasks} of {guidedTotalTasks} tasks complete
                      </span>
                    </div>
                    <div
                      className="premium-progress-track mt-4 h-1.5 overflow-hidden rounded-full"
                      role="progressbar"
                      aria-label="Client checklist progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={guidedProgress}
                    >
                      <div
                        className="premium-progress-fill h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${guidedProgress}%` }}
                      />
                    </div>
                    <p className="mt-5 text-[15px] text-[#6e6e73]">
                      Next <span className="ml-1 font-medium text-[#1d1d1f]">{guidedNextLabel}</span>
                    </p>
                  </div>
                  <button
                    className="premium-primary shrink-0 px-6 py-3 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-50"
                    disabled={
                      guidedNextDocumentInvestment?.agreement?.status === 'ANALYZING' ||
                      (guidedNextDocumentGenerating && !guidedNextGenerationRetryAvailable)
                    }
                    type="button"
                    onClick={handleGuidedNextAction}
                  >
                    {guidedNextDocumentInvestment?.agreement?.status === 'ANALYZING' ||
                    (guidedNextDocumentGenerating && !guidedNextGenerationRetryAvailable)
                      ? 'Processing'
                      : 'Continue'}
                  </button>
                </div>
              </section>

              <section className="premium-card overflow-hidden rounded-[2rem]">
                <div className="border-b border-black/[0.055] px-6 py-6 sm:px-8 sm:py-7">
                  <h2 className="text-[1.4rem] font-semibold tracking-[-0.025em] text-[#1d1d1f]">Client forms</h2>
                  <p className="mt-1.5 text-sm text-[#86868b]">Complete these once for the client.</p>
                </div>
                <div className="divide-y divide-black/[0.055]">
                  {guidedForms.map((form) => {
                    const complete = form.selected && form.onboardingStatus === 'COMPLETED';
                    const inProgress = form.selected && form.onboardingStatus === 'IN_PROGRESS';
                    return (
                      <article className="premium-row flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8" key={form.code}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                                complete
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : inProgress
                                    ? 'bg-amber-100 text-amber-800'
                                    : form.selected
                                      ? 'bg-black/5 text-mute'
                                      : 'border border-line text-mute'
                              }`}
                            >
                              {complete ? '✓' : '•'}
                            </span>
                            <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.012em] text-[#1d1d1f] sm:text-base">
                              {formDisplayName(form.code, form.title)}
                            </h3>
                          </div>
                          <p className="mt-1.5 pl-9 text-sm leading-5 text-[#86868b]">{formShortDescription(form.code)}</p>
                          <p className="mt-2 pl-9 text-xs font-medium text-[#6e6e73]">
                            {complete
                              ? 'Complete'
                              : inProgress
                                ? progressLabel(form)
                                : form.selected
                                  ? 'Ready to start'
                                  : 'Optional · Not included'}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-8 sm:pl-0">
                          {!form.selected ? (
                            <button
                                className="premium-secondary px-5 py-2.5 text-sm text-ink disabled:opacity-50"
                              disabled={submitting}
                              type="button"
                              onClick={() => void handleSubmitFormCodes([form.code], 'add')}
                            >
                              Add form
                            </button>
                          ) : complete ? (
                            <>
                              <button
                                className="premium-primary px-5 py-2.5 text-sm font-medium text-white disabled:cursor-wait disabled:opacity-45"
                                disabled={Boolean(generatingCode) || submitting}
                                type="button"
                                onClick={() => void handleGenerateOnboardingPdf(form)}
                              >
                                {generatingCode === form.code ? 'Generating…' : 'Generate PDF'}
                              </button>
                              <button
                                className="premium-secondary px-5 py-2.5 text-sm text-ink"
                                type="button"
                                onClick={() => void handleOpenPdfDrawer(form)}
                              >
                                PDF history ({form.pdfCount})
                              </button>
                              <details className="relative">
                                <summary className="cursor-pointer list-none rounded-full px-3 py-2.5 text-sm text-[#6e6e73] hover:bg-black/[0.035] hover:text-ink">More</summary>
                                <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-2xl border border-black/10 bg-white/95 p-1.5 shadow-panel backdrop-blur-xl">
                                  <button
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-fog disabled:opacity-40"
                                    disabled={!form.viewRoute}
                                    type="button"
                                    onClick={() => form.viewRoute && navigate(form.viewRoute)}
                                  >
                                    Review form
                                  </button>
                                  <button
                                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-fog disabled:opacity-40"
                                    disabled={!form.editRoute}
                                    type="button"
                                    onClick={() => form.editRoute && navigate(form.editRoute)}
                                  >
                                    Edit form
                                  </button>
                                </div>
                              </details>
                            </>
                          ) : (
                            <>
                              <button
                                className="premium-dark px-5 py-2.5 text-sm text-white disabled:opacity-40"
                                disabled={!form.resumeRoute}
                                type="button"
                                onClick={() => form.resumeRoute && navigate(form.resumeRoute)}
                              >
                                {inProgress ? 'Continue' : 'Start'}
                              </button>
                              {form.pdfCount > 0 && (
                                <button
                                  className="premium-secondary px-5 py-2.5 text-sm text-ink"
                                  type="button"
                                  onClick={() => void handleOpenPdfDrawer(form)}
                                >
                                  PDF history ({form.pdfCount})
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              {workspace.forms.some((form) => form.code === 'BAIODF') && (
                <section className="premium-card overflow-hidden rounded-[2rem]">
                  <div className="flex flex-col gap-4 border-b border-black/[0.055] px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-7">
                    <div>
                      <h2 className="text-[1.4rem] font-semibold tracking-[-0.025em] text-[#1d1d1f]">Investments</h2>
                      <p className="mt-1.5 text-sm text-[#86868b]">
                        Each investment needs its disclosure form and its agreement document.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {workspace.setupStatus === 'INCOMPLETE' && (
                        <button
                          className="premium-primary px-5 py-2.5 text-sm text-white"
                          type="button"
                          onClick={() => void handleFinalizeSetup()}
                        >
                          Finish client setup
                        </button>
                      )}
                      <details className="relative">
                        <summary className="premium-secondary cursor-pointer list-none px-5 py-2.5 text-sm text-ink">
                          Add investment
                        </summary>
                        <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-4 rounded-3xl border border-black/10 bg-white/95 p-5 shadow-panel backdrop-blur-2xl">
                          <label className="block text-xs font-medium text-mute">
                            Investment name
                            <input
                              className="mt-2 w-full rounded-2xl border border-black/10 bg-[#f5f5f7] px-4 py-3 text-sm text-ink outline-none transition focus:border-[#0071e3] focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                              maxLength={120}
                              placeholder="Investment or product name"
                              value={newInvestmentName}
                              onChange={(event) => setNewInvestmentName(event.target.value)}
                            />
                          </label>
                          <label className="block cursor-pointer rounded-2xl border border-dashed border-black/15 bg-[#f5f5f7] px-4 py-3.5 text-sm text-mute transition hover:border-[#0071e3]/50 hover:bg-white">
                            <span className="block text-xs font-medium">Agreement document</span>
                            <span className="mt-1 block truncate text-ink">{newInvestmentAgreement?.name ?? 'Choose a PDF'}</span>
                            <input className="hidden" type="file" accept="application/pdf" onChange={(event) => setNewInvestmentAgreement(event.target.files?.[0] ?? null)} />
                          </label>
                          <button
                            className="premium-dark w-full px-4 py-2.5 text-sm text-white disabled:opacity-35"
                            disabled={!newInvestmentName.trim() || !newInvestmentAgreement}
                            type="button"
                            onClick={() => void handleAddInvestment()}
                          >
                            Add investment
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>

                  {guidedInvestments.length === 0 ? (
                    <div className="px-5 py-10 text-center sm:px-7">
                      <p className="text-sm text-mute">No investments have been added yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-black/[0.055]">
                      {guidedInvestments.map((investment) => {
                        const readyCount = Number(Boolean(investment.baiodfPdf)) + Number(investment.agreement?.status === 'GENERATED');
                        const busy = investmentActionId === investment.id;
                        const agreementStatus = investment.agreement?.status ?? 'NOT_UPLOADED';
                        const agreementAnalysisStage = ANALYSIS_STAGES[investment.agreement?.analysisStage ?? 'QUEUED'];
                        const generatingDisclosure = Boolean(
                          investment.baiodfSyncRequestedAt &&
                          (!investment.baiodfPdf?.generatedAt || investment.baiodfSyncRequestedAt > investment.baiodfPdf.generatedAt)
                        );
                        const generationRetryAvailable = Boolean(
                          generatingDisclosure &&
                          investment.baiodfSyncRequestedAt &&
                          processingClock - new Date(investment.baiodfSyncRequestedAt).getTime() >= 60_000
                        );
                        return (
                          <article className="premium-row px-6 py-7 sm:px-8 sm:py-8" id={`investment-${investment.id}`} key={investment.id}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-xs font-medium text-[#86868b]">Investment {investment.position}</p>
                                <h3 className="mt-1.5 text-xl font-semibold tracking-[-0.02em] text-[#1d1d1f]">{investment.name}</h3>
                                <p className={`mt-1.5 text-sm font-medium ${investment.pairReady ? 'text-emerald-700' : 'text-[#86868b]'}`}>
                                  {readyCount} of 2 documents ready
                                </p>
                              </div>
                              <button
                                className="self-start px-1 py-2 text-sm text-mute hover:text-ink"
                                type="button"
                                onClick={() => void handleRenameInvestment(investment.id, investment.name)}
                              >
                                Rename
                              </button>
                            </div>

                            <div className="mt-6 divide-y divide-black/[0.055] overflow-hidden rounded-[1.35rem] border border-black/[0.065] bg-white/65">
                              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-ink">Brokerage Alternative Investment Order and Disclosure Form</p>
                                  <p className="mt-1 text-xs text-mute">
                                    {investment.baiodfStatus !== 'COMPLETED'
                                      ? statusLabel(investment.baiodfStatus)
                                      : generatingDisclosure
                                        ? 'Creating document'
                                        : investment.baiodfPdf
                                          ? 'Document ready'
                                          : 'Form complete · Document not created'}
                                  </p>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                  {investment.baiodfStatus !== 'COMPLETED' ? (
                                    <button
                                      className="premium-dark px-5 py-2.5 text-sm text-white"
                                      type="button"
                                      onClick={() => navigate(investment.baiodfResumeRoute)}
                                    >
                                      {investment.baiodfStatus === 'NOT_STARTED' ? 'Start' : 'Continue'}
                                    </button>
                                  ) : (
                                    <>
                                      {investment.baiodfPdf && !generatingDisclosure && (
                                        <a className="premium-secondary inline-flex items-center px-5 py-2.5 text-sm text-ink" href={generatedPdfFileUrl(clientId!, investment.baiodfPdf.id)} target="_blank" rel="noreferrer">
                                          Open document
                                        </a>
                                      )}
                                      {investment.baiodfPdf && !generatingDisclosure && (
                                        <button
                                          className="px-2 py-2.5 text-sm text-mute hover:text-red-700 disabled:opacity-45"
                                          disabled={deletingGeneratedPdfId === investment.baiodfPdf.id}
                                          type="button"
                                          onClick={() => void handleDeleteGeneratedPdf(investment.baiodfPdf!.id, `${investment.name} disclosure PDF`)}
                                        >
                                          {deletingGeneratedPdfId === investment.baiodfPdf.id ? 'Deleting…' : 'Delete'}
                                        </button>
                                      )}
                                      <button
                                        className="premium-dark px-5 py-2.5 text-sm text-white disabled:cursor-wait disabled:opacity-45"
                                        disabled={busy || (generatingDisclosure && !generationRetryAvailable)}
                                        type="button"
                                        onClick={() => void handleGenerateInvestmentBaiodf(investment.id)}
                                      >
                                        {generatingDisclosure
                                          ? generationRetryAvailable ? 'Retry' : 'Creating…'
                                          : investment.baiodfPdf ? 'Create a new version' : 'Create document'}
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="p-5 sm:p-6">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-ink">Investment agreement</p>
                                    <p className="mt-1 truncate text-xs text-mute">
                                      {investment.agreement?.fileName ?? 'Agreement document not uploaded'}
                                    </p>
                                    <p className={`mt-1 text-xs ${agreementStatus === 'ANALYSIS_FAILED' ? 'text-red-700' : agreementStatus === 'GENERATED' ? 'text-emerald-700' : 'text-mute'}`}>
                                      {agreementStatus === 'NOT_UPLOADED'
                                        ? 'Upload required'
                                        : agreementStatus === 'UPLOADED'
                                          ? 'Ready to analyze'
                                          : agreementStatus === 'ANALYZING'
                                            ? agreementAnalysisStage.label
                                            : agreementStatus === 'ANALYSIS_FAILED'
                                              ? 'Analysis needs attention'
                                              : agreementStatus === 'DRAFT'
                                                ? 'Ready for review'
                                                : 'Document ready'}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                                    {agreementStatus === 'NOT_UPLOADED' && (
                                      <label className="premium-dark inline-flex cursor-pointer items-center px-5 py-2.5 text-sm text-white">
                                        Upload agreement
                                        <input className="hidden" type="file" accept="application/pdf" onChange={(event) => void handleAgreementUpload(investment.id, event.target.files?.[0])} />
                                      </label>
                                    )}
                                    {investment.agreement && (agreementStatus === 'UPLOADED' || agreementStatus === 'ANALYSIS_FAILED') && (
                                      <button
                                        className="premium-dark px-5 py-2.5 text-sm text-white disabled:opacity-40"
                                        disabled={busy}
                                        type="button"
                                        onClick={() => void handleFillAgreement(investment.id, investment.agreement!.fillId, agreementStatus)}
                                      >
                                        {agreementStatus === 'ANALYSIS_FAILED' ? 'Retry analysis' : 'Analyze agreement'}
                                      </button>
                                    )}
                                    {investment.agreement && agreementStatus === 'DRAFT' && (
                                      <button
                                        className="premium-dark px-5 py-2.5 text-sm text-white"
                                        type="button"
                                        onClick={() => void handleFillAgreement(investment.id, investment.agreement!.fillId, agreementStatus)}
                                      >
                                        Review and complete
                                      </button>
                                    )}
                                    {investment.agreement?.generatedPdfUrl && (
                                      <a className="premium-secondary inline-flex items-center px-5 py-2.5 text-sm text-ink" href={investment.agreement.generatedPdfId ? generatedPdfFileUrl(clientId!, investment.agreement.generatedPdfId) : investment.agreement.generatedPdfUrl} target="_blank" rel="noreferrer">
                                        Open document
                                      </a>
                                    )}
                                    {investment.agreement?.generatedPdfId && (
                                      <button
                                        className="px-2 py-2.5 text-sm text-mute hover:text-red-700 disabled:opacity-45"
                                        disabled={deletingGeneratedPdfId === investment.agreement.generatedPdfId}
                                        type="button"
                                        onClick={() => void handleDeleteGeneratedPdf(investment.agreement!.generatedPdfId!, `${investment.name} subscription agreement`)}
                                      >
                                        {deletingGeneratedPdfId === investment.agreement.generatedPdfId ? 'Deleting…' : 'Delete'}
                                      </button>
                                    )}
                                    {investment.agreement && agreementStatus === 'GENERATED' && (
                                      <button
                                        className="premium-dark px-5 py-2.5 text-sm text-white"
                                        type="button"
                                        onClick={() => void handleFillAgreement(investment.id, investment.agreement!.fillId, agreementStatus)}
                                      >
                                        Edit document
                                      </button>
                                    )}
                                    {investment.agreement && !investment.agreement.generatedPdfUrl && agreementStatus !== 'ANALYZING' && (
                                      <label className="cursor-pointer px-2 py-2.5 text-sm text-mute hover:text-ink">
                                        Replace
                                        <input className="hidden" type="file" accept="application/pdf" onChange={(event) => void handleAgreementUpload(investment.id, event.target.files?.[0])} />
                                      </label>
                                    )}
                                  </div>
                                </div>
                                {investment.agreement && agreementStatus === 'ANALYZING' && (
                                  <div className="mt-5 max-w-xl rounded-2xl bg-[#f5f5f7] px-4 py-3.5">
                                    <div className="flex items-center justify-between gap-4 text-xs">
                                      <span className="font-medium text-ink">{agreementAnalysisStage.label}</span>
                                      <span className="shrink-0 text-mute">Step {agreementAnalysisStage.step} of 5</span>
                                    </div>
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10" role="progressbar" aria-label={`${investment.name} agreement analysis progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={agreementAnalysisStage.progress}>
                                      <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${agreementAnalysisStage.progress}%` }} />
                                    </div>
                                    <p className="mt-2 text-[11px] text-mute">
                                      {formatElapsedTime(investment.agreement.analysisStartedAt, processingClock)} · Safe to leave this page
                                    </p>
                                  </div>
                                )}
                                {investment.agreement?.analysisError && agreementStatus === 'ANALYSIS_FAILED' && (
                                  <p className="mt-3 max-w-xl rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                                    {investment.agreement.analysisError}
                                  </p>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              <section className="premium-final-card flex flex-col gap-5 rounded-[2rem] px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em] text-white">Final document package</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-5 text-white/60">Select completed investment pairs and any other documents, then review the order.</p>
                </div>
                <button
                  className="premium-primary shrink-0 px-6 py-2.5 text-sm font-medium text-white"
                  type="button"
                  onClick={() => setWorkspaceToolsDrawerMode('ticket')}
                >
                  Build package
                </button>
              </section>
            </div>
          )}

          {!GUIDED_CLIENT_WORKSPACE && !loading && workspace && (workspace.investments?.length ?? 0) > 0 && (
            <section className="order-2 mt-8 overflow-hidden rounded-3xl border border-black/10 bg-paper shadow-hairline">
              <div className="flex flex-col gap-4 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <div>
                  <h2 className="text-xl font-medium text-ink">Brokerage Alternative</h2>
                  <p className="mt-1 text-sm text-mute">One Brokerage Alternative Investment Order and Disclosure Form and one agreement per investment.</p>
                </div>
                <div className="flex items-center gap-2">
                  {workspace.setupStatus === 'INCOMPLETE' && (
                    <button className="rounded-xl bg-accent px-4 py-2 text-sm text-white" type="button" onClick={() => void handleFinalizeSetup()}>
                      Activate
                    </button>
                  )}
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-xl border border-line bg-white px-4 py-2 text-sm text-ink">Add investment</summary>
                    <div className="absolute right-0 z-20 mt-2 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-2xl border border-line bg-white p-4 shadow-panel">
                      <input className="w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-ink" placeholder="Investment name" value={newInvestmentName} onChange={(event) => setNewInvestmentName(event.target.value)} />
                      <label className="block cursor-pointer rounded-xl border border-dashed border-line px-3 py-3 text-sm text-mute">
                        <span className="block truncate">{newInvestmentAgreement?.name ?? 'Choose agreement PDF'}</span>
                        <input className="hidden" type="file" accept="application/pdf" onChange={(event) => setNewInvestmentAgreement(event.target.files?.[0] ?? null)} />
                      </label>
                      <button disabled={!newInvestmentName.trim() || !newInvestmentAgreement} className="w-full rounded-xl bg-ink px-4 py-2.5 text-sm text-white disabled:opacity-35" type="button" onClick={() => void handleAddInvestment()}>Add</button>
                    </div>
                  </details>
                </div>
              </div>

              <div className="divide-y divide-line">
                {workspace.investments?.map((investment) => {
                  const readyCount = Number(Boolean(investment.baiodfPdf)) + Number(investment.agreement?.status === 'GENERATED');
                  const busy = investmentActionId === investment.id;
                  const agreementStatus = investment.agreement?.status ?? 'NOT_UPLOADED';
                  const agreementAnalysisStage = ANALYSIS_STAGES[
                    investment.agreement?.analysisStage ?? 'QUEUED'
                  ];
                  const generatingBaiodf = Boolean(
                    investment.baiodfSyncRequestedAt &&
                    (!investment.baiodfPdf?.generatedAt || investment.baiodfSyncRequestedAt > investment.baiodfPdf.generatedAt)
                  );
                  const generationRetryAvailable = Boolean(
                    generatingBaiodf &&
                    investment.baiodfSyncRequestedAt &&
                    processingClock - new Date(investment.baiodfSyncRequestedAt).getTime() >= 60_000
                  );
                  return (
                    <article key={investment.id} className="px-5 py-6 sm:px-7">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs text-mute">Investment {investment.position}</p>
                          <h3 className="mt-1 text-lg font-medium text-ink">{investment.name}</h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-sm ${investment.pairReady ? 'text-emerald-700' : 'text-mute'}`}>
                            {readyCount} of 2 ready
                          </span>
                          <button className="text-sm text-mute underline decoration-line underline-offset-4 hover:text-ink" type="button" onClick={() => void handleRenameInvestment(investment.id, investment.name)}>
                            Rename
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid overflow-hidden rounded-2xl border border-line lg:grid-cols-2 lg:divide-x lg:divide-line">
                        <div className="p-4 sm:p-5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-ink">Brokerage Alternative Investment Order and Disclosure Form</p>
                            <span className="text-xs text-mute">{statusLabel(investment.baiodfStatus)}</span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {investment.baiodfStatus !== 'COMPLETED' ? (
                              <button className="rounded-full bg-accent px-4 py-2 text-xs uppercase tracking-[0.14em] text-white" type="button" onClick={() => navigate(investment.baiodfResumeRoute)}>
                                {investment.baiodfStatus === 'NOT_STARTED' ? 'Start disclosure form' : 'Continue disclosure form'}
                              </button>
                            ) : (
                              <>
                                <button className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.14em] text-ink" type="button" onClick={() => navigate(`/clients/${clientId}/investments/${investment.id}/forms/BAIODF/view/step/1`)}>
                                  View
                                </button>
                                <button className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.14em] text-ink" type="button" onClick={() => navigate(`/clients/${clientId}/investments/${investment.id}/forms/BAIODF/edit/step/1`)}>
                                  Edit
                                </button>
                                <button disabled={busy || (generatingBaiodf && !generationRetryAvailable)} className="rounded-full bg-accent px-4 py-2 text-xs uppercase tracking-[0.14em] text-white disabled:opacity-50" type="button" onClick={() => void handleGenerateInvestmentBaiodf(investment.id)}>
                                  {generatingBaiodf
                                    ? generationRetryAvailable ? 'Retry generation' : 'Generating PDF'
                                    : investment.baiodfPdf ? 'Regenerate PDF' : 'Generate PDF'}
                                </button>
                              </>
                            )}
                            {investment.baiodfPdf && (
                              <a className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.14em] text-ink" href={generatedPdfFileUrl(clientId!, investment.baiodfPdf.id)} target="_blank" rel="noreferrer">Open PDF</a>
                            )}
                            {investment.baiodfPdf && (
                              <button className="px-2 py-2 text-xs text-mute hover:text-red-700 disabled:opacity-45" disabled={deletingGeneratedPdfId === investment.baiodfPdf.id} type="button" onClick={() => void handleDeleteGeneratedPdf(investment.baiodfPdf!.id, `${investment.name} disclosure PDF`)}>
                                {deletingGeneratedPdfId === investment.baiodfPdf.id ? 'Deleting…' : 'Delete'}
                              </button>
                            )}
                          </div>
                          <p className="mt-3 text-xs text-mute">{investment.baiodfPdfCount} generated PDF{investment.baiodfPdfCount === 1 ? '' : 's'}</p>
                          {generatingBaiodf && <p className="mt-2 text-xs text-amber-700">Still processing. {generationRetryAvailable ? 'You can retry now.' : 'Retry unlocks after one minute.'}</p>}
                        </div>

                        <div className="border-t border-line p-4 sm:p-5 lg:border-t-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-ink">Agreement</p>
                            <span className={`text-xs ${agreementStatus === 'ANALYSIS_FAILED' ? 'text-red-600' : agreementStatus === 'GENERATED' ? 'text-emerald-700' : 'text-mute'}`}>
                              {agreementStatus === 'NOT_UPLOADED'
                                ? 'Not uploaded'
                                : agreementStatus === 'ANALYSIS_FAILED'
                                  ? 'Needs retry'
                                  : agreementStatus === 'ANALYZING'
                                    ? 'Analyzing'
                                    : agreementStatus === 'DRAFT'
                                      ? 'Ready to review'
                                      : 'Generated'}
                            </span>
                          </div>
                          <p className="mt-2 truncate text-sm text-ink">{investment.agreement?.fileName ?? 'Agreement missing'}</p>
                          {investment.agreement?.uploadedAt && <p className="mt-1 text-xs text-mute">Uploaded {formatTimestamp(investment.agreement.uploadedAt)}</p>}
                          {investment.agreement && agreementStatus === 'ANALYZING' && (
                            <div className="mt-4 rounded-xl bg-fog px-3.5 py-3">
                              <div className="flex items-center justify-between gap-4 text-xs">
                                <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
                                  <span className="truncate">{agreementAnalysisStage.label}</span>
                                </span>
                                <span className="shrink-0 text-mute">Step {agreementAnalysisStage.step} of 5</span>
                              </div>
                              <div
                                className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10"
                                role="progressbar"
                                aria-label="Agreement analysis progress"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={agreementAnalysisStage.progress}
                              >
                                <div
                                  className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                                  style={{ width: `${agreementAnalysisStage.progress}%` }}
                                />
                              </div>
                              <p className="mt-2 text-[11px] text-mute">
                                {formatElapsedTime(investment.agreement.analysisStartedAt, processingClock)} · You can leave this page
                              </p>
                            </div>
                          )}
                          {investment.agreement?.analysisError && (
                            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{investment.agreement.analysisError}</p>
                          )}
                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            {investment.agreement && agreementStatus === 'UPLOADED' && (
                              <button disabled={busy} className="rounded-xl bg-ink px-4 py-2 text-sm text-white disabled:opacity-40" type="button" onClick={() => void handleFillAgreement(investment.id, investment.agreement!.fillId, agreementStatus)}>
                                Analyze and fill
                              </button>
                            )}
                            {investment.agreement && agreementStatus === 'ANALYSIS_FAILED' && (
                              <button disabled={busy} className="rounded-xl bg-ink px-4 py-2 text-sm text-white disabled:opacity-40" type="button" onClick={() => void handleFillAgreement(investment.id, investment.agreement!.fillId, agreementStatus)}>
                                Retry analysis
                              </button>
                            )}
                            {investment.agreement && agreementStatus === 'DRAFT' && (
                              <button className="rounded-xl bg-ink px-4 py-2 text-sm text-white" type="button" onClick={() => void handleFillAgreement(investment.id, investment.agreement!.fillId, agreementStatus)}>
                                Resume fill
                              </button>
                            )}
                            {investment.agreement?.generatedPdfUrl && (
                              <a className="rounded-xl bg-ink px-4 py-2 text-sm text-white" href={investment.agreement.generatedPdfId ? generatedPdfFileUrl(clientId!, investment.agreement.generatedPdfId) : investment.agreement.generatedPdfUrl} target="_blank" rel="noreferrer">Open filled PDF</a>
                            )}
                            {investment.agreement?.generatedPdfId && (
                              <button className="px-2 py-2 text-sm text-mute hover:text-red-700 disabled:opacity-45" disabled={deletingGeneratedPdfId === investment.agreement.generatedPdfId} type="button" onClick={() => void handleDeleteGeneratedPdf(investment.agreement!.generatedPdfId!, `${investment.name} subscription agreement`)}>
                                {deletingGeneratedPdfId === investment.agreement.generatedPdfId ? 'Deleting…' : 'Delete'}
                              </button>
                            )}
                            {investment.agreement && agreementStatus === 'GENERATED' && (
                              <button className="rounded-xl border border-line px-4 py-2 text-sm text-ink" type="button" onClick={() => void handleFillAgreement(investment.id, investment.agreement!.fillId, agreementStatus)}>
                                Edit filled PDF
                              </button>
                            )}
                            {!investment.agreement?.generatedPdfUrl && agreementStatus !== 'ANALYZING' && (
                              <label className="cursor-pointer px-2 py-2 text-sm text-mute hover:text-ink">
                                {investment.agreement ? 'Replace' : 'Upload agreement'}
                                <input className="hidden" type="file" accept="application/pdf" onChange={(event) => void handleAgreementUpload(investment.id, event.target.files?.[0])} />
                              </label>
                            )}
                          </div>
                          {(investment.agreement?.warningCount ?? 0) > 0 && <p className="mt-3 text-xs text-amber-700">{investment.agreement?.warningCount} fields need review</p>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {!GUIDED_CLIENT_WORKSPACE && <section className="order-1 mt-10 flex-1">
            {loading && (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4].map((placeholder) => (
                  <div key={placeholder} className="h-56 animate-pulse rounded-3xl bg-white/50" />
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
                <p className="text-sm font-light text-red-600">{error}</p>
              </div>
            )}

            {!loading && !error && workspace && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {sortedForms.filter((form) => !(form.code === 'BAIODF' && (workspace.investments?.length ?? 0) > 0)).map((form) => {
                  const isStaged = stagedCodes.has(form.code);
                  const isMappingTemplate = form.mappingTemplate || form.dynamic;
                  const canContinue = form.selected && form.onboardingStatus !== 'COMPLETED' && !!form.resumeRoute;

                  return (
                    <article
                      key={form.code}
                      className={`group flex flex-col justify-between rounded-[2rem] border p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-panel ${
                        form.selected ? 'border-black/10 bg-white' : 'border-transparent bg-white/40 hover:bg-white/80'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-mute">Client form</p>
                            <h2 className="mt-2 text-lg font-light leading-tight text-ink">{form.title}</h2>
                            <p className="mt-1.5 text-xs font-light text-mute">
                              {form.selected
                                ? isMappingTemplate
                                  ? 'Selected for direct PDF generation'
                                  : 'Selected for onboarding'
                                : isMappingTemplate
                                  ? 'Available mapping template'
                                  : 'Available to add'}
                            </p>
                          </div>
                          <label className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-ink shadow-sm">
                            <input
                              checked={isStaged}
                              className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                              type="checkbox"
                              aria-label={`Select ${form.title}`}
                              onChange={() => handleToggleStage(form.code)}
                            />
                            Select
                          </label>
                        </div>

                        <div className="mt-6 flex items-center justify-between border-b border-line pb-3 text-xs">
                          <span className="font-light text-mute">Status</span>
                          <span
                            className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${
                              form.selected && !isMappingTemplate
                                ? statusPillClass(form.onboardingStatus)
                                : isMappingTemplate && form.selected
                                  ? 'border border-blue-500/30 bg-blue-500/10 text-blue-700'
                                  : 'bg-black/5 text-mute'
                            }`}
                          >
                            {form.selected
                              ? isMappingTemplate
                                ? 'Ready'
                                : statusLabel(form.onboardingStatus)
                              : 'Available'}
                          </span>
                        </div>

                        {form.selected && !isMappingTemplate && (
                          <>
                            <div className="mt-3 flex items-center justify-between text-xs">
                              <span className="font-light text-mute">Progress</span>
                              <span className="font-light text-ink">{progressLabel(form)}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="font-light text-mute">PDFs</span>
                              <span className="font-light text-ink">{form.pdfCount}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="font-light text-mute">Latest PDF</span>
                              <span className="max-w-[10rem] truncate text-right font-light text-ink">
                                {formatTimestamp(form.latestPdfReceivedAt)}
                              </span>
                            </div>
                          </>
                        )}
                        {form.selected && isMappingTemplate && (
                          <>
                            <div className="mt-3 flex items-center justify-between text-xs">
                              <span className="font-light text-mute">Mode</span>
                              <span className="font-light text-ink">Admin PDF mapping</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="font-light text-mute">PDFs</span>
                              <span className="font-light text-ink">{form.pdfCount}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="font-light text-mute">Latest PDF</span>
                              <span className="max-w-[10rem] truncate text-right font-light text-ink">
                                {formatTimestamp(form.latestPdfReceivedAt)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="mt-6 flex flex-wrap items-center gap-2">
                        {form.fillRoute && !isMappingTemplate && (
                          <button
                            type="button"
                            onClick={() => navigate(form.fillRoute!)}
                            className="w-full rounded-full bg-accent px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-white transition hover:bg-accent/90"
                          >
                            Fill form
                          </button>
                        )}
                        {!form.selected ? (
                          <p
                            className={`w-full rounded-2xl border px-4 py-3 text-center text-[10px] uppercase tracking-[0.18em] ${
                              isStaged ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-white text-mute'
                            }`}
                          >
                            Available to add
                          </p>
                        ) : (
                          <div className="flex w-full flex-col gap-2">
                            {isStaged && (
                              <p className="w-full rounded-2xl border border-accent bg-accent/10 px-4 py-3 text-center text-[10px] uppercase tracking-[0.18em] text-accent">
                                {isMappingTemplate
                                  ? 'Selected for PDF generation'
                                  : form.onboardingStatus === 'COMPLETED'
                                  ? 'Selected for document generation'
                                  : 'Selected for onboarding'}
                              </p>
                            )}
                            {isMappingTemplate && (
                              <button
                                className="w-full rounded-full bg-accent px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/45"
                                disabled={generatingCode === form.code}
                                type="button"
                                onClick={() => {
                                  void handleGenerateMappedPdf(form);
                                }}
                              >
                                {generatingCode === form.code ? 'Generating...' : 'Generate PDF'}
                              </button>
                            )}
                            <div className="flex w-full gap-2">
                              {!isMappingTemplate && (
                                <>
                                  <button
                                    className="flex-1 rounded-full border border-line bg-transparent px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-ink transition hover:border-black disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={!form.viewRoute}
                                    type="button"
                                    onClick={() => form.viewRoute && navigate(form.viewRoute)}
                                  >
                                    View
                                  </button>
                                  <button
                                    className="flex-1 rounded-full border border-line bg-transparent px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-ink transition hover:border-black disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={!form.editRoute}
                                    type="button"
                                    onClick={() => form.editRoute && navigate(form.editRoute)}
                                  >
                                    Edit
                                  </button>
                                </>
                              )}
                              <button
                                className="flex-1 rounded-full border border-line bg-transparent px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-ink transition hover:border-black disabled:cursor-not-allowed disabled:opacity-50"
                                type="button"
                                onClick={() => {
                                  void handleOpenPdfDrawer(form);
                                }}
                              >
                                {`PDFs (${form.pdfCount})`}
                              </button>
                            </div>
                            {canContinue && (
                              <button
                                className="w-full rounded-full bg-ink px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-black/80"
                                type="button"
                                onClick={() => form.resumeRoute && navigate(form.resumeRoute)}
                              >
                                Continue
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>}

          <footer className={GUIDED_CLIENT_WORKSPACE ? 'order-3 mt-10 pb-2 text-center text-xs text-[#86868b]' : 'order-3 mt-8 border-t border-line pt-6 text-center text-xs uppercase tracking-[0.2em] text-mute'}>
            {GUIDED_CLIENT_WORKSPACE ? 'TaxAlpha · Client workspace' : 'TaxAlpha Workspace • Ensure all records are verified'}
          </footer>
        </div>
      </main>

      {pdfDrawerForm && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/35 backdrop-blur-[2px]">
          <button
            aria-label="Close PDFs drawer overlay"
            className="flex-1"
            type="button"
            onClick={handleClosePdfDrawer}
          />
          <aside
            aria-labelledby="pdf-drawer-title"
            aria-modal="true"
            className={`${GUIDED_CLIENT_WORKSPACE ? 'premium-workspace-drawer' : 'border-l border-black/10 bg-paper shadow-2xl'} relative flex h-full w-full max-w-3xl flex-col`}
            role="dialog"
          >
            <div className="flex items-start justify-between border-b border-line px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-mute">PDF History</p>
                <h2 className="mt-2 text-2xl font-light text-ink" id="pdf-drawer-title">
                  {formDisplayName(pdfDrawerForm.code, pdfDrawerForm.title)}
                </h2>
                <p className="mt-2 text-sm text-mute">
                  Review every generated PDF for this form with received and generated timestamps.
                </p>
              </div>
              <button
                className="rounded-full border border-line px-4 py-2 text-sm text-mute transition hover:border-black hover:text-ink"
                type="button"
                onClick={handleClosePdfDrawer}
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {pdfLoading && <div className="h-32 animate-pulse rounded-3xl bg-white/50" />}

              {!pdfLoading && pdfError && (
                <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
                  <p className="text-sm font-light text-red-600">{pdfError}</p>
                </div>
              )}

              {!pdfLoading && !pdfError && pdfs.length === 0 && (
                <div className="rounded-3xl border border-dashed border-line bg-white px-6 py-10 text-center">
                  <p className="text-lg font-light text-ink">No PDFs received yet.</p>
                  <p className="mt-2 text-sm text-mute">
                    Generated documents will appear here.
                  </p>
                </div>
              )}

              {!pdfLoading && !pdfError && pdfs.length > 0 && (
                <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="bg-fog text-xs uppercase tracking-[0.16em] text-mute">
                        <tr>
                          <th className="px-4 py-3 font-medium">Document</th>
                          <th className="px-4 py-3 font-medium">Received</th>
                          <th className="px-4 py-3 font-medium">Generated</th>
                          <th className="px-4 py-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pdfs.map((pdf) => (
                          <tr key={pdf.id} className="border-t border-line/70">
                            <td className="px-4 py-3 align-top">
                              <p className="font-light text-ink">{pdfDisplayTitle(pdf)}</p>
                              {pdf.fileName && <p className="mt-1 text-xs text-mute">{pdf.fileName}</p>}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-mute">
                              {formatTimestamp(pdf.receivedAt)}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-mute">
                              {formatTimestamp(pdf.generatedAt)}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-center gap-3">
                              <a
                                className="inline-flex rounded-full border border-line px-3 py-1 text-xs uppercase tracking-[0.14em] text-ink transition hover:border-black"
                                href={generatedPdfViewUrl(pdf)}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Open PDF
                              </a>
                              <button
                                className="text-xs text-mute underline decoration-line underline-offset-4 hover:text-red-700 disabled:opacity-45"
                                disabled={deletingGeneratedPdfId === pdf.id}
                                type="button"
                                onClick={() => void handleDeleteGeneratedPdf(pdf.id, pdfDisplayTitle(pdf))}
                              >
                                {deletingGeneratedPdfId === pdf.id ? 'Deleting…' : 'Delete'}
                              </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {workspaceToolsDrawerMode && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/35 backdrop-blur-[2px]">
          <button
            aria-label="Close workspace files drawer overlay"
            className="flex-1"
            type="button"
            onClick={handleCloseWorkspaceToolsDrawer}
          />
          <aside
            aria-labelledby="workspace-tools-drawer-title"
            aria-modal="true"
            className={`${GUIDED_CLIENT_WORKSPACE ? 'premium-workspace-drawer max-w-3xl' : 'max-w-4xl border-l border-black/10 bg-paper shadow-2xl'} relative flex h-full w-full flex-col`}
            role="dialog"
          >
            <div className={`${GUIDED_CLIENT_WORKSPACE ? 'border-b border-black/[0.055] px-5 py-5 sm:px-7 sm:py-6' : 'border-b border-line px-5 py-5 sm:px-6'}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  {!GUIDED_CLIENT_WORKSPACE && <p className="text-xs uppercase tracking-[0.2em] text-mute">Workspace Files</p>}
                  <h2 className={`${GUIDED_CLIENT_WORKSPACE ? 'text-[1.7rem] font-semibold tracking-[-0.03em]' : 'mt-2 text-2xl font-light'} text-ink`} id="workspace-tools-drawer-title">
                    {GUIDED_CLIENT_WORKSPACE ? 'Documents' : 'Documents & PDF fill'}
                  </h2>
                  <p className={`${GUIDED_CLIENT_WORKSPACE ? 'mt-1.5' : 'mt-2'} text-sm text-mute`}>
                    {GUIDED_CLIENT_WORKSPACE
                      ? 'Files, PDF fills, and the final package for this client.'
                      : 'Upload client files, run one-off PDF fills, and package generated PDFs.'}
                  </p>
                </div>
                <button
                  aria-label={GUIDED_CLIENT_WORKSPACE ? 'Close document tools' : undefined}
                  className={`${GUIDED_CLIENT_WORKSPACE ? 'h-10 w-10 bg-black/[0.045] text-xl leading-none hover:bg-black/[0.08]' : 'border border-line px-4 py-2 text-sm text-mute hover:border-black hover:text-ink'} rounded-full transition`}
                  type="button"
                  onClick={handleCloseWorkspaceToolsDrawer}
                >
                  {GUIDED_CLIENT_WORKSPACE ? <span aria-hidden="true">×</span> : 'Close'}
                </button>
              </div>

              <div className={GUIDED_CLIENT_WORKSPACE ? 'mt-5 grid grid-cols-3 overflow-hidden rounded-full bg-black/[0.05] p-1' : 'mt-5 grid grid-cols-3 overflow-hidden rounded-full border border-line bg-white p-1'}>
                <button
                  aria-pressed={workspaceToolsDrawerMode === 'documents'}
                  className={`${GUIDED_CLIENT_WORKSPACE ? 'rounded-full px-3 py-2.5 text-sm font-medium' : 'rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em]'} transition ${
                    workspaceToolsDrawerMode === 'documents'
                      ? GUIDED_CLIENT_WORKSPACE ? 'bg-white text-ink shadow-sm' : 'bg-ink text-white'
                      : GUIDED_CLIENT_WORKSPACE ? 'text-mute hover:text-ink' : 'text-mute hover:bg-fog hover:text-ink'
                  }`}
                  type="button"
                  onClick={() => setWorkspaceToolsDrawerMode('documents')}
                >
                  {GUIDED_CLIENT_WORKSPACE ? `Files (${clientDocuments.length})` : `Documents (${clientDocuments.length})`}
                </button>
                <button
                  aria-pressed={workspaceToolsDrawerMode === 'pdf-fill'}
                  className={`${GUIDED_CLIENT_WORKSPACE ? 'rounded-full px-3 py-2.5 text-sm font-medium' : 'rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em]'} transition ${
                    workspaceToolsDrawerMode === 'pdf-fill'
                      ? GUIDED_CLIENT_WORKSPACE ? 'bg-white text-ink shadow-sm' : 'bg-ink text-white'
                      : GUIDED_CLIENT_WORKSPACE ? 'text-mute hover:text-ink' : 'text-mute hover:bg-fog hover:text-ink'
                  }`}
                  type="button"
                  onClick={() => setWorkspaceToolsDrawerMode('pdf-fill')}
                >
                  {GUIDED_CLIENT_WORKSPACE ? `Fill a PDF (${pdfFills.length})` : `PDF Fill (${pdfFills.length})`}
                </button>
                <button
                  aria-pressed={workspaceToolsDrawerMode === 'ticket'}
                  className={`${GUIDED_CLIENT_WORKSPACE ? 'rounded-full px-3 py-2.5 text-sm font-medium' : 'rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em]'} transition ${
                    workspaceToolsDrawerMode === 'ticket'
                      ? GUIDED_CLIENT_WORKSPACE ? 'bg-white text-ink shadow-sm' : 'bg-ink text-white'
                      : GUIDED_CLIENT_WORKSPACE ? 'text-mute hover:text-ink' : 'text-mute hover:bg-fog hover:text-ink'
                  }`}
                  type="button"
                  onClick={() => setWorkspaceToolsDrawerMode('ticket')}
                >
                  {GUIDED_CLIENT_WORKSPACE ? `Build package (${allSelectableTicketPdfCount})` : `Ticket (${allSelectableTicketPdfCount})`}
                </button>
              </div>
            </div>

            <div className={`${GUIDED_CLIENT_WORKSPACE ? 'px-5 py-6 sm:px-7 sm:py-7' : 'px-5 py-6 sm:px-6'} flex-1 overflow-y-auto`}>
              {workspaceToolsDrawerMode === 'documents' && (
                <section>
                  <div className={`${GUIDED_CLIENT_WORKSPACE ? '' : 'border-b border-line pb-5'} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
                    <div>
                      {!GUIDED_CLIENT_WORKSPACE && <p className="text-xs uppercase tracking-[0.2em] text-mute">Client Documents</p>}
                      <h3 className={`${GUIDED_CLIENT_WORKSPACE ? 'text-xl font-semibold tracking-[-0.02em]' : 'mt-2 text-xl font-light'} text-ink`}>
                        {GUIDED_CLIENT_WORKSPACE ? 'Client files' : 'Documents for this client'}
                      </h3>
                      <p className={`${GUIDED_CLIENT_WORKSPACE ? 'mt-1' : 'mt-2'} text-sm text-mute`}>
                        {GUIDED_CLIENT_WORKSPACE ? 'Supporting documents attached to this workspace.' : 'Supporting files stay attached to this shared client workspace.'}
                      </p>
                    </div>
                    <button
                      className={`${GUIDED_CLIENT_WORKSPACE ? 'premium-dark px-5 py-2.5 text-sm' : 'rounded-full bg-ink px-5 py-3 text-xs uppercase tracking-[0.16em] hover:bg-black/80'} shrink-0 text-white transition disabled:cursor-not-allowed disabled:opacity-45`}
                      disabled={uploadingClientDocument}
                      type="button"
                      onClick={() => clientDocumentInputRef.current?.click()}
                    >
                      {uploadingClientDocument ? (GUIDED_CLIENT_WORKSPACE ? 'Uploading…' : 'Uploading...') : GUIDED_CLIENT_WORKSPACE ? 'Upload file' : 'Upload Document'}
                    </button>
                  </div>

                  <div className="mt-5">
                    {clientDocumentsLoading && <div className="h-24 animate-pulse rounded-2xl bg-white/60" />}

                    {!clientDocumentsLoading && clientDocumentsError && (
                      <div className="rounded-2xl border border-red-200 bg-white px-5 py-5 text-sm text-red-600">
                        {clientDocumentsError}
                      </div>
                    )}

                    {!clientDocumentsLoading && !clientDocumentsError && clientDocuments.length === 0 && (
                      <div className="rounded-2xl bg-black/[0.035] px-5 py-8 text-center text-sm text-mute">
                        No files uploaded yet.
                      </div>
                    )}

                    {!clientDocumentsLoading && !clientDocumentsError && clientDocuments.length > 0 && (
                      <div className="grid gap-2">
                        {clientDocuments.map((document) => (
                          <article key={document.id} className="rounded-2xl border border-black/[0.065] bg-white/70 px-4 py-4 sm:px-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink" title={document.fileName}>{document.fileName}</p>
                                <p className="mt-1 text-xs text-mute">
                                  {formatFileSize(document.sizeBytes)} · Uploaded {formatTimestamp(document.createdAt)} by {document.uploadedByName}
                                </p>
                                <p className={`mt-1 text-xs ${isPackageEligibleDocument(document) ? 'text-emerald-700' : 'text-amber-700'}`}>
                                  {isPackageEligibleDocument(document)
                                    ? 'Available for the final package'
                                    : 'Supporting file only · upload a PDF, JPG, or PNG version to include it in the final package'}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <a className="premium-secondary inline-flex items-center px-4 py-2 text-sm text-ink" href={clientDocumentViewUrl(document)} rel="noreferrer" target="_blank">Open</a>
                                <button
                                  className="rounded-full px-3 py-2 text-sm text-mute transition hover:bg-red-50 hover:text-red-700 disabled:opacity-45"
                                  disabled={deletingClientDocumentId === document.id}
                                  type="button"
                                  onClick={() => void handleDeleteClientDocument(document)}
                                >
                                  {deletingClientDocumentId === document.id ? 'Deleting…' : 'Delete'}
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {workspaceToolsDrawerMode === 'pdf-fill' && (
                <section>
                  <div className={`${GUIDED_CLIENT_WORKSPACE ? '' : 'border-b border-line pb-5'} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
                    <div>
                      <p className={`${GUIDED_CLIENT_WORKSPACE ? 'hidden' : 'text-xs uppercase tracking-[0.2em] text-mute'}`}>
                        {GUIDED_CLIENT_WORKSPACE ? 'Separate document' : 'Direct PDF Fill'}
                      </p>
                      <h3 className={`${GUIDED_CLIENT_WORKSPACE ? 'text-xl font-semibold tracking-[-0.02em]' : 'mt-2 text-xl font-light'} text-ink`}>
                        {GUIDED_CLIENT_WORKSPACE ? 'Fill another PDF' : 'Upload any PDF for this client'}
                      </h3>
                      <p className={`${GUIDED_CLIENT_WORKSPACE ? 'mt-1' : 'mt-2'} text-sm text-mute`}>
                        {GUIDED_CLIENT_WORKSPACE
                          ? 'Use completed client information to suggest values automatically.'
                          : 'The PDF opens with client data filled from completed website forms.'}
                      </p>
                    </div>
                    <div
                      className={`flex min-w-[15rem] shrink-0 items-center justify-between gap-3 rounded-2xl border border-dashed px-3 py-2.5 transition ${
                        pdfFillDropActive
                          ? 'border-accent bg-blue-50'
                          : 'border-black/15 bg-white/55'
                      }`}
                      data-testid="pdf-fill-dropzone"
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setPdfFillDropActive(true);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'copy';
                        setPdfFillDropActive(true);
                      }}
                      onDragLeave={() => setPdfFillDropActive(false)}
                      onDrop={handlePdfFillDrop}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">
                          {pdfFillDropActive ? 'Release to upload' : 'Drag and drop PDF'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-mute">PDF only · 15 MB maximum</p>
                      </div>
                      <button
                        className={`${GUIDED_CLIENT_WORKSPACE ? 'premium-dark px-4 py-2 text-sm' : 'rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-[0.16em] hover:bg-black/80'} shrink-0 text-white transition disabled:cursor-not-allowed disabled:opacity-45`}
                        disabled={uploadingPdfFill}
                        type="button"
                        onClick={() => uploadInputRef.current?.click()}
                      >
                        {uploadingPdfFill
                          ? GUIDED_CLIENT_WORKSPACE ? 'Analyzing…' : 'Analyzing...'
                          : GUIDED_CLIENT_WORKSPACE ? 'Choose PDF' : 'Upload PDF'}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5">
                    {pdfFillsLoading && <div className="h-24 animate-pulse rounded-2xl bg-white/60" />}

                    {!pdfFillsLoading && pdfFills.length === 0 && (
                      <div className="rounded-2xl bg-black/[0.035] px-5 py-8 text-center text-sm text-mute">
                        {GUIDED_CLIENT_WORKSPACE ? 'No separately filled PDFs yet.' : 'No direct PDF fills yet.'}
                      </div>
                    )}

                    {!pdfFillsLoading && pdfFills.length > 0 && (
                      <div className="grid gap-3">
                        {pdfFills.map((fill) => {
                          const isAnalyzing = fill.status === 'ANALYZING';
                          const analysisStage = ANALYSIS_STAGES[fill.analysisStage ?? 'QUEUED'];
                          const actionLabel =
                            fill.status === 'ANALYSIS_FAILED'
                              ? 'Retry analysis'
                              : fill.status === 'GENERATED'
                                ? 'Edit PDF'
                                : 'Open editor';
                          return (
                            <div key={fill.id} className="rounded-2xl border border-black/[0.065] bg-white/70 px-4 py-4 sm:px-5">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-ink">
                                    {fill.fileName ?? 'Uploaded PDF'}
                                  </p>
                                  <p className="mt-1 text-xs text-mute">
                                    {fill.generatedAt
                                      ? `Generated ${formatTimestamp(fill.generatedAt)}`
                                      : isAnalyzing
                                        ? 'Analysis in progress'
                                        : `Updated ${formatTimestamp(fill.updatedAt)}`}
                                  </p>
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${
                                    fill.status === 'ANALYSIS_FAILED'
                                      ? 'bg-red-50 text-red-700'
                                      : fill.status === 'GENERATED'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-black/[0.045] text-mute'
                                  }`}
                                >
                                  {isAnalyzing ? 'Analyzing' : fill.status.replace('_', ' ')}
                                </span>
                              </div>

                              {isAnalyzing && (
                                <div className="mt-4 rounded-xl bg-fog px-3.5 py-3">
                                  <div className="flex items-center justify-between gap-4 text-xs">
                                    <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                                      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" />
                                      <span className="truncate">{analysisStage.label}</span>
                                    </span>
                                    <span className="shrink-0 text-mute">Step {analysisStage.step} of 5</span>
                                  </div>
                                  <div
                                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10"
                                    role="progressbar"
                                    aria-label="PDF analysis progress"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={analysisStage.progress}
                                  >
                                    <div
                                      className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
                                      style={{ width: `${analysisStage.progress}%` }}
                                    />
                                  </div>
                                  <p className="mt-2 text-[11px] text-mute">
                                    {formatElapsedTime(fill.analysisStartedAt, processingClock)} · You can leave this drawer
                                  </p>
                                </div>
                              )}

                              {fill.analysisError && (
                                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                                  {fill.analysisError}
                                </p>
                              )}

                              {fill.warningCount > 0 && !isAnalyzing && (
                                <p className="mt-3 text-xs text-amber-700">
                                  {fill.warningCount} field{fill.warningCount === 1 ? '' : 's'} need review
                                </p>
                              )}

                              <div className="mt-4 flex items-center justify-between gap-3">
                                {isAnalyzing ? (
                                  <span className="text-xs text-mute">We’ll refresh this automatically.</span>
                                ) : (
                                  <button
                                    aria-label={`${actionLabel}: ${fill.fileName ?? 'Uploaded PDF'}`}
                                    className="premium-dark px-4 py-2 text-sm text-white disabled:opacity-45"
                                    disabled={pdfFillActionId === fill.id}
                                    type="button"
                                    onClick={() => void handleDirectPdfFillAction(fill)}
                                  >
                                    {pdfFillActionId === fill.id ? 'Starting…' : actionLabel}
                                  </button>
                                )}
                                <button
                                  className="text-xs text-mute underline decoration-line underline-offset-4 transition hover:text-red-700 disabled:opacity-45"
                                  disabled={deletingPdfFillId === fill.id || isAnalyzing}
                                  type="button"
                                  onClick={() => void handleDeletePdfFill(fill)}
                                >
                                  {deletingPdfFillId === fill.id ? 'Deleting…' : 'Delete'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {workspaceToolsDrawerMode === 'ticket' && (
                <section>
                  <div className={`${GUIDED_CLIENT_WORKSPACE ? '' : 'border-b border-line pb-5'} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
                    <div>
                      <p className={`${GUIDED_CLIENT_WORKSPACE ? 'hidden' : 'text-xs uppercase tracking-[0.2em] text-mute'}`}>
                        {GUIDED_CLIENT_WORKSPACE ? 'Final package' : 'DocuSign Ticket'}
                      </p>
                      <h3 className={`${GUIDED_CLIENT_WORKSPACE ? 'text-xl font-semibold tracking-[-0.02em]' : 'mt-2 text-xl font-light'} text-ink`}>
                        {GUIDED_CLIENT_WORKSPACE ? 'Build final package' : 'Create ticket package'}
                      </h3>
                      <p className={`${GUIDED_CLIENT_WORKSPACE ? 'mt-1' : 'mt-2'} text-sm text-mute`}>
                        {GUIDED_CLIENT_WORKSPACE
                          ? 'Select ready documents, review their order, and download one combined PDF.'
                          : 'Select generated PDFs and download one merged PDF for this client.'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                      <button
                        className={`${GUIDED_CLIENT_WORKSPACE ? 'premium-secondary px-4 py-2.5 text-sm' : 'rounded-full border border-line px-4 py-3 text-xs uppercase tracking-[0.16em] hover:border-black'} text-ink transition disabled:cursor-not-allowed disabled:opacity-45`}
                        disabled={allSelectableTicketPdfCount === 0}
                        type="button"
                        onClick={handleToggleAllTicketPdfs}
                      >
                        {allTicketPdfsSelected
                          ? GUIDED_CLIENT_WORKSPACE ? 'Clear selection' : 'Clear'
                          : GUIDED_CLIENT_WORKSPACE ? 'Select all' : 'Select All'}
                      </button>
                      <button
                        className={`${GUIDED_CLIENT_WORKSPACE ? 'premium-dark px-5 py-2.5 text-sm' : 'rounded-full bg-ink px-5 py-3 text-xs uppercase tracking-[0.16em] hover:bg-black/80'} text-white transition disabled:cursor-not-allowed disabled:opacity-45`}
                        disabled={selectedTicketPdfCount === 0 || creatingTicket}
                        type="button"
                        onClick={handleOpenTicketOrderDialog}
                      >
                        {creatingTicket
                          ? 'Creating...'
                          : GUIDED_CLIENT_WORKSPACE
                            ? `Review package (${selectedTicketPdfCount})`
                            : `Create Ticket (${selectedTicketPdfCount})`}
                      </button>
                    </div>
                  </div>

                  <div className="mt-5">
                    {ticketPdfsLoading && <div className="h-24 animate-pulse rounded-2xl bg-white/60" />}

                    {!ticketPdfsLoading && ticketPdfsError && (
                      <div className="border border-red-200 bg-white px-5 py-5 text-sm text-red-600">
                        {ticketPdfsError}
                      </div>
                    )}

                    {!ticketPdfsLoading && !ticketPdfsError && ticketPdfs.length === 0 && ticketDocuments.length === 0 && ticketPairs.length === 0 && (
                      <div className="rounded-2xl bg-black/[0.035] px-5 py-8 text-center text-sm text-mute">
                        No generated PDFs available yet.
                      </div>
                    )}

                    {!ticketPdfsLoading && !ticketPdfsError && (
                      <div className="grid gap-3">
                        {intakeTicketDocuments.length > 0 && (
                          <details className="overflow-hidden rounded-2xl border border-black/[0.065] bg-white/70">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                              <span><span className="block text-sm font-medium text-ink">Documents uploaded during intake</span><span className="mt-1 block text-xs text-mute">Government IDs and files supplied inside forms</span></span>
                              <span className="text-xs text-mute">{intakeTicketDocuments.length} file{intakeTicketDocuments.length === 1 ? '' : 's'} ▾</span>
                            </summary>
                            {renderTicketDocumentRows(intakeTicketDocuments)}
                          </details>
                        )}

                        {drawerTicketDocuments.length > 0 && (
                          <details className="overflow-hidden rounded-2xl border border-black/[0.065] bg-white/70">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                              <span><span className="block text-sm font-medium text-ink">Files uploaded from Documents</span><span className="mt-1 block text-xs text-mute">Original files added through the Documents drawer</span></span>
                              <span className="text-xs text-mute">{drawerTicketDocuments.length} file{drawerTicketDocuments.length === 1 ? '' : 's'} ▾</span>
                            </summary>
                            {renderTicketDocumentRows(drawerTicketDocuments)}
                          </details>
                        )}

                        {directFillTicketPdfs.length > 0 && (
                          <details className="overflow-hidden rounded-2xl border border-black/[0.065] bg-white/70">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                              <span><span className="block text-sm font-medium text-ink">AI-filled uploaded PDFs</span><span className="mt-1 block text-xs text-mute">Documents uploaded through Fill a PDF</span></span>
                              <span className="text-xs text-mute">{directFillTicketPdfs.length} PDF{directFillTicketPdfs.length === 1 ? '' : 's'} ▾</span>
                            </summary>
                            {renderTicketPdfRows(directFillTicketPdfs)}
                          </details>
                        )}

                        {generatedFormGroups.map((group) => (
                          <details key={group.code} className="overflow-hidden rounded-2xl border border-black/[0.065] bg-white/70">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                              <span><span className="block text-sm font-medium text-ink">{group.title}</span><span className="mt-1 block text-xs text-mute">Generated form PDFs</span></span>
                              <span className="text-xs text-mute">{group.pdfs.length} PDF{group.pdfs.length === 1 ? '' : 's'} ▾</span>
                            </summary>
                            {renderTicketPdfRows(group.pdfs)}
                          </details>
                        ))}

                        {ticketPairs.length > 0 && (
                          <details className="overflow-hidden rounded-2xl border border-black/[0.065] bg-white/70">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                              <span><span className="block text-sm font-medium text-ink">Subscription agreements and disclosures</span><span className="mt-1 block text-xs text-mute">Choose either document separately for each investment</span></span>
                              <span className="text-xs text-mute">{ticketPairs.length} investment{ticketPairs.length === 1 ? '' : 's'} ▾</span>
                            </summary>
                            <div className="grid gap-2 border-t border-black/[0.055] p-3">
                              {ticketPairs.map((pair) => (
                                <details key={pair.investmentId} className="overflow-hidden rounded-xl border border-line bg-white">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                                    <span className="truncate text-sm font-medium text-ink">{pair.position}. {pair.name}</span>
                                    <span className="text-xs text-mute">{Number(Boolean(pair.baiodfPdf)) + Number(Boolean(pair.agreementPdf))} of 2 ready ▾</span>
                                  </summary>
                                  <div className="divide-y divide-line border-t border-line">
                                    <div className="flex items-center gap-3 px-4 py-3">
                                      <input aria-label={`Select ${pair.name} brokerage alternative disclosure`} checked={selectedTicketInvestmentDocumentKeys.has(investmentDocumentKey('investment-baiodf', pair.investmentId))} disabled={!pair.baiodfPdf} type="checkbox" onChange={() => handleToggleTicketInvestmentDocument('investment-baiodf', pair.investmentId)} />
                                      <div className="min-w-0 flex-1"><p className="text-sm text-ink">Brokerage Alternative Investment Order and Disclosure Form</p><p className="mt-1 text-xs text-mute">{pair.baiodfPdf ? 'PDF ready' : 'PDF not generated'}</p></div>
                                      {pair.baiodfPdf && <a className="text-xs text-mute underline underline-offset-4" href={generatedPdfViewUrl(pair.baiodfPdf)} target="_blank" rel="noreferrer">Open</a>}
                                      {pair.baiodfPdf && <button className="text-xs text-mute underline underline-offset-4 hover:text-red-700" type="button" onClick={() => void handleDeleteGeneratedPdf(pair.baiodfPdf!.id, `${pair.name} disclosure PDF`)}>Delete</button>}
                                    </div>
                                    <div className="flex items-center gap-3 px-4 py-3">
                                      <input aria-label={`Select ${pair.name} subscription agreement`} checked={selectedTicketInvestmentDocumentKeys.has(investmentDocumentKey('investment-agreement', pair.investmentId))} disabled={!pair.agreementPdf} type="checkbox" onChange={() => handleToggleTicketInvestmentDocument('investment-agreement', pair.investmentId)} />
                                      <div className="min-w-0 flex-1"><p className="text-sm text-ink">Subscription agreement</p><p className="mt-1 text-xs text-mute">{pair.agreementPdf ? pair.agreement?.fileName ?? 'PDF ready' : 'PDF not generated'}</p></div>
                                      {pair.agreementPdf && <a className="text-xs text-mute underline underline-offset-4" href={generatedPdfViewUrl(pair.agreementPdf)} target="_blank" rel="noreferrer">Open</a>}
                                      {pair.agreementPdf && <button className="text-xs text-mute underline underline-offset-4 hover:text-red-700" type="button" onClick={() => void handleDeleteGeneratedPdf(pair.agreementPdf!.id, `${pair.name} subscription agreement`)}>Delete</button>}
                                    </div>
                                  </div>
                                </details>
                              ))}
                            </div>
                          </details>
                        )}

                        {clientDocuments.some((document) => !isPackageEligibleDocument(document)) && (
                          <details className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm text-amber-900">
                              Supporting files not eligible for a PDF package <span className="text-xs">▾</span>
                            </summary>
                            <div className="divide-y divide-amber-200 border-t border-amber-200">
                              {clientDocuments.filter((document) => !isPackageEligibleDocument(document)).map((document) => (
                                <div key={document.id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm text-ink">{document.fileName}</p><p className="mt-1 text-xs text-amber-800">Upload a PDF, JPG, or PNG version to include it.</p></div><a className="text-xs text-mute underline underline-offset-4" href={clientDocumentViewUrl(document)} target="_blank" rel="noreferrer">Open</a></div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </aside>
        </div>
      )}

      {ticketOrderDialogOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-end bg-black/35 p-3 sm:items-center sm:justify-center sm:p-6"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !creatingTicket) setTicketOrderDialogOpen(false);
          }}
        >
          <section
            aria-labelledby="ticket-order-title"
            aria-modal="true"
            className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-paper shadow-panel"
            role="dialog"
          >
            <div className="border-b border-line px-5 py-5 sm:px-6">
              <p className="text-xs uppercase tracking-[0.2em] text-mute">Ticket order</p>
              <h2 id="ticket-order-title" className="mt-2 text-xl font-medium text-ink">Arrange package</h2>
              <p className="mt-2 text-sm text-mute">
                Drag each selected document into the final sequence. Investment disclosures and subscription agreements can be arranged independently.
              </p>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-4 sm:p-5">
              <div className="grid gap-2">
                {ticketOrderItems.map((item, index) => (
                  <div
                    key={item.key}
                    aria-grabbed={draggedTicketOrderKey === item.key}
                    className={`flex cursor-grab items-center gap-3 rounded-xl border bg-white px-3 py-3 transition active:cursor-grabbing ${
                      draggedTicketOrderKey === item.key
                        ? 'border-accent/40 bg-blue-50 opacity-70 shadow-sm'
                        : 'border-line hover:border-black/20'
                    }`}
                    data-testid={`ticket-order-item-${item.key}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', item.key);
                      draggedTicketOrderKeyRef.current = item.key;
                      setDraggedTicketOrderKey(item.key);
                    }}
                    onDragEnter={(event) => handleTicketOrderDragEnter(event, item.key)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(event) => handleTicketOrderDrop(event, item.key)}
                    onDragEnd={() => {
                      draggedTicketOrderKeyRef.current = null;
                      setDraggedTicketOrderKey(null);
                    }}
                  >
                    <button
                      aria-label={`Reorder ${item.title}. Use arrow keys or drag.`}
                      className="select-none px-1 py-2 text-base leading-none text-mute hover:text-ink"
                      draggable={false}
                      type="button"
                      onKeyDown={(event) => {
                        handleTicketOrderKeyboardMove(event, item.key, -1);
                        handleTicketOrderKeyboardMove(event, item.key, 1);
                      }}
                    >
                      ⠿
                    </button>
                    <span className="w-5 text-center text-xs text-mute">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                      <p className="mt-1 text-xs text-mute">{item.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-mute">
                      {item.pdfCount} PDF{item.pdfCount === 1 ? '' : 's'}
                    </span>
                    <div className="flex shrink-0 items-center gap-1" aria-label={`Move ${item.title}`}>
                      <button
                        aria-label={`Move ${item.title} up`}
                        className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-mute transition hover:border-black/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        disabled={index === 0}
                        draggable={false}
                        type="button"
                        onClick={() => handleTicketOrderMove(item.key, -1)}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${item.title} down`}
                        className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-mute transition hover:border-black/20 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                        disabled={index === ticketOrderItems.length - 1}
                        draggable={false}
                        type="button"
                        onClick={() => handleTicketOrderMove(item.key, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                className="rounded-xl border border-line px-4 py-2.5 text-sm text-ink transition hover:border-black disabled:opacity-45"
                disabled={creatingTicket}
                type="button"
                onClick={() => setTicketOrderDialogOpen(false)}
              >
                Back
              </button>
              <button
                className="rounded-xl bg-ink px-4 py-2.5 text-sm text-white transition hover:bg-black/80 disabled:opacity-45"
                disabled={creatingTicket || ticketOrderItems.length === 0}
                type="button"
                onClick={() => void handleCreateTicket()}
              >
                {creatingTicket ? 'Creating…' : `Create ticket (${selectedTicketPdfCount})`}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
