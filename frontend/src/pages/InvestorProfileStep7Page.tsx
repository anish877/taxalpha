import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  InvestorProfileStepSevenFields,
  InvestorProfileStepSevenQuestionConfig,
  InvestorProfileStepSevenQuestionId,
  InvestorProfileStepSevenResponse,
  InvestorProfileStepSevenUpdateRequest
} from '../types/api';

function createEmptyStep7Fields(): InvestorProfileStepSevenFields {
  return {
    certifications: {
      acceptances: {
        attestationsAccepted: false,
        taxpayerCertificationAccepted: false,
        usPersonDefinitionAcknowledged: false
      }
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
      supervisorPrincipal: {
        typedSignature: null,
        printedName: null,
        date: null
      }
    }
  };
}

const QUESTION_CONFIG: Record<InvestorProfileStepSevenQuestionId, InvestorProfileStepSevenQuestionConfig> = {
  'step7.certifications.acceptances': {
    key: 'step7.certifications.acceptances',
    title: 'Please confirm required attestations and certifications.',
    helper: 'Each statement below must be acknowledged before signature capture.',
    type: 'certification-checklist-block'
  },
  'step7.signatures.accountOwners': {
    key: 'step7.signatures.accountOwners',
    title: 'Capture account owner signatures.',
    helper: 'Provide typed signature, printed name, and date for required account owners.',
    type: 'account-owner-signatures-block'
  },
  'step7.signatures.firm': {
    key: 'step7.signatures.firm',
    title: 'Capture firm signatures.',
    helper: 'Financial Professional signature is required. Supervisor/Principal is optional.',
    type: 'firm-signatures-block'
  }
};

function findQuestionIndex(
  currentQuestionId: InvestorProfileStepSevenQuestionId | null,
  visibleQuestionIds: InvestorProfileStepSevenQuestionId[]
): number {
  if (!currentQuestionId) {
    return 0;
  }

  const index = visibleQuestionIds.indexOf(currentQuestionId);
  return index >= 0 ? index : 0;
}

function getErrorForQuestion(
  questionId: InvestorProfileStepSevenQuestionId,
  fieldErrors: Record<string, string>
): string | null {
  const directError = fieldErrors[questionId];
  if (directError) {
    return directError;
  }

  if (questionId === 'step7.signatures.accountOwners') {
    const key = Object.keys(fieldErrors).find((item) => item.startsWith('step7.signatures.accountOwners.'));
    return key ? fieldErrors[key] : null;
  }

  if (questionId === 'step7.signatures.firm') {
    const key = Object.keys(fieldErrors).find((item) => item.startsWith('step7.signatures.firm.'));
    return key ? fieldErrors[key] : null;
  }

  const prefixed = Object.keys(fieldErrors).find((item) => item.startsWith(`${questionId}.`));
  return prefixed ? fieldErrors[prefixed] : null;
}

function getAnswer(fields: InvestorProfileStepSevenFields, questionId: InvestorProfileStepSevenQuestionId): unknown {
  switch (questionId) {
    case 'step7.certifications.acceptances':
      return fields.certifications.acceptances;
    case 'step7.signatures.accountOwners':
      return {
        accountOwner: fields.signatures.accountOwner,
        jointAccountOwner: fields.signatures.jointAccountOwner
      };
    case 'step7.signatures.firm':
      return {
        financialProfessional: fields.signatures.financialProfessional,
        supervisorPrincipal: fields.signatures.supervisorPrincipal
      };
    default:
      return null;
  }
}

function applyAnswer(
  fields: InvestorProfileStepSevenFields,
  questionId: InvestorProfileStepSevenQuestionId,
  answer: unknown
): InvestorProfileStepSevenFields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step7.certifications.acceptances':
      next.certifications.acceptances = answer as InvestorProfileStepSevenFields['certifications']['acceptances'];
      break;
    case 'step7.signatures.accountOwners': {
      const payload = answer as {
        accountOwner: InvestorProfileStepSevenFields['signatures']['accountOwner'];
        jointAccountOwner: InvestorProfileStepSevenFields['signatures']['jointAccountOwner'];
      };
      next.signatures.accountOwner = payload.accountOwner;
      next.signatures.jointAccountOwner = payload.jointAccountOwner;
      break;
    }
    case 'step7.signatures.firm': {
      const payload = answer as {
        financialProfessional: InvestorProfileStepSevenFields['signatures']['financialProfessional'];
        supervisorPrincipal: InvestorProfileStepSevenFields['signatures']['supervisorPrincipal'];
      };
      next.signatures.financialProfessional = payload.financialProfessional;
      next.signatures.supervisorPrincipal = payload.supervisorPrincipal;
      break;
    }
  }

  return next;
}

