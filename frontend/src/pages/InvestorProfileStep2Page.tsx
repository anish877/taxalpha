import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  InvestorProfileStepTwoFields,
  InvestorProfileStepTwoResponse,
  InvestorProfileStepTwoUpdateRequest
} from '../types/api';

const SOURCE_OPTIONS: Array<{
  key: Exclude<keyof InvestorProfileStepTwoFields['initialSourceOfFunds'], 'otherDetails'>;
  label: string;
}> = [
  { key: 'accountsReceivable', label: 'Accounts Receivable' },
  { key: 'incomeFromEarnings', label: 'Income From Earnings' },
  { key: 'legalSettlement', label: 'Legal Settlement' },
  { key: 'spouseParent', label: 'Spouse/Parent' },
  { key: 'accumulatedSavings', label: 'Accumulated Savings' },
  { key: 'inheritance', label: 'Inheritance' },
  { key: 'lotteryGaming', label: 'Lottery/Gaming' },
  { key: 'rentalIncome', label: 'Rental Income' },
  { key: 'alimony', label: 'Alimony' },
  { key: 'insuranceProceeds', label: 'Insurance Proceeds' },
  { key: 'pensionIraRetirementSavings', label: 'Pension/IRA/Retirement Savings' },
  { key: 'saleOfBusiness', label: 'Sale of Business' },
  { key: 'gift', label: 'Gift' },
  { key: 'investmentProceeds', label: 'Investment Proceeds' },
  { key: 'saleOfRealEstate', label: 'Sale of Real Estate' },
  { key: 'other', label: 'Other' }
];

function createEmptyStep2Fields(): InvestorProfileStepTwoFields {
  return {
    initialSourceOfFunds: {
      accountsReceivable: false,
      incomeFromEarnings: false,
      legalSettlement: false,
      spouseParent: false,
      accumulatedSavings: false,
      inheritance: false,
      lotteryGaming: false,
      rentalIncome: false,
      alimony: false,
      insuranceProceeds: false,
      pensionIraRetirementSavings: false,
      saleOfBusiness: false,
      gift: false,
      investmentProceeds: false,
      saleOfRealEstate: false,
      other: false,
      otherDetails: null
    }
  };
}

