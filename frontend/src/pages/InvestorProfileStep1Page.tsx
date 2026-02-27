import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  InvestorProfileStepOneResponse,
  InvestorProfileStepOneUpdateRequest
} from '../types/api';

type QuestionKey = 'rrName' | 'rrNo' | 'customerNames' | 'accountNo' | 'accountType';

interface Step1Values {
  rrName: string;
  rrNo: string;
  customerNames: string;
  accountNo: string;
  accountType: {
    retirement: boolean;
    retail: boolean;
  };
}

interface QuestionDefinition {
  key: QuestionKey;
  eyebrow: string;
  prompt: string;
  helper: string;
  placeholder?: string;
}

const QUESTION_FLOW: QuestionDefinition[] = [
  {
    key: 'rrName',
    eyebrow: 'STEP 1. ACCOUNT REGISTRATION',
    prompt: 'What is the RR Name for this profile?',
    helper: 'Use the exact name you want reflected across the Investor Profile paperwork.',
    placeholder: 'Enter RR Name'
  },
  {
    key: 'rrNo',
    eyebrow: 'STEP 1. ACCOUNT REGISTRATION',
    prompt: 'Great. What RR number should we use?',
    helper: 'This should match your registered representative number on file.',
    placeholder: 'Enter RR No.'
  },
  {
    key: 'customerNames',
    eyebrow: 'STEP 1. ACCOUNT REGISTRATION',
    prompt: 'Who are the customer name(s) on this account?',
    helper: 'Add full legal names exactly as they should appear on the form.',
    placeholder: 'Enter customer name(s)'
  },
  {
    key: 'accountNo',
    eyebrow: 'STEP 1. ACCOUNT REGISTRATION',
    prompt: 'What is the account number?',
    helper: 'Use the account number from your brokerage/custodial record.',
    placeholder: 'Enter account number'
  },
  {
    key: 'accountType',
    eyebrow: 'STEP 1. ACCOUNT REGISTRATION',
    prompt: 'Which account type is this right now?',
    helper: 'Choose one option. We will store both values as booleans for downstream automation.'
  }
];

function emptyStep1Values(): Step1Values {
  return {
    rrName: '',
    rrNo: '',
    customerNames: '',
    accountNo: '',
    accountType: {
      retirement: false,
      retail: false
    }
  };
}

function clampQuestionIndex(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    return 0;
  }

  if (value >= QUESTION_FLOW.length) {
    return QUESTION_FLOW.length - 1;
  }

  return value;
}

