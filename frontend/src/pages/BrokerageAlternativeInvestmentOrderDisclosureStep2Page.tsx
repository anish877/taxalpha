import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  BaiodfStepTwoConcentrations,
  BaiodfStepTwoFields,
  BaiodfStepTwoQuestionConfig,
  BaiodfStepTwoQuestionId,
  BaiodfStepTwoResponse,
  BaiodfStepTwoUpdateRequest
} from '../types/api';

const CUSTODIAN_OPTIONS: Array<{
  key: keyof BaiodfStepTwoFields['custodianAndProduct']['custodian'];
  label: string;
}> = [
  { key: 'firstClearing', label: 'First Clearing' },
  { key: 'direct', label: 'Direct' },
  { key: 'mainStar', label: 'MainStar' },
  { key: 'cnb', label: 'CNB' },
  { key: 'kingdomTrust', label: 'Kingdom Trust' },
  { key: 'other', label: 'Other' }
];

function createEmptyStep2Fields(): BaiodfStepTwoFields {
  return {
    custodianAndProduct: {
      custodian: {
        firstClearing: false,
        direct: false,
        mainStar: false,
        cnb: false,
        kingdomTrust: false,
        other: false
      },
      custodianOther: null,
      nameOfProduct: '',
      sponsorIssuer: '',
      dateOfPpm: null,
      datePpmSent: null
    },
    existingAltPositions: {
      existingIlliquidAltPositions: 0,
      existingSemiLiquidAltPositions: 0,
      existingTaxAdvantageAltPositions: 0
    },
    netWorthAndConcentration: {
      totalNetWorth: 0,
      liquidNetWorth: 0
    }
  };
}

function createEmptyConcentrations(): BaiodfStepTwoConcentrations {
  return {
    existingIlliquidAltConcentrationPercent: 0,
    existingSemiLiquidAltConcentrationPercent: 0,
    existingTaxAdvantageAltConcentrationPercent: 0,
    totalConcentrationPercent: 0
  };
}

const QUESTION_CONFIG: Record<BaiodfStepTwoQuestionId, BaiodfStepTwoQuestionConfig> = {
  'step2.custodianAndProduct': {
    key: 'step2.custodianAndProduct',
    title: 'Who is the custodian, and what product is being ordered?',
    helper: 'Pick one custodian and enter product and PPM details.',
    type: 'custodian-product-block'
  },
  'step2.existingAltPositions': {
    key: 'step2.existingAltPositions',
    title: 'What existing alternative positions should we include?',
    helper: 'Use current values for illiquid, semi-liquid, and tax-advantage positions.',
    type: 'existing-alt-positions-block'
  },
  'step2.netWorthAndConcentration': {
    key: 'step2.netWorthAndConcentration',
    title: 'Last check: net worth and concentration.',
    helper: 'Total and liquid net worth drive the read-only concentration percentages.',
    type: 'net-worth-concentration-block'
  }
};

function findQuestionIndex(
  currentQuestionId: BaiodfStepTwoQuestionId | null,
  visibleQuestionIds: BaiodfStepTwoQuestionId[]
): number {
  if (!currentQuestionId) {
    return 0;
  }

  const index = visibleQuestionIds.indexOf(currentQuestionId);
  return index >= 0 ? index : 0;
}

function getErrorForQuestion(
  questionId: BaiodfStepTwoQuestionId,
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

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function getAnswer(fields: BaiodfStepTwoFields, questionId: BaiodfStepTwoQuestionId): unknown {
  switch (questionId) {
    case 'step2.custodianAndProduct':
      return fields.custodianAndProduct;
    case 'step2.existingAltPositions':
      return fields.existingAltPositions;
    case 'step2.netWorthAndConcentration':
      return fields.netWorthAndConcentration;
    default:
      return null;
  }
}

function applyAnswer(
  fields: BaiodfStepTwoFields,
  questionId: BaiodfStepTwoQuestionId,
  answer: unknown
): BaiodfStepTwoFields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step2.custodianAndProduct':
      next.custodianAndProduct = answer as BaiodfStepTwoFields['custodianAndProduct'];
      break;
    case 'step2.existingAltPositions':
      next.existingAltPositions = answer as BaiodfStepTwoFields['existingAltPositions'];
      break;
    case 'step2.netWorthAndConcentration':
      next.netWorthAndConcentration = answer as BaiodfStepTwoFields['netWorthAndConcentration'];
      break;
  }

  return next;
}