export function InvestorProfileStep2Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<InvestorProfileStepTwoFields>(createEmptyStep2Fields());

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
        const response = await apiRequest<InvestorProfileStepTwoResponse>(
          `/api/clients/${clientId}/investor-profile/step-2`
        );

        setFields(response.onboarding.step.fields);
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

        setError('Unable to load Step 2 right now. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    void loadStep();
  }, [clientId, navigate, signOut]);

  const selectedCount = useMemo(() => {
    return SOURCE_OPTIONS.filter((option) => fields.initialSourceOfFunds[option.key]).length;
  }, [fields]);

  const handleToggle = (
    key: Exclude<keyof InvestorProfileStepTwoFields['initialSourceOfFunds'], 'otherDetails'>
  ) => {
    setFields((current) => {
      const next = structuredClone(current);
      next.initialSourceOfFunds[key] = !next.initialSourceOfFunds[key];

      if (key === 'other' && !next.initialSourceOfFunds.other) {
        next.initialSourceOfFunds.otherDetails = null;
      }

      return next;
    });

    setFieldErrors({});
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!clientId) {
      setError('Invalid client identifier.');
      return;
    }

    const payload: InvestorProfileStepTwoUpdateRequest = {
      questionId: 'step2.initialSourceOfFunds',
      answer: {
        ...fields.initialSourceOfFunds,
        otherDetails: fields.initialSourceOfFunds.other ? fields.initialSourceOfFunds.otherDetails : null
      },
      clientCursor: {
        currentQuestionId: 'step2.initialSourceOfFunds'
      }
    };

    setSaving(true);
    setFieldErrors({});
    setError(null);

    try {
      await apiRequest<InvestorProfileStepTwoResponse>(
        `/api/clients/${clientId}/investor-profile/step-2`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      pushToast('Step 2 saved. Continuing to Step 3.');
      navigate(`/clients/${clientId}/investor-profile/step-3`, { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setFieldErrors(requestError.fieldErrors ?? {});
        setError(requestError.message);
      } else {
        setError('Unable to save this step right now.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-fog text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 pb-10 pt-8 sm:px-12 sm:pt-10">
        <header className="flex items-center justify-between">
          <button
            className="rounded-full border border-line px-4 py-2 text-xs uppercase tracking-[0.16em] text-mute transition hover:border-black hover:text-ink"
            type="button"
            onClick={() => navigate(clientId ? `/clients/${clientId}/investor-profile/step-1` : '/dashboard')}
          >
            Back to Step 1
          </button>
          <p className="text-xs uppercase tracking-[0.2em] text-mute">Question 1 / 1</p>
        </header>

        <div className="mt-6 h-[3px] w-full rounded-full bg-black/10">
          <div className="h-full w-full rounded-full bg-accent transition-all duration-300" />
        </div>

        <section className="flex flex-1 flex-col justify-center py-10 sm:py-14">
          <p className="text-xs uppercase tracking-[0.22em] text-accent">STEP 2. USA PATRIOT ACT INFORMATION</p>
          <h1 className="mt-5 max-w-6xl text-4xl font-light tracking-tight sm:text-6xl lg:text-7xl">
            Where is the initial funding for this account coming from?
          </h1>
          <p className="mt-6 max-w-4xl text-base font-light leading-relaxed text-mute sm:text-lg">
            If assets are being transferred from another financial institution, select the origin of those
            investments. You can choose one or multiple sources.
          </p>

          <form className="mt-10 max-w-6xl" onSubmit={handleSubmit}>
            <div className="rounded-3xl border border-line bg-paper p-5 shadow-hairline sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.18em] text-mute">Initial Source of Funds</p>
                <p className="text-xs uppercase tracking-[0.18em] text-mute">{selectedCount} selected</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SOURCE_OPTIONS.map((option) => {
                  const selected = fields.initialSourceOfFunds[option.key];

                  return (
                    <button
                      key={option.key}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        selected
                          ? 'border-accent bg-accentSoft text-ink shadow-hairline'
                          : 'border-line bg-white text-ink hover:border-black/40'
                      }`}
                      type="button"
                      onClick={() => handleToggle(option.key)}
                    >
                      <p className="text-sm font-light">{option.label}</p>
                    </button>
                  );
                })}
              </div>

              {fields.initialSourceOfFunds.other && (
                <label className="mt-5 block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">Other Details</span>
                  <input
                    className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
                    placeholder="Describe the other source of funds"
                    value={fields.initialSourceOfFunds.otherDetails ?? ''}
                    onChange={(event) => {
                      const next = event.target.value;
                      setFields((current) => ({
                        ...current,
                        initialSourceOfFunds: {
                          ...current.initialSourceOfFunds,
                          otherDetails: next
                        }
                      }));
                    }}
                  />
                </label>
              )}
            </div>

            {(fieldErrors.initialSourceOfFunds || fieldErrors['initialSourceOfFunds.otherDetails']) && (
              <p className="mt-4 text-sm text-black">
                {fieldErrors['initialSourceOfFunds.otherDetails'] ?? fieldErrors.initialSourceOfFunds}
              </p>
            )}

            {error && (
              <p className="mt-5 rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">{error}</p>
            )}

            <div className="mt-8 flex items-center gap-3">
              <button
                className="rounded-full border border-line px-5 py-3 text-sm text-ink transition hover:border-black"
                type="button"
                onClick={() => navigate(clientId ? `/clients/${clientId}/investor-profile/step-1` : '/dashboard')}
              >
                Back
              </button>

              <button
                className="rounded-full bg-accent px-6 py-3 text-sm uppercase tracking-[0.14em] text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
                disabled={saving || loading}
                type="submit"
              >
                {saving ? 'Saving...' : 'Continue to Step 3'}
              </button>

              {loading && <span className="text-sm text-mute">Loading step...</span>}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
