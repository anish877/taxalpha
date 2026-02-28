import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  BaiodfStepOneFields,
  BaiodfStepOneQuestionConfig,
  BaiodfStepOneQuestionId,
  BaiodfStepOneResponse,
  BaiodfStepOneUpdateRequest
} from '../types/api';

function createEmptyStep1Fields(): BaiodfStepOneFields {
  return {
    accountRegistration: {
      rrName: '',
      rrNo: '',
      customerNames: ''
    },
    orderBasics: {
      proposedPrincipalAmount: 0,
      qualifiedAccount: {
        yes: false,
        no: false
      },
      qualifiedAccountRmdCertification: false,
      solicitedTrade: {
        yes: false,
        no: false
      },
      taxAdvantagePurchase: {
        yes: false,
        no: false
      }
    }
  };
}

const QUESTION_CONFIG: Record<BaiodfStepOneQuestionId, BaiodfStepOneQuestionConfig> = {
  'step1.accountRegistration': {
    key: 'step1.accountRegistration',
    title: "Let's confirm who this order belongs to.",
    helper: 'We prefilled this from your earlier onboarding where possible.',
    type: 'account-registration-block'
  },
  'step1.orderBasics': {
    key: 'step1.orderBasics',
    title: 'Now a few quick order basics.',
    helper: 'Small yes/no checks here so you can keep moving quickly.',
    type: 'order-basics-block'
  }
};

function findQuestionIndex(
  currentQuestionId: BaiodfStepOneQuestionId | null,
  visibleQuestionIds: BaiodfStepOneQuestionId[]
): number {
  if (!currentQuestionId) {
    return 0;
  }

  const index = visibleQuestionIds.indexOf(currentQuestionId);
  return index >= 0 ? index : 0;
}

function getErrorForQuestion(
  questionId: BaiodfStepOneQuestionId,
  fieldErrors: Record<string, string>
): string | null {
  const direct = fieldErrors[questionId];
  if (direct) {
    return direct;
  }

  const prefixed = Object.keys(fieldErrors).find((key) => key.startsWith(`${questionId}.`));
  return prefixed ? fieldErrors[prefixed] : null;
}

function parseAmountInput(raw: string): number {
  if (!raw.trim()) {
    return 0;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function getAnswer(fields: BaiodfStepOneFields, questionId: BaiodfStepOneQuestionId): unknown {
  switch (questionId) {
    case 'step1.accountRegistration':
      return fields.accountRegistration;
    case 'step1.orderBasics':
      return fields.orderBasics;
    default:
      return null;
  }
}

function applyAnswer(
  fields: BaiodfStepOneFields,
  questionId: BaiodfStepOneQuestionId,
  answer: unknown
): BaiodfStepOneFields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step1.accountRegistration':
      next.accountRegistration = answer as BaiodfStepOneFields['accountRegistration'];
      break;
    case 'step1.orderBasics':
      next.orderBasics = answer as BaiodfStepOneFields['orderBasics'];
      break;
  }

  return next;
}