export function BrokerageAlternativeInvestmentOrderDisclosureStep2Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<BaiodfStepTwoFields>(createEmptyStep2Fields());
  const [concentrations, setConcentrations] = useState<BaiodfStepTwoConcentrations>(createEmptyConcentrations());
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<BaiodfStepTwoQuestionId[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<BaiodfStepTwoQuestionId | null>(null);

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
        const response = await apiRequest<BaiodfStepTwoResponse>(
          `/api/clients/${clientId}/brokerage-alternative-investment-order-disclosure/step-2`
        );
        setFields(response.onboarding.step.fields);
        setConcentrations(response.onboarding.step.concentrations);
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

        setError('Unable to load BAIODF Step 2.');
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

    const payload: BaiodfStepTwoUpdateRequest = {
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
      const response = await apiRequest<BaiodfStepTwoResponse>(
        `/api/clients/${clientId}/brokerage-alternative-investment-order-disclosure/step-2`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      setFields(response.onboarding.step.fields);
      setConcentrations(response.onboarding.step.concentrations);
      setVisibleQuestionIds(response.onboarding.step.visibleQuestionIds);
      setCurrentQuestionId(response.onboarding.step.currentQuestionId);

      const responseIndex = response.onboarding.step.visibleQuestionIds.indexOf(
        response.onboarding.step.currentQuestionId
      );
      const isStillLastQuestion =
        responseIndex === response.onboarding.step.visibleQuestionIds.length - 1 &&
        response.onboarding.step.currentQuestionId === currentQuestionId;

      if (isStillLastQuestion) {
        pushToast('BAIODF Step 2 saved.');
        navigate(`/clients/${clientId}/brokerage-alternative-investment-order-disclosure/step-3`, {
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

  const renderConcentrationSummary = () => (
    <div className="mt-6 grid gap-3 rounded-2xl border border-line bg-paper/70 p-4 sm:grid-cols-2">
      <p className="text-xs uppercase tracking-[0.14em] text-mute">
        Existing Illiquid Alt Concentration: {formatPercent(concentrations.existingIlliquidAltConcentrationPercent)}
      </p>
      <p className="text-xs uppercase tracking-[0.14em] text-mute">
        Existing Semi-Liquid Alt Concentration: {formatPercent(concentrations.existingSemiLiquidAltConcentrationPercent)}
      </p>
      <p className="text-xs uppercase tracking-[0.14em] text-mute">
        Existing Tax Advantage Alt Concentration: {formatPercent(concentrations.existingTaxAdvantageAltConcentrationPercent)}
      </p>
      <p className="text-xs uppercase tracking-[0.14em] text-mute">
        Total Concentration: {formatPercent(concentrations.totalConcentrationPercent)}
      </p>
    </div>
  );

  const renderActiveControl = () => {
    if (!activeQuestion || !currentQuestionId) {
      return null;
    }

    if (activeQuestion.type === 'custodian-product-block') {
      const answer = currentAnswer as BaiodfStepTwoFields['custodianAndProduct'];

      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-paper p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-mute">Custodian</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CUSTODIAN_OPTIONS.map((option) => (
                <label key={option.key} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    checked={answer.custodian[option.key]}
                    type="checkbox"
                    onChange={() => {
                      const payload = structuredClone(answer);
                      for (const candidate of CUSTODIAN_OPTIONS) {
                        payload.custodian[candidate.key] = candidate.key === option.key;
                      }
                      if (option.key !== 'other') {
                        payload.custodianOther = null;
                      }
                      setFields((current) => applyAnswer(current, 'step2.custodianAndProduct', payload));
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          {answer.custodian.other && (
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Other Custodian</span>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                value={answer.custodianOther ?? ''}
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload.custodianOther = event.target.value;
                  setFields((current) => applyAnswer(current, 'step2.custodianAndProduct', payload));
                }}
              />
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Name of Product</span>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                value={answer.nameOfProduct}
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload.nameOfProduct = event.target.value;
                  setFields((current) => applyAnswer(current, 'step2.custodianAndProduct', payload));
                }}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Sponsor / Issuer</span>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                value={answer.sponsorIssuer}
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload.sponsorIssuer = event.target.value;
                  setFields((current) => applyAnswer(current, 'step2.custodianAndProduct', payload));
                }}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Date of PPM</span>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                type="date"
                value={answer.dateOfPpm ?? ''}
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload.dateOfPpm = event.target.value || null;
                  setFields((current) => applyAnswer(current, 'step2.custodianAndProduct', payload));
                }}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Date PPM Sent</span>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                type="date"
                value={answer.datePpmSent ?? ''}
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload.datePpmSent = event.target.value || null;
                  setFields((current) => applyAnswer(current, 'step2.custodianAndProduct', payload));
                }}
              />
            </label>
          </div>

          {renderConcentrationSummary()}
        </div>
      );
    }

    if (activeQuestion.type === 'existing-alt-positions-block') {
      const answer = currentAnswer as BaiodfStepTwoFields['existingAltPositions'];

      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">
                Existing Illiquid Alt Positions
              </span>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                min={0}
                step="any"
                type="number"
                value={answer.existingIlliquidAltPositions}
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload.existingIlliquidAltPositions = parseAmountInput(event.target.value);
                  setFields((current) => applyAnswer(current, 'step2.existingAltPositions', payload));
                }}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">
                Existing Semi-Liquid Alt Positions
              </span>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                min={0}
                step="any"
                type="number"
                value={answer.existingSemiLiquidAltPositions}
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload.existingSemiLiquidAltPositions = parseAmountInput(event.target.value);
                  setFields((current) => applyAnswer(current, 'step2.existingAltPositions', payload));
                }}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">
                Existing Tax Advantage Alt Positions
              </span>
              <input
                className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                min={0}
                step="any"
                type="number"
                value={answer.existingTaxAdvantageAltPositions}
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload.existingTaxAdvantageAltPositions = parseAmountInput(event.target.value);
                  setFields((current) => applyAnswer(current, 'step2.existingAltPositions', payload));
                }}
              />
            </label>
          </div>
          {renderConcentrationSummary()}
        </div>
      );
    }

    const answer = currentAnswer as BaiodfStepTwoFields['netWorthAndConcentration'];
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Total Net Worth</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              min={0}
              step="any"
              type="number"
              value={answer.totalNetWorth}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.totalNetWorth = parseAmountInput(event.target.value);
                setFields((current) => applyAnswer(current, 'step2.netWorthAndConcentration', payload));
              }}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">
              Liquid Net Worth (Excluding home and auto)
            </span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              min={0}
              step="any"
              type="number"
              value={answer.liquidNetWorth}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.liquidNetWorth = parseAmountInput(event.target.value);
                setFields((current) => applyAnswer(current, 'step2.netWorthAndConcentration', payload));
              }}
            />
          </label>
        </div>
        {renderConcentrationSummary()}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-fog text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-10 pt-8 sm:px-12 sm:pt-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.16em] text-mute transition hover:border-black hover:text-ink"
              type="button"
              onClick={() =>
                navigate(
                  clientId
                    ? `/clients/${clientId}/brokerage-alternative-investment-order-disclosure/step-1`
                    : '/dashboard'
                )
              }
            >
              Back to Step 1
            </button>
            <button
              className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.16em] text-mute transition hover:border-black hover:text-ink"
              type="button"
              onClick={() => navigate('/dashboard')}
            >
              Dashboard
            </button>
          </div>
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
            BROKERAGE ALTERNATIVE INVESTMENT ORDER AND DISCLOSURE - STEP 2
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
                    ? 'Continue to Step 3'
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