export function InvestorProfileStep1Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Step1Values>(emptyStep1Values());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      setError('Invalid client identifier.');
      return;
    }

    const loadStep = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await apiRequest<InvestorProfileStepOneResponse>(
          `/api/clients/${clientId}/investor-profile/step-1`
        );

        setValues(response.onboarding.step.fields);
        setCurrentQuestionIndex(clampQuestionIndex(response.onboarding.step.currentQuestionIndex));
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.statusCode === 401) {
          await signOut();
          navigate('/signin', { replace: true });
          return;
        }

        if (requestError instanceof ApiError && requestError.statusCode === 404) {
          setError('Client onboarding was not found.');
          return;
        }

        setError('Unable to load onboarding step. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    void loadStep();
  }, [clientId, navigate, signOut]);

  const activeQuestion = useMemo(() => QUESTION_FLOW[currentQuestionIndex], [currentQuestionIndex]);

  const setTextField = (key: Exclude<QuestionKey, 'accountType'>, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const selectAccountType = (nextKey: 'retirement' | 'retail') => {
    setValues((current) => ({
      ...current,
      accountType: {
        retirement: nextKey === 'retirement',
        retail: nextKey === 'retail'
      }
    }));
    setFieldErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors.accountType;
      return nextErrors;
    });
  };

  const goBack = () => {
    if (currentQuestionIndex === 0 || saving) {
      return;
    }

    setFieldErrors({});
    setError(null);
    setCurrentQuestionIndex((current) => Math.max(current - 1, 0));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!clientId) {
      setError('Invalid client identifier.');
      return;
    }

    setFieldErrors({});
    setError(null);

    const payload: InvestorProfileStepOneUpdateRequest = {};

    if (activeQuestion.key === 'accountType') {
      const selectedCount = Number(values.accountType.retirement) + Number(values.accountType.retail);

      if (selectedCount !== 1) {
        setFieldErrors({ accountType: 'Please choose exactly one account type.' });
        return;
      }

      payload.accountType = values.accountType;
      payload.currentQuestionIndex = currentQuestionIndex;
    } else {
      const currentValue = values[activeQuestion.key].trim();

      if (!currentValue) {
        const labelMap: Record<string, string> = {
          rrName: 'RR Name is required.',
          rrNo: 'RR No. is required.',
          customerNames: 'Customer Name(s) is required.',
          accountNo: 'Account No. is required.'
        };

        setFieldErrors({ [activeQuestion.key]: labelMap[activeQuestion.key] ?? 'This field is required.' });
        return;
      }

      payload[activeQuestion.key] = currentValue;
      payload.currentQuestionIndex = clampQuestionIndex(currentQuestionIndex + 1);
    }

    setSaving(true);

    try {
      const response = await apiRequest<InvestorProfileStepOneResponse>(
        `/api/clients/${clientId}/investor-profile/step-1`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      setValues(response.onboarding.step.fields);

      if (activeQuestion.key === 'accountType') {
        pushToast('Step 1 saved. You can continue onboarding from the dashboard.');
        navigate('/dashboard', { replace: true });
        return;
      }

      setCurrentQuestionIndex(clampQuestionIndex(payload.currentQuestionIndex ?? currentQuestionIndex + 1));
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFieldErrors(requestError.fieldErrors ?? {});
        setError(requestError.message);
      } else {
        setError('Unable to save this answer right now.');
      }
    } finally {
      setSaving(false);
    }
  };

  const progressPercent = ((currentQuestionIndex + 1) / QUESTION_FLOW.length) * 100;

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
            Question {currentQuestionIndex + 1} / {QUESTION_FLOW.length}
          </p>
        </header>

        <div className="mt-6 h-[3px] w-full rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <section className="flex flex-1 flex-col justify-center py-10 sm:py-14">
          <p className="text-xs uppercase tracking-[0.22em] text-accent">{activeQuestion.eyebrow}</p>
          <h1 className="mt-5 max-w-5xl text-4xl font-light tracking-tight sm:text-6xl lg:text-7xl">
            {activeQuestion.prompt}
          </h1>
          <p className="mt-6 max-w-3xl text-base font-light leading-relaxed text-mute sm:text-lg">
            {activeQuestion.helper}
          </p>

          <form className="mt-10 max-w-3xl" onSubmit={handleSubmit}>
            {activeQuestion.key === 'accountType' ? (
              <div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    className={`rounded-3xl border px-6 py-6 text-left transition ${
                      values.accountType.retirement
                        ? 'border-accent bg-accentSoft text-ink shadow-hairline'
                        : 'border-line bg-paper text-ink hover:border-black/40'
                    }`}
                    type="button"
                    onClick={() => selectAccountType('retirement')}
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-mute">Account Type</p>
                    <p className="mt-2 text-2xl font-light">Retirement</p>
                  </button>

                  <button
                    className={`rounded-3xl border px-6 py-6 text-left transition ${
                      values.accountType.retail
                        ? 'border-accent bg-accentSoft text-ink shadow-hairline'
                        : 'border-line bg-paper text-ink hover:border-black/40'
                    }`}
                    type="button"
                    onClick={() => selectAccountType('retail')}
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-mute">Account Type</p>
                    <p className="mt-2 text-2xl font-light">Retail</p>
                  </button>
                </div>

                {fieldErrors.accountType && <p className="mt-3 text-sm text-black">{fieldErrors.accountType}</p>}
              </div>
            ) : (
              <label className="block">
                <span className="mb-2 block text-sm uppercase tracking-[0.14em] text-mute">
                  {activeQuestion.key === 'rrName' && 'RR Name'}
                  {activeQuestion.key === 'rrNo' && 'RR No.'}
                  {activeQuestion.key === 'customerNames' && 'Customer Name(s)'}
                  {activeQuestion.key === 'accountNo' && 'Account No.'}
                </span>
                <input
                  className="w-full rounded-3xl border border-line bg-paper px-6 py-5 text-2xl font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                  placeholder={activeQuestion.placeholder}
                  value={values[activeQuestion.key]}
                  onChange={(event) =>
                    setTextField(activeQuestion.key as Exclude<QuestionKey, 'accountType'>, event.target.value)
                  }
                />
                {fieldErrors[activeQuestion.key] && (
                  <p className="mt-3 text-sm text-black">{fieldErrors[activeQuestion.key]}</p>
                )}
              </label>
            )}

            {error && <p className="mt-5 rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">{error}</p>}

            <div className="mt-8 flex items-center gap-3">
              <button
                className="rounded-full border border-line px-5 py-3 text-sm text-ink transition hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentQuestionIndex === 0 || saving || loading}
                type="button"
                onClick={goBack}
              >
                Back
              </button>
              <button
                className="rounded-full bg-accent px-6 py-3 text-sm uppercase tracking-[0.14em] text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
                disabled={saving || loading}
                type="submit"
              >
                {saving
                  ? 'Saving...'
                  : activeQuestion.key === 'accountType'
                    ? 'Save Step 1'
                    : 'Continue'}
              </button>
              {loading && <span className="text-sm text-mute">Loading current progress...</span>}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
