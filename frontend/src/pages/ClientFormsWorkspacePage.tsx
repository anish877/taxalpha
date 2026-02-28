import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { FormWorkspaceItem, FormWorkspaceRecord, SelectClientFormsResponse } from '../types/api';

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

export function ClientFormsWorkspacePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [workspace, setWorkspace] = useState<FormWorkspaceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagedCodes, setStagedCodes] = useState<Set<string>>(new Set());

  const stagedCount = stagedCodes.size;
  const selectedCount = workspace?.forms.filter((form) => form.selected).length ?? 0;
  const inProgressCount =
    workspace?.forms.filter((form) => form.selected && form.onboardingStatus === 'IN_PROGRESS').length ?? 0;
  const completedCount =
    workspace?.forms.filter((form) => form.selected && form.onboardingStatus === 'COMPLETED').length ?? 0;

  const loadWorkspace = useCallback(async () => {
    if (!clientId) {
      setError('Invalid client identifier.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<{ workspace: FormWorkspaceRecord }>(
        `/api/clients/${clientId}/forms/workspace`
      );
      setWorkspace(response.workspace);
      setStagedCodes(new Set());
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await signOut();
        navigate('/signin', { replace: true });
        return;
      }

      if (requestError instanceof ApiError && requestError.statusCode === 404) {
        setError('Client not found.');
      } else {
        setError('Unable to load forms workspace.');
      }
    } finally {
      setLoading(false);
    }
  }, [clientId, navigate, signOut]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const stagedTitles = useMemo(() => {
    if (!workspace) {
      return [] as string[];
    }

    return workspace.forms.filter((form) => stagedCodes.has(form.code)).map((form) => form.title);
  }, [stagedCodes, workspace]);

  const sortedForms = useMemo(() => {
    if (!workspace) {
      return [] as FormWorkspaceItem[];
    }

    return workspace.forms
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

  const handleOnboard = async () => {
    if (!clientId || stagedCodes.size === 0 || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await apiRequest<SelectClientFormsResponse>(
        `/api/clients/${clientId}/forms/select`,
        {
          method: 'POST',
          body: JSON.stringify({ formCodes: [...stagedCodes] })
        }
      );

      setWorkspace(response.workspace);
      setStagedCodes(new Set());
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
        await signOut();
        navigate('/signin', { replace: true });
        return;
      }

      setError(requestError instanceof ApiError ? requestError.message : 'Unable to add selected forms.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-fog px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-black/10 bg-paper px-5 py-5 shadow-hairline sm:px-8 sm:py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-mute">Client Workspace</p>
              <h1 className="mt-2 text-3xl font-light tracking-tight text-ink">
                {workspace?.clientName ?? 'Loading client...'}
              </h1>
              <p className="mt-2 text-sm text-mute">
                Build your onboarding package, configure templates, and progress efficiently.
              </p>
            </div>

            <div className="flex gap-4 sm:flex-row sm:items-center">
              <div className="flex items-center gap-6 text-[10px] sm:text-xs border-r border-line pr-4">
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
              </div>
              <button
                className="whitespace-nowrap rounded-full border border-line px-4 py-2 text-sm text-mute transition hover:border-black hover:text-ink"
                type="button"
                onClick={() => navigate('/dashboard')}
              >
                Dashboard
              </button>
            </div>
          </div>
        </header>

        {stagedCount > 0 && (
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
              <button
                className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-xs uppercase tracking-[0.14em] text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/45 shadow-sm"
                disabled={submitting}
                type="button"
                onClick={() => {
                  void handleOnboard();
                }}
              >
                {submitting ? 'Starting...' : `Onboard (${stagedCount})`}
              </button>
            </div>
          </section>
        )}

        <section className="mt-10 flex-1">
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
              {sortedForms.map((form) => {
                const isStaged = stagedCodes.has(form.code);
                const canContinue = form.selected && form.onboardingStatus !== 'COMPLETED' && !!form.resumeRoute;

                return (
                  <article
                    key={form.code}
                    className={`group flex flex-col justify-between rounded-[2rem] border p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-panel ${form.selected
                      ? 'border-black/10 bg-white'
                      : 'border-transparent bg-white/40 hover:bg-white/80'
                      }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-mute">{form.code}</p>
                          <h2 className="mt-2 text-lg font-light leading-tight text-ink">{form.title}</h2>
                          <p className="mt-1.5 text-xs font-light text-mute">
                            {form.selected ? 'Selected for onboarding' : 'Available to add'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex items-center justify-between border-b border-line pb-3 text-xs">
                        <span className="font-light text-mute">Status</span>
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${form.selected ? statusPillClass(form.onboardingStatus) : 'text-mute bg-black/5'
                            }`}
                        >
                          {form.selected ? statusLabel(form.onboardingStatus) : 'Available'}
                        </span>
                      </div>

                      {form.selected && (
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="font-light text-mute">Progress</span>
                          <span className="font-light text-ink">{progressLabel(form)}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-2">
                      {!form.selected ? (
                        <button
                          className={`w-full rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.2em] transition ${isStaged
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-line bg-white text-ink hover:border-black'
                            }`}
                          type="button"
                          onClick={() => handleToggleStage(form.code)}
                        >
                          {isStaged ? 'Added to Stage' : 'Add to Stage'}
                        </button>
                      ) : (
                        <div className="flex w-full flex-col gap-2">
                          <div className="flex w-full gap-2">
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
                          </div>
                          {canContinue && (
                            <button
                              className="w-full rounded-full bg-ink px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-white transition hover:bg-black/80 shadow-sm"
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
        </section>

        <footer className="mt-8 border-t border-line pt-6 text-center text-xs uppercase tracking-[0.2em] text-mute">
          TaxAlpha Workspace • Ensure all records are verified
        </footer>
      </div>
    </main>
  );
}

