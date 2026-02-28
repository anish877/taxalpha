import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  StatementOfFinancialConditionStepTwoFields,
  StatementOfFinancialConditionStepTwoQuestionConfig,
  StatementOfFinancialConditionStepTwoQuestionId,
  StatementOfFinancialConditionStepTwoResponse,
  StatementOfFinancialConditionStepTwoUpdateRequest
} from '../types/api';

function createEmptyStep2Fields(): StatementOfFinancialConditionStepTwoFields {
  return {
    notes: {
      notes: null,
      additionalNotes: null
    },
    acknowledgements: {
      attestDataAccurateComplete: false,
      agreeReportMaterialChanges: false,
      understandMayNeedRecertification: false,
      understandMayNeedSupportingDocumentation: false,
      understandInfoUsedForBestInterestRecommendations: false
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
      },
      registeredPrincipal: {
        typedSignature: null,
        printedName: null,
        date: null
      }
    }
  };
}

const QUESTION_CONFIG: Record<
  StatementOfFinancialConditionStepTwoQuestionId,
  StatementOfFinancialConditionStepTwoQuestionConfig
> = {
  'step2.notes': {
    key: 'step2.notes',
    title: 'Any notes we should include with this statement?',
    helper: 'Add notes and additional notes as needed.',
    type: 'notes-block'
  },
  'step2.acknowledgements': {
    key: 'step2.acknowledgements',
    title: 'Please acknowledge each required statement.',
    helper: 'All acknowledgements must be accepted before signatures.',
    type: 'acknowledgements-block'
  },
  'step2.signatures.accountOwners': {
    key: 'step2.signatures.accountOwners',
    title: 'Capture account owner signatures.',
    helper: 'Provide typed signature, printed name, and date.',
    type: 'account-owner-signatures-block'
  },
  'step2.signatures.firm': {
    key: 'step2.signatures.firm',
    title: 'Capture firm signatures.',
    helper: 'Financial Professional is required. Registered Principal is optional.',
    type: 'firm-signatures-block'
  }
};

function findQuestionIndex(
  currentQuestionId: StatementOfFinancialConditionStepTwoQuestionId | null,
  visibleQuestionIds: StatementOfFinancialConditionStepTwoQuestionId[]
): number {
  if (!currentQuestionId) {
    return 0;
  }

  const index = visibleQuestionIds.indexOf(currentQuestionId);
  return index >= 0 ? index : 0;
}

function getErrorForQuestion(
  questionId: StatementOfFinancialConditionStepTwoQuestionId,
  fieldErrors: Record<string, string>
): string | null {
  const directError = fieldErrors[questionId];
  if (directError) {
    return directError;
  }

  const prefixed = Object.keys(fieldErrors).find((item) => item.startsWith(`${questionId}.`));
  return prefixed ? fieldErrors[prefixed] : null;
}

function getAnswer(
  fields: StatementOfFinancialConditionStepTwoFields,
  questionId: StatementOfFinancialConditionStepTwoQuestionId
): unknown {
  switch (questionId) {
    case 'step2.notes':
      return fields.notes;
    case 'step2.acknowledgements':
      return fields.acknowledgements;
    case 'step2.signatures.accountOwners':
      return {
        accountOwner: fields.signatures.accountOwner,
        jointAccountOwner: fields.signatures.jointAccountOwner
      };
    case 'step2.signatures.firm':
      return {
        financialProfessional: fields.signatures.financialProfessional,
        registeredPrincipal: fields.signatures.registeredPrincipal
      };
    default:
      return null;
  }
}

function applyAnswer(
  fields: StatementOfFinancialConditionStepTwoFields,
  questionId: StatementOfFinancialConditionStepTwoQuestionId,
  answer: unknown
): StatementOfFinancialConditionStepTwoFields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step2.notes':
      next.notes = answer as StatementOfFinancialConditionStepTwoFields['notes'];
      break;
    case 'step2.acknowledgements':
      next.acknowledgements = answer as StatementOfFinancialConditionStepTwoFields['acknowledgements'];
      break;
    case 'step2.signatures.accountOwners': {
      const payload = answer as {
        accountOwner: StatementOfFinancialConditionStepTwoFields['signatures']['accountOwner'];
        jointAccountOwner: StatementOfFinancialConditionStepTwoFields['signatures']['jointAccountOwner'];
      };
      next.signatures.accountOwner = payload.accountOwner;
      next.signatures.jointAccountOwner = payload.jointAccountOwner;
      break;
    }
    case 'step2.signatures.firm': {
      const payload = answer as {
        financialProfessional: StatementOfFinancialConditionStepTwoFields['signatures']['financialProfessional'];
        registeredPrincipal: StatementOfFinancialConditionStepTwoFields['signatures']['registeredPrincipal'];
      };
      next.signatures.financialProfessional = payload.financialProfessional;
      next.signatures.registeredPrincipal = payload.registeredPrincipal;
      break;
    }
  }

  return next;
}

