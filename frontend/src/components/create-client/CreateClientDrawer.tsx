import { useEffect, useMemo, useState } from 'react';

import { ApiError, apiRequest } from '../../api/client';
import { finalizeClientSetup, uploadInvestmentAgreement } from '../../api/investments';
import { useToast } from '../../context/ToastContext';
import type { BrokerUserOption, ClientRecord, FormCatalogItem, User } from '../../types/api';

interface CreateClientDrawerProps {
  open: boolean;
  onClose: () => void;
  forms: FormCatalogItem[];
  brokerUsers: BrokerUserOption[];
  primaryBroker: User;
  onClientCreated: (client: ClientRecord, nextOnboardingRoute?: string | null) => void;
}

type InvestmentUploadStatus = 'WAITING' | 'UPLOADING' | 'UPLOADED' | 'FAILED';
interface InvestmentDraft {
  name: string;
  file: File | null;
  status: InvestmentUploadStatus;
  error: string | null;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+\d()\-.\s]{7,20}$/;

export function CreateClientDrawer({
  open,
  onClose,
  forms,
  brokerUsers,
  primaryBroker,
  onClientCreated
}: CreateClientDrawerProps) {
  const { pushToast } = useToast();

  const investorProfileForm = useMemo(
    () => forms.find((form) => form.code === 'INVESTOR_PROFILE') ?? null,
    [forms]
  );
  const statementOfFinancialConditionForm = useMemo(
    () => forms.find((form) => form.code === 'SFC') ?? null,
    [forms]
  );
  const baiodfForm = useMemo(
    () => forms.find((form) => form.code === 'BAIODF') ?? null,
    [forms]
  );
  const baiv506cForm = useMemo(
    () => forms.find((form) => form.code === 'BAIV_506C') ?? null,
    [forms]
  );

  const [step, setStep] = useState(0);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [selectedBrokerUserIds, setSelectedBrokerUserIds] = useState<string[]>([]);
  const [includeStatementOfFinancialCondition, setIncludeStatementOfFinancialCondition] = useState(false);
  const [includeBaiodf, setIncludeBaiodf] = useState(false);
  const [includeBaiv506c, setIncludeBaiv506c] = useState(false);
  const [investmentCount, setInvestmentCount] = useState(1);
  const [investments, setInvestments] = useState<InvestmentDraft[]>([
    { name: '', file: null, status: 'WAITING', error: null }
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedSetupClient, setSavedSetupClient] = useState<ClientRecord | null>(null);

  const stepTitle = useMemo(() => {
    if (step === 0) {
      return 'Client Details';
    }

    if (step === 1) {
      return 'Broker Selection';
    }

    if (step === 2) return 'Form Selection';
    if (step === 3) return 'Investments';
    return 'Upload & Activate';
  }, [step]);
  const lastStep = includeBaiodf ? 4 : 2;

  const selectedBrokerUsers = useMemo(
    () =>
      selectedBrokerUserIds
        .map((userId) => brokerUsers.find((brokerUser) => brokerUser.id === userId))
        .filter((brokerUser): brokerUser is BrokerUserOption => Boolean(brokerUser)),
    [brokerUsers, selectedBrokerUserIds]
  );

  const availableBrokerUsers = useMemo(
    () =>
      brokerUsers.filter(
        (brokerUser) =>
          brokerUser.id !== primaryBroker.id && !selectedBrokerUserIds.includes(brokerUser.id)
      ),
    [brokerUsers, primaryBroker.id, selectedBrokerUserIds]
  );

  const brokerSectionError = errors.additionalBrokerUserIds ?? errors.additionalBrokers;

  useEffect(() => {
    if (!open) {
      setStep(0);
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setSelectedBrokerUserIds([]);
      setIncludeStatementOfFinancialCondition(false);
      setIncludeBaiodf(false);
      setIncludeBaiv506c(false);
      setInvestmentCount(1);
      setInvestments([{ name: '', file: null, status: 'WAITING', error: null }]);
      setErrors({});
      setSubmitError(null);
      setIsSubmitting(false);
      setSavedSetupClient(null);
    }
  }, [open]);

  const validateStepOne = () => {
    const nextErrors: Record<string, string> = {};

    if (!clientName.trim()) {
      nextErrors.clientName = 'Client name is required.';
    }

    if (!clientEmail.trim() || !emailPattern.test(clientEmail.trim())) {
      nextErrors.clientEmail = 'Enter a valid client email.';
    }

    if (clientPhone.trim() && !phonePattern.test(clientPhone.trim())) {
      nextErrors.clientPhone = 'Enter a valid phone number.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateStepTwo = () => {
    setErrors({});
    return true;
  };

  const validateStepThree = () => {
    if (!investorProfileForm) {
      setErrors({ investorProfileForm: 'Investor Profile form is unavailable.' });
      setSubmitError('Investor Profile form is unavailable. Please seed forms and refresh.');
      return false;
    }

    if (includeStatementOfFinancialCondition && !statementOfFinancialConditionForm) {
      setErrors({ statementOfFinancialConditionForm: 'Statement of Financial Condition form is unavailable.' });
      setSubmitError('Statement of Financial Condition form is unavailable. Please seed forms and refresh.');
      return false;
    }

    if (includeBaiodf && !baiodfForm) {
      setErrors({ baiodfForm: 'Brokerage Alternative Investment Order and Disclosure Form is unavailable.' });
      setSubmitError(
        'Brokerage Alternative Investment Order and Disclosure Form is unavailable. Please seed forms and refresh.'
      );
      return false;
    }

    if (includeBaiv506c && !baiv506cForm) {
      setErrors({ baiv506cForm: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c) is unavailable.' });
      setSubmitError(
        'Brokerage Accredited Investor Verification Form for SEC Rule 506(c) is unavailable. Please seed forms and refresh.'
      );
      return false;
    }

    setSubmitError(null);
    setErrors({});
    return true;
  };

  const validateInvestments = () => {
    const nextErrors: Record<string, string> = {};
    const names = investments.map((investment) => investment.name.trim());
    if (investments.length < 1 || investments.length > 10) {
      nextErrors.investments = 'Add between 1 and 10 investments.';
    } else if (names.some((name) => !name)) {
      nextErrors.investments = 'Enter a name for every investment.';
    } else if (new Set(names.map((name) => name.toLocaleLowerCase())).size !== names.length) {
      nextErrors.investments = 'Investment names must be unique.';
    } else if (investments.some((investment) => !investment.file)) {
      nextErrors.investments = 'Choose one agreement PDF for every investment.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 0 && !validateStepOne()) {
      return;
    }

    if (step === 1 && !validateStepTwo()) {
      return;
    }

    if (step === 2 && !validateStepThree()) {
      return;
    }

    if (step === 3 && !validateInvestments()) return;

    setErrors({});
    setStep((current) => Math.min(current + 1, lastStep));
  };

  const handleBack = () => {
    if (isSubmitting) return;
    setErrors({});
    setStep((current) => Math.max(current - 1, 0));
  };

  const resizeInvestments = (count: number) => {
    const nextCount = Math.max(1, Math.min(10, count));
    if (
      nextCount < investments.length &&
      investments.slice(nextCount).some((investment) => investment.name.trim() || investment.file) &&
      !window.confirm('Reducing the count will remove populated investment rows. Continue?')
    ) {
      return;
    }
    setInvestmentCount(nextCount);
    setInvestments((current) =>
      Array.from({ length: nextCount }, (_, index) =>
        current[index] ?? { name: '', file: null, status: 'WAITING' as const, error: null }
      )
    );
  };

  const updateInvestment = (index: number, patch: Partial<InvestmentDraft>) => {
    setInvestments((current) => current.map((investment, itemIndex) =>
      itemIndex === index ? { ...investment, ...patch } : investment
    ));
    setErrors((current) => {
      const next = { ...current };
      delete next.investments;
      return next;
    });
  };

  const addBrokerUser = (userId: string) => {
    if (!userId) {
      return;
    }

    setSelectedBrokerUserIds((current) => (current.includes(userId) ? current : [...current, userId]));
    setErrors((current) => {
      const next = { ...current };
      delete next.additionalBrokerUserIds;
      delete next.additionalBrokers;
      return next;
    });
  };

  const removeBrokerUser = (userId: string) => {
    setSelectedBrokerUserIds((current) => current.filter((selectedUserId) => selectedUserId !== userId));
  };

  const handleSubmit = async () => {
    if (step !== lastStep && !(includeBaiodf && step === 3)) {
      handleNext();
      return;
    }

    if (!validateStepThree()) {
      return;
    }
    if (includeBaiodf && !validateInvestments()) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setErrors({});

    try {
      const payload = {
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        clientPhone: clientPhone.trim() || undefined,
        additionalBrokerUserIds: selectedBrokerUserIds,
        selectedFormCodes: [
          'INVESTOR_PROFILE',
          ...(includeStatementOfFinancialCondition ? ['SFC'] : []),
          ...(includeBaiodf ? ['BAIODF'] : []),
          ...(includeBaiv506c ? ['BAIV_506C'] : [])
        ],
        investments: includeBaiodf ? investments.map((investment) => ({ name: investment.name.trim() })) : []
      };

      const response = await apiRequest<{ client: ClientRecord; nextOnboardingRoute?: string | null }>('/api/clients', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      let nextRoute = response.nextOnboardingRoute ?? null;
      let activatedClient = response.client;
      if (includeBaiodf) {
        setSavedSetupClient(response.client);
        setStep(4);
        const serverInvestments = response.client.investments ?? [];
        const queue = investments.map((investment, index) => ({ investment, index, server: serverInvestments[index] }));
        let cursor = 0;
        const worker = async () => {
          while (cursor < queue.length) {
            const item = queue[cursor++];
            if (!item.server || !item.investment.file) throw new Error('Investment setup could not be matched.');
            updateInvestment(item.index, { status: 'UPLOADING', error: null });
            try {
              await uploadInvestmentAgreement(response.client.id, item.server.id, item.investment.file);
              updateInvestment(item.index, { status: 'UPLOADED', error: null });
            } catch (uploadError) {
              updateInvestment(item.index, {
                status: 'FAILED',
                error: uploadError instanceof Error ? uploadError.message : 'Upload failed.'
              });
              throw uploadError;
            }
          }
        };
        await Promise.all([worker(), worker()]);
        const finalized = await finalizeClientSetup(response.client.id);
        nextRoute = finalized.nextOnboardingRoute;
        activatedClient = { ...response.client, setupStatus: 'ACTIVE' };
      }
      onClientCreated(activatedClient, nextRoute);
      pushToast('Client created and ready for onboarding.');
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors ?? {};
        setErrors(fieldErrors);

        if (fieldErrors.clientEmail) {
          setStep(0);
        }

        if (fieldErrors.additionalBrokerUserIds) {
          setStep(1);
        }

        if (fieldErrors.selectedFormCodes) {
          setStep(2);
        }

        setSubmitError(error.message);
      } else {
        setSubmitError('Failed to create client. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const retryInvestmentUpload = async (index: number) => {
    const investment = investments[index];
    const serverInvestment = savedSetupClient?.investments?.[index];
    if (!savedSetupClient || !serverInvestment || !investment?.file) return;
    updateInvestment(index, { status: 'UPLOADING', error: null });
    try {
      await uploadInvestmentAgreement(savedSetupClient.id, serverInvestment.id, investment.file);
      updateInvestment(index, { status: 'UPLOADED', error: null });
    } catch (error) {
      updateInvestment(index, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Upload failed.'
      });
    }
  };

  const activateSavedSetup = async () => {
    if (!savedSetupClient) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const finalized = await finalizeClientSetup(savedSetupClient.id);
      onClientCreated({ ...savedSetupClient, setupStatus: 'ACTIVE' }, finalized.nextOnboardingRoute);
      pushToast('Client created and ready for onboarding.');
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to activate client setup.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <button
        aria-label="Close client drawer"
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        type="button"
        onClick={onClose}
      />

      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-[40rem] flex-col bg-paper shadow-panel transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="border-b border-line px-6 py-5 sm:px-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-mute">Create Client</p>
              <h2 className="mt-2 text-2xl font-light tracking-tight text-ink">{stepTitle}</h2>
            </div>
            <button
              className="rounded-full border border-line px-3 py-1 text-sm text-mute transition hover:border-ink/20 hover:text-ink"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <div
            className="mt-4 grid gap-2"
            style={{ gridTemplateColumns: `repeat(${includeBaiodf ? 5 : 3}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: includeBaiodf ? 5 : 3 }, (_, index) => index).map((index) => (
              <div
                key={index}
                className={`h-[3px] rounded-full transition ${
                  step >= index ? 'bg-accent' : 'bg-black/10'
                }`}
              />
            ))}
          </div>
        </header>

        <form
          className="flex flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <section className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
            {step === 0 && (
              <div className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm text-mute">Client Name</span>
                  <input
                    className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light text-ink outline-none ring-accent transition focus:border-accent focus:ring-1"
                    placeholder="Enter full name"
                    value={clientName}
                    onChange={(event) => setClientName(event.target.value)}
                  />
                  {errors.clientName && <p className="mt-2 text-xs text-black">{errors.clientName}</p>}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm text-mute">Client Email</span>
                  <input
                    className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light text-ink outline-none ring-accent transition focus:border-accent focus:ring-1"
                    placeholder="name@example.com"
                    value={clientEmail}
                    onChange={(event) => setClientEmail(event.target.value)}
                  />
                  {errors.clientEmail && <p className="mt-2 text-xs text-black">{errors.clientEmail}</p>}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm text-mute">Phone (optional)</span>
                  <input
                    className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light text-ink outline-none ring-accent transition focus:border-accent focus:ring-1"
                    placeholder="+1 555 123 4567"
                    value={clientPhone}
                    onChange={(event) => setClientPhone(event.target.value)}
                  />
                  {errors.clientPhone && <p className="mt-2 text-xs text-black">{errors.clientPhone}</p>}
                </label>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-black/10 bg-black px-4 py-4 text-white">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/65">Primary Locked Broker</p>
                  <p className="mt-3 text-lg font-light">{primaryBroker.name}</p>
                  <p className="mt-1 text-sm text-white/80">{primaryBroker.email}</p>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-medium tracking-wide text-ink">Additional Brokers</h3>
                  </div>

                  {brokerSectionError && (
                    <div className="mb-3 rounded-xl border border-black/15 bg-black px-3 py-2 text-xs text-white">
                      {brokerSectionError}
                    </div>
                  )}

                  <label className="block">
                    <span className="mb-2 block text-sm text-mute">Select Website User</span>
                    <select
                      className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-light text-ink outline-none ring-accent transition focus:border-accent focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={availableBrokerUsers.length === 0}
                      value=""
                      onChange={(event) => addBrokerUser(event.target.value)}
                    >
                      <option value="">
                        {availableBrokerUsers.length === 0 ? 'No more users available' : 'Choose a broker'}
                      </option>
                      {availableBrokerUsers.map((brokerUser) => (
                        <option key={brokerUser.id} value={brokerUser.id}>
                          {brokerUser.name} ({brokerUser.email})
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedBrokerUsers.length === 0 && (
                    <div className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm text-mute">
                      No additional brokers selected.
                    </div>
                  )}

                  <div className="mt-4 space-y-3">
                    {selectedBrokerUsers.map((brokerUser) => (
                      <div
                        key={brokerUser.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-light text-ink">{brokerUser.name}</p>
                          <p className="mt-1 truncate text-xs text-mute">{brokerUser.email}</p>
                        </div>
                        <button
                          className="shrink-0 text-xs uppercase tracking-[0.14em] text-mute transition hover:text-ink"
                          type="button"
                          onClick={() => removeBrokerUser(brokerUser.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-accent/25 bg-accentSoft px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-accent">Required Form</p>
                  <p className="mt-2 text-xl font-light text-ink">
                    {investorProfileForm?.title ?? 'Investor Profile'}
                  </p>
                  <p className="mt-2 text-sm text-mute">
                    Investor Profile is always included and starts immediately after client creation.
                  </p>
                </div>

                <button
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    includeStatementOfFinancialCondition
                      ? 'border-accent bg-accentSoft'
                      : 'border-line bg-paper hover:border-black/35'
                  } ${!statementOfFinancialConditionForm ? 'cursor-not-allowed opacity-60' : ''}`}
                  disabled={!statementOfFinancialConditionForm}
                  type="button"
                  onClick={() => {
                    setIncludeStatementOfFinancialCondition((current) => !current);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.statementOfFinancialConditionForm;
                      delete next.selectedFormCodes;
                      return next;
                    });
                  }}
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-mute">Optional Form</p>
                  <p className="mt-2 text-xl font-light text-ink">
                    {statementOfFinancialConditionForm?.title ?? 'Statement of Financial Condition'}
                  </p>
                  <p className="mt-2 text-sm text-mute">
                    {includeStatementOfFinancialCondition
                      ? 'Selected. After Investor Profile Step 7, onboarding continues to Statement of Financial Condition.'
                      : 'Not selected. Toggle on to include this two-step financial condition form.'}
                  </p>
                </button>

                <button
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    includeBaiodf ? 'border-accent bg-accentSoft' : 'border-line bg-paper hover:border-black/35'
                  } ${!baiodfForm ? 'cursor-not-allowed opacity-60' : ''}`}
                  disabled={!baiodfForm}
                  type="button"
                  onClick={() => {
                    setIncludeBaiodf((current) => !current);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.baiodfForm;
                      delete next.selectedFormCodes;
                      return next;
                    });
                  }}
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-mute">Optional Form</p>
                  <p className="mt-2 text-xl font-light text-ink">
                    {baiodfForm?.title ?? 'Brokerage Alternative Investment Order and Disclosure Form'}
                  </p>
                  <p className="mt-2 text-sm text-mute">
                    {includeBaiodf
                      ? `${investmentCount} investment${investmentCount === 1 ? '' : 's'} · ${investmentCount} Brokerage Alternative Investment Order and Disclosure Form${investmentCount === 1 ? '' : 's'} · ${investmentCount} agreement${investmentCount === 1 ? '' : 's'}.`
                      : 'Not selected. Toggle on to include the three-step Brokerage Alternative Investment Order and Disclosure Form for each investment.'}
                  </p>
                </button>

                <button
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    includeBaiv506c ? 'border-accent bg-accentSoft' : 'border-line bg-paper hover:border-black/35'
                  } ${!baiv506cForm ? 'cursor-not-allowed opacity-60' : ''}`}
                  disabled={!baiv506cForm}
                  type="button"
                  onClick={() => {
                    setIncludeBaiv506c((current) => !current);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.baiv506cForm;
                      delete next.selectedFormCodes;
                      return next;
                    });
                  }}
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-mute">Optional Form</p>
                  <p className="mt-2 text-xl font-light text-ink">
                    {baiv506cForm?.title ?? 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'}
                  </p>
                  <p className="mt-2 text-sm text-mute">
                    {includeBaiv506c
                      ? 'Selected. Starts after all Brokerage Alternative Investment Order and Disclosure Forms, when investments are included; otherwise it starts after the prior selected form.'
                      : 'Not selected. Toggle on to include this two-step accredited investor verification flow.'}
                  </p>
                </button>

                {(errors.investorProfileForm ||
                  errors.statementOfFinancialConditionForm ||
                  errors.baiodfForm ||
                  errors.baiv506cForm ||
                  errors.selectedFormCodes) && (
                  <p className="rounded-xl border border-black/15 bg-black px-3 py-2 text-xs text-white">
                    {errors.investorProfileForm ??
                      errors.statementOfFinancialConditionForm ??
                      errors.baiodfForm ??
                      errors.baiv506cForm ??
                      errors.selectedFormCodes}
                  </p>
                )}
              </div>
            )}

            {step === 3 && includeBaiodf && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-accent/25 bg-accentSoft p-4">
                  <label className="block text-sm text-ink">
                    Number of investments
                    <span className="mt-2 grid grid-cols-[3.25rem_1fr_3.25rem] overflow-hidden rounded-xl border border-line bg-white">
                      <button
                        aria-label="Remove one investment"
                        className="border-r border-line px-4 py-3 text-xl text-ink transition hover:bg-fog disabled:cursor-not-allowed disabled:text-mute/35 disabled:hover:bg-white"
                        disabled={investmentCount <= 1}
                        type="button"
                        onClick={() => resizeInvestments(investmentCount - 1)}
                      >
                        −
                      </button>
                      <span
                        aria-live="polite"
                        className="flex items-center justify-center px-4 py-3 text-lg font-medium text-ink"
                      >
                        {investmentCount}
                      </span>
                      <button
                        aria-label="Add one investment"
                        className="border-l border-line px-4 py-3 text-xl text-ink transition hover:bg-fog disabled:cursor-not-allowed disabled:text-mute/35 disabled:hover:bg-white"
                        disabled={investmentCount >= 10}
                        type="button"
                        onClick={() => resizeInvestments(investmentCount + 1)}
                      >
                        +
                      </button>
                    </span>
                  </label>
                  <p className="mt-2 text-xs text-mute">Each investment requires its own Brokerage Alternative Investment Order and Disclosure Form and agreement PDF.</p>
                </div>
                {investments.map((investment, index) => (
                  <div key={index} className="rounded-2xl border border-line bg-white p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-mute">Investment {index + 1}</p>
                    <input
                      aria-label={`Investment ${index + 1} name`}
                      className="mt-3 w-full rounded-xl border border-line px-4 py-3 text-sm"
                      placeholder="Investment or product name"
                      maxLength={120}
                      value={investment.name}
                      onChange={(event) => updateInvestment(index, { name: event.target.value })}
                    />
                    <label className="mt-3 block rounded-xl border border-dashed border-line px-4 py-4 text-sm text-mute">
                      <span className="block text-xs uppercase tracking-[0.14em]">Agreement PDF</span>
                      <input
                        className="mt-2 block w-full text-xs"
                        type="file"
                        accept="application/pdf"
                        onChange={(event) => updateInvestment(index, {
                          file: event.target.files?.[0] ?? null,
                          status: 'WAITING',
                          error: null
                        })}
                      />
                      {investment.file && (
                        <span className="mt-2 flex items-center justify-between gap-3 text-xs text-ink">
                          <span className="min-w-0 truncate">
                            {investment.file.name} · {(investment.file.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                          <button
                            className="shrink-0 text-red-600 underline"
                            type="button"
                            onClick={() => updateInvestment(index, { file: null, status: 'WAITING', error: null })}
                          >
                            Remove
                          </button>
                        </span>
                      )}
                    </label>
                  </div>
                ))}
                {errors.investments && <p className="rounded-xl bg-black px-3 py-2 text-xs text-white">{errors.investments}</p>}
              </div>
            )}

            {step === 4 && includeBaiodf && (
              <div className="space-y-4">
                <p className="text-sm text-mute">Your client is saved. Agreement uploads can be resumed if this drawer is closed.</p>
                {investments.map((investment, index) => (
                  <div key={index} className="flex items-center justify-between rounded-2xl border border-line bg-white p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{investment.name}</p>
                      <p className="mt-1 truncate text-xs text-mute">{investment.file?.name}</p>
                      {investment.error && <p className="mt-1 text-xs text-red-600">{investment.error}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {investment.status === 'FAILED' && (
                        <button
                          className="rounded-full border border-red-300 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-red-700"
                          type="button"
                          onClick={() => void retryInvestmentUpload(index)}
                        >
                          Retry
                        </button>
                      )}
                      <span className="rounded-full border border-line px-3 py-1 text-[10px] uppercase tracking-[0.14em]">{investment.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {submitError && (
              <div className="mt-6 rounded-2xl border border-black/15 bg-black px-4 py-3 text-sm text-white">
                {submitError}
              </div>
            )}
          </section>

          <footer className="border-t border-line px-6 py-4 sm:px-8">
            <div className="flex items-center justify-between">
              <button
                className="rounded-full border border-line px-5 py-2 text-sm text-ink transition hover:border-black disabled:cursor-not-allowed disabled:opacity-30"
                disabled={step === 0 || isSubmitting || Boolean(savedSetupClient)}
                type="button"
                onClick={handleBack}
              >
                Back
              </button>

              {step < 2 || (step === 2 && includeBaiodf) ? (
                <button
                  className="rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent/90"
                  type="button"
                  onClick={handleNext}
                >
                  Next
                </button>
              ) : step < 4 ? (
                <button
                  className="rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => {
                    void handleSubmit();
                  }}
                >
                  {isSubmitting ? 'Creating & uploading...' : includeBaiodf ? 'Create & Upload' : 'Create Client'}
                </button>
              ) : (
                <button
                  className="rounded-full bg-accent px-5 py-2 text-sm text-white disabled:opacity-40"
                  disabled={isSubmitting || investments.some((investment) => investment.status !== 'UPLOADED')}
                  type="button"
                  onClick={() => void activateSavedSetup()}
                >
                  {isSubmitting ? 'Uploading agreements…' : 'Activate client'}
                </button>
              )}
            </div>
          </footer>
        </form>
      </aside>
    </div>
  );
}
