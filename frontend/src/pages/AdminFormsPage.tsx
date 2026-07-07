import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getIngestionJob, listAdminForms, startUploadFormJob } from '../api/adminForms';
import { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { AdminFormSummary, AdminIngestionJob, UploadFormResult } from '../types/api';

const ACTIVE_UPLOAD_JOB_KEY = 'taxalpha.activeUploadIngestionJobId';

function newJobId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function uploadResult(job: AdminIngestionJob): UploadFormResult | null {
  const result = job.result as UploadFormResult | undefined;
  return result?.form?.id ? result : null;
}

function StatusPill({ status }: { status: AdminFormSummary['status'] }) {
  const draft = status === 'DRAFT';
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
        draft ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
      }`}
    >
      {status}
    </span>
  );
}

export function AdminFormsPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { pushToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [forms, setForms] = useState<AdminFormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [hint, setHint] = useState('');
  const [vision, setVision] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<{ percent: number; label: string } | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setForms(await listAdminForms());
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await signOut();
        navigate('/signin', { replace: true });
        return;
      }
      setError('Unable to load forms. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [navigate, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const finishJob = useCallback(
    (job: AdminIngestionJob) => {
      const result = uploadResult(job);
      if (!result) return;
      window.localStorage.removeItem(ACTIVE_UPLOAD_JOB_KEY);
      clearPollTimer();
      setUploading(false);
      setIngestProgress({ percent: 100, label: result.report?.headline ?? 'Mapping complete' });
      const { stats } = result;
      const mappedPercent =
        typeof stats.mappedPercent === 'number'
          ? stats.mappedPercent
          : Math.round((stats.mapped / Math.max(1, stats.totalFields)) * 1000) / 10;
      pushToast(
        `Mapped: ${mappedPercent}% suggested (${stats.mapped}/${stats.totalFields} PDF boxes). Opening visual mapper.`
      );
      navigate(`/admin/forms/${result.form.id}`);
    },
    [clearPollTimer, navigate, pushToast]
  );

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const job = await getIngestionJob(jobId);
        setUploading(job.status === 'RUNNING' || job.status === 'QUEUED');
        setIngestProgress({ percent: job.percent, label: job.label });

        if (job.status === 'COMPLETED') {
          finishJob(job);
          return;
        }
        if (job.status === 'FAILED') {
          window.localStorage.removeItem(ACTIVE_UPLOAD_JOB_KEY);
          clearPollTimer();
          setUploading(false);
          pushToast(job.error ?? 'Mapping failed.', 'error');
          return;
        }

        pollTimerRef.current = window.setTimeout(() => void pollJob(jobId), 1500);
      } catch (pollError) {
        window.localStorage.removeItem(ACTIVE_UPLOAD_JOB_KEY);
        clearPollTimer();
        setUploading(false);
        setIngestProgress(null);
        const message =
          pollError instanceof ApiError && pollError.statusCode === 404
            ? 'The page refreshed before the PDF reached the server. Please choose the PDF again.'
            : 'Unable to reconnect to the mapping job.';
        pushToast(message, 'error');
      }
    },
    [clearPollTimer, finishJob, pushToast]
  );

  useEffect(() => {
    const activeJobId = window.localStorage.getItem(ACTIVE_UPLOAD_JOB_KEY);
    if (activeJobId) {
      setUploading(true);
      setIngestProgress({ percent: 35, label: 'Reconnecting to AI mapping...' });
      void pollJob(activeJobId);
    }
    return clearPollTimer;
  }, [clearPollTimer, pollJob]);

  const handleUpload = async () => {
    if (!file) {
      pushToast('Choose a PDF first.', 'error');
      return;
    }
    clearPollTimer();
    const jobId = newJobId();
    window.localStorage.setItem(ACTIVE_UPLOAD_JOB_KEY, jobId);
    setUploading(true);
    setIngestProgress({ percent: 1, label: 'Preparing upload' });
    try {
      const job = await startUploadFormJob(
        jobId,
        file,
        { title: title || undefined, hint: hint || undefined, vision },
        (progress) => {
          setIngestProgress({ percent: progress.percent, label: progress.label });
        }
      );
      setIngestProgress({ percent: job.percent, label: job.label });
      void pollJob(job.id);
    } catch (uploadError) {
      const message =
        uploadError instanceof ApiError ? uploadError.message : 'Upload failed. Please try again.';
      window.localStorage.removeItem(ACTIVE_UPLOAD_JOB_KEY);
      pushToast(message, 'error');
      setIngestProgress(null);
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-fog px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between rounded-3xl border border-black/10 bg-paper px-8 py-6 shadow-hairline">
          <div>
            <h1 className="text-3xl font-light tracking-tight text-ink">Form Library</h1>
            <p className="mt-1 text-sm text-mute">Upload a fillable PDF, map variables, and publish it as a reusable template.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-accent"
          >
            Back to dashboard
          </button>
        </header>

        {/* Upload card */}
        <section className="mt-6 rounded-3xl border border-black/10 bg-paper p-6 shadow-hairline">
          <h2 className="text-lg font-light text-ink">Upload a PDF template</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-xl border border-line bg-paper px-4 py-2 text-sm font-medium transition hover:border-accent"
              >
                {file ? `📎 ${file.name}` : 'Choose PDF'}
              </button>
            </div>
            <label className="text-sm text-mute">
              Title (optional)
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. RGP Income Fund II"
                className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>
            <label className="text-sm text-mute">
              Hint for the AI (optional)
              <input
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="e.g. Reg D 506(c) subscription agreement"
                className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-mute">
            <input type="checkbox" checked={vision} onChange={(e) => setVision(e.target.checked)} />
            Deep analyze (vision) — slower, reads each page as an image for better variable suggestions
          </label>
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={uploading || !file}
            className="mt-4 rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? 'Mapping… (this can take ~30–60s)' : 'Upload & Map'}
          </button>
          {ingestProgress && (
            <div className="mt-4 rounded-xl border border-line bg-fog p-3">
              <div className="flex items-center justify-between gap-3 text-xs text-mute">
                <span>{ingestProgress.label}</span>
                <span>{Math.round(ingestProgress.percent)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${Math.max(1, Math.min(100, ingestProgress.percent))}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-mute">
                After the upload reaches the server, refreshing this page will reconnect to the same mapping job.
              </p>
            </div>
          )}
        </section>

        {/* List */}
        <section className="mt-6 rounded-3xl border border-black/10 bg-paper p-6 shadow-hairline">
          <h2 className="text-lg font-light text-ink">Published and draft templates</h2>
          <div className="mt-4">
            {loading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-2xl bg-fog" />
                ))}
              </div>
            )}
            {!loading && error && (
              <div className="rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">
                {error}
              </div>
            )}
            {!loading && !error && (
              <div className="overflow-hidden rounded-2xl border border-line">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="bg-fog text-xs uppercase tracking-[0.16em] text-mute">
                    <tr>
                      <th className="px-4 py-3 font-medium">Form</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Unmapped</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {forms.map((f) => (
                      <tr key={f.id} className="border-t border-line/70">
                        <td className="px-4 py-3">
                          <p className="font-light text-ink">{f.title}</p>
                          <p className="mt-0.5 text-xs text-mute">{f.code}</p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={f.status} />
                        </td>
                        <td className="px-4 py-3 text-xs text-mute">{f.source}</td>
                        <td className="px-4 py-3 text-xs text-mute">{f.unmappedCount ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {f.source === 'UPLOAD' ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/admin/forms/${f.id}`)}
                              className="text-sm font-medium text-accent underline"
                            >
                              Review
                            </button>
                          ) : (
                            <span className="text-xs text-mute">built-in</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
