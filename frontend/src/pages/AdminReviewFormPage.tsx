import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

import {
  getAdminForm,
  getIngestionJob,
  getPdfMap,
  publishAdminForm,
  savePdfMap,
  startReanalyzeFormJob,
  templateUrlFor,
  updateAdminForm
} from '../api/adminForms';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  AdminFormDetail,
  AdminIngestionJob,
  PdfMapPage,
  PdfMapResponse,
  PdfMapVariable,
  PdfMappingRect,
  PdfMappingTarget,
  PdfValueFormat,
  SkippedSignatureField,
  V2Schema
} from '../types/api';

const reanalyzeJobKey = (id: string): string => `taxalpha.reanalyzeJob.${id}`;
const FORMAT_OPTIONS: Array<{ value: PdfValueFormat; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'currency', label: 'Currency' },
  { value: 'phone', label: 'Phone' },
  { value: 'tin', label: 'TIN' },
  { value: 'ssn', label: 'SSN' }
];

function newJobId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function displayPercent(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0%';
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function confidenceLabel(confidence: number | null | undefined): string | null {
  if (typeof confidence !== 'number') return null;
  return `${Math.round(confidence * 100)}%`;
}

function groupBy<T>(items: T[], keyFor: (item: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function rectStyle(page: PdfMapPage, rect: PdfMappingRect): CSSProperties {
  return {
    left: `${rect.x}px`,
    top: `${page.height - rect.y - rect.height}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  };
}

function variableLabel(variable?: PdfMapVariable): string {
  if (!variable) return 'Unmapped';
  return variable.description ? `${variable.label} (${variable.description})` : variable.label;
}

function variableSourceLabel(variable?: PdfMapVariable): string {
  if (!variable) return 'Unmapped';
  if (variable.source === 'fact') return 'Smart fact';
  return 'Client data';
}

function dragVariableKey(event: DragEvent): string | null {
  return event.dataTransfer.getData('application/x-taxalpha-variable') || event.dataTransfer.getData('text/plain') || null;
}

function PdfPageCanvas({
  doc,
  page,
  children
}: {
  doc: PDFDocumentProxy;
  page: PdfMapPage;
  children: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      const pdfPage = await doc.getPage(page.page);
      const scale = window.devicePixelRatio || 1;
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${page.width}px`;
      canvas.style.height = `${page.height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [doc, page.height, page.page, page.width]);

  return (
    <div className="relative bg-white shadow-panel" style={{ width: page.width, height: page.height }}>
      <canvas ref={canvasRef} className="absolute inset-0" aria-label={`PDF page ${page.page}`} />
      {children}
    </div>
  );
}

export function AdminReviewFormPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [form, setForm] = useState<AdminFormDetail | null>(null);
  const [schema, setSchema] = useState<V2Schema | null>(null);
  const [title, setTitle] = useState('');
  const [pdfMap, setPdfMap] = useState<PdfMapResponse | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [variableSearch, setVariableSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [analysisHint, setAnalysisHint] = useState('');
  const [deepAnalyze, setDeepAnalyze] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{ percent: number; label: string } | null>(null);
  const reanalyzePollTimerRef = useRef<number | null>(null);

  const clearReanalyzePollTimer = useCallback(() => {
    if (reanalyzePollTimerRef.current !== null) {
      window.clearTimeout(reanalyzePollTimerRef.current);
      reanalyzePollTimerRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, map] = await Promise.all([getAdminForm(id), getPdfMap(id)]);
      setForm(detail);
      setSchema({ ...detail.schema!, mappingLayout: map.mappingLayout });
      setTitle(detail.title);
      setPdfMap(map);
      setSelectedTargetId(map.mappingLayout.targets[0]?.id ?? null);
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 401) {
        await signOut();
        navigate('/signin', { replace: true });
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Unable to load this form.');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const templateUrl = useMemo(() => templateUrlFor(id), [id]);

  useEffect(() => {
    if (!templateUrl || !pdfMap) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    const loadPdf = async () => {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      if (cancelled) return;
      task = pdfjsLib.getDocument({ url: templateUrl, withCredentials: true });
      try {
        const doc = await task.promise;
        if (cancelled) {
          void doc.cleanup();
          return;
        }
        setPdfDoc(doc);
      } catch {
        if (!cancelled) setError('Unable to render the stored PDF.');
      }
    };
    void loadPdf();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [pdfMap, templateUrl]);

  useEffect(() => () => {
    if (pdfDoc) void pdfDoc.cleanup();
  }, [pdfDoc]);

  const mappingLayout = schema?.mappingLayout ?? { version: 1, targets: [] };
  const targets = mappingLayout.targets;
  const variables = pdfMap?.variables ?? [];
  const variableByKey = useMemo(() => new Map(variables.map((variable) => [variable.key, variable])), [variables]);
  const selectedTarget = targets.find((target) => target.id === selectedTargetId) ?? null;
  const selectedVariable = selectedTarget?.variableKey ? variableByKey.get(selectedTarget.variableKey) : undefined;
  const mappedCount = targets.filter((target) => target.variableKey && !target.ignoredReason).length;
  const needsReviewCount = targets.filter((target) => !target.variableKey && !target.ignoredReason).length;
  const mappedPercent = targets.length === 0 ? 100 : Math.round((mappedCount / targets.length) * 1000) / 10;

  const variableSections = useMemo(() => {
    const q = variableSearch.trim().toLowerCase();
    const filtered = q
      ? variables.filter((variable) =>
          `${variable.label} ${variable.group} ${variable.description ?? ''} ${variable.sourceForms?.join(' ') ?? ''}`.toLowerCase().includes(q)
        )
      : variables;
    const clientData = filtered.filter((variable) => variable.source !== 'fact');
    const facts = filtered.filter((variable) => variable.source === 'fact');
    return [
      { title: 'Client Data', variables: clientData, groups: groupBy(clientData, (variable) => variable.group) },
      { title: 'Smart Facts', variables: facts, groups: groupBy(facts, (variable) => variable.group) }
    ].filter((section) => section.variables.length > 0);
  }, [variableSearch, variables]);

  const targetsByPage = useMemo(() => groupBy(targets, (target) => String(target.page)), [targets]);
  const targetPageMap = useMemo(() => new Map(targetsByPage), [targetsByPage]);
  const signaturesByPage = useMemo(
    () => groupBy(pdfMap?.skippedSignatureFields ?? [], (field) => String(field.page)),
    [pdfMap?.skippedSignatureFields]
  );
  const signaturePageMap = useMemo(() => new Map(signaturesByPage), [signaturesByPage]);

  const setMappingLayout = useCallback((updater: (targets: PdfMappingTarget[]) => PdfMappingTarget[]) => {
    setSchema((prev) => {
      if (!prev) return prev;
      return { ...prev, mappingLayout: { version: 1, targets: updater(prev.mappingLayout?.targets ?? []) } };
    });
  }, []);

  const updateTarget = useCallback(
    (targetId: string, patch: Partial<PdfMappingTarget>) => {
      setMappingLayout((current) => current.map((target) => (target.id === targetId ? { ...target, ...patch } : target)));
    },
    [setMappingLayout]
  );

  const bindTarget = useCallback(
    (targetId: string, variableKey: string) => {
      const variable = variableByKey.get(variableKey);
      updateTarget(targetId, {
        variableKey,
        format: variable?.format ?? 'text',
        source: 'admin',
        ignoredReason: undefined
      });
      setSelectedTargetId(targetId);
    },
    [updateTarget, variableByKey]
  );

  const createOverlay = useCallback(
    (page: PdfMapPage, event: DragEvent<HTMLDivElement>) => {
      const variableKey = dragVariableKey(event);
      if (!variableKey) return;
      event.preventDefault();
      const variable = variableByKey.get(variableKey);
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(page.width - 140, event.clientX - bounds.left));
      const yFromTop = Math.max(0, Math.min(page.height - 22, event.clientY - bounds.top));
      const target: PdfMappingTarget = {
        id: `overlay:${Date.now()}:${Math.random().toString(36).slice(2)}`,
        kind: 'overlay',
        page: page.page,
        rect: { x, y: page.height - yFromTop - 18, width: 160, height: 18 },
        widgetType: 'text',
        variableKey,
        format: variable?.format ?? 'text',
        source: 'admin'
      };
      setMappingLayout((current) => [...current, target]);
      setSelectedTargetId(target.id);
    },
    [setMappingLayout, variableByKey]
  );

  const removeOverlay = useCallback(
    (targetId: string) => {
      setMappingLayout((current) => current.filter((target) => target.id !== targetId || target.kind !== 'overlay'));
      setSelectedTargetId(null);
    },
    [setMappingLayout]
  );

  const persistDraft = useCallback(
    async (quiet = false) => {
      if (!schema) return;
      setSaving(true);
      try {
        const nextSchema = { ...schema, mappingLayout };
        await updateAdminForm(id, { title, schema: nextSchema });
        const saved = await savePdfMap(id, mappingLayout);
        setSchema((prev) => (prev ? { ...prev, mappingLayout: saved } : prev));
        if (!quiet) pushToast('Saved PDF mapping.');
      } catch (e) {
        pushToast(e instanceof ApiError ? e.message : 'Save failed.', 'error');
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [id, mappingLayout, pushToast, schema, title]
  );

  const publish = async () => {
    setPublishing(true);
    try {
      await persistDraft(true);
      await publishAdminForm(id);
      pushToast('Form published.');
      navigate('/admin/forms');
    } catch (e) {
      if (e instanceof ApiError) pushToast(e.message, 'error');
    } finally {
      setPublishing(false);
    }
  };

  const finishReanalyzeJob = useCallback(
    async (job: AdminIngestionJob) => {
      window.localStorage.removeItem(reanalyzeJobKey(id));
      clearReanalyzePollTimer();
      setReanalyzing(false);
      setReanalyzeProgress({ percent: 100, label: job.label || 'Mapping refresh complete' });
      const result = job.result as { stats?: { mapped?: number; totalFields?: number; mappedPercent?: number } } | undefined;
      const stats = result?.stats;
      if (stats?.mapped !== undefined && stats.totalFields !== undefined) {
        pushToast(`Re-analyzed: ${displayPercent(stats.mappedPercent)} mapped (${stats.mapped}/${stats.totalFields}) fields.`);
      } else {
        pushToast('Mapping refresh complete.');
      }
      await load();
    },
    [clearReanalyzePollTimer, id, load, pushToast]
  );

  const pollReanalyzeJob = useCallback(
    async (jobId: string) => {
      try {
        const job = await getIngestionJob(jobId);
        setReanalyzing(job.status === 'RUNNING' || job.status === 'QUEUED');
        setReanalyzeProgress({ percent: job.percent, label: job.label });
        if (job.status === 'COMPLETED') {
          await finishReanalyzeJob(job);
          return;
        }
        if (job.status === 'FAILED') {
          window.localStorage.removeItem(reanalyzeJobKey(id));
          clearReanalyzePollTimer();
          setReanalyzing(false);
          pushToast(job.error ?? 'Reanalyze failed.', 'error');
          return;
        }
        reanalyzePollTimerRef.current = window.setTimeout(() => void pollReanalyzeJob(jobId), 1500);
      } catch (pollError) {
        window.localStorage.removeItem(reanalyzeJobKey(id));
        clearReanalyzePollTimer();
        setReanalyzing(false);
        setReanalyzeProgress(null);
        pushToast(
          pollError instanceof ApiError && pollError.statusCode === 404
            ? 'The mapping refresh job is no longer available. Start it again if needed.'
            : 'Unable to reconnect to mapping refresh.',
          'error'
        );
      }
    },
    [clearReanalyzePollTimer, finishReanalyzeJob, id, pushToast]
  );

  useEffect(() => {
    const activeJobId = window.localStorage.getItem(reanalyzeJobKey(id));
    if (activeJobId) {
      setReanalyzing(true);
      setReanalyzeProgress({ percent: 35, label: 'Reconnecting to AI mapping refresh...' });
      void pollReanalyzeJob(activeJobId);
    }
    return clearReanalyzePollTimer;
  }, [clearReanalyzePollTimer, id, pollReanalyzeJob]);

  const reanalyze = async () => {
    clearReanalyzePollTimer();
    const jobId = newJobId();
    window.localStorage.setItem(reanalyzeJobKey(id), jobId);
    setReanalyzing(true);
    setReanalyzeProgress({ percent: 5, label: 'Preparing AI mapping refresh' });
    try {
      const job = await startReanalyzeFormJob(id, jobId, { hint: analysisHint.trim() || title, vision: deepAnalyze });
      setReanalyzeProgress({ percent: job.percent, label: job.label });
      void pollReanalyzeJob(job.id);
    } catch (e) {
      window.localStorage.removeItem(reanalyzeJobKey(id));
      pushToast(e instanceof ApiError ? e.message : 'Reanalyze failed.', 'error');
      setReanalyzeProgress(null);
      setReanalyzing(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-fog px-4 py-8">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-28 animate-pulse rounded-2xl bg-paper" />
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="h-96 animate-pulse rounded-2xl bg-paper" />
            <div className="h-96 animate-pulse rounded-2xl bg-paper" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !form || !schema || !pdfMap) {
    return (
      <main className="min-h-screen bg-fog px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">
          {error ?? 'This form has no PDF mapping data to review.'}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-fog px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="border border-black/10 bg-paper px-5 py-5 shadow-hairline">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-72 flex-1">
              <p className="text-xs uppercase tracking-[0.16em] text-mute">
                Visual PDF mapping · {form.status === 'PUBLISHED' ? 'Live' : 'Draft'}
              </p>
              <label className="mt-1 block text-xs text-mute">
                Form name
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full border border-line bg-paper px-3 py-2 text-2xl font-light tracking-tight text-ink outline-none focus:border-accent"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-mute">
                <span>{form.code}</span>
                <a href={templateUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                  View original PDF
                </a>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate('/admin/forms')} className="border border-line px-4 py-2 text-sm text-ink transition hover:border-accent">
                Back
              </button>
              <button type="button" onClick={() => void reanalyze()} disabled={reanalyzing} className="border border-line px-4 py-2 text-sm text-ink transition hover:border-accent disabled:opacity-50">
                {reanalyzing ? 'Refreshing...' : 'Refresh AI map'}
              </button>
              <button type="button" onClick={() => void persistDraft()} disabled={saving} className="border border-accent px-4 py-2 text-sm text-accent transition hover:bg-accentSoft disabled:opacity-50">
                {saving ? 'Saving...' : 'Save draft'}
              </button>
              <button type="button" onClick={() => void publish()} disabled={publishing} className="bg-accent px-4 py-2 text-sm text-white transition hover:bg-accent/90 disabled:opacity-50">
                {publishing ? 'Publishing...' : 'Publish mapping'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <div className="border border-line bg-fog px-3 py-2">
              <p className="text-xs text-mute">Mapped</p>
              <p className="font-medium text-ink">{displayPercent(mappedPercent)}</p>
            </div>
            <div className="border border-line bg-fog px-3 py-2">
              <p className="text-xs text-mute">Editable targets</p>
              <p className="font-medium text-ink">{targets.length}</p>
            </div>
            <div className="border border-line bg-fog px-3 py-2">
              <p className="text-xs text-mute">Needs review</p>
              <p className="font-medium text-ink">{needsReviewCount}</p>
            </div>
            <div className="border border-line bg-fog px-3 py-2">
              <p className="text-xs text-mute">Manual overlays</p>
              <p className="font-medium text-ink">{targets.filter((target) => target.kind === 'overlay').length}</p>
            </div>
            <div className="border border-line bg-fog px-3 py-2">
              <p className="text-xs text-mute">Signatures skipped</p>
              <p className="font-medium text-ink">{pdfMap.skippedSignatureFields.length}</p>
            </div>
          </div>
        </header>

        <section className="mt-4 border border-line bg-paper p-4 shadow-hairline">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-medium text-ink">Refresh variable suggestions</h2>
              <p className="mt-1 text-sm text-mute">Rerun AI mapping on the stored PDF when the document needs better context.</p>
            </div>
            <label className="flex items-center gap-2 border border-line px-3 py-2 text-sm text-mute">
              <input type="checkbox" checked={deepAnalyze} onChange={(e) => setDeepAnalyze(e.target.checked)} />
              Deep visual analysis
            </label>
          </div>
          <textarea
            value={analysisHint}
            onChange={(e) => setAnalysisHint(e.target.value)}
            placeholder="Example: This is a subscription agreement. Ignore broker-only boxes. Map investor identity and subscription amount from client data."
            className="mt-3 min-h-20 w-full border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
          {reanalyzeProgress && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-mute">
                <span>{reanalyzeProgress.label}</span>
                <span>{Math.round(reanalyzeProgress.percent)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden bg-fog">
                <div className="h-full bg-accent transition-all duration-500" style={{ width: `${Math.max(1, Math.min(100, reanalyzeProgress.percent))}%` }} />
              </div>
            </div>
          )}
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
          <aside className="min-h-[640px] border border-line bg-paper p-4 shadow-hairline lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium text-ink">Variables & facts</h2>
              <span className="text-xs text-mute">{variables.length}</span>
            </div>
            <input
              value={variableSearch}
              onChange={(e) => setVariableSearch(e.target.value)}
              placeholder="Search variables or facts"
              className="mt-3 w-full border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <div className="mt-4 space-y-4">
              {variableSections.map((section) => (
                <div key={section.title} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink">{section.title}</p>
                    <span className="text-xs text-mute">{section.variables.length}</span>
                  </div>
                  <div className="space-y-4">
                    {section.groups.map(([group, groupVariables]) => (
                      <div key={group}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-mute">{group.replace(/^Smart Facts: /, '')}</p>
                        <div className="space-y-2">
                          {groupVariables.map((variable) => (
                            <button
                              key={variable.key}
                              type="button"
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.setData('application/x-taxalpha-variable', variable.key);
                                event.dataTransfer.setData('text/plain', variable.key);
                              }}
                              className={`w-full border px-3 py-2 text-left text-sm text-ink transition hover:border-accent hover:bg-accentSoft ${
                                variable.source === 'fact' ? 'border-blue-200 bg-blue-50/70' : 'border-line bg-white'
                              }`}
                              title={variable.description ?? variable.key}
                            >
                              <span className="flex items-start justify-between gap-2">
                                <span className="font-medium">{variable.label}</span>
                                {variable.source === 'fact' && (
                                  <span className="shrink-0 border border-blue-300 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-blue-700">
                                    Fact
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block text-xs text-mute">{variable.description ?? variable.key}</span>
                              {variable.source === 'fact' && (
                                <span className="mt-2 flex flex-wrap gap-1 text-[10px] uppercase tracking-[0.12em]">
                                  {variable.reviewSensitive && <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-700">Review</span>}
                                  {variable.sourceForms?.map((sourceForm) => (
                                    <span key={sourceForm} className="border border-line bg-white px-1.5 py-0.5 text-mute">{sourceForm}</span>
                                  ))}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <div className="min-w-0 overflow-auto border border-line bg-[#e7e5df] p-4 shadow-hairline">
            {!pdfDoc && <div className="border border-line bg-paper px-4 py-3 text-sm text-mute">Rendering PDF...</div>}
            {pdfDoc && (
              <div className="space-y-6">
                {pdfMap.pages.map((page) => (
                  <div key={page.page} className="mx-auto w-max">
                    <div className="mb-2 flex items-center justify-between text-xs text-mute">
                      <span>Page {page.page}</span>
                      <span>Drop a variable on an empty place to create a text overlay.</span>
                    </div>
                    <div
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => createOverlay(page, event)}
                    >
                      <PdfPageCanvas doc={pdfDoc} page={page}>
                        {(targetPageMap.get(String(page.page)) ?? []).map((target) => {
                          const variable = target.variableKey ? variableByKey.get(target.variableKey) : undefined;
                          const selected = target.id === selectedTargetId;
                          const smartFact = variable?.source === 'fact';
                          return (
                            <button
                              key={target.id}
                              type="button"
                              onClick={() => setSelectedTargetId(target.id)}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                const variableKey = dragVariableKey(event);
                                if (variableKey) bindTarget(target.id, variableKey);
                              }}
                              className={`absolute overflow-hidden border px-1 text-left text-[10px] leading-tight transition ${
                                selected
                                  ? 'border-accent bg-accent/20 ring-2 ring-accent'
                                  : target.variableKey && smartFact
                                    ? 'border-blue-500 bg-blue-400/20 hover:bg-blue-400/30'
                                    : target.variableKey
                                    ? 'border-emerald-500 bg-emerald-400/20 hover:bg-emerald-400/30'
                                    : 'border-amber-500 bg-amber-300/25 hover:bg-amber-300/40'
                              }`}
                              style={rectStyle(page, target.rect)}
                              title={variableLabel(variable)}
                            >
                              <span className="block truncate">{variable?.label ?? 'Drop variable'}</span>
                            </button>
                          );
                        })}
                        {(signaturePageMap.get(String(page.page)) ?? []).map((field: SkippedSignatureField) => (
                          <div
                            key={field.id}
                            className="absolute border border-dashed border-neutral-500 bg-neutral-400/20 px-1 text-[10px] leading-tight text-neutral-700"
                            style={rectStyle(page, field.rect)}
                            title="Signature skipped for now"
                          >
                            signature skipped
                          </div>
                        ))}
                      </PdfPageCanvas>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="min-h-[640px] border border-line bg-paper p-4 shadow-hairline lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">
            <h2 className="text-base font-medium text-ink">Selected target</h2>
            {!selectedTarget && <p className="mt-3 border border-line bg-fog px-3 py-3 text-sm text-mute">Select a PDF field or drop a variable onto the PDF.</p>}
            {selectedTarget && (
              <div className="mt-4 space-y-4">
                <div className="border border-line bg-fog px-3 py-3 text-sm">
                  <p className="font-medium text-ink">{selectedTarget.kind === 'overlay' ? 'Manual overlay' : selectedTarget.pdfField}</p>
                  <p className="mt-1 text-xs text-mute">Page {selectedTarget.page} · {selectedTarget.widgetType}</p>
                  {confidenceLabel(selectedTarget.confidence) && <p className="mt-1 text-xs text-mute">AI confidence {confidenceLabel(selectedTarget.confidence)}</p>}
                </div>

                <label className="block text-xs font-medium uppercase tracking-[0.12em] text-mute">
                  Variable
                  <select
                    value={selectedTarget.variableKey ?? ''}
                    onChange={(event) => {
                      if (event.target.value) bindTarget(selectedTarget.id, event.target.value);
                      else updateTarget(selectedTarget.id, { variableKey: null, source: 'admin' });
                    }}
                    className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm normal-case tracking-normal text-ink outline-none focus:border-accent"
                  >
                    <option value="">Unmapped</option>
                    {groupBy(variables, (variable) => variable.group).map(([group, groupVariables]) => (
                      <optgroup key={group} label={group}>
                        {groupVariables.map((variable) => (
                          <option key={variable.key} value={variable.key}>{variableLabel(variable)}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                {selectedVariable && (
                  <div className={`border px-3 py-3 text-sm ${selectedVariable.source === 'fact' ? 'border-blue-200 bg-blue-50/70' : 'border-line bg-fog'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{selectedVariable.label}</p>
                        <p className="mt-0.5 text-xs text-mute">{variableSourceLabel(selectedVariable)}</p>
                      </div>
                      {selectedVariable.source === 'fact' && (
                        <span className="border border-blue-300 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-blue-700">
                          Smart fact
                        </span>
                      )}
                    </div>
                    {selectedVariable.ruleSummary && (
                      <p className="mt-3 text-xs leading-5 text-ink">{selectedVariable.ruleSummary}</p>
                    )}
                    {!selectedVariable.ruleSummary && selectedVariable.description && (
                      <p className="mt-3 text-xs leading-5 text-mute">{selectedVariable.description}</p>
                    )}
                    {selectedVariable.source === 'fact' && (
                      <div className="mt-3 space-y-2 text-xs text-mute">
                        {selectedVariable.reviewSensitive && (
                          <p className="border border-amber-300 bg-amber-50 px-2 py-2 text-amber-800">
                            Needs admin review when evidence or legal judgment is incomplete. Unresolved values stay blank at generation.
                          </p>
                        )}
                        {selectedVariable.sourceForms && selectedVariable.sourceForms.length > 0 && (
                          <p>Source forms: {selectedVariable.sourceForms.join(', ')}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <label className="block text-xs font-medium uppercase tracking-[0.12em] text-mute">
                  Format
                  <select
                    value={selectedTarget.format ?? 'text'}
                    onChange={(event) => updateTarget(selectedTarget.id, { format: event.target.value as PdfValueFormat, source: 'admin' })}
                    className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm normal-case tracking-normal text-ink outline-none focus:border-accent"
                  >
                    {FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                {selectedTarget.widgetType === 'checkbox' && (
                  <label className="block text-xs font-medium uppercase tracking-[0.12em] text-mute">
                    Option value
                    <input
                      value={selectedTarget.optionValue ?? ''}
                      onChange={(event) => updateTarget(selectedTarget.id, { optionValue: event.target.value || null, source: 'admin' })}
                      placeholder="Example: individual"
                      className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm normal-case tracking-normal text-ink outline-none focus:border-accent"
                    />
                  </label>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-mute">
                  <div className="border border-line px-2 py-2">
                    <p>X</p>
                    <p className="text-sm text-ink">{Math.round(selectedTarget.rect.x)}</p>
                  </div>
                  <div className="border border-line px-2 py-2">
                    <p>Y</p>
                    <p className="text-sm text-ink">{Math.round(selectedTarget.rect.y)}</p>
                  </div>
                  <div className="border border-line px-2 py-2">
                    <p>Width</p>
                    <p className="text-sm text-ink">{Math.round(selectedTarget.rect.width)}</p>
                  </div>
                  <div className="border border-line px-2 py-2">
                    <p>Height</p>
                    <p className="text-sm text-ink">{Math.round(selectedTarget.rect.height)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateTarget(selectedTarget.id, { variableKey: null, optionValue: null, source: 'admin' })}
                    className="border border-line px-3 py-2 text-sm text-ink transition hover:border-accent"
                  >
                    Remove mapping
                  </button>
                  {selectedTarget.kind === 'overlay' && (
                    <button
                      type="button"
                      onClick={() => removeOverlay(selectedTarget.id)}
                      className="border border-red-300 px-3 py-2 text-sm text-red-700 transition hover:bg-red-50"
                    >
                      Delete overlay
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-line pt-4">
              <h3 className="text-sm font-medium text-ink">Skipped signatures</h3>
              {pdfMap.skippedSignatureFields.length === 0 ? (
                <p className="mt-2 text-sm text-mute">No signature widgets were detected.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {pdfMap.skippedSignatureFields.map((field) => (
                    <div key={field.id} className="border border-line bg-fog px-3 py-2 text-xs text-mute">
                      <p className="font-medium text-ink">{field.label}</p>
                      <p>Page {field.page} · {field.fieldName ?? 'unnamed'} · skipped</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
