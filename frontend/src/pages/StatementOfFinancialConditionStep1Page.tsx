import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  StatementOfFinancialConditionStepOneFields,
  StatementOfFinancialConditionStepOneQuestionConfig,
  StatementOfFinancialConditionStepOneQuestionId,
  StatementOfFinancialConditionStepOneResponse,
  StatementOfFinancialConditionStepOneTotals,
  StatementOfFinancialConditionStepOneUpdateRequest
} from '../types/api';

const LIQUID_NON_QUALIFIED_FIELDS: Array<{
  key: keyof StatementOfFinancialConditionStepOneFields['liquidNonQualifiedAssets'];
  label: string;
}> = [
  { key: 'cashMoneyMarketsCds', label: 'Cash / Money Markets / CDs' },
  { key: 'brokerageNonManaged', label: 'Brokerage (non-managed)' },
  { key: 'managedAccounts', label: 'Managed Accounts' },
  { key: 'mutualFundsDirect', label: 'Mutual Funds (Direct)' },
  { key: 'annuitiesLessSurrenderCharges', label: 'Annuities (less surrender charges)' },
  { key: 'cashValueLifeInsurance', label: 'Cash Value Life Insurance' },
  { key: 'otherBusinessAssetsCollectibles', label: 'Other (business assets / collectibles)' }
];

const LIABILITY_FIELDS: Array<{
  key: keyof StatementOfFinancialConditionStepOneFields['liabilities'];
  label: string;
}> = [
  { key: 'mortgagePrimaryResidence', label: 'Mortgage (Primary Residence)' },
  { key: 'mortgagesSecondaryInvestment', label: 'Mortgages (Secondary / Investment)' },
  { key: 'homeEquityLoans', label: 'Home Equity Loans' },
  { key: 'creditCards', label: 'Credit Cards' },
  { key: 'otherLiabilities', label: 'Other Liabilities' }
];

const ILLIQUID_NON_QUALIFIED_FIELDS: Array<{
  key: keyof StatementOfFinancialConditionStepOneFields['illiquidNonQualifiedAssets'];
  label: string;
}> = [
  { key: 'primaryResidence', label: 'Primary Residence' },
  { key: 'investmentRealEstate', label: 'Investment Real Estate' },
  { key: 'privateBusiness', label: 'Private Business' }
];

const LIQUID_QUALIFIED_FIELDS: Array<{
  key: keyof StatementOfFinancialConditionStepOneFields['liquidQualifiedAssets'];
  label: string;
}> = [
  { key: 'cashMoneyMarketsCds', label: 'Cash / Money Markets / CDs' },
  { key: 'retirementPlans', label: 'Retirement Plans (401k, 403b, etc.)' },
  { key: 'brokerageNonManaged', label: 'Brokerage (non-managed)' },
  { key: 'managedAccounts', label: 'Managed Accounts' },
  { key: 'mutualFundsDirect', label: 'Mutual Funds (Direct)' },
  { key: 'annuities', label: 'Annuities' }
];

const INCOME_SUMMARY_FIELDS: Array<{
  key: keyof StatementOfFinancialConditionStepOneFields['incomeSummary'];
  label: string;
}> = [
  { key: 'salaryCommissions', label: 'Salary / Commissions' },
  { key: 'investmentIncome', label: 'Investment Income (Interest & Dividends)' },
  { key: 'pension', label: 'Pension' },
  { key: 'socialSecurity', label: 'Social Security' },
  { key: 'netRentalIncome', label: 'Net Rental Income' },
  { key: 'other', label: 'Other' }
];

const ILLIQUID_QUALIFIED_FIELDS: Array<{
  key: keyof StatementOfFinancialConditionStepOneFields['illiquidQualifiedAssets'];
  label: string;
}> = [{ key: 'purchaseAmountValue', label: 'Purchase Amount / Value' }];

