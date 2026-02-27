import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type {
  InvestorProfileStepOneFields,
  InvestorProfileStepOneQuestionConfig,
  InvestorProfileStepOneQuestionId,
  InvestorProfileStepOneResponse,
  InvestorProfileStepOneUpdateRequest
} from '../types/api';

const QUESTION_CONFIG: Record<InvestorProfileStepOneQuestionId, InvestorProfileStepOneQuestionConfig> = {
  rrName: {
    key: 'rrName',
    title: "Let's start with the RR Name.",
    helper: 'Use the exact registered representative name you want on the form.',
    type: 'text',
    placeholder: 'Enter RR Name',
    fieldErrorKey: 'rrName'
  },
  rrNo: {
    key: 'rrNo',
    title: 'Perfect. What RR number should we use?',
    helper: 'This should match your internal or broker record for this representative.',
    type: 'text',
    placeholder: 'Enter RR No.',
    fieldErrorKey: 'rrNo'
  },
  customerNames: {
    key: 'customerNames',
    title: 'Who are the customer name(s) on this account?',
    helper: 'Enter the legal name(s) exactly as they should appear in documents.',
    type: 'text',
    placeholder: 'Enter customer name(s)',
    fieldErrorKey: 'customerNames'
  },
  accountNo: {
    key: 'accountNo',
    title: 'What is the account number?',
    helper: 'Use the brokerage or custodian account number for this client.',
    type: 'text',
    placeholder: 'Enter account number',
    fieldErrorKey: 'accountNo'
  },
  'accountRegistration.retailRetirement': {
    key: 'accountRegistration.retailRetirement',
    title: 'Is this Retail or Retirement?',
    helper: 'Choose one. We store both checkbox values as true/false.',
    type: 'single-choice-cards',
    fieldErrorKey: 'accountRegistration.retailRetirement',
    options: [
      { key: 'retail', label: 'Retail', description: 'Standard retail investment account.' },
      { key: 'retirement', label: 'Retirement', description: 'Tax-advantaged retirement account.' }
    ]
  },
  'typeOfAccount.primaryType': {
    key: 'typeOfAccount.primaryType',
    title: 'What is the primary type of account?',
    helper: 'Select one account type. We will ask only the related follow-up questions.',
    type: 'single-choice-cards',
    fieldErrorKey: 'typeOfAccount.primaryType',
    options: [
      { key: 'individual', label: 'Individual' },
      { key: 'corporation', label: 'Corporation' },
      { key: 'corporatePensionProfitSharing', label: 'Corporate Pension / Profit Sharing' },
      { key: 'custodial', label: 'Custodial' },
      { key: 'estate', label: 'Estate' },
      { key: 'jointTenant', label: 'Joint Tenant' },
      { key: 'limitedLiabilityCompany', label: 'Limited Liability / Company' },
      { key: 'individualSingleMemberLlc', label: 'Individual Single Member LLC' },
      { key: 'soleProprietorship', label: 'Sole Proprietorship' },
      { key: 'transferOnDeathIndividual', label: 'Transfer on Death Individual' },
      { key: 'transferOnDeathJoint', label: 'Transfer on Death Joint' },
      { key: 'trust', label: 'Trust' },
      { key: 'nonprofitOrganization', label: 'Nonprofit Organization' },
      { key: 'partnership', label: 'Partnership' },
      { key: 'exemptOrganization', label: 'Exempt Organization' },
      { key: 'other', label: 'Other' }
    ]
  },
  'typeOfAccount.corporationDesignation': {
    key: 'typeOfAccount.corporationDesignation',
    title: 'Which corporation designation applies?',
    helper: 'Choose one designation for this corporation account.',
    type: 'single-choice-cards',
    fieldErrorKey: 'typeOfAccount.corporationDesignation',
    options: [
      { key: 'cCorp', label: 'C Corp' },
      { key: 'sCorp', label: 'S Corp' }
    ]
  },
  'typeOfAccount.llcDesignation': {
    key: 'typeOfAccount.llcDesignation',
    title: 'How is this LLC designated?',
    helper: 'Choose one LLC designation.',
    type: 'single-choice-cards',
    fieldErrorKey: 'typeOfAccount.llcDesignation',
    options: [
      { key: 'cCorp', label: 'C Corp' },
      { key: 'sCorp', label: 'S Corp' },
      { key: 'partnership', label: 'Partnership' }
    ]
  },
  'typeOfAccount.trust.establishmentDate': {
    key: 'typeOfAccount.trust.establishmentDate',
    title: 'When was this trust established?',
    helper: 'Enter the trust establishment date in YYYY-MM-DD format.',
    type: 'date',
    fieldErrorKey: 'typeOfAccount.trust.establishmentDate'
  },
  'typeOfAccount.trust.trustType': {
    key: 'typeOfAccount.trust.trustType',
    title: 'What type of trust is this?',
    helper: 'Select one trust type from the official form options.',
    type: 'single-choice-cards',
    fieldErrorKey: 'typeOfAccount.trust.trustType',
    options: [
      { key: 'charitable', label: 'Charitable' },
      { key: 'living', label: 'Living' },
      { key: 'irrevocableLiving', label: 'Irrevocable Living' },
      { key: 'family', label: 'Family' },
      { key: 'revocable', label: 'Revocable' },
      { key: 'irrevocable', label: 'Irrevocable' },
      { key: 'testamentary', label: 'Testamentary' }
    ]
  },
  'typeOfAccount.custodial.custodialType': {
    key: 'typeOfAccount.custodial.custodialType',
    title: 'For custodial setup, is it UGMA or UTMA?',
    helper: 'Choose one custodial designation.',
    type: 'single-choice-cards',
    fieldErrorKey: 'typeOfAccount.custodial.custodialType',
    options: [
      { key: 'ugma', label: 'UGMA' },
      { key: 'utma', label: 'UTMA' }
    ]
  },
  'typeOfAccount.custodial.gifts': {
    key: 'typeOfAccount.custodial.gifts',
    title: 'Tell me about the custodial gift details.',
    helper: 'Add one or more gift entries with state and date given.',
    type: 'gifts',
    fieldErrorKey: 'typeOfAccount.custodial.gifts'
  },
  'typeOfAccount.joint.marriedToEachOther': {
    key: 'typeOfAccount.joint.marriedToEachOther',
    title: 'Are the joint account holders married to each other?',
    helper: 'Choose one option.',
    type: 'single-choice-cards',
    fieldErrorKey: 'typeOfAccount.joint.marriedToEachOther',
    options: [
      { key: 'yes', label: 'Yes' },
      { key: 'no', label: 'No' }
    ]
  },
  'typeOfAccount.joint.tenancyState': {
    key: 'typeOfAccount.joint.tenancyState',
    title: 'Which state governs tenancy for this joint account?',
    helper: 'Enter the tenancy state exactly as required for account opening.',
    type: 'text',
    placeholder: 'Enter tenancy state',
    fieldErrorKey: 'typeOfAccount.joint.tenancyState'
  },
  'typeOfAccount.joint.numberOfTenants': {
    key: 'typeOfAccount.joint.numberOfTenants',
    title: 'How many tenants are on this joint account?',
    helper: 'Enter a whole number (2 or more).',
    type: 'number',
    fieldErrorKey: 'typeOfAccount.joint.numberOfTenants'
  },
  'typeOfAccount.joint.tenancyClause': {
    key: 'typeOfAccount.joint.tenancyClause',
    title: 'Which tenancy clause applies?',
    helper: 'Select one clause that matches the account registration.',
    type: 'single-choice-cards',
    fieldErrorKey: 'typeOfAccount.joint.tenancyClause',
    options: [
      { key: 'communityProperty', label: 'Community Property' },
      { key: 'tenantsByEntirety', label: 'Tenants by Entirety' },
      {
        key: 'communityPropertyWithRightsOfSurvivorship',
        label: 'Community Property with Rights of Survivorship'
      },
      {
        key: 'jointTenantsWithRightsOfSurvivorship',
        label: 'Joint Tenants with Rights of Survivorship'
      },
      { key: 'tenantsInCommon', label: 'Tenants in Common' }
    ]
  },
  'typeOfAccount.transferOnDeath.individualAgreementDate': {
    key: 'typeOfAccount.transferOnDeath.individualAgreementDate',
    title: 'What is the agreement date for Transfer on Death (Individual)?',
    helper: 'Use YYYY-MM-DD.',
    type: 'date',
    fieldErrorKey: 'typeOfAccount.transferOnDeath.individualAgreementDate'
  },
  'typeOfAccount.transferOnDeath.jointAgreementDate': {
    key: 'typeOfAccount.transferOnDeath.jointAgreementDate',
    title: 'What is the agreement date for Transfer on Death (Joint)?',
    helper: 'Use YYYY-MM-DD.',
    type: 'date',
    fieldErrorKey: 'typeOfAccount.transferOnDeath.jointAgreementDate'
  },
  'typeOfAccount.otherDescription': {
    key: 'typeOfAccount.otherDescription',
    title: 'Please describe this account type.',
    helper: 'Add a short, clear description for the "Other" account type.',
    type: 'text',
    placeholder: 'Describe account type',
    fieldErrorKey: 'typeOfAccount.otherDescription'
  }
};

