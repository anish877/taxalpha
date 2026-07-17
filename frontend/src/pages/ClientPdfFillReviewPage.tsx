import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

import { ApiError } from '../api/client';
import { generatePdfFill, getPdfFill, reanalyzePdfFill, savePdfFillValues } from '../api/pdfFills';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { PdfFillRecord, PdfFillTarget, PdfMapPage, PdfMappingRect } from '../types/api';

function rectStyle(page: PdfMapPage, rect: PdfMappingRect): CSSProperties {
  return {
    left: `${rect.x}px`,
    top: `${page.height - rect.y - rect.height}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  };
}

function statusClass(target: PdfFillTarget, selected: boolean): string {
  if (target.status === 'skipped') {
    return 'border-neutral-500 bg-neutral-300/30 text-neutral-700';
  }
  if (selected) {
    return 'border-accent bg-accent/20 ring-2 ring-accent text-ink';
  }
  if (target.status === 'filled') {
    return 'border-emerald-600 bg-emerald-400/20 text-emerald-900 hover:bg-emerald-400/30';
  }
  if (target.status === 'needs_review') {
    return 'border-amber-600 bg-amber-300/30 text-amber-900 hover:bg-amber-300/45';
  }
  return 'border-slate-500 bg-slate-200/35 text-slate-900 hover:bg-slate-200/55';
}

function targetLabel(target: PdfFillTarget): string {
  if (target.status === 'skipped') return 'Skipped';
  if (target.widgetType === 'checkbox') return target.value === true ? '✓' : target.status === 'needs_review' ? 'Review' : '';
  return target.displayValue || (target.status === 'needs_review' ? 'Needs review' : 'Click to fill');
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not generated';
  return new Date(value).toLocaleString();
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

export function ClientPdfFillReviewPage() {
  const { clientId = '', fillId = '' } = useParams<{ clientId: string; fillId: string }>();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [fill, setFill] = useState<PdfFillRecord | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [draftChecked, setDraftChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(async () => {
    await signOut();
    navigate('/signin', { replace: true });
  }, [navigate, signOut]);

  const loadFill = useCallback(async () => {
    if (!clientId || !fillId) return;
    setLoading(true);
    setError(null);
    try {
      const loaded = await getPdfFill(clientId, fillId);
      setFill(loaded);
      setSelectedTargetId((current) => current ?? loaded.resolvedLayout.targets.find((target) => target.editable)?.id ?? null);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }
      setError(requestError instanceof ApiError ? requestError.message : 'Unable to load PDF fill session.');
    } finally {
      setLoading(false);
    }
  }, [clientId, fillId, handleUnauthorized]);

  useEffect(() => {
    void loadFill();
  }, [loadFill]);

  useEffect(() => {
    if (!fill?.originalPdfUrl) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    const loadPdf = async () => {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      if (cancelled) return;
      task = pdfjsLib.getDocument({ url: fill.originalPdfUrl, withCredentials: true });
      try {
        const doc = await task.promise;
        if (cancelled) {
          void doc.cleanup();
          return;
        }
        setPdfDoc(doc);
      } catch {
        if (!cancelled) setError('Unable to render this PDF.');
      }
    };
    void loadPdf();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [fill?.originalPdfUrl]);

  useEffect(() => () => {
    if (pdfDoc) void pdfDoc.cleanup();
  }, [pdfDoc]);

  const targetByPage = useMemo(() => {
    const groups = new Map<number, PdfFillTarget[]>();
    for (const target of fill?.resolvedLayout.targets ?? []) {
      const group = groups.get(target.page);
      if (group) group.push(target);
      else groups.set(target.page, [target]);
    }
    return groups;
  }, [fill?.resolvedLayout.targets]);

  const selectedTarget = useMemo(
    () => fill?.resolvedLayout.targets.find((target) => target.id === selectedTargetId) ?? null,
    [fill?.resolvedLayout.targets, selectedTargetId]
  );

  useEffect(() => {
    if (!selectedTarget) {
      setDraftValue('');
      setDraftChecked(false);
      return;
    }
    if (selectedTarget.widgetType === 'checkbox') {
      setDraftChecked(selectedTarget.value === true);
      setDraftValue('');
      return;
    }
    setDraftValue(selectedTarget.displayValue);
    setDraftChecked(false);
  }, [selectedTarget]);

  const filledCount = fill?.resolvedLayout.targets.filter((target) => target.status === 'filled').length ?? 0;
  const reviewCount = fill?.resolvedLayout.targets.filter((target) => target.status === 'needs_review').length ?? 0;
  const skippedCount = fill?.resolvedLayout.targets.filter((target) => target.status === 'skipped').length ?? 0;

  const saveSelected = async () => {
    if (!clientId || !fillId || !selectedTarget || saving || !selectedTarget.editable) return;
    setSaving(true);
    try {
      const value = selectedTarget.widgetType === 'checkbox' ? draftChecked : draftValue;
      const result = await savePdfFillValues(clientId, fillId, { [selectedTarget.id]: { value } });
      setFill((current) => (current ? { ...current, status: result.status, resolvedLayout: result.resolvedLayout, warnings: result.warnings } : current));
      pushToast(fill?.generatedAt ? 'Field saved. Generate an updated PDF when you are ready.' : 'PDF field updated.');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }
      pushToast(requestError instanceof ApiError ? requestError.message : 'Unable to save PDF field.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const clearSelected = async () => {
    if (!clientId || !fillId || !selectedTarget || saving || !selectedTarget.editable) return;
    setSaving(true);
    try {
      const result = await savePdfFillValues(clientId, fillId, { [selectedTarget.id]: { value: null } });
      setFill((current) => (current ? { ...current, status: result.status, resolvedLayout: result.resolvedLayout, warnings: result.warnings } : current));
      pushToast(fill?.generatedAt ? 'Field cleared. Generate an updated PDF when you are ready.' : 'PDF field cleared.');
    } catch (requestError) {
      pushToast(requestError instanceof ApiError ? requestError.message : 'Unable to clear PDF field.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReanalyze = async () => {
    if (!clientId || !fillId || reanalyzing) return;
    setReanalyzing(true);
    try {
      const result = await reanalyzePdfFill(clientId, fillId);
      setFill((current) => (current ? { ...current, status: 'DRAFT', resolvedLayout: result.resolvedLayout, warnings: result.warnings } : current));
      pushToast('PDF re-analyzed with the latest client data.');
    } catch (requestError) {
      pushToast(requestError instanceof ApiError ? requestError.message : 'Unable to reanalyze PDF.', 'error');
    } finally {
      setReanalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if (!clientId || !fillId || generating) return;
    setGenerating(true);
    try {
      const result = await generatePdfFill(clientId, fillId);
      setFill((current) =>
        current
          ? {
              ...current,
              status: 'GENERATED',
              generatedPdfUrl: result.pdfUrl,
              generatedAt: new Date().toISOString(),
              resolvedLayout: result.resolvedLayout,
              warnings: result.warnings
            }
          : current
      );
      pushToast(`Generated PDF with ${result.fieldsFilled} filled field${result.fieldsFilled === 1 ? '' : 's'}.`);
      window.open(result.pdfUrl, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await handleUnauthorized();
        return;
      }
      pushToast(requestError instanceof ApiError ? requestError.message : 'Unable to generate PDF.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="workspace-premium min-h-screen px-4 py-5 sm:px-7 sm:py-7">
      <div className="mx-auto max-w-7xl">
        <header className="premium-header rounded-[2rem] px-5 py-5 sm:px-7 sm:py-6">
          <button
            className="relative z-10 -ml-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-sm text-[#6e6e73] transition hover:bg-black/[0.04] hover:text-[#1d1d1f]"
            type="button"
            onClick={() => navigate(`/clients/${clientId}/forms`)}
          >
            <span aria-hidden="true">←</span>
            Workspace
          </button>

          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#86868b]">Document editor</p>
              <h1 className="mt-1.5 truncate text-[1.7rem] font-semibold tracking-[-0.03em] text-[#1d1d1f] sm:text-[2rem]" title={fill?.fileName ?? 'Uploaded PDF'}>
                {fill?.fileName ?? 'Uploaded PDF'}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#86868b]">
                <span>{filledCount} fields filled</span>
                <span aria-hidden="true">·</span>
                <span className={reviewCount > 0 ? 'text-amber-700' : undefined}>{reviewCount} need review</span>
                <span aria-hidden="true">·</span>
                <span>{skippedCount} signatures skipped</span>
                {fill?.generatedAt && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Generated {formatTimestamp(fill.generatedAt)}</span>
                  </>
                )}
              </div>
            </div>

            <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
              {fill?.generatedPdfUrl && (
                <a
                  className="premium-secondary inline-flex items-center px-5 py-2.5 text-sm text-[#1d1d1f]"
                  href={fill.generatedPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open current PDF
                </a>
              )}
              <details className="relative">
                <summary className="premium-secondary flex cursor-pointer list-none items-center px-5 py-2.5 text-sm text-[#1d1d1f]">
                  More
                </summary>
                <div className="absolute right-0 z-30 mt-2 w-52 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-panel">
                  <button
                    className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-[#1d1d1f] transition hover:bg-[#f5f5f7] disabled:opacity-45"
                    disabled={reanalyzing}
                    type="button"
                    onClick={() => void handleReanalyze()}
                  >
                    {reanalyzing ? 'Refreshing fields…' : 'Refresh suggested fields'}
                  </button>
                </div>
              </details>
              <button
                className="premium-primary px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
                disabled={generating || !fill}
                type="button"
                onClick={() => void handleGenerate()}
              >
                {generating ? 'Generating…' : fill?.generatedAt ? 'Generate updated PDF' : 'Generate PDF'}
              </button>
            </div>
          </div>
        </header>

        {loading && <div className="premium-card mt-5 h-40 animate-pulse rounded-[2rem]" />}
        {!loading && error && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && fill && (
          <>
            {fill.status === 'DRAFT' && fill.generatedAt && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                Edits saved. Generate an updated PDF when you are ready.
              </div>
            )}
            <section className="mt-5 grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_320px]">
            <div className="order-2 min-w-0 overflow-auto rounded-[2rem] border border-black/[0.055] bg-[#e9e9ed] p-4 shadow-hairline sm:p-6 min-[900px]:col-start-1 min-[900px]:row-start-1">
              {!pdfDoc && <div className="rounded-2xl bg-white px-4 py-3 text-sm text-mute">Rendering PDF…</div>}
              {pdfDoc && (
                <div className="space-y-6">
                  {fill.resolvedLayout.pages.map((page) => (
                    <div key={page.page} className="mx-auto w-max">
                      <div className="mb-2 px-1 text-xs font-medium text-[#6e6e73]">Page {page.page}</div>
                      <PdfPageCanvas doc={pdfDoc} page={page}>
                        {(targetByPage.get(page.page) ?? []).map((target) => {
                          const selected = target.id === selectedTargetId;
                          return (
                            <button
                              key={target.id}
                              type="button"
                              disabled={!target.editable}
                              onClick={() => setSelectedTargetId(target.id)}
                              className={`absolute overflow-hidden border px-1 text-left text-[10px] leading-tight transition ${statusClass(target, selected)}`}
                              style={rectStyle(page, target.rect)}
                              title={`${target.label}${target.explanation ? ` - ${target.explanation}` : ''}`}
                            >
                              <span className="block truncate">{targetLabel(target)}</span>
                            </button>
                          );
                        })}
                      </PdfPageCanvas>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside className="premium-card order-1 rounded-[2rem] p-5 sm:p-6 min-[900px]:sticky min-[900px]:top-5 min-[900px]:col-start-2 min-[900px]:row-start-1 min-[900px]:max-h-[calc(100vh-2.5rem)] min-[900px]:overflow-auto">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#1d1d1f]">Field details</h2>
              {!selectedTarget && (
                <p className="mt-3 rounded-2xl bg-[#f5f5f7] px-4 py-3 text-sm text-mute">Select a highlighted field in the PDF.</p>
              )}
              {selectedTarget && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl bg-[#f5f5f7] px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-ink">{selectedTarget.label}</p>
                        <p className="mt-1 text-xs text-mute">Page {selectedTarget.page} · {selectedTarget.widgetType}</p>
                      </div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-mute">
                        {selectedTarget.status === 'needs_review' ? 'Needs review' : selectedTarget.status === 'filled' ? 'Filled' : 'Skipped'}
                      </span>
                    </div>
                    {selectedTarget.sourceLabel && (
                      <p className="mt-3 text-xs text-mute">Source: {selectedTarget.sourceLabel}</p>
                    )}
                    {selectedTarget.explanation && (
                      <p className="mt-2 text-xs leading-5 text-ink">{selectedTarget.explanation}</p>
                    )}
                    {selectedTarget.warning && (
                      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {selectedTarget.warning}
                      </p>
                    )}
                  </div>

                  {selectedTarget.editable && selectedTarget.widgetType === 'checkbox' && (
                    <label className="flex items-center justify-between rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink">
                      Checked
                      <input
                        checked={draftChecked}
                        className="h-5 w-5 rounded border-line text-accent focus:ring-accent"
                        type="checkbox"
                        onChange={(event) => setDraftChecked(event.target.checked)}
                      />
                    </label>
                  )}

                  {selectedTarget.editable && selectedTarget.widgetType !== 'checkbox' && (
                    <label className="block text-xs font-medium text-mute">
                      Value
                      <textarea
                        value={draftValue}
                        onChange={(event) => setDraftValue(event.target.value)}
                        className="mt-2 min-h-28 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-[#0071e3] focus:ring-4 focus:ring-[#0071e3]/10"
                      />
                    </label>
                  )}

                  <div className="flex gap-2">
                    <button
                      className="premium-primary flex-1 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!selectedTarget.editable || saving}
                      type="button"
                      onClick={() => void saveSelected()}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      className="premium-secondary flex-1 px-4 py-2.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!selectedTarget.editable || saving}
                      type="button"
                      onClick={() => void clearSelected()}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {fill.warnings.length > 0 && (
                <div className="mt-6 border-t border-black/[0.07] pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink">Needs attention</h3>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">{fill.warnings.length}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {fill.warnings.slice(0, 8).map((warning) => (
                      <button
                        key={`${warning.targetId}:${warning.reason}`}
                        className="w-full rounded-2xl bg-amber-50 px-3.5 py-3 text-left text-xs text-amber-900 transition hover:bg-amber-100"
                        type="button"
                        onClick={() => setSelectedTargetId(warning.targetId)}
                      >
                        <span className="font-medium">{warning.label}</span>
                        <span className="mt-1 block leading-5">{warning.reason}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