export function InvestorProfileStep7Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<InvestorProfileStepSevenFields>(createEmptyStep7Fields());
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<InvestorProfileStepSevenQuestionId[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<InvestorProfileStepSevenQuestionId | null>(null);
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
        const response = await apiRequest<InvestorProfileStepSevenResponse>(
          `/api/clients/${clientId}/investor-profile/step-7`
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

        setError('Unable to load Step 7 right now. Please try again.');
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

    const payload: InvestorProfileStepSevenUpdateRequest = {
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
      const response = await apiRequest<InvestorProfileStepSevenResponse>(
        `/api/clients/${clientId}/investor-profile/step-7`,
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
        pushToast('Step 7 saved.');
        navigate('/dashboard', { replace: true });
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

    if (activeQuestion.type === 'certification-checklist-block') {
      const answer = currentAnswer as InvestorProfileStepSevenFields['certifications']['acceptances'];

      return (
        <div className="space-y-4">
          <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-4">
            <input
              checked={answer.attestationsAccepted}
              className="mt-1 h-4 w-4"
              type="checkbox"
              onChange={(event) => {
                const payload = {
                  ...answer,
                  attestationsAccepted: event.target.checked
                };
                setFields((current) => applyAnswer(current, 'step7.certifications.acceptances', payload));
                setFieldErrors({});
              }}
            />
            <span className="text-sm text-ink">
              I/we attest the information provided is accurate and complete, and agree to report changes timely.
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-4">
            <input
              checked={answer.taxpayerCertificationAccepted}
              className="mt-1 h-4 w-4"
              type="checkbox"
              onChange={(event) => {
                const payload = {
                  ...answer,
                  taxpayerCertificationAccepted: event.target.checked
                };
                setFields((current) => applyAnswer(current, 'step7.certifications.acceptances', payload));
                setFieldErrors({});
              }}
            />
            <span className="text-sm text-ink">
              I/we certify taxpayer statements under penalties of perjury, including SSN/TIN correctness and U.S.
              person status.
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-4">
            <input
              checked={answer.usPersonDefinitionAcknowledged}
              className="mt-1 h-4 w-4"
              type="checkbox"
              onChange={(event) => {
                const payload = {
                  ...answer,
                  usPersonDefinitionAcknowledged: event.target.checked
                };
                setFields((current) => applyAnswer(current, 'step7.certifications.acceptances', payload));
                setFieldErrors({});
              }}
            />
            <span className="text-sm text-ink">
              I/we acknowledge the definition of a U.S. person as presented in this form.
            </span>
          </label>
        </div>
      );
    }

    if (activeQuestion.type === 'account-owner-signatures-block') {
      const answer = currentAnswer as {
        accountOwner: InvestorProfileStepSevenFields['signatures']['accountOwner'];
        jointAccountOwner: InvestorProfileStepSevenFields['signatures']['jointAccountOwner'];
      };

      return (
        <div className="space-y-4">
          {renderSignatureFields('Account Owner Signature (Required)', answer.accountOwner, (nextValue) => {
            const payload = structuredClone(answer);
            payload.accountOwner = nextValue;
            setFields((current) => applyAnswer(current, 'step7.signatures.accountOwners', payload));
          })}

          {requiresJointOwnerSignature &&
            renderSignatureFields('Joint Account Owner Signature (Required)', answer.jointAccountOwner, (nextValue) => {
              const payload = structuredClone(answer);
              payload.jointAccountOwner = nextValue;
              setFields((current) => applyAnswer(current, 'step7.signatures.accountOwners', payload));
            })}
        </div>
      );
    }

    if (activeQuestion.type === 'firm-signatures-block') {
      const answer = currentAnswer as {
        financialProfessional: InvestorProfileStepSevenFields['signatures']['financialProfessional'];
        supervisorPrincipal: InvestorProfileStepSevenFields['signatures']['supervisorPrincipal'];
      };

      return (
        <div className="space-y-4">
          {renderSignatureFields(
            'Financial Professional Signature (Required)',
            answer.financialProfessional,
            (nextValue) => {
              const payload = structuredClone(answer);
              payload.financialProfessional = nextValue;
              setFields((current) => applyAnswer(current, 'step7.signatures.firm', payload));
            }
          )}

          {renderSignatureFields(
            'Supervisor / Principal Signature (Optional)',
            answer.supervisorPrincipal,
            (nextValue) => {
              const payload = structuredClone(answer);
              payload.supervisorPrincipal = nextValue;
              setFields((current) => applyAnswer(current, 'step7.signatures.firm', payload));
            }
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <main className="min-h-screen bg-fog text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-10 pt-8 sm:px-12 sm:pt-10">
        <header className="flex items-center justify-between">
          <button
            className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.16em] text-mute transition hover:border-black hover:text-ink"
            type="button"
            onClick={() => navigate(clientId ? `/clients/${clientId}/investor-profile/step-6` : '/dashboard')}
          >
            Back to Step 6
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
          <p className="text-xs uppercase tracking-[0.22em] text-accent">STEP 7. SIGNATURES</p>
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
