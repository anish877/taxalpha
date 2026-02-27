import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { ApiError, apiRequest } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import type { ClientRecord, FormCatalogItem, User } from '../../types/api';

interface AdditionalBrokerInput {
  id: string;
  name: string;
  email: string;
}

interface CreateClientDrawerProps {
  open: boolean;
  onClose: () => void;
  forms: FormCatalogItem[];
  primaryBroker: User;
  onClientCreated: (client: ClientRecord) => void;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+\d()\-.\s]{7,20}$/;

function createBrokerRow(): AdditionalBrokerInput {
  return {
    id: `broker_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
    name: '',
    email: ''
  };
}

export function CreateClientDrawer({
  open,
  onClose,
  forms,
  primaryBroker,
  onClientCreated
}: CreateClientDrawerProps) {
  const { pushToast } = useToast();

  const investorProfileForm = useMemo(
    () => forms.find((form) => form.code === 'INVESTOR_PROFILE') ?? null,
    [forms]
  );

  const [step, setStep] = useState(0);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [additionalBrokers, setAdditionalBrokers] = useState<AdditionalBrokerInput[]>([]);
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

    return 'Investor Profile';
  }, [step]);

  const brokerSectionError =
    errors.additionalBrokers ||
    errors['additionalBrokers.0.name'] ||
    errors['additionalBrokers.0.email'] ||
    errors.additionalBrokersName ||
    errors.additionalBrokersEmail;

  useEffect(() => {
    if (!open) {
      setStep(0);
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setAdditionalBrokers([]);
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
    const nextErrors: Record<string, string> = {};

    for (const broker of additionalBrokers) {
      if (!broker.name.trim()) {
        nextErrors[`broker_name_${broker.id}`] = 'Broker name is required.';
      }

      if (!broker.email.trim() || !emailPattern.test(broker.email.trim())) {
        nextErrors[`broker_email_${broker.id}`] = 'Enter a valid broker email.';
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateStepThree = () => {
    if (!investorProfileForm) {
      setErrors({ investorProfileForm: 'Investor Profile form is unavailable.' });
      setSubmitError('Investor Profile form is unavailable. Please seed forms and refresh.');
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

  const addBrokerRow = () => {
    setAdditionalBrokers((current) => [...current, createBrokerRow()]);
  };

  const removeBrokerRow = (id: string) => {
    setAdditionalBrokers((current) => current.filter((item) => item.id !== id));
    setErrors((current) => {
      const next = { ...current };
      delete next[`broker_name_${id}`];
      delete next[`broker_email_${id}`];
      return next;
    });
  };

  const updateBrokerField = (id: string, field: 'name' | 'email', value: string) => {
    setAdditionalBrokers((current) =>
      current.map((broker) => (broker.id === id ? { ...broker, [field]: value } : broker))
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

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
        additionalBrokers: additionalBrokers.map((broker) => ({
          name: broker.name.trim(),
          email: broker.email.trim()
        }))
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

        <form className="flex flex-1 flex-col overflow-hidden" onSubmit={handleSubmit}>
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
                    <button
                      className="rounded-full border border-line px-3 py-1 text-xs uppercase tracking-[0.14em] text-ink transition hover:border-black"
                      type="button"
                      onClick={addBrokerRow}
                    >
                      Add Broker
                    </button>
                  </div>

                  {additionalBrokers.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-mute">
                      No additional brokers added.
                    </div>
                  )}

                  {brokerSectionError && (
                    <div className="mb-3 rounded-xl border border-black/15 bg-black px-3 py-2 text-xs text-white">
                      {brokerSectionError}
                    </div>
                  )}

                  <div className="space-y-4">
                    {additionalBrokers.map((broker) => (
                      <div key={broker.id} className="rounded-2xl border border-line p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-[0.2em] text-mute">Broker</p>
                          <button
                            className="text-xs uppercase tracking-[0.14em] text-mute hover:text-ink"
                            type="button"
                            onClick={() => removeBrokerRow(broker.id)}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="mt-3 space-y-3">
                          <label className="block">
                            <span className="mb-1 block text-xs text-mute">Name</span>
                            <input
                              className="w-full rounded-xl border border-line px-3 py-2 text-sm font-light outline-none ring-accent focus:border-accent focus:ring-1"
                              value={broker.name}
                              onChange={(event) =>
                                updateBrokerField(broker.id, 'name', event.target.value)
                              }
                            />
                            {errors[`broker_name_${broker.id}`] && (
                              <p className="mt-1 text-xs text-black">{errors[`broker_name_${broker.id}`]}</p>
                            )}
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs text-mute">Email</span>
                            <input
                              className="w-full rounded-xl border border-line px-3 py-2 text-sm font-light outline-none ring-accent focus:border-accent focus:ring-1"
                              value={broker.email}
                              onChange={(event) =>
                                updateBrokerField(broker.id, 'email', event.target.value)
                              }
                            />
                            {errors[`broker_email_${broker.id}`] && (
                              <p className="mt-1 text-xs text-black">{errors[`broker_email_${broker.id}`]}</p>
                            )}
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-accent/25 bg-accentSoft px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-accent">Selected Form</p>
                  <p className="mt-2 text-xl font-light text-ink">
                    {investorProfileForm?.title ?? 'Investor Profile'}
                  </p>
                  <p className="mt-2 text-sm text-mute">
                    This client will start onboarding with Investor Profile Step 1 after creation.
                  </p>
                </div>

                {errors.investorProfileForm && (
                  <p className="rounded-xl border border-black/15 bg-black px-3 py-2 text-xs text-white">
                    {errors.investorProfileForm}
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
                  type="submit"
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