export function BrokerageAlternativeInvestmentOrderDisclosureStep1Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<BaiodfStepOneFields>(createEmptyStep1Fields());
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<BaiodfStepOneQuestionId[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<BaiodfStepOneQuestionId | null>(null);

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
        const response = await apiRequest<BaiodfStepOneResponse>(
          `/api/clients/${clientId}/brokerage-alternative-investment-order-disclosure/step-1`
        );
        setFields(response.onboarding.step.fields);
        setVisibleQuestionIds(response.onboarding.step.visibleQuestionIds);
        setCurrentQuestionId(response.onboarding.step.currentQuestionId);
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

        setError('Unable to load BAIODF Step 1.');
      } finally {
        setLoading(false);
      }
    };

    void loadStep();
  }, [clientId, navigate, signOut]);

  const activeQuestion = useMemo(
    () => (currentQuestionId ? QUESTION_CONFIG[currentQuestionId] ?? null : null),
    [currentQuestionId]
  );

  const currentQuestionIndex = useMemo(
    () => findQuestionIndex(currentQuestionId, visibleQuestionIds),
    [currentQuestionId, visibleQuestionIds]
  );

  const progressPercent = useMemo(() => {
    if (visibleQuestionIds.length === 0) {
      return 0;
    }

    return ((currentQuestionIndex + 1) / visibleQuestionIds.length) * 100;
  }, [currentQuestionIndex, visibleQuestionIds]);

  const questionError = useMemo(() => {
    if (!currentQuestionId) {
      return null;
    }

    return getErrorForQuestion(currentQuestionId, fieldErrors);
  }, [currentQuestionId, fieldErrors]);

  const currentAnswer = useMemo(() => {
    if (!currentQuestionId) {
      return null;
    }

    return getAnswer(fields, currentQuestionId);
  }, [fields, currentQuestionId]);

  const onBack = () => {
    if (!currentQuestionId || saving) {
      return;
    }

    const index = visibleQuestionIds.indexOf(currentQuestionId);
    if (index <= 0) {
      return;
    }

    setFieldErrors({});
    setError(null);
    setCurrentQuestionId(visibleQuestionIds[index - 1]);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!clientId || !currentQuestionId) {
      setError('Invalid client identifier.');
      return;
    }

    const payload: BaiodfStepOneUpdateRequest = {
      questionId: currentQuestionId,
      answer: currentAnswer,
      clientCursor: {
        currentQuestionId
      }
    };

    setSaving(true);
    setFieldErrors({});
    setError(null);

    try {
      const response = await apiRequest<BaiodfStepOneResponse>(
        `/api/clients/${clientId}/brokerage-alternative-investment-order-disclosure/step-1`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      setFields(response.onboarding.step.fields);
      setVisibleQuestionIds(response.onboarding.step.visibleQuestionIds);
      setCurrentQuestionId(response.onboarding.step.currentQuestionId);

      const responseIndex = response.onboarding.step.visibleQuestionIds.indexOf(
        response.onboarding.step.currentQuestionId
      );
      const isStillLastQuestion =
        responseIndex === response.onboarding.step.visibleQuestionIds.length - 1 &&
        response.onboarding.step.currentQuestionId === currentQuestionId;

      if (isStillLastQuestion) {
        pushToast('BAIODF Step 1 saved.');
        navigate(`/clients/${clientId}/brokerage-alternative-investment-order-disclosure/step-2`, {
          replace: true
        });
      }
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

  const renderYesNo = (
    label: string,
    value: { yes: boolean; no: boolean },
    onChange: (next: { yes: boolean; no: boolean }) => void
  ) => (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-mute">{label}</p>
      <div className="mt-3 flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input checked={value.yes} type="checkbox" onChange={() => onChange({ yes: true, no: false })} />
          Yes
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input checked={value.no} type="checkbox" onChange={() => onChange({ yes: false, no: true })} />
          No
        </label>
      </div>
    </div>
  );

  const renderActiveControl = () => {
    if (!activeQuestion || !currentQuestionId) {
      return null;
    }

    if (activeQuestion.type === 'account-registration-block') {
      const answer = currentAnswer as BaiodfStepOneFields['accountRegistration'];

      return (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">RR Name</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              value={answer.rrName}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.rrName = event.target.value;
                setFields((current) => applyAnswer(current, 'step1.accountRegistration', payload));
              }}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">RR No.</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              value={answer.rrNo}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.rrNo = event.target.value;
                setFields((current) => applyAnswer(current, 'step1.accountRegistration', payload));
              }}
            />
          </label>

          <label className="block sm:col-span-3">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Customer Name(s)</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              value={answer.customerNames}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.customerNames = event.target.value;
                setFields((current) => applyAnswer(current, 'step1.accountRegistration', payload));
              }}
            />
          </label>
        </div>
      );
    }

    const answer = currentAnswer as BaiodfStepOneFields['orderBasics'];
    return (
      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">
            Proposed Principal Amount
          </span>
          <input
            className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
            min={0}
            step="any"
            type="number"
            value={answer.proposedPrincipalAmount}
            onChange={(event) => {
              const payload = structuredClone(answer);
              payload.proposedPrincipalAmount = parseAmountInput(event.target.value);
              setFields((current) => applyAnswer(current, 'step1.orderBasics', payload));
            }}
          />
        </label>

        {renderYesNo('Qualified Account', answer.qualifiedAccount, (nextValue) => {
          const payload = structuredClone(answer);
          payload.qualifiedAccount = nextValue;
          if (!nextValue.yes) {
            payload.qualifiedAccountRmdCertification = false;
          }
          setFields((current) => applyAnswer(current, 'step1.orderBasics', payload));
        })}

        {answer.qualifiedAccount.yes && (
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-4">
            <input
              checked={answer.qualifiedAccountRmdCertification}
              className="mt-1 h-4 w-4"
              type="checkbox"
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.qualifiedAccountRmdCertification = event.target.checked;
                setFields((current) => applyAnswer(current, 'step1.orderBasics', payload));
              }}
            />
            <span className="text-sm text-ink">
              I certify I have other qualified funds available to meet required minimum distributions until this
              product matures.
            </span>
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {renderYesNo('Solicited Trade', answer.solicitedTrade, (nextValue) => {
            const payload = structuredClone(answer);
            payload.solicitedTrade = nextValue;
            setFields((current) => applyAnswer(current, 'step1.orderBasics', payload));
          })}

          {renderYesNo('Tax Advantage Purchase', answer.taxAdvantagePurchase, (nextValue) => {
            const payload = structuredClone(answer);
            payload.taxAdvantagePurchase = nextValue;
            setFields((current) => applyAnswer(current, 'step1.orderBasics', payload));
          })}
        </div>
      </div>
    );
  };

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
            {visibleQuestionIds.length > 0
              ? `Question ${currentQuestionIndex + 1} / ${visibleQuestionIds.length}`
              : 'Question 0 / 0'}
          </p>
        </header>

        <div className="mt-6 h-[3px] w-full rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <section className="flex flex-1 flex-col justify-center py-10 sm:py-14">
          <p className="text-xs uppercase tracking-[0.22em] text-accent">
            BROKERAGE ALTERNATIVE INVESTMENT ORDER AND DISCLOSURE - STEP 1
          </p>
          <h1 className="mt-5 max-w-5xl text-4xl font-light tracking-tight sm:text-6xl lg:text-7xl">
            {activeQuestion?.title ?? 'Loading question...'}
          </h1>
          <p className="mt-6 max-w-3xl text-base font-light leading-relaxed text-mute sm:text-lg">
            {activeQuestion?.helper ?? 'Please wait while we load this step.'}
          </p>

          <form className="mt-10 max-w-5xl" onSubmit={handleSubmit}>
            {renderActiveControl()}

            {questionError && <p className="mt-3 text-sm text-black">{questionError}</p>}

            {error && (
              <p className="mt-5 rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">{error}</p>
            )}

            <div className="mt-8 flex items-center gap-3">
              <button
                className="rounded-full border border-line px-5 py-3 text-sm text-ink transition hover:border-black disabled:cursor-not-allowed disabled:opacity-40"
                disabled={currentQuestionIndex === 0 || saving || loading}
                type="button"
                onClick={onBack}
              >
                Back
              </button>

              <button
                className="rounded-full bg-accent px-6 py-3 text-sm uppercase tracking-[0.14em] text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
                disabled={saving || loading || !activeQuestion}
                type="submit"
              >
                {saving
                  ? 'Saving...'
                  : currentQuestionIndex === visibleQuestionIds.length - 1
                    ? 'Continue to Step 2'
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