function createEmptyStep1Fields(): StatementOfFinancialConditionStepOneFields {
  return {
    accountRegistration: {
      rrName: '',
      rrNo: '',
      customerNames: ''
    },
    liquidNonQualifiedAssets: {
      cashMoneyMarketsCds: 0,
      brokerageNonManaged: 0,
      managedAccounts: 0,
      mutualFundsDirect: 0,
      annuitiesLessSurrenderCharges: 0,
      cashValueLifeInsurance: 0,
      otherBusinessAssetsCollectibles: 0
    },
    liabilities: {
      mortgagePrimaryResidence: 0,
      mortgagesSecondaryInvestment: 0,
      homeEquityLoans: 0,
      creditCards: 0,
      otherLiabilities: 0
    },
    illiquidNonQualifiedAssets: {
      primaryResidence: 0,
      investmentRealEstate: 0,
      privateBusiness: 0
    },
    liquidQualifiedAssets: {
      cashMoneyMarketsCds: 0,
      retirementPlans: 0,
      brokerageNonManaged: 0,
      managedAccounts: 0,
      mutualFundsDirect: 0,
      annuities: 0
    },
    incomeSummary: {
      salaryCommissions: 0,
      investmentIncome: 0,
      pension: 0,
      socialSecurity: 0,
      netRentalIncome: 0,
      other: 0
    },
    illiquidQualifiedAssets: {
      purchaseAmountValue: 0
    }
  };
}

function createEmptyTotals(): StatementOfFinancialConditionStepOneTotals {
  return {
    totalLiabilities: 0,
    totalLiquidAssets: 0,
    totalLiquidQualifiedAssets: 0,
    totalAnnualIncome: 0,
    totalIlliquidAssetsEquity: 0,
    totalAssetsLessPrimaryResidence: 0,
    totalNetWorthAssetsLessPrimaryResidenceLiabilities: 0,
    totalIlliquidSecurities: 0,
    totalNetWorth: 0,
    totalPotentialLiquidity: 0,
    totalIlliquidQualifiedAssets: 0
  };
}

const QUESTION_CONFIG: Record<
  StatementOfFinancialConditionStepOneQuestionId,
  StatementOfFinancialConditionStepOneQuestionConfig
> = {
  'step1.accountRegistration': {
    key: 'step1.accountRegistration',
    title: "Let's confirm account registration details.",
    helper: 'Please confirm RR Name, RR No., and customer name(s).',
    type: 'account-registration-block'
  },
  'step1.liquidNonQualifiedAssets': {
    key: 'step1.liquidNonQualifiedAssets',
    title: 'What are the liquid non-qualified assets?',
    helper: 'Enter current approximate values. Use 0 where not applicable.',
    type: 'amount-grid-block'
  },
  'step1.liabilities': {
    key: 'step1.liabilities',
    title: 'What liabilities should we include?',
    helper: 'Enter all applicable liabilities. Blank amounts are treated as 0.',
    type: 'amount-grid-block'
  },
  'step1.illiquidNonQualifiedAssets': {
    key: 'step1.illiquidNonQualifiedAssets',
    title: 'Now, the illiquid non-qualified assets.',
    helper: 'Enter current value/equity amounts for these items.',
    type: 'amount-grid-block'
  },
  'step1.liquidQualifiedAssets': {
    key: 'step1.liquidQualifiedAssets',
    title: 'What liquid qualified assets are available?',
    helper: 'Enter approximate values for retirement and other qualified holdings.',
    type: 'amount-grid-block'
  },
  'step1.incomeSummary': {
    key: 'step1.incomeSummary',
    title: 'Please provide annual income summary values.',
    helper: 'Use annual amounts and set any non-applicable field to 0.',
    type: 'amount-grid-block'
  },
  'step1.illiquidQualifiedAssets': {
    key: 'step1.illiquidQualifiedAssets',
    title: 'Any illiquid qualified assets to record?',
    helper: 'Provide purchase amount/value.',
    type: 'amount-grid-block'
  }
};

function findQuestionIndex(
  currentQuestionId: StatementOfFinancialConditionStepOneQuestionId | null,
  visibleQuestionIds: StatementOfFinancialConditionStepOneQuestionId[]
): number {
  if (!currentQuestionId) {
    return 0;
  }

  const index = visibleQuestionIds.indexOf(currentQuestionId);
  return index >= 0 ? index : 0;
}

