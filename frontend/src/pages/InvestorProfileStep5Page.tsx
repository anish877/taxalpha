import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  InvestorProfileStepFiveFields,
  InvestorProfileStepFiveQuestionConfig,
  InvestorProfileStepFiveQuestionId,
  InvestorProfileStepFiveResponse,
  InvestorProfileStepFiveUpdateRequest
} from '../types/api';

const RISK_OPTIONS = [
  { key: 'low', label: 'Low' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'speculation', label: 'Speculation' },
  { key: 'highRisk', label: 'High Risk' }
] as const;

const OBJECTIVE_OPTIONS = [
  { key: 'income', label: 'Income' },
  { key: 'longTermGrowth', label: 'Long-Term Growth' },
  { key: 'shortTermGrowth', label: 'Short-Term Growth' }
] as const;

const YES_NO_OPTIONS = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' }
] as const;

const LIQUIDITY_OPTIONS = [
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' }
] as const;

const MARKET_INCOME_FIELDS: Array<{
  key: keyof InvestorProfileStepFiveFields['investments']['fixedValues']['marketIncome'];
  label: string;
}> = [
  { key: 'equities', label: 'Equities' },
  { key: 'options', label: 'Options' },
  { key: 'fixedIncome', label: 'Fixed Income' },
  { key: 'mutualFunds', label: 'Mutual Funds' },
  { key: 'unitInvestmentTrusts', label: 'Unit Investment Trusts' },
  { key: 'exchangeTradedFunds', label: 'Exchange-Traded Funds' }
];

const ALTERNATIVES_INSURANCE_FIELDS: Array<{
  key: keyof InvestorProfileStepFiveFields['investments']['fixedValues']['alternativesInsurance'];
  label: string;
}> = [
  { key: 'realEstate', label: 'Real Estate' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'variableAnnuities', label: 'Variable Annuities' },
  { key: 'fixedAnnuities', label: 'Fixed Annuities' },
  { key: 'preciousMetals', label: 'Precious Metals' },
  { key: 'commoditiesFutures', label: 'Commodities/Futures' }
];

function createEmptyStep5Fields(): InvestorProfileStepFiveFields {
  return {
    profile: {
      riskExposure: {
        low: false,
        moderate: false,
        speculation: false,
        highRisk: false
      },
      accountObjectives: {
        income: false,
        longTermGrowth: false,
        shortTermGrowth: false
      }
    },
    investments: {
      fixedValues: {
        marketIncome: {
          equities: null,
          options: null,
          fixedIncome: null,
          mutualFunds: null,
          unitInvestmentTrusts: null,
          exchangeTradedFunds: null
        },
        alternativesInsurance: {
          realEstate: null,
          insurance: null,
          variableAnnuities: null,
          fixedAnnuities: null,
          preciousMetals: null,
          commoditiesFutures: null
        }
      },
      hasOther: {
        yes: false,
        no: false
      },
      otherEntries: {
        entries: []
      }
    },
    horizonAndLiquidity: {
      timeHorizon: {
        fromYear: null,
        toYear: null
      },
      liquidityNeeds: {
        high: false,
        medium: false,
        low: false
      }
    }
  };
}

