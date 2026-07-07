import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import { filledPdfV2Url, generatePdf, getStep, getStepSchema, postStepAnswer } from '../api/dynamicSteps';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { DynamicStepEnvelope, V2Question, V2Schema } from '../types/api';

// ---- dotted-path helpers ----
function getPath(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj;
  for (const s of path.split('.')) {
    if (cur && typeof cur === 'object' && s in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[s];
    else return undefined;
  }
  return cur;
}
function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const next = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  const segs = path.split('.');
  let cur = next;
  for (let i = 0; i < segs.length - 1; i++) {
    const k = segs[i]!;
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]!] = value;
  return next;
}
function resolveMeta(schema: V2Schema, id: string): V2Question | null {
  for (const it of schema.items) {
    if (it.kind === 'repeat-block' && it.fields) {
      const m = id.match(new RegExp(`^${it.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)\\.(.+)$`));
      if (m) return it.fields.find((f) => f.id === m[2]) ?? null;
    } else if (it.id === id) {
      return it;
    }
  }
  return null;
}

const TEXT_INPUT = 'w-full rounded-3xl border border-line bg-paper px-6 py-5 text-2xl font-light outline-none ring-accent transition focus:border-accent focus:ring-1';

function inputValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function parseNumberInput(raw: string): number | null | string {
  const normalized = raw.trim();
  if (normalized === '') return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : raw;
}