export function StatementOfFinancialConditionStep2Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<StatementOfFinancialConditionStepTwoFields>(createEmptyStep2Fields());
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<StatementOfFinancialConditionStepTwoQuestionId[]>([]);
  const [currentQuestionId, setCurrentQuestionId] =
    useState<StatementOfFinancialConditionStepTwoQuestionId | null>(null);
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
        const response = await apiRequest<StatementOfFinancialConditionStepTwoResponse>(
          `/api/clients/${clientId}/statement-of-financial-condition/step-2`
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

        setError('Unable to load Statement of Financial Condition Step 2.');
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

    const payload: StatementOfFinancialConditionStepTwoUpdateRequest = {
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
      const response = await apiRequest<StatementOfFinancialConditionStepTwoResponse>(
        `/api/clients/${clientId}/statement-of-financial-condition/step-2`,
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
        pushToast('Statement of Financial Condition completed.');
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

    if (activeQuestion.type === 'notes-block') {
      const answer = currentAnswer as StatementOfFinancialConditionStepTwoFields['notes'];

      return (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Notes</span>
            <textarea
              className="h-28 w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              value={answer.notes ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.notes = event.target.value;
                setFields((current) => applyAnswer(current, 'step2.notes', payload));
              }}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Additional Notes</span>
            <textarea
              className="h-28 w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              value={answer.additionalNotes ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.additionalNotes = event.target.value;
                setFields((current) => applyAnswer(current, 'step2.notes', payload));
              }}
            />
          </label>
        </div>
      );
    }

    if (activeQuestion.type === 'acknowledgements-block') {
      const answer = currentAnswer as StatementOfFinancialConditionStepTwoFields['acknowledgements'];

      return (
        <div className="space-y-4">
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-4">
            <input
              checked={answer.attestDataAccurateComplete}
              className="mt-1 h-4 w-4"
              type="checkbox"
              onChange={(event) => {
                const payload = { ...answer, attestDataAccurateComplete: event.target.checked };
                setFields((current) => applyAnswer(current, 'step2.acknowledgements', payload));
              }}
            />
            <span className="text-sm text-ink">
              I attest that the data above and attached are accurate and complete based on information provided.
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-4">
            <input
              checked={answer.agreeReportMaterialChanges}
              className="mt-1 h-4 w-4"
              type="checkbox"
              onChange={(event) => {
                const payload = { ...answer, agreeReportMaterialChanges: event.target.checked };
                setFields((current) => applyAnswer(current, 'step2.acknowledgements', payload));
              }}
            />
            <span className="text-sm text-ink">
              I agree to report material changes to financial and personal circumstances in a timely fashion.
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-4">
            <input
              checked={answer.understandMayNeedRecertification}
              className="mt-1 h-4 w-4"
              type="checkbox"
              onChange={(event) => {
                const payload = { ...answer, understandMayNeedRecertification: event.target.checked };
                setFields((current) => applyAnswer(current, 'step2.acknowledgements', payload));
              }}
            />
            <span className="text-sm text-ink">
              I understand this information may require future attestation and recertification.
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-4">
            <input
              checked={answer.understandMayNeedSupportingDocumentation}
              className="mt-1 h-4 w-4"
              type="checkbox"
              onChange={(event) => {
                const payload = { ...answer, understandMayNeedSupportingDocumentation: event.target.checked };
                setFields((current) => applyAnswer(current, 'step2.acknowledgements', payload));
              }}
            />
            <span className="text-sm text-ink">
              I understand supporting documentation may be requested to verify this information.
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-4">
            <input
              checked={answer.understandInfoUsedForBestInterestRecommendations}
              className="mt-1 h-4 w-4"
              type="checkbox"
              onChange={(event) => {
                const payload = {
                  ...answer,
                  understandInfoUsedForBestInterestRecommendations: event.target.checked
                };
                setFields((current) => applyAnswer(current, 'step2.acknowledgements', payload));
              }}
            />
            <span className="text-sm text-ink">
              I understand this information will be used by my financial professional for best-interest recommendations.
            </span>
          </label>
        </div>
      );
    }

    if (activeQuestion.type === 'account-owner-signatures-block') {
      const answer = currentAnswer as {
        accountOwner: StatementOfFinancialConditionStepTwoFields['signatures']['accountOwner'];
        jointAccountOwner: StatementOfFinancialConditionStepTwoFields['signatures']['jointAccountOwner'];
      };

      return (
        <div className="space-y-4">
          {renderSignatureFields('Account Owner Signature (Required)', answer.accountOwner, (nextValue) => {
            const payload = structuredClone(answer);
            payload.accountOwner = nextValue;
            setFields((current) => applyAnswer(current, 'step2.signatures.accountOwners', payload));
          })}

          {requiresJointOwnerSignature &&
            renderSignatureFields('Joint Account Owner Signature (Required)', answer.jointAccountOwner, (nextValue) => {
              const payload = structuredClone(answer);
              payload.jointAccountOwner = nextValue;
              setFields((current) => applyAnswer(current, 'step2.signatures.accountOwners', payload));
            })}
        </div>
      );
    }

    const answer = currentAnswer as {
      financialProfessional: StatementOfFinancialConditionStepTwoFields['signatures']['financialProfessional'];
      registeredPrincipal: StatementOfFinancialConditionStepTwoFields['signatures']['registeredPrincipal'];
    };

    return (
      <div className="space-y-4">
        {renderSignatureFields(
          'Financial Professional Signature (Required)',
          answer.financialProfessional,
          (nextValue) => {
            const payload = structuredClone(answer);
            payload.financialProfessional = nextValue;
            setFields((current) => applyAnswer(current, 'step2.signatures.firm', payload));
          }
        )}
        {renderSignatureFields('Registered Principal Signature (Optional)', answer.registeredPrincipal, (nextValue) => {
          const payload = structuredClone(answer);
          payload.registeredPrincipal = nextValue;
          setFields((current) => applyAnswer(current, 'step2.signatures.firm', payload));
        })}
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
                    ? `/clients/${clientId}/statement-of-financial-condition/step-1`
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
          <p className="text-xs uppercase tracking-[0.22em] text-accent">STATEMENT OF FINANCIAL CONDITION - STEP 2</p>
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
