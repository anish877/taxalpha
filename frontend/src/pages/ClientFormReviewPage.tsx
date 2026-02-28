import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  appendArrayItem,
  flattenReviewFields,
  formatPathLabel,
  getValueAtPath,
  removeArrayIndex,
  setValueAtPath,
  toTitleCase,
  type FlattenedFieldRow,
  type JsonLike,
  type ReviewArrayContainer
} from '../lib/form-review-table';
import type { ReviewStepUpdateRequest } from '../types/api';

type ReviewMode = 'view' | 'edit';

type ReviewPayload = {
  onboarding: {
    clientId: string;
    status: string;
    step: {
      key: string;
      label: string;
      fields: unknown;
      requiresJointOwnerSignature?: boolean;
      requiresStep4?: boolean;
      nextRouteAfterCompletion?: string | null;
    };
  };
  review?: {
    stepNumber: number;
    totalSteps: number;
  };
};

interface FormReviewConfig {
  title: string;
  totalSteps: number;
  endpointBase: string;
}

interface ReviewSection {
  key: string;
  label: string;
  rows: FlattenedFieldRow[];
  arrays: ReviewArrayContainer[];
  errorCount: number;
}

const REVIEW_CONFIG_BY_FORM: Record<string, FormReviewConfig> = {
  INVESTOR_PROFILE: {
    title: 'Investor Profile',
    totalSteps: 7,
    endpointBase: 'investor-profile'
  },
  SFC: {
    title: 'Statement of Financial Condition',
    totalSteps: 2,
    endpointBase: 'statement-of-financial-condition'
  },
  BAIODF: {
    title: 'Brokerage Alternative Investment Order and Disclosure',
    totalSteps: 3,
    endpointBase: 'brokerage-alternative-investment-order-disclosure'
  },
  BAIV_506C: {
    title: 'Brokerage Accredited Investor Verification (Rule 506(c))',
    totalSteps: 2,
    endpointBase: 'brokerage-accredited-investor-verification'
  }
};

function getReviewEndpoint(clientId: string, formCode: string, stepNumber: number): string | null {
  const config = REVIEW_CONFIG_BY_FORM[formCode];
  if (!config) {
    return null;
  }

  return `/api/clients/${clientId}/${config.endpointBase}/review/step-${stepNumber}`;
}

function findFieldError(
  fieldErrors: Record<string, string>,
  pathKey: string,
  stepPrefix: string
): string | null {
  const candidates = [
    pathKey,
    `${stepPrefix}.${pathKey}`,
    `${stepPrefix}.${pathKey}.value`,
    `${stepPrefix}.${pathKey}.entries`,
    stepPrefix
  ];

  for (const candidate of candidates) {
    if (fieldErrors[candidate]) {
      return fieldErrors[candidate];
    }
  }

  const byPrefix = Object.keys(fieldErrors).find(
    (key) => key.startsWith(`${stepPrefix}.${pathKey}.`) || key.startsWith(`${pathKey}.`)
  );
  if (byPrefix) {
    return fieldErrors[byPrefix];
  }

  return null;
}

function sectionErrorCount(
  sectionKey: string,
  fieldErrors: Record<string, string>,
  stepPrefix: string
): number {
  const seen = new Set<string>();

  Object.entries(fieldErrors).forEach(([key, value]) => {
    if (!value) {
      return;
    }

    if (
      key === sectionKey ||
      key.startsWith(`${sectionKey}.`) ||
      key.startsWith(`${stepPrefix}.${sectionKey}.`) ||
      key.startsWith(`${stepPrefix}.${sectionKey}`)
    ) {
      seen.add(key);
    }
  });

  return seen.size;
}

function toDisplayValue(row: FlattenedFieldRow): string {
  if (row.inputKind === 'array-empty') {
    return '—';
  }

  if (row.inputKind === 'boolean') {
    return row.value === true ? 'Yes' : 'No';
  }

  if (row.value === null || row.value === '') {
    return '—';
  }

  return String(row.value);
}

function toNextInputValue(row: FlattenedFieldRow, raw: string): JsonLike {
  if (row.inputKind === 'number') {
    const normalized = raw.trim();
    return normalized === '' ? null : Number(normalized);
  }

  if (row.inputKind === 'date') {
    const normalized = raw.trim();
    return normalized === '' ? null : normalized;
  }

  if (row.inputKind === 'array-empty') {
    return row.value;
  }

  if (row.value === null && raw.trim() === '') {
    return null;
  }

  return raw;
}

