import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError } from '../api/client';
import {
  filledPdfUrl,
  generateDynamicPdf,
  getDynamicForm,
  saveDynamicForm
} from '../api/dynamicForms';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { isVisible } from '../lib/evalShowIf';
import type { IngestedFormSchema, IngestedQuestion } from '../types/api';

type Answers = Record<string, unknown>;

function inputValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function parseNumberInput(raw: string): number | null | string {
  const normalized = raw.trim();
  if (normalized === '') return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : raw;
}

function Field({
  q,
  value,
  onChange
}: {
  q: IngestedQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const base =
    'mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent';

  if (q.options && q.options.length > 0) {
    if (q.type === 'multi-select') {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          {q.options.map((o) => {
            const on = arr.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  on ? 'border-accent bg-accentSoft text-accent' : 'border-line text-ink hover:border-accent'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {q.options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                on ? 'border-accent bg-accentSoft text-accent' : 'border-line text-ink hover:border-accent'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (q.type === 'checkbox') {
    return (
      <label className="mt-2 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> Yes
      </label>
    );
  }
  if (q.type === 'textarea') {
    return (
      <textarea rows={3} className={base} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
    );
  }
  if (q.type === 'signature') {
    return <input className={base} placeholder="Type full name to sign" value={inputValue(value)} onChange={(e) => onChange(e.target.value)} />;
  }
  if (q.type === 'number') {
    return (
      <input
        className={base}
        inputMode="decimal"
        min={0}
        step="any"
        type="number"
        value={inputValue(value)}
        onChange={(e) => onChange(parseNumberInput(e.target.value))}
      />
    );
  }
  const inputType =
    q.type === 'date' ? 'date' : q.type === 'email' ? 'email' : q.type === 'phone' ? 'tel' : 'text';
  return <input type={inputType} className={base} value={inputValue(value)} onChange={(e) => onChange(e.target.value)} />;
}

export function DynamicFormPage() {
  const { clientId = '', code = '' } = useParams<{ clientId: string; code: string }>();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [schema, setSchema] = useState<IngestedFormSchema | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDynamicForm(clientId, code);
      setSchema(data.form.schema);
      setFormTitle(data.form.title);
      setAnswers(data.answers ?? {});
      setPdfReady(data.responseStatus === 'COMPLETED');
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
  }, [clientId, code, navigate, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(
    () => (schema ? schema.items.filter((q) => isVisible(q, answers)) : []),
    [schema, answers]
  );
  const sections = useMemo(
    () => [...new Set(visibleItems.map((i) => i.section))].sort((a, b) => a - b),
    [visibleItems]
  );
  const sectionTitle = (n: number) =>
    schema?.sections.find((s) => s.number === n)?.title ?? (n === 0 ? 'Other' : `Section ${n}`);

  const setAnswer = (id: string, v: unknown) => setAnswers((prev) => ({ ...prev, [id]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await saveDynamicForm(clientId, code, answers);
      pushToast('Progress saved.');
    } catch (e) {
      pushToast(e instanceof ApiError ? e.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await generateDynamicPdf(clientId, code, answers);
      pushToast(`PDF generated — ${res.fieldsFilled} fields filled.`);
      setPdfReady(true);
      window.open(filledPdfUrl(clientId, code), '_blank');
    } catch (e) {
      pushToast(e instanceof ApiError ? e.message : 'Generate failed.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-fog px-4 py-8">
        <div className="mx-auto max-w-3xl space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-paper" />
          ))}
        </div>
      </main>
    );
  }

  if (error || !schema) {
    return (
      <main className="min-h-screen bg-fog px-4 py-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">
          {error ?? 'This form is not available.'}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-fog px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-black/10 bg-paper px-8 py-6 shadow-hairline">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-mute">Fill form</p>
            <h1 className="mt-1 text-3xl font-light tracking-tight text-ink">{formTitle}</h1>
            <p className="mt-1 text-sm text-mute">{visibleItems.length} questions shown</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate(`/clients/${clientId}/forms`)}
              className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-accent"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-full border border-accent px-4 py-2 text-sm text-accent transition hover:bg-accentSoft disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating}
              className="rounded-full bg-accent px-4 py-2 text-sm text-white transition hover:bg-accent/90 disabled:opacity-50"
            >
              {generating ? 'Generating…' : 'Generate PDF'}
            </button>
          </div>
        </header>

        {pdfReady && (
          <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            A completed PDF is available.{' '}
            <a className="underline" href={filledPdfUrl(clientId, code)} target="_blank" rel="noreferrer">
              Open it
            </a>
            .
          </div>
        )}

        {sections.map((sectionNum) => (
          <section key={sectionNum} className="mt-6">
            <h2 className="mb-2 px-1 text-sm font-medium uppercase tracking-[0.14em] text-mute">
              {sectionTitle(sectionNum)}
            </h2>
            <div className="space-y-3">
              {visibleItems
                .filter((q) => q.section === sectionNum)
                .map((q) => (
                  <div key={q.id} className="rounded-2xl border border-line bg-paper p-4 shadow-hairline">
                    <label className="text-sm text-ink">
                      {q.title}
                      {q.required && <span className="text-red-600"> *</span>}
                    </label>
                    {q.helper && <p className="text-xs text-mute">{q.helper}</p>}
                    <Field q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
