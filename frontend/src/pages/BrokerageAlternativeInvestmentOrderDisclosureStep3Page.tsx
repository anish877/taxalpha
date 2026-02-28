import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  BaiodfStepThreeFields,
  BaiodfStepThreeQuestionConfig,
  BaiodfStepThreeQuestionId,
  BaiodfStepThreeResponse,
  BaiodfStepThreeUpdateRequest
} from '../types/api';

function createEmptyStep3Fields(): BaiodfStepThreeFields {
  return {
    acknowledgements: {
      illiquidLongTerm: false,
      reviewedProspectusOrPpm: false,
      understandFeesAndExpenses: false,
      noPublicMarket: false,
      limitedRedemptionAndSaleRisk: false,
      speculativeMayLoseInvestment: false,
      distributionsMayVaryOrStop: false,
      meetsSuitabilityStandards: false,
      featuresRisksDiscussed: false,
      meetsFinancialGoalsAndAccurate: false
    },
    signatures: {
      accountOwner: {
        typedSignature: null,
        printedName: null,
        date: null
      },
      jointAccountOwner: {
        typedSignature: null,
        printedName: null,
        date: null
      },
      financialProfessional: {
        typedSignature: null,
        printedName: null,
        date: null
      }
    }
  };
}

const ACKNOWLEDGEMENT_ITEMS: Array<{
  key: keyof BaiodfStepThreeFields['acknowledgements'];
  label: string;
}> = [
  {
    key: 'illiquidLongTerm',
    label:
      'I/We understand this investment may be illiquid, long-term, and may not be available for short-term liquidity needs.'
  },
  {
    key: 'reviewedProspectusOrPpm',
    label: 'I/We reviewed the prospectus or private placement memorandum for this product.'
  },
  {
    key: 'understandFeesAndExpenses',
    label: 'I/We understand the fees and expenses associated with this purchase.'
  },
  {
    key: 'noPublicMarket',
    label: 'I/We understand this alternative investment may not be publicly traded and may have no active market.'
  },
  {
    key: 'limitedRedemptionAndSaleRisk',
    label:
      'I/We understand sale or redemption may be limited, may require price concessions, and may not be available at all.'
  },
  {
    key: 'speculativeMayLoseInvestment',
    label:
      'I/We understand this is speculative and I/we may lose some or all invested principal.'
  },
  {
    key: 'distributionsMayVaryOrStop',
    label:
      'I/We understand dividends/distributions may vary, stop entirely, or include return of capital.'
  },
  {
    key: 'meetsSuitabilityStandards',
    label: 'I/We meet the issuer and state suitability standards.'
  },
  {
    key: 'featuresRisksDiscussed',
    label:
      'I/We discussed product features/risks and my/our financial, tax, risk tolerance, and objective profile with my/our representative.'
  },
  {
    key: 'meetsFinancialGoalsAndAccurate',
    label:
      'I/We believe this investment aligns with my/our goals and that all information provided is accurate at signing.'
  }
];

const QUESTION_CONFIG: Record<BaiodfStepThreeQuestionId, BaiodfStepThreeQuestionConfig> = {
  'step3.acknowledgements': {
    key: 'step3.acknowledgements',
    title: 'Please acknowledge each disclosure statement.',
    helper: 'All 10 acknowledgements are required before signature capture.',
    type: 'acknowledgements-block'
  },
  'step3.signatures.accountOwners': {
    key: 'step3.signatures.accountOwners',
    title: 'Capture account owner signatures.',
    helper: 'Account owner signature is required. Joint owner appears only when required for this account type.',
    type: 'account-owner-signatures-block'
  },
  'step3.signatures.financialProfessional': {
    key: 'step3.signatures.financialProfessional',
    title: 'Capture financial professional signature.',
    helper: 'Final required signature to complete BAIODF.',
    type: 'financial-professional-signature-block'
  }
};

