import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  InvestorProfileStepSixFields,
  InvestorProfileStepSixQuestionConfig,
  InvestorProfileStepSixQuestionId,
  InvestorProfileStepSixResponse,
  InvestorProfileStepSixUpdateRequest
} from '../types/api';

const YES_NO_OPTIONS = [
  { key: 'yes', label: 'Yes, I/We decline to provide' },
  { key: 'no', label: 'No, I/We want to provide one' }
] as const;

function createEmptyStep6Fields(): InvestorProfileStepSixFields {
  return {
    trustedContact: {
      decline: {
        yes: false,
        no: false
      },
      contactInfo: {
        name: null,
        email: null,
        phones: {
          home: null,
          business: null,
          mobile: null
        }
      },
      mailingAddress: {
        line1: null,
        city: null,
        stateProvince: null,
        postalCode: null,
        country: null
      }
    }
  };
}

const QUESTION_CONFIG: Record<InvestorProfileStepSixQuestionId, InvestorProfileStepSixQuestionConfig> = {
  'step6.trustedContact.decline': {
    key: 'step6.trustedContact.decline',
    title: 'Would you like to provide a trusted contact?',
    helper: 'If you decline, we will skip trusted contact detail collection.',
    type: 'single-choice-cards',
    options: [...YES_NO_OPTIONS]
  },
  'step6.trustedContact.contactInfo': {
    key: 'step6.trustedContact.contactInfo',
    title: 'Who should we contact if we suspect financial exploitation?',
    helper: 'Enter trusted contact name, email, and at least one phone number.',
    type: 'trusted-contact-block'
  },
  'step6.trustedContact.mailingAddress': {
    key: 'step6.trustedContact.mailingAddress',
    title: 'What is the trusted contact mailing address?',
    helper: 'Provide full mailing address details.',
    type: 'address-block'
  }
};

function findQuestionIndex(
  currentQuestionId: InvestorProfileStepSixQuestionId | null,
  visibleQuestionIds: InvestorProfileStepSixQuestionId[]
): number {
  if (!currentQuestionId) {
    return 0;
  }

  const index = visibleQuestionIds.indexOf(currentQuestionId);
  return index >= 0 ? index : 0;
}

