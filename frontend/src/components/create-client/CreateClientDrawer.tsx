import { useEffect, useMemo, useState } from 'react';

import { ApiError, apiRequest } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import type { BrokerUserOption, ClientRecord, FormCatalogItem, User } from '../../types/api';

interface CreateClientDrawerProps {
  open: boolean;
  onClose: () => void;
  forms: FormCatalogItem[];
  brokerUsers: BrokerUserOption[];
  primaryBroker: User;
  onClientCreated: (client: ClientRecord) => void;
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stepTitle = useMemo(() => {
    if (step === 0) {
      return 'Client Details';
    }

    if (step === 1) {
      return 'Broker Selection';
    }

    return 'Form Selection';
  }, [step]);

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
      setErrors({});
      setSubmitError(null);
      setIsSubmitting(false);
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

    setErrors({});
    setStep((current) => Math.min(current + 1, 2));
  };

  const handleBack = () => {
    setErrors({});
    setStep((current) => Math.max(current - 1, 0));
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
    if (step !== 2) {
      handleNext();
      return;
    }

    if (!validateStepThree()) {
      return;
    }

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
        ]
      };

      const response = await apiRequest<{ client: ClientRecord }>('/api/clients', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      onClientCreated(response.client);
      pushToast('Client created successfully.');
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
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((index) => (
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
                      ? 'Selected. If SFC is selected, BAIODF starts after SFC completes. If SFC is not selected, BAIODF starts after Investor Profile Step 7.'
                      : 'Not selected. Toggle on to include this three-step BAIODF flow.'}
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
                      ? 'Selected. Starts after BAIODF if selected; otherwise after prior selected forms.'
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
                disabled={step === 0 || isSubmitting}
                type="button"
                onClick={handleBack}
              >
                Back
              </button>

              {step < 2 ? (
                <button
                  className="rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent/90"
                  type="button"
                  onClick={handleNext}
                >
                  Next
                </button>
              ) : (
                <button
                  className="rounded-full bg-accent px-5 py-2 text-sm text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-accent/50"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => {
                    void handleSubmit();
                  }}
                >
                  {isSubmitting ? 'Creating...' : 'Create Client'}
                </button>
              )}
            </div>
          </footer>
        </form>
      </aside>
    </div>
  );
}