function findQuestionIndex(
  currentQuestionId: BaiodfStepThreeQuestionId | null,
  visibleQuestionIds: BaiodfStepThreeQuestionId[]
): number {
  if (!currentQuestionId) {
    return 0;
  }

  const index = visibleQuestionIds.indexOf(currentQuestionId);
  return index >= 0 ? index : 0;
}

function getErrorForQuestion(
  questionId: BaiodfStepThreeQuestionId,
  fieldErrors: Record<string, string>
): string | null {
  const direct = fieldErrors[questionId];
  if (direct) {
    return direct;
  }

  if (questionId === 'step3.signatures.accountOwners') {
    const key = Object.keys(fieldErrors).find((item) => item.startsWith('step3.signatures.accountOwners.'));
    return key ? fieldErrors[key] : null;
  }

  if (questionId === 'step3.signatures.financialProfessional') {
    const key = Object.keys(fieldErrors).find((item) => item.startsWith('step3.signatures.financialProfessional.'));
    return key ? fieldErrors[key] : null;
  }

  const prefixed = Object.keys(fieldErrors).find((item) => item.startsWith(`${questionId}.`));
  return prefixed ? fieldErrors[prefixed] : null;
}

function getAnswer(fields: BaiodfStepThreeFields, questionId: BaiodfStepThreeQuestionId): unknown {
  switch (questionId) {
    case 'step3.acknowledgements':
      return fields.acknowledgements;
    case 'step3.signatures.accountOwners':
      return {
        accountOwner: fields.signatures.accountOwner,
        jointAccountOwner: fields.signatures.jointAccountOwner
      };
    case 'step3.signatures.financialProfessional':
      return {
        financialProfessional: fields.signatures.financialProfessional
      };
    default:
      return null;
  }
}

function applyAnswer(
  fields: BaiodfStepThreeFields,
  questionId: BaiodfStepThreeQuestionId,
  answer: unknown
): BaiodfStepThreeFields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step3.acknowledgements':
      next.acknowledgements = answer as BaiodfStepThreeFields['acknowledgements'];
      break;
    case 'step3.signatures.accountOwners': {
      const payload = answer as {
        accountOwner: BaiodfStepThreeFields['signatures']['accountOwner'];
        jointAccountOwner: BaiodfStepThreeFields['signatures']['jointAccountOwner'];
      };
      next.signatures.accountOwner = payload.accountOwner;
      next.signatures.jointAccountOwner = payload.jointAccountOwner;
      break;
    }
    case 'step3.signatures.financialProfessional': {
      const payload = answer as {
        financialProfessional: BaiodfStepThreeFields['signatures']['financialProfessional'];
      };
      next.signatures.financialProfessional = payload.financialProfessional;
      break;
    }
  }

  return next;
}