function getErrorForQuestion(
  questionId: InvestorProfileStepSixQuestionId,
  fieldErrors: Record<string, string>
): string | null {
  const directError = fieldErrors[questionId];
  if (directError) {
    return directError;
  }

  if (questionId === 'step6.trustedContact.contactInfo') {
    const key = Object.keys(fieldErrors).find((item) =>
      item.startsWith('step6.trustedContact.contactInfo.')
    );
    return key ? fieldErrors[key] : null;
  }

  if (questionId === 'step6.trustedContact.mailingAddress') {
    const key = Object.keys(fieldErrors).find((item) =>
      item.startsWith('step6.trustedContact.mailingAddress.')
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

function getAnswer(fields: InvestorProfileStepSixFields, questionId: InvestorProfileStepSixQuestionId): unknown {
  switch (questionId) {
    case 'step6.trustedContact.decline':
      return fields.trustedContact.decline;
    case 'step6.trustedContact.contactInfo':
      return fields.trustedContact.contactInfo;
    case 'step6.trustedContact.mailingAddress':
      return fields.trustedContact.mailingAddress;
    default:
      return null;
  }
}

function applyAnswer(
  fields: InvestorProfileStepSixFields,
  questionId: InvestorProfileStepSixQuestionId,
  answer: unknown
): InvestorProfileStepSixFields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step6.trustedContact.decline':
      next.trustedContact.decline = answer as InvestorProfileStepSixFields['trustedContact']['decline'];
      break;
    case 'step6.trustedContact.contactInfo':
      next.trustedContact.contactInfo = answer as InvestorProfileStepSixFields['trustedContact']['contactInfo'];
      break;
    case 'step6.trustedContact.mailingAddress':
      next.trustedContact.mailingAddress = answer as InvestorProfileStepSixFields['trustedContact']['mailingAddress'];
      break;
  }

  return next;
}

export function InvestorProfileStep6Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<InvestorProfileStepSixFields>(createEmptyStep6Fields());
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<InvestorProfileStepSixQuestionId[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<InvestorProfileStepSixQuestionId | null>(null);

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
        const response = await apiRequest<InvestorProfileStepSixResponse>(
          `/api/clients/${clientId}/investor-profile/step-6`
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

        setError('Unable to load Step 6 right now. Please try again.');
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

    const payload: InvestorProfileStepSixUpdateRequest = {
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
      const response = await apiRequest<InvestorProfileStepSixResponse>(
        `/api/clients/${clientId}/investor-profile/step-6`,
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
        pushToast('Step 6 saved.');
        navigate(`/clients/${clientId}/investor-profile/step-7`, { replace: true });
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

  const renderTrustedContactBlock = () => {
    const answer = currentAnswer as InvestorProfileStepSixFields['trustedContact']['contactInfo'];

    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Name</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              type="text"
              value={answer.name ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.name = event.target.value;
                setFields((current) => applyAnswer(current, 'step6.trustedContact.contactInfo', payload));
              }}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Email</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              type="email"
              value={answer.email ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.email = event.target.value;
                setFields((current) => applyAnswer(current, 'step6.trustedContact.contactInfo', payload));
              }}
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Home Phone</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              placeholder="Home phone"
              type="text"
              value={answer.phones.home ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.phones.home = event.target.value;
                setFields((current) => applyAnswer(current, 'step6.trustedContact.contactInfo', payload));
              }}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Business Phone</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              placeholder="Business phone"
              type="text"
              value={answer.phones.business ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.phones.business = event.target.value;
                setFields((current) => applyAnswer(current, 'step6.trustedContact.contactInfo', payload));
              }}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Mobile Phone</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              placeholder="Mobile phone"
              type="text"
              value={answer.phones.mobile ?? ''}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload.phones.mobile = event.target.value;
                setFields((current) => applyAnswer(current, 'step6.trustedContact.contactInfo', payload));
              }}
            />
          </label>
        </div>
      </div>
    );
  };

  const renderAddressBlock = () => {
    const answer = currentAnswer as InvestorProfileStepSixFields['trustedContact']['mailingAddress'];

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Mailing Address</span>
          <input
            className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
            type="text"
            value={answer.line1 ?? ''}
            onChange={(event) => {
              const payload = structuredClone(answer);
              payload.line1 = event.target.value;
              setFields((current) => applyAnswer(current, 'step6.trustedContact.mailingAddress', payload));
            }}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">City</span>
          <input
            className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
            type="text"
            value={answer.city ?? ''}
            onChange={(event) => {
              const payload = structuredClone(answer);
              payload.city = event.target.value;
              setFields((current) => applyAnswer(current, 'step6.trustedContact.mailingAddress', payload));
            }}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">State/Province</span>
          <input
            className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
            type="text"
            value={answer.stateProvince ?? ''}
            onChange={(event) => {
              const payload = structuredClone(answer);
              payload.stateProvince = event.target.value;
              setFields((current) => applyAnswer(current, 'step6.trustedContact.mailingAddress', payload));
            }}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">ZIP/Postal Code</span>
          <input
            className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
            type="text"
            value={answer.postalCode ?? ''}
            onChange={(event) => {
              const payload = structuredClone(answer);
              payload.postalCode = event.target.value;
              setFields((current) => applyAnswer(current, 'step6.trustedContact.mailingAddress', payload));
            }}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Country (2-letter code)</span>
          <input
            className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light uppercase outline-none ring-accent transition focus:border-accent focus:ring-1"
            maxLength={2}
            type="text"
            value={answer.country ?? ''}
            onChange={(event) => {
              const payload = structuredClone(answer);
              payload.country = event.target.value;
              setFields((current) => applyAnswer(current, 'step6.trustedContact.mailingAddress', payload));
            }}
          />
        </label>
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
        setFields((current) => {
          const next = structuredClone(current);
          selectOne(next.trustedContact.decline, key);
          return next;
        });
      });
    }

    if (activeQuestion.type === 'trusted-contact-block') {
      return renderTrustedContactBlock();
    }

    if (activeQuestion.type === 'address-block') {
      return renderAddressBlock();
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
              onClick={() => navigate(clientId ? `/clients/${clientId}/investor-profile/step-5` : '/dashboard')}
            >
              Back to Step 5
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
          <p className="text-xs uppercase tracking-[0.22em] text-accent">STEP 6. TRUSTED CONTACT</p>
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
                    ? 'Continue to Step 7'
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