function getErrorForQuestion(
  questionId: StatementOfFinancialConditionStepOneQuestionId,
  fieldErrors: Record<string, string>
): string | null {
  const directError = fieldErrors[questionId];
  if (directError) {
    return directError;
  }

  const prefixed = Object.keys(fieldErrors).find((item) => item.startsWith(`${questionId}.`));
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

function getAnswer(
  fields: StatementOfFinancialConditionStepOneFields,
  questionId: StatementOfFinancialConditionStepOneQuestionId
): unknown {
  switch (questionId) {
    case 'step1.accountRegistration':
      return fields.accountRegistration;
    case 'step1.liquidNonQualifiedAssets':
      return fields.liquidNonQualifiedAssets;
    case 'step1.liabilities':
      return fields.liabilities;
    case 'step1.illiquidNonQualifiedAssets':
      return fields.illiquidNonQualifiedAssets;
    case 'step1.liquidQualifiedAssets':
      return fields.liquidQualifiedAssets;
    case 'step1.incomeSummary':
      return fields.incomeSummary;
    case 'step1.illiquidQualifiedAssets':
      return fields.illiquidQualifiedAssets;
    default:
      return null;
  }
}

function applyAnswer(
  fields: StatementOfFinancialConditionStepOneFields,
  questionId: StatementOfFinancialConditionStepOneQuestionId,
  answer: unknown
): StatementOfFinancialConditionStepOneFields {
  const next = structuredClone(fields);

  switch (questionId) {
    case 'step1.accountRegistration':
      next.accountRegistration = answer as StatementOfFinancialConditionStepOneFields['accountRegistration'];
      break;
    case 'step1.liquidNonQualifiedAssets':
      next.liquidNonQualifiedAssets =
        answer as StatementOfFinancialConditionStepOneFields['liquidNonQualifiedAssets'];
      break;
    case 'step1.liabilities':
      next.liabilities = answer as StatementOfFinancialConditionStepOneFields['liabilities'];
      break;
    case 'step1.illiquidNonQualifiedAssets':
      next.illiquidNonQualifiedAssets =
        answer as StatementOfFinancialConditionStepOneFields['illiquidNonQualifiedAssets'];
      break;
    case 'step1.liquidQualifiedAssets':
      next.liquidQualifiedAssets = answer as StatementOfFinancialConditionStepOneFields['liquidQualifiedAssets'];
      break;
    case 'step1.incomeSummary':
      next.incomeSummary = answer as StatementOfFinancialConditionStepOneFields['incomeSummary'];
      break;
    case 'step1.illiquidQualifiedAssets':
      next.illiquidQualifiedAssets =
        answer as StatementOfFinancialConditionStepOneFields['illiquidQualifiedAssets'];
      break;
  }

  return next;
}

export function StatementOfFinancialConditionStep1Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<StatementOfFinancialConditionStepOneFields>(createEmptyStep1Fields());
  const [totals, setTotals] = useState<StatementOfFinancialConditionStepOneTotals>(createEmptyTotals());
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<StatementOfFinancialConditionStepOneQuestionId[]>([]);
  const [currentQuestionId, setCurrentQuestionId] =
    useState<StatementOfFinancialConditionStepOneQuestionId | null>(null);

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
        const response = await apiRequest<StatementOfFinancialConditionStepOneResponse>(
          `/api/clients/${clientId}/statement-of-financial-condition/step-1`
        );
        setFields(response.onboarding.step.fields);
        setTotals(response.onboarding.step.totals);
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

        setError('Unable to load Statement of Financial Condition Step 1.');
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

    const payload: StatementOfFinancialConditionStepOneUpdateRequest = {
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
      const response = await apiRequest<StatementOfFinancialConditionStepOneResponse>(
        `/api/clients/${clientId}/statement-of-financial-condition/step-1`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      setFields(response.onboarding.step.fields);
      setTotals(response.onboarding.step.totals);
      setVisibleQuestionIds(response.onboarding.step.visibleQuestionIds);
      setCurrentQuestionId(response.onboarding.step.currentQuestionId);

      const responseIndex = response.onboarding.step.visibleQuestionIds.indexOf(
        response.onboarding.step.currentQuestionId
      );
      const isStillLastQuestion =
        responseIndex === response.onboarding.step.visibleQuestionIds.length - 1 &&
        response.onboarding.step.currentQuestionId === currentQuestionId;

      if (isStillLastQuestion) {
        pushToast('Statement of Financial Condition Step 1 saved.');
        navigate(`/clients/${clientId}/statement-of-financial-condition/step-2`, { replace: true });
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

  const renderAmountGrid = (
    section:
      | 'liquidNonQualifiedAssets'
      | 'liabilities'
      | 'illiquidNonQualifiedAssets'
      | 'liquidQualifiedAssets'
      | 'incomeSummary'
      | 'illiquidQualifiedAssets',
    entries: Array<{ key: string; label: string }>
  ) => {
    const answer = fields[section] as Record<string, number>;

    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {entries.map((entry) => (
          <label key={entry.key} className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.14em] text-mute">{entry.label}</span>
            <input
              className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
              min={0}
              step="any"
              type="number"
              value={answer[entry.key]}
              onChange={(event) => {
                const payload = structuredClone(answer);
                payload[entry.key] = parseAmountInput(event.target.value);
                setFields((current) => applyAnswer(current, currentQuestionId!, payload));
              }}
            />
          </label>
        ))}
      </div>
    );
  };

  const renderActiveControl = () => {
    if (!activeQuestion || !currentQuestionId) {
      return null;
    }

    if (activeQuestion.type === 'account-registration-block') {
      const answer = currentAnswer as StatementOfFinancialConditionStepOneFields['accountRegistration'];

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

    if (currentQuestionId === 'step1.liquidNonQualifiedAssets') {
      return renderAmountGrid('liquidNonQualifiedAssets', LIQUID_NON_QUALIFIED_FIELDS);
    }

    if (currentQuestionId === 'step1.liabilities') {
      return renderAmountGrid('liabilities', LIABILITY_FIELDS);
    }

    if (currentQuestionId === 'step1.illiquidNonQualifiedAssets') {
      return renderAmountGrid('illiquidNonQualifiedAssets', ILLIQUID_NON_QUALIFIED_FIELDS);
    }

    if (currentQuestionId === 'step1.liquidQualifiedAssets') {
      return renderAmountGrid('liquidQualifiedAssets', LIQUID_QUALIFIED_FIELDS);
    }

    if (currentQuestionId === 'step1.incomeSummary') {
      return renderAmountGrid('incomeSummary', INCOME_SUMMARY_FIELDS);
    }

    return renderAmountGrid('illiquidQualifiedAssets', ILLIQUID_QUALIFIED_FIELDS);
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
          <p className="text-xs uppercase tracking-[0.22em] text-accent">STATEMENT OF FINANCIAL CONDITION - STEP 1</p>
          <h1 className="mt-5 max-w-5xl text-4xl font-light tracking-tight sm:text-6xl lg:text-7xl">
            {activeQuestion?.title ?? 'Loading question...'}
          </h1>
          <p className="mt-6 max-w-3xl text-base font-light leading-relaxed text-mute sm:text-lg">
            {activeQuestion?.helper ?? 'Please wait while we load this step.'}
          </p>

          <form className="mt-10 max-w-5xl" onSubmit={handleSubmit}>
            {renderActiveControl()}

            <div className="mt-8 grid gap-3 rounded-2xl border border-line bg-paper/70 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <p className="text-xs uppercase tracking-[0.14em] text-mute">Total Liabilities: {totals.totalLiabilities}</p>
              <p className="text-xs uppercase tracking-[0.14em] text-mute">Total Liquid Assets: {totals.totalLiquidAssets}</p>
              <p className="text-xs uppercase tracking-[0.14em] text-mute">Total Net Worth: {totals.totalNetWorth}</p>
              <p className="text-xs uppercase tracking-[0.14em] text-mute">
                Total Annual Income: {totals.totalAnnualIncome}
              </p>
              <p className="text-xs uppercase tracking-[0.14em] text-mute">
                Total Potential Liquidity: {totals.totalPotentialLiquidity}
              </p>
              <p className="text-xs uppercase tracking-[0.14em] text-mute">
                Total Illiquid Qualified Assets: {totals.totalIlliquidQualifiedAssets}
              </p>
            </div>

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