export function BrokerageAlternativeInvestmentOrderDisclosureStep3Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<BaiodfStepThreeFields>(createEmptyStep3Fields());
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<BaiodfStepThreeQuestionId[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<BaiodfStepThreeQuestionId | null>(null);
  const [requiresJointOwnerSignature, setRequiresJointOwnerSignature] = useState(false);

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
        const response = await apiRequest<BaiodfStepThreeResponse>(
          `/api/clients/${clientId}/brokerage-alternative-investment-order-disclosure/step-3`
        );
        setFields(response.onboarding.step.fields);
        setVisibleQuestionIds(response.onboarding.step.visibleQuestionIds);
        setCurrentQuestionId(response.onboarding.step.currentQuestionId);
        setRequiresJointOwnerSignature(response.onboarding.step.requiresJointOwnerSignature);
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

        setError('Unable to load BAIODF Step 3.');
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

    const payload: BaiodfStepThreeUpdateRequest = {
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
      const response = await apiRequest<BaiodfStepThreeResponse>(
        `/api/clients/${clientId}/brokerage-alternative-investment-order-disclosure/step-3`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      setFields(response.onboarding.step.fields);
      setVisibleQuestionIds(response.onboarding.step.visibleQuestionIds);
      setCurrentQuestionId(response.onboarding.step.currentQuestionId);
      setRequiresJointOwnerSignature(response.onboarding.step.requiresJointOwnerSignature);

      const responseIndex = response.onboarding.step.visibleQuestionIds.indexOf(
        response.onboarding.step.currentQuestionId
      );
      const isStillLastQuestion =
        responseIndex === response.onboarding.step.visibleQuestionIds.length - 1 &&
        response.onboarding.step.currentQuestionId === currentQuestionId;

      if (isStillLastQuestion) {
        pushToast('BAIODF onboarding completed.');
        navigate(response.onboarding.step.nextRouteAfterCompletion ?? '/dashboard', { replace: true });
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

  const renderSignatureFields = (
    label: string,
    value: { typedSignature: string | null; printedName: string | null; date: string | null },
    onChange: (next: { typedSignature: string | null; printedName: string | null; date: string | null }) => void
  ) => (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-mute">{label}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Typed Signature</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
            type="text"
            value={value.typedSignature ?? ''}
            onChange={(event) => onChange({ ...value, typedSignature: event.target.value })}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Printed Name</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
            type="text"
            value={value.printedName ?? ''}
            onChange={(event) => onChange({ ...value, printedName: event.target.value })}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Date</span>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
            type="date"
            value={value.date ?? ''}
            onChange={(event) => onChange({ ...value, date: event.target.value })}
          />
        </label>
      </div>
    </div>
  );

  const renderActiveControl = () => {
    if (!activeQuestion || !currentQuestionId) {
      return null;
    }

    if (activeQuestion.type === 'acknowledgements-block') {
      const answer = currentAnswer as BaiodfStepThreeFields['acknowledgements'];

      return (
        <div className="space-y-4">
          {ACKNOWLEDGEMENT_ITEMS.map((item) => (
            <label key={item.key} className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-4">
              <input
                checked={answer[item.key]}
                className="mt-1 h-4 w-4"
                type="checkbox"
                onChange={(event) => {
                  const payload = structuredClone(answer);
                  payload[item.key] = event.target.checked;
                  setFields((current) => applyAnswer(current, 'step3.acknowledgements', payload));
                }}
              />
              <span className="text-sm text-ink">{item.label}</span>
            </label>
          ))}
        </div>
      );
    }

    if (activeQuestion.type === 'account-owner-signatures-block') {
      const answer = currentAnswer as {
        accountOwner: BaiodfStepThreeFields['signatures']['accountOwner'];
        jointAccountOwner: BaiodfStepThreeFields['signatures']['jointAccountOwner'];
      };

      return (
        <div className="space-y-4">
          {renderSignatureFields('Account Owner Signature (Required)', answer.accountOwner, (nextValue) => {
            const payload = structuredClone(answer);
            payload.accountOwner = nextValue;
            setFields((current) => applyAnswer(current, 'step3.signatures.accountOwners', payload));
          })}

          {requiresJointOwnerSignature &&
            renderSignatureFields('Joint Account Owner Signature (Required)', answer.jointAccountOwner, (nextValue) => {
              const payload = structuredClone(answer);
              payload.jointAccountOwner = nextValue;
              setFields((current) => applyAnswer(current, 'step3.signatures.accountOwners', payload));
            })}
        </div>
      );
    }

    const answer = currentAnswer as {
      financialProfessional: BaiodfStepThreeFields['signatures']['financialProfessional'];
    };

    return renderSignatureFields(
      'Financial Professional Signature (Required)',
      answer.financialProfessional,
      (nextValue) => {
        const payload = structuredClone(answer);
        payload.financialProfessional = nextValue;
        setFields((current) => applyAnswer(current, 'step3.signatures.financialProfessional', payload));
      }
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
                    ? `/clients/${clientId}/brokerage-alternative-investment-order-disclosure/step-2`
                    : '/dashboard'
                )
              }
            >
              Back to Step 2
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
            BROKERAGE ALTERNATIVE INVESTMENT ORDER AND DISCLOSURE - STEP 3
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
                    ? 'Save and Return'
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