export function SchemaWizardPage() {
  const { clientId = '', code = '', n = '1' } = useParams<{ clientId: string; code: string; n: string }>();
  const step = Number(n) || 1;
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [schema, setSchema] = useState<V2Schema | null>(null);
  const [env, setEnv] = useState<DynamicStepEnvelope | null>(null);
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [idx, setIdx] = useState(0);
  const [totalSteps, setTotalSteps] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async (landOnLast = false) => {
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const sch = schema ?? (await getStepSchema(clientId, code));
      if (!schema) setSchema(sch);
      const resp = await getStep(clientId, code, step);
      const s = resp.onboarding.step;
      setTotalSteps(resp.onboarding.totalSteps);
      if (s.visibleQuestionIds.length === 0) {
        // skip empty (not-required) steps — but never skip a SHOWN question
        if (landOnLast && step > 1) { navigate(`/clients/${clientId}/forms/${code}/step/${step - 1}`, { replace: true }); return; }
        if (step < resp.onboarding.totalSteps) { navigate(`/clients/${clientId}/forms/${code}/step/${step + 1}`, { replace: true }); return; }
        pushToast('Form complete.');
        navigate(`/clients/${clientId}/forms`);
        return;
      }
      setEnv(s);
      setFields(s.fields);
      setIdx(landOnLast ? s.visibleQuestionIds.length - 1 : s.currentQuestionIndex);
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 401) { await signOut(); navigate('/signin', { replace: true }); return; }
      setError(e instanceof ApiError ? e.message : 'Unable to load this form.');
    } finally {
      setLoading(false);
    }
  }, [clientId, code, step, schema, navigate, signOut, pushToast]);

  // `landOnLast` via sessionStorage flag set when navigating Back into a prior step
  useEffect(() => {
    const flag = sessionStorage.getItem(`wizard-back-${clientId}-${code}`);
    if (flag) sessionStorage.removeItem(`wizard-back-${clientId}-${code}`);
    void load(flag === String(step));
  }, [clientId, code, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentId = env?.visibleQuestionIds[idx] ?? null;
  const meta = useMemo(() => (schema && currentId ? resolveMeta(schema, currentId) : null), [schema, currentId]);
  const isAutoFilled = currentId != null && env?.autoFilled.includes(currentId);
  const isLastInStep = env ? idx === env.visibleQuestionIds.length - 1 : false;
  const progress = env && env.visibleQuestionIds.length ? ((idx + 1) / env.visibleQuestionIds.length) * 100 : 0;

  const setAnswer = (value: unknown) => { if (currentId) setFields((f) => setPath(f, currentId, value)); };

  const goBack = () => {
    if (saving) return;
    if (idx > 0) { setIdx(idx - 1); return; }
    if (step > 1) {
      sessionStorage.setItem(`wizard-back-${clientId}-${code}`, String(step - 1));
      navigate(`/clients/${clientId}/forms/${code}/step/${step - 1}`);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentId || !env) return;
    setSaving(true);
    setFieldErrors({});
    setError(null);
    try {
      const wasLast = isLastInStep;
      const resp = await postStepAnswer(clientId, code, step, currentId, getPath(fields, currentId));
      const s = resp.onboarding.step;
      setEnv(s);
      setFields(s.fields);
      const stillLast = s.currentQuestionId === currentId && s.currentQuestionIndex === idx;
      if (wasLast && stillLast) {
        if (step < totalSteps) { navigate(`/clients/${clientId}/forms/${code}/step/${step + 1}`); return; }
        try {
          const gen = await generatePdf(clientId, code);
          pushToast(`All steps complete — PDF generated (${gen.fieldsFilled} fields).`);
          window.open(filledPdfV2Url(clientId, code), '_blank');
        } catch { pushToast('All steps complete.'); }
        navigate(`/clients/${clientId}/forms`);
        return;
      }
      setIdx(s.currentQuestionIndex);
    } catch (err) {
      if (err instanceof ApiError) { setFieldErrors(err.fieldErrors ?? {}); setError(err.message); }
      else setError('Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const continueLabel = saving
    ? 'Saving…'
    : isLastInStep
      ? step < totalSteps ? `Continue to Step ${step + 1}` : 'Finish & generate PDF'
      : 'Continue';

  return (
    <main className="min-h-screen bg-fog text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-10 pt-8 sm:px-12 sm:pt-10">
        <header className="flex items-center justify-between">
          <button
            className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.16em] text-mute transition hover:border-black hover:text-ink"
            type="button"
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </button>
          <p className="text-xs uppercase tracking-[0.2em] text-mute">
            {env && env.visibleQuestionIds.length > 0 ? `Question ${idx + 1} / ${env.visibleQuestionIds.length}` : 'Question 0 / 0'}
          </p>
        </header>

        <div className="mt-6 h-[3px] w-full rounded-full bg-black/10">
          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <section className="flex flex-1 flex-col justify-center py-10 sm:py-14">
          <p className="text-xs uppercase tracking-[0.22em] text-accent">{env?.label ?? `STEP ${step}`}</p>
          <h1 className="mt-5 max-w-5xl text-4xl font-light tracking-tight sm:text-6xl lg:text-7xl">
            {loading ? 'Loading…' : meta?.title ?? 'Loading question...'}
          </h1>
          <p className="mt-6 max-w-3xl text-base font-light leading-relaxed text-mute sm:text-lg">
            {meta?.helper ?? (loading ? 'Please wait while we load your form.' : '')}
          </p>
          {isAutoFilled && (
            <p className="mt-3 text-sm text-accent">Pre-filled from a previous form — please review and edit if needed.</p>
          )}

          <form className="mt-10 max-w-4xl" onSubmit={submit}>
            {meta && currentId && <Control meta={meta} value={getPath(fields, currentId)} qid={currentId} fieldErrors={fieldErrors} onChange={setAnswer} />}

            {error && <p className="mt-5 rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">{error}</p>}

            <div className="mt-8 flex items-center gap-3">
              <button
                className="rounded-full border border-line px-5 py-3 text-sm text-ink transition hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
                disabled={(idx === 0 && step === 1) || saving || loading}
                type="button"
                onClick={goBack}
              >
                Back
              </button>
              <button
                className="rounded-full bg-accent px-6 py-3 text-sm uppercase tracking-[0.14em] text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
                disabled={saving || loading || !meta}
                type="submit"
              >
                {continueLabel}
              </button>
              {loading && <span className="text-sm text-mute">Loading…</span>}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function Control({ meta, value, qid, fieldErrors, onChange }: {
  meta: V2Question; value: unknown; qid: string; fieldErrors: Record<string, string>; onChange: (v: unknown) => void;
}) {
  const err = fieldErrors[qid];

  if (meta.type === 'single-choice-cards' && meta.options) {
    const map = (value && typeof value === 'object' ? value : {}) as Record<string, boolean>;
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2">
          {meta.options.map((o) => {
            const on = map[o.value] === true;
            return (
              <button key={o.value} type="button"
                onClick={() => onChange(Object.fromEntries(meta.options!.map((x) => [x.value, x.value === o.value])))}
                className={`rounded-3xl border px-6 py-6 text-left transition ${on ? 'border-accent bg-accentSoft text-ink shadow-hairline' : 'border-line bg-paper text-ink hover:border-black/40'}`}>
                <p className="text-2xl font-light">{o.label}</p>
                {o.description && <p className="mt-2 text-sm text-mute">{o.description}</p>}
              </button>
            );
          })}
        </div>
        {err && <p className="mt-3 text-sm text-black">{err}</p>}
      </>
    );
  }

  if ((meta.type === 'multi-select' || meta.type === 'certification-checklist') && meta.options) {
    const map = (value && typeof value === 'object' ? value : {}) as Record<string, boolean>;
    return (
      <>
        <div className="space-y-3">
          {meta.options.map((o) => (
            <label key={o.value} className={`flex cursor-pointer items-center gap-3 rounded-3xl border px-6 py-4 transition ${map[o.value] ? 'border-accent bg-accentSoft' : 'border-line bg-paper hover:border-black/40'}`}>
              <input type="checkbox" checked={map[o.value] === true} onChange={(e) => onChange({ ...map, [o.value]: e.target.checked })} />
              <span className="text-lg font-light text-ink">{o.label}{o.required ? <span className="text-accent"> *</span> : null}</span>
            </label>
          ))}
        </div>
        {err && <p className="mt-3 text-sm text-black">{err}</p>}
      </>
    );
  }

  if (meta.type === 'checkbox') {
    return (
      <label className="flex items-center gap-3 text-lg font-light text-ink">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> Yes
      </label>
    );
  }

  if (meta.subFields && meta.subFields.length > 0) {
    const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    return (
      <div className="space-y-4 rounded-3xl border border-line bg-paper/70 p-5 shadow-hairline">
        {meta.subFields.map((sf) => (
          <div key={sf.key}>
            <label className="text-xs uppercase tracking-[0.16em] text-mute">{sf.label}{sf.required ? <span className="text-accent"> *</span> : null}</label>
            <input
              inputMode={sf.type === 'number' ? 'decimal' : undefined}
              min={sf.type === 'number' ? 0 : undefined}
              step={sf.type === 'number' ? 'any' : undefined}
              type={sf.type === 'date' ? 'date' : sf.type === 'email' ? 'email' : sf.type === 'number' ? 'number' : 'text'}
              className="mt-1 w-full rounded-xl border border-line px-4 py-3 text-base font-light outline-none ring-accent focus:border-accent focus:ring-1"
              value={inputValue(obj[sf.key])}
              onChange={(e) =>
                onChange({
                  ...obj,
                  [sf.key]: sf.type === 'number' ? parseNumberInput(e.target.value) : e.target.value
                })
              }
            />
            {fieldErrors[`${qid}.${sf.key}`] && <p className="mt-1 text-xs text-black">{fieldErrors[`${qid}.${sf.key}`]}</p>}
          </div>
        ))}
      </div>
    );
  }

  if (meta.type === 'textarea') {
    return (<><textarea rows={4} className={TEXT_INPUT} value={inputValue(value)} onChange={(e) => onChange(e.target.value)} />{err && <p className="mt-3 text-sm text-black">{err}</p>}</>);
  }

  const inputType = meta.type === 'date' ? 'date' : meta.type === 'email' ? 'email' : meta.type === 'number' ? 'number' : meta.type === 'phone' ? 'tel' : 'text';
  return (
    <>
      <input
        className={TEXT_INPUT}
        inputMode={meta.type === 'number' ? 'decimal' : undefined}
        min={meta.type === 'number' ? 0 : undefined}
        placeholder={meta.type === 'currency' ? '$0' : undefined}
        step={meta.type === 'number' ? 'any' : undefined}
        type={inputType}
        value={inputValue(value)}
        onChange={(e) => onChange(meta.type === 'number' ? parseNumberInput(e.target.value) : e.target.value)}
      />
      {err && <p className="mt-3 text-sm text-black">{err}</p>}
    </>
  );
}