const QUESTION_CONFIG: Record<InvestorProfileStepFiveQuestionId, InvestorProfileStepFiveQuestionConfig> = {
  'step5.profile.riskExposure': {
    key: 'step5.profile.riskExposure',
    title: 'How would you describe risk exposure for this account?',
    helper: 'Select one risk exposure level.',
    type: 'single-choice-cards',
    options: [...RISK_OPTIONS]
  },
  'step5.profile.accountObjectives': {
    key: 'step5.profile.accountObjectives',
    title: 'What are the account investment objectives?',
    helper: 'Select one or more objectives.',
    type: 'multi-select-cards',
    options: [...OBJECTIVE_OPTIONS]
  },
  'step5.investments.fixedValues.marketIncome': {
    key: 'step5.investments.fixedValues.marketIncome',
    title: 'Enter current values for market and income holdings.',
    helper: 'All values are required. Enter 0 if none.',
    type: 'investment-values-block'
  },
  'step5.investments.fixedValues.alternativesInsurance': {
    key: 'step5.investments.fixedValues.alternativesInsurance',
    title: 'Enter current values for alternatives and insurance holdings.',
    helper: 'All values are required. Enter 0 if none.',
    type: 'investment-values-block'
  },
  'step5.investments.hasOther': {
    key: 'step5.investments.hasOther',
    title: 'Do you want to add other investment categories?',
    helper: 'Select Yes to add custom categories with values.',
    type: 'single-choice-cards',
    options: [...YES_NO_OPTIONS]
  },
  'step5.investments.otherEntries': {
    key: 'step5.investments.otherEntries',
    title: 'Add other investment categories and values.',
    helper: 'Add at least one row with category name and value.',
    type: 'other-investments-block'
  },
  'step5.horizonAndLiquidity': {
    key: 'step5.horizonAndLiquidity',
    title: 'What is the investment time horizon and liquidity need?',
    helper: 'Enter From Year and To Year, then select one liquidity need.',
    type: 'horizon-liquidity-block'
  }
};

function findQuestionIndex(
  currentQuestionId: InvestorProfileStepFiveQuestionId | null,
  visibleQuestionIds: InvestorProfileStepFiveQuestionId[]
): number {
  if (!currentQuestionId) {
    return 0;
  }

  const index = visibleQuestionIds.indexOf(currentQuestionId);
  return index >= 0 ? index : 0;
}

function getErrorForQuestion(
  questionId: InvestorProfileStepFiveQuestionId,
  fieldErrors: Record<string, string>
): string | null {
  const directError = fieldErrors[questionId];
  if (directError) {
    return directError;
  }

  if (questionId === 'step5.investments.fixedValues.marketIncome') {
    const key = Object.keys(fieldErrors).find((item) =>
      item.startsWith('step5.investments.fixedValues.marketIncome.')
    );
    return key ? fieldErrors[key] : null;
  }

  if (questionId === 'step5.investments.fixedValues.alternativesInsurance') {
    const key = Object.keys(fieldErrors).find((item) =>
      item.startsWith('step5.investments.fixedValues.alternativesInsurance.')
    );
    return key ? fieldErrors[key] : null;
  }

  if (questionId === 'step5.investments.otherEntries') {
    const key = Object.keys(fieldErrors).find((item) =>
      item.startsWith('step5.investments.otherEntries.')
    );
    return key ? fieldErrors[key] : null;
  }

  if (questionId === 'step5.horizonAndLiquidity') {
    const key = Object.keys(fieldErrors).find((item) =>
      item.startsWith('step5.horizonAndLiquidity.')
    );
    return key ? fieldErrors[key] : null;
  }

  const prefixed = Object.keys(fieldErrors).find((item) => item.startsWith(`${questionId}.`));
  return prefixed ? fieldErrors[prefixed] : null;
}

function selectOne(map: Record<string, boolean>, selectedKey: string): void {
  Object.keys(map).forEach((key) => {
    map[key] = key === selectedKey;
  });
}

function toggleOne(map: Record<string, boolean>, selectedKey: string): void {
  map[selectedKey] = !map[selectedKey];
}