function groupLabel(pathSegments: string[]): string {
  if (pathSegments.length <= 1) {
    return 'General';
  }

  const parents = pathSegments.slice(0, -1).filter((segment) => !/^\d+$/.test(segment));
  if (parents.length === 0) {
    return 'General';
  }

  return parents.map(toTitleCase).join(' ');
}

export function ClientFormReviewPage() {
  const navigate = useNavigate();
  const { clientId, formCode, mode, stepNumber } = useParams<{
    clientId: string;
    formCode: string;
    mode: ReviewMode;
    stepNumber: string;
  }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [fields, setFields] = useState<JsonLike | null>(null);
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);

  const resolvedMode: ReviewMode = mode === 'edit' ? 'edit' : 'view';
  const resolvedFormCode = formCode ?? '';
  const config = REVIEW_CONFIG_BY_FORM[resolvedFormCode] ?? null;
  const resolvedStepNumber = Number(stepNumber);
  const isStepNumberValid = Number.isInteger(resolvedStepNumber) && resolvedStepNumber > 0;
  const endpoint =
    clientId && config && isStepNumberValid
      ? getReviewEndpoint(clientId, resolvedFormCode, resolvedStepNumber)
      : null;
  const stepPrefix = `step${resolvedStepNumber}`;

  const loadStep = useCallback(async () => {
    if (!clientId || !endpoint || !config || !isStepNumberValid || resolvedStepNumber > config.totalSteps) {
      setLoading(false);
      setError('Invalid review route.');
      return;
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await apiRequest<ReviewPayload>(endpoint);
      setPayload(response);
      setFields((response.onboarding.step.fields ?? null) as JsonLike);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await signOut();
        navigate('/signin', { replace: true });
        return;
      }

      if (requestError instanceof ApiError && requestError.statusCode === 404) {
        setError('Review step not found.');
      } else {
        setError('Unable to load review step.');
      }
    } finally {
      setLoading(false);
    }
  }, [clientId, config, endpoint, isStepNumberValid, navigate, resolvedStepNumber, signOut]);

  useEffect(() => {
    void loadStep();
  }, [loadStep]);

  const canSave = resolvedMode === 'edit' && !loading && !saving && !!endpoint && fields !== null;

  const flattened = useMemo(() => {
    if (fields === null) {
      return {
        rows: [] as FlattenedFieldRow[],
        arrays: [] as ReviewArrayContainer[]
      };
    }

    return flattenReviewFields(fields);
  }, [fields]);

  const sections = useMemo(() => {
    const rowMap = new Map<string, FlattenedFieldRow[]>();
    const arrayMap = new Map<string, ReviewArrayContainer[]>();

    flattened.rows.forEach((row) => {
      if (!rowMap.has(row.sectionKey)) {
        rowMap.set(row.sectionKey, []);
      }
      rowMap.get(row.sectionKey)!.push(row);
    });

    flattened.arrays.forEach((arrayContainer) => {
      if (!arrayMap.has(arrayContainer.sectionKey)) {
        arrayMap.set(arrayContainer.sectionKey, []);
      }
      arrayMap.get(arrayContainer.sectionKey)!.push(arrayContainer);
    });

    const keys = new Set<string>([...rowMap.keys(), ...arrayMap.keys()]);

    return [...keys].map((sectionKey) => ({
      key: sectionKey,
      label: toTitleCase(sectionKey),
      rows: rowMap.get(sectionKey) ?? [],
      arrays: arrayMap.get(sectionKey) ?? [],
      errorCount: sectionErrorCount(sectionKey, fieldErrors, stepPrefix)
    }));
  }, [fieldErrors, flattened.arrays, flattened.rows, stepPrefix]);

  useEffect(() => {
    if (sections.length === 0) {
      setActiveSectionKey(null);
      return;
    }

    if (!activeSectionKey || !sections.some((section) => section.key === activeSectionKey)) {
      setActiveSectionKey(sections[0].key);
    }
  }, [activeSectionKey, sections]);

  const activeSection = useMemo(
    () => sections.find((section) => section.key === activeSectionKey) ?? null,
    [activeSectionKey, sections]
  );

  const groupedRows = useMemo(() => {
    if (!activeSection) {
      return [] as Array<{ label: string; rows: FlattenedFieldRow[] }>;
    }

    const groups = new Map<string, FlattenedFieldRow[]>();

    activeSection.rows.forEach((row) => {
      const label = groupLabel(row.pathSegments);
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)!.push(row);
    });

    return [...groups.entries()].map(([label, rows]) => ({ label, rows }));
  }, [activeSection]);

  const firstRowByArrayEntry = useMemo(() => {
    const firstRows = new Set<string>();
    const seen = new Set<string>();

    if (!activeSection) {
      return firstRows;
    }

    activeSection.rows.forEach((row) => {
      if (!row.arrayPathSegments || row.arrayIndex === null) {
        return;
      }

      const key = `${row.arrayPathSegments.join('.')}#${row.arrayIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        firstRows.add(row.pathKey);
      }
    });

    return firstRows;
  }, [activeSection]);

  const handleSave = async () => {
    if (!endpoint || fields === null || !canSave) {
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await apiRequest<ReviewPayload>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ fields } satisfies ReviewStepUpdateRequest)
      });
      setPayload(response);
      setFields((response.onboarding.step.fields ?? null) as JsonLike);
      pushToast('Step saved.');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.statusCode === 401) {
        await signOut();
        navigate('/signin', { replace: true });
        return;
      }

      if (requestError instanceof ApiError) {
        setFieldErrors(requestError.fieldErrors ?? {});
        setError(requestError.message);
      } else {
        setError('Unable to save this step.');
      }
    } finally {
      setSaving(false);
    }
  };

  const navigateToStep = (nextStep: number) => {
    if (!clientId || !resolvedFormCode || !config || nextStep < 1 || nextStep > config.totalSteps) {
      return;
    }

    navigate(`/clients/${clientId}/forms/${resolvedFormCode}/${resolvedMode}/step/${nextStep}`);
  };

  const totalSteps = payload?.review?.totalSteps ?? config?.totalSteps ?? 0;
  const stepProgressPercent =
    totalSteps > 0 && resolvedStepNumber > 0
      ? Math.min(100, Math.max(0, (resolvedStepNumber / totalSteps) * 100))
      : 0;

  return (
    <main className="min-h-screen bg-fog px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-black/10 bg-paper px-5 py-5 shadow-hairline sm:px-8 sm:py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-mute">
                Form Review • {resolvedMode === 'edit' ? 'Edit Mode' : 'View Mode'}
              </p>
              <h1 className="mt-2 text-3xl font-light tracking-tight text-ink">
                {config?.title ?? 'Unknown Form'}
              </h1>
              <p className="mt-2 text-sm text-mute">
                {payload?.onboarding.step.label ?? 'Loading step...'}
              </p>
            </div>

            <div className="flex gap-4 sm:flex-row sm:items-center">
              <div className="flex gap-2 border-r border-line pr-4">
                <button
                  className="whitespace-nowrap rounded-full border border-line px-4 py-2 text-sm text-mute transition hover:border-black hover:text-ink"
                  type="button"
                  onClick={() => navigate(clientId ? `/clients/${clientId}/forms` : '/dashboard')}
                >
                  Workspace
                </button>
                {resolvedMode === 'view' ? (
                  <button
                    className="whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm text-white transition hover:bg-accent/90 shadow-sm"
                    type="button"
                    onClick={() =>
                      clientId &&
                      config &&
                      navigate(`/clients/${clientId}/forms/${resolvedFormCode}/edit/step/${resolvedStepNumber}`)
                    }
                  >
                    Edit Form
                  </button>
                ) : (
                  <>
                    <button
                      className="whitespace-nowrap rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-black"
                      type="button"
                      onClick={() =>
                        clientId &&
                        config &&
                        navigate(`/clients/${clientId}/forms/${resolvedFormCode}/view/step/${resolvedStepNumber}`)
                      }
                    >
                      View Mode
                    </button>
                    <button
                      className="whitespace-nowrap rounded-full bg-accent px-4 py-2 text-sm text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/45"
                      disabled={!canSave}
                      type="button"
                      onClick={() => {
                        void handleSave();
                      }}
                    >
                      {saving ? 'Saving...' : 'Save Step'}
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div>
                  <p className="uppercase tracking-[0.2em] text-mute">Progress</p>
                  <p className="mt-1 text-xl font-light text-ink">
                    {isStepNumberValid && totalSteps > 0 ? `Step ${resolvedStepNumber} of ${totalSteps}` : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {
          config && totalSteps > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-2">
              {Array.from({ length: totalSteps }).map((_, index) => {
                const step = index + 1;
                const isActive = resolvedStepNumber === step;

                return (
                  <button
                    key={step}
                    className={`rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.16em] transition shadow-sm ${isActive
                      ? 'bg-ink text-white'
                      : 'border border-black/10 bg-white text-mute hover:border-black hover:text-ink'
                      }`}
                    type="button"
                    onClick={() => navigateToStep(step)}
                  >
                    Step {step}
                  </button>
                );
              })}
            </div>
          )
        }

        <section className="mt-6 flex-1">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((placeholder) => (
                <div key={placeholder} className="h-24 animate-pulse rounded-2xl bg-white/70" />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">{error}</div>
          )}

          {!loading && !error && fields !== null && activeSection && (
            <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <aside className="space-y-6 lg:sticky lg:top-8 lg:h-fit">
                {sections.length > 0 && (
                  <div className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-mute">Sections</p>
                    <div className="mt-4 space-y-2">
                      {sections.map((section) => {
                        const isActive = section.key === activeSectionKey;
                        return (
                          <button
                            key={section.key}
                            className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition ${isActive
                              ? 'bg-black/5 text-ink font-medium'
                              : 'bg-transparent text-mute hover:bg-black/5 hover:text-ink font-light'
                              }`}
                            type="button"
                            onClick={() => setActiveSectionKey(section.key)}
                          >
                            <span className="text-sm">{section.label}</span>
                            {section.errorCount > 0 && (
                              <span
                                aria-hidden="true"
                                className="rounded-full border border-black/10 bg-white px-2.5 py-0.5 text-[11px] text-mute shadow-sm"
                              >
                                {section.errorCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeSection.arrays.length > 0 && (
                  <div className="rounded-[2rem] border border-black/5 bg-white p-5 shadow-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-mute">Array Elements</p>
                    <div className="mt-4 space-y-4">
                      {activeSection.arrays.map((arrayContainer) => {
                        const arrayValue = getValueAtPath(fields, arrayContainer.pathSegments);
                        const rowCount = Array.isArray(arrayValue) ? arrayValue.length : 0;

                        return (
                          <div key={arrayContainer.pathKey} className="rounded-[1.5rem] border border-black/5 bg-fog/60 p-4">
                            <p className="text-xs uppercase tracking-[0.16em] text-ink">{arrayContainer.label}</p>
                            <p className="mt-1 text-xs font-light text-mute">Instances: {rowCount}</p>
                            {resolvedMode === 'edit' && (
                              <div className="mt-4 flex flex-col gap-2">
                                <button
                                  className="w-full rounded-full border border-line bg-white px-4 py-2.5 text-xs uppercase tracking-[0.16em] text-ink transition hover:border-black shadow-sm"
                                  type="button"
                                  onClick={() =>
                                    setFields((current) =>
                                      current ? appendArrayItem(current, arrayContainer.pathSegments) : current
                                    )
                                  }
                                >
                                  Add New Field
                                </button>

                                {Array.from({ length: rowCount }).map((_, index) => (
                                  <button
                                    key={`${arrayContainer.pathKey}-${index}`}
                                    className="w-full rounded-full border border-transparent bg-transparent px-4 py-2.5 text-xs uppercase tracking-[0.16em] text-mute transition hover:bg-black/5 hover:text-ink"
                                    type="button"
                                    onClick={() =>
                                      setFields((current) =>
                                        current ? removeArrayIndex(current, arrayContainer.pathSegments, index) : current
                                      )
                                    }
                                  >
                                    Remove #{index + 1}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </aside>

              <div className="space-y-6">
                <article className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm sm:p-8">
                  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-mute">Active Focus</p>
                      <h2 className="mt-2 text-3xl font-light tracking-tight text-ink">{activeSection.label}</h2>
                    </div>
                    <p className="text-xs uppercase tracking-[0.16em] text-mute">
                      {groupedRows.reduce((count, group) => count + group.rows.length, 0)} Configurable Fields
                    </p>
                  </div>

                  <div className="mt-8 space-y-8">
                    {groupedRows.map((group) => (
                      <section key={group.label} className="space-y-6">
                        <div className="flex items-center gap-4">
                          <h3 className="text-sm uppercase tracking-[0.2em] text-ink">{group.label}</h3>
                          <div className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
                        </div>

                        <div className="space-y-4">
                          {group.rows.map((row) => {
                            const rowError = findFieldError(fieldErrors, row.pathKey, stepPrefix);
                            const canRemoveFromRow =
                              resolvedMode === 'edit' &&
                              row.arrayPathSegments !== null &&
                              row.arrayIndex !== null &&
                              firstRowByArrayEntry.has(row.pathKey);
                            const fieldLabel = row.label || formatPathLabel(row.pathSegments);

                            return (
                              <div
                                key={row.pathKey}
                                className="group flex flex-col gap-3 rounded-[1.5rem] border border-transparent bg-white/40 p-4 transition-all hover:bg-white/80 hover:shadow-panel lg:flex-row lg:items-start lg:justify-between sm:p-5"
                              >
                                <div className="max-w-md">
                                  <p className="text-[11px] uppercase tracking-[0.2em] text-mute">Field Data</p>
                                  <p className="mt-2 text-base font-light text-ink">{fieldLabel}</p>
                                  {canRemoveFromRow && (
                                    <button
                                      className="mt-3 rounded-full border border-line bg-transparent px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-mute transition hover:border-black hover:text-ink"
                                      type="button"
                                      onClick={() =>
                                        setFields((current) =>
                                          current
                                            ? removeArrayIndex(
                                              current,
                                              row.arrayPathSegments as string[],
                                              row.arrayIndex as number
                                            )
                                            : current
                                        )
                                      }
                                    >
                                      Discard Element #{(row.arrayIndex as number) + 1}
                                    </button>
                                  )}
                                </div>

                                <div className="w-full max-w-xl space-y-2">
                                  {resolvedMode === 'view' || row.inputKind === 'array-empty' ? (
                                    <div className="rounded-[1rem] bg-black/5 px-4 py-3 text-sm font-light text-ink">
                                      {toDisplayValue(row)}
                                    </div>
                                  ) : row.inputKind === 'boolean' ? (
                                    <label className="inline-flex cursor-pointer items-center gap-4 rounded-[1rem] border border-transparent bg-black/5 px-4 py-3 text-sm font-light text-ink transition hover:bg-black/10">
                                      <input
                                        aria-label={fieldLabel}
                                        checked={row.value === true}
                                        className="h-5 w-5 cursor-pointer rounded-full border-line text-ink transition focus:ring-ink focus:ring-offset-0"
                                        type="checkbox"
                                        onChange={(event) =>
                                          setFields((current) =>
                                            current
                                              ? setValueAtPath(current, row.pathSegments, event.target.checked)
                                              : current
                                          )
                                        }
                                      />
                                      <span>{row.value === true ? 'Enabled' : 'Disabled'}</span>
                                    </label>
                                  ) : (
                                    <input
                                      aria-label={fieldLabel}
                                      className={`w-full rounded-[1rem] border bg-transparent px-4 py-3 text-sm font-light text-ink outline-none transition focus:ring-1 ${rowError
                                        ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500'
                                        : 'border-line focus:border-ink focus:ring-ink'
                                        }`}
                                      step={row.inputKind === 'number' ? 'any' : undefined}
                                      type={
                                        row.inputKind === 'date'
                                          ? 'date'
                                          : row.inputKind === 'number'
                                            ? 'number'
                                            : 'text'
                                      }
                                      value={row.value === null ? '' : String(row.value)}
                                      onChange={(event) =>
                                        setFields((current) =>
                                          current
                                            ? setValueAtPath(
                                              current,
                                              row.pathSegments,
                                              toNextInputValue(row, event.target.value)
                                            )
                                            : current
                                        )
                                      }
                                    />
                                  )}

                                  {rowError && <p className="ml-1 mt-2 text-xs font-light text-red-500">{rowError}</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </article>
              </div>
            </div>
          )}
        </section>

        <footer className="mt-8 border-t border-line pt-6 text-center text-xs uppercase tracking-[0.2em] text-mute">
          TaxAlpha Form System • Ensure all records are verified
        </footer>
      </div >
    </main >
  );
}