function getErrorForQuestion(questionId: InvestorProfileStepOneQuestionId, fieldErrors: Record<string, string>): string | null {
  const config = QUESTION_CONFIG[questionId];
  const directKey = config.fieldErrorKey ?? questionId;

  if (fieldErrors[directKey]) {
    return fieldErrors[directKey];
  }

  if (questionId === 'typeOfAccount.custodial.gifts') {
    const nested = Object.entries(fieldErrors).find(([key]) => key.startsWith('typeOfAccount.custodial.gifts.'));
    if (nested) {
      return nested[1];
    }
  }

  return null;
}

function findQuestionIndex(currentQuestionId: InvestorProfileStepOneQuestionId | null, visible: InvestorProfileStepOneQuestionId[]): number {
  if (!currentQuestionId) {
    return 0;
  }

  const index = visible.indexOf(currentQuestionId);
  return index >= 0 ? index : 0;
}

export function InvestorProfileStep1Page() {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { signOut } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<InvestorProfileStepOneFields | null>(null);
  const [visibleQuestionIds, setVisibleQuestionIds] = useState<InvestorProfileStepOneQuestionId[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<InvestorProfileStepOneQuestionId | null>(null);

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
        const response = await apiRequest<InvestorProfileStepOneResponse>(
          `/api/clients/${clientId}/investor-profile/step-1`
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

        setError('Unable to load onboarding step. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    void loadStep();
  }, [clientId, navigate, signOut]);

  const activeQuestion = useMemo(() => {
    if (!currentQuestionId) {
      return null;
    }

    return QUESTION_CONFIG[currentQuestionId];
  }, [currentQuestionId]);

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

  const updateSingleChoice = (
    path:
      | 'accountRegistration.retailRetirement'
      | 'typeOfAccount.primaryType'
      | 'typeOfAccount.corporationDesignation'
      | 'typeOfAccount.llcDesignation'
      | 'typeOfAccount.trust.trustType'
      | 'typeOfAccount.custodial.custodialType'
      | 'typeOfAccount.joint.marriedToEachOther'
      | 'typeOfAccount.joint.tenancyClause',
    selectedKey: string
  ) => {
    if (!fields) {
      return;
    }

    setFields((current) => {
      if (!current) {
        return current;
      }

      const clone: InvestorProfileStepOneFields = structuredClone(current);

      const applySelection = (map: Record<string, boolean>) => {
        Object.keys(map).forEach((key) => {
          map[key] = key === selectedKey;
        });
      };

      if (path === 'accountRegistration.retailRetirement') {
        applySelection(clone.accountRegistration.retailRetirement);
      }

      if (path === 'typeOfAccount.primaryType') {
        applySelection(clone.typeOfAccount.primaryType);
      }

      if (path === 'typeOfAccount.corporationDesignation') {
        applySelection(clone.typeOfAccount.corporationDesignation);
      }

      if (path === 'typeOfAccount.llcDesignation') {
        applySelection(clone.typeOfAccount.llcDesignation);
      }

      if (path === 'typeOfAccount.trust.trustType') {
        applySelection(clone.typeOfAccount.trust.trustType);
      }

      if (path === 'typeOfAccount.custodial.custodialType') {
        applySelection(clone.typeOfAccount.custodial.custodialType);
      }

      if (path === 'typeOfAccount.joint.marriedToEachOther') {
        applySelection(clone.typeOfAccount.joint.marriedToEachOther);
      }

      if (path === 'typeOfAccount.joint.tenancyClause') {
        applySelection(clone.typeOfAccount.joint.tenancyClause);
      }

      return clone;
    });

    setFieldErrors((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
  };

  const getCurrentAnswer = (): unknown => {
    if (!fields || !currentQuestionId) {
      return null;
    }

    switch (currentQuestionId) {
      case 'rrName':
        return fields.accountRegistration.rrName;
      case 'rrNo':
        return fields.accountRegistration.rrNo;
      case 'customerNames':
        return fields.accountRegistration.customerNames;
      case 'accountNo':
        return fields.accountRegistration.accountNo;
      case 'accountRegistration.retailRetirement':
        return fields.accountRegistration.retailRetirement;
      case 'typeOfAccount.primaryType':
        return fields.typeOfAccount.primaryType;
      case 'typeOfAccount.corporationDesignation':
        return fields.typeOfAccount.corporationDesignation;
      case 'typeOfAccount.llcDesignation':
        return fields.typeOfAccount.llcDesignation;
      case 'typeOfAccount.trust.establishmentDate':
        return fields.typeOfAccount.trust.establishmentDate ?? '';
      case 'typeOfAccount.trust.trustType':
        return fields.typeOfAccount.trust.trustType;
      case 'typeOfAccount.custodial.custodialType':
        return fields.typeOfAccount.custodial.custodialType;
      case 'typeOfAccount.custodial.gifts':
        return fields.typeOfAccount.custodial.gifts;
      case 'typeOfAccount.joint.marriedToEachOther':
        return fields.typeOfAccount.joint.marriedToEachOther;
      case 'typeOfAccount.joint.tenancyState':
        return fields.typeOfAccount.joint.tenancyState ?? '';
      case 'typeOfAccount.joint.numberOfTenants':
        return fields.typeOfAccount.joint.numberOfTenants ?? '';
      case 'typeOfAccount.joint.tenancyClause':
        return fields.typeOfAccount.joint.tenancyClause;
      case 'typeOfAccount.transferOnDeath.individualAgreementDate':
        return fields.typeOfAccount.transferOnDeath.individualAgreementDate ?? '';
      case 'typeOfAccount.transferOnDeath.jointAgreementDate':
        return fields.typeOfAccount.transferOnDeath.jointAgreementDate ?? '';
      case 'typeOfAccount.otherDescription':
        return fields.typeOfAccount.otherDescription ?? '';
      default:
        return null;
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!clientId || !currentQuestionId) {
      setError('Invalid client identifier.');
      return;
    }

    const answer = getCurrentAnswer();

    const payload: InvestorProfileStepOneUpdateRequest = {
      questionId: currentQuestionId,
      answer,
      clientCursor: {
        currentQuestionId
      }
    };

    setSaving(true);
    setFieldErrors({});
    setError(null);

    try {
      const response = await apiRequest<InvestorProfileStepOneResponse>(
        `/api/clients/${clientId}/investor-profile/step-1`,
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
        pushToast('Step 1 saved. Continuing to Step 2.');
        navigate(`/clients/${clientId}/investor-profile/step-2`, { replace: true });
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

  const renderActiveControl = () => {
    if (!fields || !activeQuestion || !currentQuestionId) {
      return null;
    }

    if (activeQuestion.type === 'text') {
      const value = getCurrentAnswer();

      return (
        <input
          className="w-full rounded-3xl border border-line bg-paper px-6 py-5 text-2xl font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
          placeholder={activeQuestion.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => {
            const next = event.target.value;

            setFields((current) => {
              if (!current || !currentQuestionId) {
                return current;
              }

              const clone = structuredClone(current);

              if (currentQuestionId === 'rrName') {
                clone.accountRegistration.rrName = next;
              }

              if (currentQuestionId === 'rrNo') {
                clone.accountRegistration.rrNo = next;
              }

              if (currentQuestionId === 'customerNames') {
                clone.accountRegistration.customerNames = next;
              }

              if (currentQuestionId === 'accountNo') {
                clone.accountRegistration.accountNo = next;
              }

              if (currentQuestionId === 'typeOfAccount.joint.tenancyState') {
                clone.typeOfAccount.joint.tenancyState = next;
              }

              if (currentQuestionId === 'typeOfAccount.otherDescription') {
                clone.typeOfAccount.otherDescription = next;
              }

              return clone;
            });
          }}
        />
      );
    }

    if (activeQuestion.type === 'date') {
      const value = getCurrentAnswer();

      return (
        <input
          className="w-full rounded-3xl border border-line bg-paper px-6 py-5 text-2xl font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => {
            const next = event.target.value;

            setFields((current) => {
              if (!current || !currentQuestionId) {
                return current;
              }

              const clone = structuredClone(current);

              if (currentQuestionId === 'typeOfAccount.trust.establishmentDate') {
                clone.typeOfAccount.trust.establishmentDate = next;
              }

              if (currentQuestionId === 'typeOfAccount.transferOnDeath.individualAgreementDate') {
                clone.typeOfAccount.transferOnDeath.individualAgreementDate = next;
              }

              if (currentQuestionId === 'typeOfAccount.transferOnDeath.jointAgreementDate') {
                clone.typeOfAccount.transferOnDeath.jointAgreementDate = next;
              }

              return clone;
            });
          }}
        />
      );
    }

    if (activeQuestion.type === 'number') {
      const value = getCurrentAnswer();

      return (
        <input
          className="w-full rounded-3xl border border-line bg-paper px-6 py-5 text-2xl font-light outline-none ring-accent transition focus:border-accent focus:ring-1"
          min={2}
          type="number"
          value={typeof value === 'number' ? value : value === '' ? '' : String(value)}
          onChange={(event) => {
            const next = event.target.value;
            const parsed = Number(next);

            setFields((current) => {
              if (!current) {
                return current;
              }

              const clone = structuredClone(current);
              clone.typeOfAccount.joint.numberOfTenants = Number.isFinite(parsed) ? parsed : null;
              return clone;
            });
          }}
        />
      );
    }

    if (activeQuestion.type === 'single-choice-cards' && activeQuestion.options) {
      const options = activeQuestion.options;

      const isOptionSelected = (optionKey: string) => {
        if (currentQuestionId === 'accountRegistration.retailRetirement') {
          return fields.accountRegistration.retailRetirement[optionKey as 'retail' | 'retirement'] ?? false;
        }

        if (currentQuestionId === 'typeOfAccount.primaryType') {
          return fields.typeOfAccount.primaryType[optionKey as keyof typeof fields.typeOfAccount.primaryType] ?? false;
        }

        if (currentQuestionId === 'typeOfAccount.corporationDesignation') {
          return (
            fields.typeOfAccount.corporationDesignation[
              optionKey as keyof typeof fields.typeOfAccount.corporationDesignation
            ] ?? false
          );
        }

        if (currentQuestionId === 'typeOfAccount.llcDesignation') {
          return fields.typeOfAccount.llcDesignation[optionKey as keyof typeof fields.typeOfAccount.llcDesignation] ?? false;
        }

        if (currentQuestionId === 'typeOfAccount.trust.trustType') {
          return fields.typeOfAccount.trust.trustType[optionKey as keyof typeof fields.typeOfAccount.trust.trustType] ?? false;
        }

        if (currentQuestionId === 'typeOfAccount.custodial.custodialType') {
          return (
            fields.typeOfAccount.custodial.custodialType[
              optionKey as keyof typeof fields.typeOfAccount.custodial.custodialType
            ] ?? false
          );
        }

        if (currentQuestionId === 'typeOfAccount.joint.marriedToEachOther') {
          return (
            fields.typeOfAccount.joint.marriedToEachOther[
              optionKey as keyof typeof fields.typeOfAccount.joint.marriedToEachOther
            ] ?? false
          );
        }

        if (currentQuestionId === 'typeOfAccount.joint.tenancyClause') {
          return fields.typeOfAccount.joint.tenancyClause[optionKey as keyof typeof fields.typeOfAccount.joint.tenancyClause] ?? false;
        }

        return false;
      };

      return (
        <div className="grid gap-4 sm:grid-cols-2">
          {options.map((option) => {
            const selected = isOptionSelected(option.key);

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
                  if (currentQuestionId === 'accountRegistration.retailRetirement') {
                    updateSingleChoice('accountRegistration.retailRetirement', option.key);
                  }

                  if (currentQuestionId === 'typeOfAccount.primaryType') {
                    updateSingleChoice('typeOfAccount.primaryType', option.key);
                  }

                  if (currentQuestionId === 'typeOfAccount.corporationDesignation') {
                    updateSingleChoice('typeOfAccount.corporationDesignation', option.key);
                  }

                  if (currentQuestionId === 'typeOfAccount.llcDesignation') {
                    updateSingleChoice('typeOfAccount.llcDesignation', option.key);
                  }

                  if (currentQuestionId === 'typeOfAccount.trust.trustType') {
                    updateSingleChoice('typeOfAccount.trust.trustType', option.key);
                  }

                  if (currentQuestionId === 'typeOfAccount.custodial.custodialType') {
                    updateSingleChoice('typeOfAccount.custodial.custodialType', option.key);
                  }

                  if (currentQuestionId === 'typeOfAccount.joint.marriedToEachOther') {
                    updateSingleChoice('typeOfAccount.joint.marriedToEachOther', option.key);
                  }

                  if (currentQuestionId === 'typeOfAccount.joint.tenancyClause') {
                    updateSingleChoice('typeOfAccount.joint.tenancyClause', option.key);
                  }
                }}
              >
                <p className="text-xs uppercase tracking-[0.16em] text-mute">Select One</p>
                <p className="mt-2 text-2xl font-light">{option.label}</p>
                {option.description && <p className="mt-2 text-sm text-mute">{option.description}</p>}
              </button>
            );
          })}
        </div>
      );
    }

    if (activeQuestion.type === 'gifts') {
      return (
        <div className="space-y-4 rounded-3xl border border-line bg-paper/70 p-5 shadow-hairline">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.18em] text-mute">Custodial Gift Entries</p>
            <button
              className="rounded-full border border-line bg-white px-4 py-2 text-xs uppercase tracking-[0.16em] text-ink transition hover:border-black"
              type="button"
              onClick={() => {
                setFields((current) => {
                  if (!current) {
                    return current;
                  }

                  const clone = structuredClone(current);
                  clone.typeOfAccount.custodial.gifts.push({ state: '', dateGiftWasGiven: '' });
                  return clone;
                });
              }}
            >
              Add Entry
            </button>
          </div>

          {fields.typeOfAccount.custodial.gifts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-8 text-center text-sm text-mute">
              No gift entry yet. Add your first row to continue.
            </div>
          )}

          {fields.typeOfAccount.custodial.gifts.map((gift, index) => (
            <div key={`gift-${index}`} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.16em] text-mute">Gift #{index + 1}</p>
                <button
                  className="rounded-full border border-line px-3 py-1 text-xs uppercase tracking-[0.14em] text-mute transition hover:border-black hover:text-ink"
                  type="button"
                  onClick={() => {
                    setFields((current) => {
                      if (!current) {
                        return current;
                      }

                      const clone = structuredClone(current);
                      clone.typeOfAccount.custodial.gifts = clone.typeOfAccount.custodial.gifts.filter(
                        (_, rowIndex) => rowIndex !== index
                      );
                      return clone;
                    });
                  }}
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-[0.14em] text-mute">State</span>
                  <input
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm font-light outline-none ring-accent focus:border-accent focus:ring-1"
                    placeholder="State in which gift was given"
                    value={gift.state}
                    onChange={(event) => {
                      const next = event.target.value;

                      setFields((current) => {
                        if (!current) {
                          return current;
                        }

                        const clone = structuredClone(current);
                        clone.typeOfAccount.custodial.gifts[index].state = next;
                        return clone;
                    });
                  }}
                />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-[0.14em] text-mute">Date Gift Was Given</span>
                  <input
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm font-light outline-none ring-accent focus:border-accent focus:ring-1"
                    type="date"
                    value={gift.dateGiftWasGiven}
                    onChange={(event) => {
                      const next = event.target.value;

                      setFields((current) => {
                        if (!current) {
                          return current;
                        }

                        const clone = structuredClone(current);
                        clone.typeOfAccount.custodial.gifts[index].dateGiftWasGiven = next;
                        return clone;
                      });
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
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
          <p className="text-xs uppercase tracking-[0.22em] text-accent">STEP 1. ACCOUNT REGISTRATION</p>
          <h1 className="mt-5 max-w-5xl text-4xl font-light tracking-tight sm:text-6xl lg:text-7xl">
            {activeQuestion?.title ?? 'Loading question...'}
          </h1>
          <p className="mt-6 max-w-3xl text-base font-light leading-relaxed text-mute sm:text-lg">
            {activeQuestion?.helper ?? 'Please wait while we load your onboarding flow.'}
          </p>

          <form className="mt-10 max-w-4xl" onSubmit={handleSubmit}>
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