function parseNumericInput(raw: string): number | null {
  if (!raw.trim()) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function setSingleChoice(
  fields: InvestorProfileStepFiveFields,
  questionId: InvestorProfileStepFiveQuestionId,
  selectedKey: string
): InvestorProfileStepFiveFields {
  const next = structuredClone(fields);

  if (questionId === 'step5.profile.riskExposure') {
    selectOne(next.profile.riskExposure, selectedKey);
  }

  if (questionId === 'step5.investments.hasOther') {
    selectOne(next.investments.hasOther, selectedKey);
  }

  return next;
}

function getAnswer(fields: InvestorProfileStepFiveFields, questionId: InvestorProfileStepFiveQuestionId): unknown {
  switch (questionId) {
    case 'step5.profile.riskExposure':
      return fields.profile.riskExposure;
    case 'step5.profile.accountObjectives':
      return fields.profile.accountObjectives;
    case 'step5.investments.fixedValues.marketIncome':
      return fields.investments.fixedValues.marketIncome;
    case 'step5.investments.fixedValues.alternativesInsurance':
      return fields.investments.fixedValues.alternativesInsurance;
    case 'step5.investments.hasOther':
      return fields.investments.hasOther;
    case 'step5.investments.otherEntries':
      return fields.investments.otherEntries;
    case 'step5.horizonAndLiquidity':
      return fields.horizonAndLiquidity;
    default:
      return null;
  }
}

function applyAnswer(
  fields: InvestorProfileStepFiveFields,
  questionId: InvestorProfileStepFiveQuestionId,
  answer: unknown
): InvestorProfileStepFiveFields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step5.profile.riskExposure':
      next.profile.riskExposure = answer as InvestorProfileStepFiveFields['profile']['riskExposure'];
      break;
    case 'step5.profile.accountObjectives':
      next.profile.accountObjectives = answer as InvestorProfileStepFiveFields['profile']['accountObjectives'];
      break;
    case 'step5.investments.fixedValues.marketIncome':
      next.investments.fixedValues.marketIncome =
        answer as InvestorProfileStepFiveFields['investments']['fixedValues']['marketIncome'];
      break;
    case 'step5.investments.fixedValues.alternativesInsurance':
      next.investments.fixedValues.alternativesInsurance =
        answer as InvestorProfileStepFiveFields['investments']['fixedValues']['alternativesInsurance'];
      break;
    case 'step5.investments.hasOther':
      next.investments.hasOther = answer as InvestorProfileStepFiveFields['investments']['hasOther'];
      break;
    case 'step5.investments.otherEntries':
      next.investments.otherEntries = answer as InvestorProfileStepFiveFields['investments']['otherEntries'];
      break;
    case 'step5.horizonAndLiquidity':
      next.horizonAndLiquidity = answer as InvestorProfileStepFiveFields['horizonAndLiquidity'];
      break;
  }

  return next;
}

export function InvestorProfileStep5Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<InvestorProfileStepFiveFields>(createEmptyStep5Fields());
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<InvestorProfileStepFiveQuestionId[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<InvestorProfileStepFiveQuestionId | null>(null);
  const [requiresStep4, setRequiresStep4] = useState(false);

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
        const response = await apiRequest<InvestorProfileStepFiveResponse>(
          `/api/clients/${clientId}/investor-profile/step-5`
        );
        setFields(response.onboarding.step.fields);
        setVisibleQuestionIds(response.onboarding.step.visibleQuestionIds);
        setCurrentQuestionId(response.onboarding.step.currentQuestionId);
        setRequiresStep4(response.onboarding.step.requiresStep4);
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

        setError('Unable to load Step 5 right now. Please try again.');
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

    const payload: InvestorProfileStepFiveUpdateRequest = {
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
      const response = await apiRequest<InvestorProfileStepFiveResponse>(
        `/api/clients/${clientId}/investor-profile/step-5`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      setFields(response.onboarding.step.fields);
      setVisibleQuestionIds(response.onboarding.step.visibleQuestionIds);
      setCurrentQuestionId(response.onboarding.step.currentQuestionId);
      setRequiresStep4(response.onboarding.step.requiresStep4);

      const responseIndex = response.onboarding.step.visibleQuestionIds.indexOf(
        response.onboarding.step.currentQuestionId
      );
      const isStillLastQuestion =
        responseIndex === response.onboarding.step.visibleQuestionIds.length - 1 &&
        response.onboarding.step.currentQuestionId === currentQuestionId;

      if (isStillLastQuestion) {
        pushToast('Step 5 saved.');
        navigate(`/clients/${clientId}/investor-profile/step-6`, { replace: true });
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

  const renderSingleChoice = (
    options: readonly { key: string; label: string }[],
    answer: Record<string, boolean>,
    onSelect: (key: string) => void
  ) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {options.map((option) => {
        const selected = answer?.[option.key] ?? false;
        return (
          <button
            key={option.key}
            className={`rounded-3xl border px-6 py-6 text-left transition ${
              selected
                ? 'border-accent bg-accentSoft text-ink shadow-hairline'
                : 'border-line bg-paper text-ink hover:border-black/40'
            }`}
            type="button"
            onClick={() => {
              onSelect(option.key);
              setFieldErrors({});
            }}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-mute">Select One</p>
            <p className="mt-2 text-2xl font-light">{option.label}</p>
          </button>
        );
      })}
    </div>
  );

  const renderMultiSelect = (
    options: readonly { key: string; label: string }[],
    answer: Record<string, boolean>,
    onToggle: (key: string) => void
  ) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {options.map((option) => {
        const selected = answer?.[option.key] ?? false;
        return (
          <button
            key={option.key}
            className={`rounded-3xl border px-6 py-6 text-left transition ${
              selected
                ? 'border-accent bg-accentSoft text-ink shadow-hairline'
                : 'border-line bg-paper text-ink hover:border-black/40'
            }`}
            type="button"
            onClick={() => {
              onToggle(option.key);
              setFieldErrors({});
            }}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-mute">Select Any</p>
            <p className="mt-2 text-2xl font-light">{option.label}</p>
          </button>
        );
      })}
    </div>
  );

  const renderMarketIncomeBlock = () => {
    const answer = currentAnswer as InvestorProfileStepFiveFields['investments']['fixedValues']['marketIncome'];

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {MARKET_INCOME_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">{field.label}</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              min={0}
              step="any"
              type="number"
              value={answer[field.key] ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload[field.key] = parseNumericInput(event.target.value);
                setFields((current) => applyAnswer(current, 'step5.investments.fixedValues.marketIncome', payload));
              }}
            />
          </label>
        ))}
      </div>
    );
  };

  const renderAlternativesInsuranceBlock = () => {
    const answer =
      currentAnswer as InvestorProfileStepFiveFields['investments']['fixedValues']['alternativesInsurance'];

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {ALTERNATIVES_INSURANCE_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">{field.label}</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              min={0}
              step="any"
              type="number"
              value={answer[field.key] ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload[field.key] = parseNumericInput(event.target.value);
                setFields((current) =>
                  applyAnswer(current, 'step5.investments.fixedValues.alternativesInsurance', payload)
                );
              }}
            />
          </label>
        ))}
      </div>
    );
  };

  const renderOtherInvestmentsBlock = () => {
    const answer = currentAnswer as InvestorProfileStepFiveFields['investments']['otherEntries'];

    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {answer.entries.map((entry, index) => (
            <div key={index} className="grid gap-3 rounded-2xl border border-line bg-paper p-4 sm:grid-cols-[1fr_180px_auto]">
              <input
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                placeholder="Other investment category"
                value={entry.label ?? ''}
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload.entries[index].label = event.target.value;
                  setFields((current) => applyAnswer(current, 'step5.investments.otherEntries', payload));
                }}
              />
              <input
                className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                min={0}
                step="any"
                type="number"
                value={entry.value ?? ''}
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload.entries[index].value = parseNumericInput(event.target.value);
                  setFields((current) => applyAnswer(current, 'step5.investments.otherEntries', payload));
                }}
              />
              <button
                className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.12em] text-mute transition hover:border-black hover:text-ink"
                type="button"
                onClick={() => {
                  const payload = structuredClone(answer);
                  payload.entries.splice(index, 1);
                  setFields((current) => applyAnswer(current, 'step5.investments.otherEntries', payload));
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button
          className="rounded-full border border-line px-5 py-2 text-xs uppercase tracking-[0.12em] text-mute transition hover:border-black hover:text-ink"
          type="button"
          onClick={() => {
            const payload = structuredClone(answer);
            payload.entries.push({ label: null, value: null });
            setFields((current) => applyAnswer(current, 'step5.investments.otherEntries', payload));
            setFieldErrors({});
          }}
        >
          Add Other Investment
        </button>
      </div>
    );
  };

  const renderHorizonAndLiquidityBlock = () => {
    const answer = currentAnswer as InvestorProfileStepFiveFields['horizonAndLiquidity'];

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">From Year</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              max={2100}
              min={1900}
              type="number"
              value={answer.timeHorizon.fromYear ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.timeHorizon.fromYear = parseNumericInput(event.target.value);
                setFields((current) => applyAnswer(current, 'step5.horizonAndLiquidity', payload));
              }}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">To Year</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              max={2100}
              min={1900}
              type="number"
              value={answer.timeHorizon.toYear ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.timeHorizon.toYear = parseNumericInput(event.target.value);
                setFields((current) => applyAnswer(current, 'step5.horizonAndLiquidity', payload));
              }}
            />
          </label>
        </div>

        {renderSingleChoice(LIQUIDITY_OPTIONS, answer.liquidityNeeds, (key) => {
          const payload = structuredClone(answer);
          selectOne(payload.liquidityNeeds, key);
          setFields((current) => applyAnswer(current, 'step5.horizonAndLiquidity', payload));
        })}
      </div>
    );
  };

  const renderActiveControl = () => {
    if (!activeQuestion || !currentQuestionId) {
      return null;
    }

    if (activeQuestion.type === 'single-choice-cards' && activeQuestion.options) {
      const answer = currentAnswer as Record<string, boolean>;
      return renderSingleChoice(activeQuestion.options, answer, (key) => {
        setFields((current) => setSingleChoice(current, currentQuestionId, key));
      });
    }

    if (activeQuestion.type === 'multi-select-cards' && activeQuestion.options) {
      const answer = currentAnswer as Record<string, boolean>;
      return renderMultiSelect(activeQuestion.options, answer, (key) => {
        setFields((current) => {
          const next = structuredClone(current);
          toggleOne(next.profile.accountObjectives, key);
          return next;
        });
      });
    }

    if (activeQuestion.type === 'investment-values-block') {
      if (currentQuestionId === 'step5.investments.fixedValues.marketIncome') {
        return renderMarketIncomeBlock();
      }

      return renderAlternativesInsuranceBlock();
    }

    if (activeQuestion.type === 'other-investments-block') {
      return renderOtherInvestmentsBlock();
    }

    if (activeQuestion.type === 'horizon-liquidity-block') {
      return renderHorizonAndLiquidityBlock();
    }

    return null;
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
                    ? requiresStep4
                      ? `/clients/${clientId}/investor-profile/step-4`
                      : `/clients/${clientId}/investor-profile/step-3`
                    : '/dashboard'
                )
              }
            >
              {requiresStep4 ? 'Back to Step 4' : 'Back to Step 3'}
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
          <p className="text-xs uppercase tracking-[0.22em] text-accent">STEP 5. OBJECTIVES AND INVESTMENT DETAIL</p>
          <h1 className="mt-5 max-w-5xl text-4xl font-light tracking-tight sm:text-6xl lg:text-7xl">
            {activeQuestion?.title ?? 'Loading question...'}
          </h1>
          <p className="mt-6 max-w-3xl text-base font-light leading-relaxed text-mute sm:text-lg">
            {activeQuestion?.helper ?? 'Please wait while we load your onboarding flow.'}
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
                    ? 'Continue to Step 6'
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
