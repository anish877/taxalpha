import type { ProfileLookup } from '../dynamic-step-engine.js';

export type FactValueShape = 'string' | 'date' | 'number' | 'boolean' | 'enum-onehot';
export type FactConfidence = 'high' | 'medium' | 'low' | 'blocked';

export interface FactDefinition {
  key: string;
  label: string;
  group: string;
  valueShape: FactValueShape;
  format?: 'text' | 'date' | 'currency' | 'phone' | 'tin' | 'ssn';
  ruleSummary: string;
  sourceForms: string[];
  reviewSensitive?: boolean;
}

export interface FactResolution {
  key: string;
  value: unknown;
  confidence: FactConfidence;
  needsReview: boolean;
  sourceFields: string[];
  explanation: string;
  missingInputs: string[];
}

const RGPIF_ENTITY_TYPES = new Set([
  'trust',
  'partnership',
  'limitedLiabilityCompany',
  'individualSingleMemberLlc',
  'corporation',
  'corporatePensionProfitSharing',
  'nonprofitOrganization',
  'exemptOrganization'
]);

const RGPIF_INVESTMENT_TYPE_MAP: Record<string, string | null> = {
  individual: 'individual',
  transferOnDeathIndividual: 'individual',
  jointTenant: 'joint_survivorship',
  transferOnDeathJoint: 'joint_survivorship',
  trust: 'trust',
  partnership: 'partnership',
  limitedLiabilityCompany: 'llc',
  individualSingleMemberLlc: 'llc',
  corporation: 'corporation',
  corporatePensionProfitSharing: 'corporation',
  estate: null,
  custodial: null,
  soleProprietorship: null,
  nonprofitOrganization: null,
  exemptOrganization: null,
  other: null
};

export const FACT_REGISTRY: Record<string, FactDefinition> = {
  'account.isNaturalPerson': {
    key: 'account.isNaturalPerson',
    label: 'Is Natural Person',
    group: 'Smart Facts: Account',
    valueShape: 'boolean',
    ruleSummary: 'True when account registration is individual, joint, transfer-on-death, custodial, estate, or sole proprietorship.',
    sourceForms: ['INVESTOR_PROFILE']
  },
  'account.isJoint': {
    key: 'account.isJoint',
    label: 'Is Joint Account',
    group: 'Smart Facts: Account',
    valueShape: 'boolean',
    ruleSummary: 'True when account registration is joint tenant or transfer-on-death joint.',
    sourceForms: ['INVESTOR_PROFILE']
  },
  'account.isEntity': {
    key: 'account.isEntity',
    label: 'Is Entity Account',
    group: 'Smart Facts: Account',
    valueShape: 'boolean',
    ruleSummary: 'True when account registration is trust, partnership, LLC, corporation, nonprofit, or exempt organization.',
    sourceForms: ['INVESTOR_PROFILE']
  },
  'account.isTrust': {
    key: 'account.isTrust',
    label: 'Is Trust',
    group: 'Smart Facts: Account',
    valueShape: 'boolean',
    ruleSummary: 'True when account registration is trust.',
    sourceForms: ['INVESTOR_PROFILE']
  },
  'account.requiresJointOwner': {
    key: 'account.requiresJointOwner',
    label: 'Requires Joint Owner Section',
    group: 'Smart Facts: Account',
    valueShape: 'boolean',
    ruleSummary: 'True for joint tenant or transfer-on-death joint registrations.',
    sourceForms: ['INVESTOR_PROFILE']
  },
  'account.requiresControlPerson': {
    key: 'account.requiresControlPerson',
    label: 'Requires Control Person Section',
    group: 'Smart Facts: Account',
    valueShape: 'boolean',
    ruleSummary: 'True for trust, partnership, LLC, corporation, nonprofit, or exempt organization registrations.',
    sourceForms: ['INVESTOR_PROFILE']
  },
  'account.rgpifInvestmentType': {
    key: 'account.rgpifInvestmentType',
    label: 'RGPIF Investment Type',
    group: 'Smart Facts: Account',
    valueShape: 'enum-onehot',
    ruleSummary: 'Converts the Investor Profile registration type into RGPIF subscription ownership checkbox values.',
    sourceForms: ['INVESTOR_PROFILE']
  },
  'accreditation.naturalPersonNetWorthQualified': {
    key: 'accreditation.naturalPersonNetWorthQualified',
    label: 'Net Worth Accredited',
    group: 'Smart Facts: Accreditation',
    valueShape: 'boolean',
    ruleSummary: 'True when natural-person net worth excluding primary residence exceeds $1,000,000.',
    sourceForms: ['SFC'],
    reviewSensitive: true
  },
  'accreditation.naturalPersonIncomeQualified': {
    key: 'accreditation.naturalPersonIncomeQualified',
    label: 'Income Accredited',
    group: 'Smart Facts: Accreditation',
    valueShape: 'boolean',
    ruleSummary: 'Requires two most recent years of income and current-year expectation; unresolved in V1 unless those exact inputs exist.',
    sourceForms: ['SFC', 'BAIV_506C'],
    reviewSensitive: true
  },
  'accreditation.baivAcknowledgementsComplete': {
    key: 'accreditation.baivAcknowledgementsComplete',
    label: '506(c) Acknowledgements Complete',
    group: 'Smart Facts: Accreditation',
    valueShape: 'boolean',
    ruleSummary: 'True when all BAIV 506(c) acknowledgement checkboxes currently captured by the website are accepted.',
    sourceForms: ['BAIV_506C'],
    reviewSensitive: true
  },
  'accreditation.documentationAcknowledged': {
    key: 'accreditation.documentationAcknowledged',
    label: 'Documentation Reviewed Acknowledged',
    group: 'Smart Facts: Accreditation',
    valueShape: 'boolean',
    ruleSummary: 'True when BAIV 506(c) documentation-reviewed acknowledgement is accepted.',
    sourceForms: ['BAIV_506C'],
    reviewSensitive: true
  },
  'accreditation.entityAccreditationCandidate': {
    key: 'accreditation.entityAccreditationCandidate',
    label: 'Entity Accredited Candidate',
    group: 'Smart Facts: Accreditation',
    valueShape: 'boolean',
    ruleSummary: 'Suggests entity accreditation only for entity registrations; remains review-needed because V1 lacks exact entity asset/all-owner evidence fields.',
    sourceForms: ['INVESTOR_PROFILE', 'SFC', 'BAIV_506C'],
    reviewSensitive: true
  },
  'investment.subscriptionAmount': {
    key: 'investment.subscriptionAmount',
    label: 'Subscription Amount',
    group: 'Smart Facts: Subscription',
    valueShape: 'number',
    format: 'currency',
    ruleSummary: 'Uses the proposed principal amount from the order/disclosure form.',
    sourceForms: ['BAIODF']
  },
  'investment.productName': {
    key: 'investment.productName',
    label: 'Product Name',
    group: 'Smart Facts: Subscription',
    valueShape: 'string',
    ruleSummary: 'Uses the selected product name from the order/disclosure form.',
    sourceForms: ['BAIODF']
  },
  'investment.sponsorIssuer': {
    key: 'investment.sponsorIssuer',
    label: 'Sponsor / Issuer',
    group: 'Smart Facts: Subscription',
    valueShape: 'string',
    ruleSummary: 'Uses the sponsor/issuer from the order/disclosure form.',
    sourceForms: ['BAIODF']
  },
  'investment.ppmDate': {
    key: 'investment.ppmDate',
    label: 'PPM Date',
    group: 'Smart Facts: Subscription',
    valueShape: 'date',
    format: 'date',
    ruleSummary: 'Uses the PPM date from the order/disclosure form.',
    sourceForms: ['BAIODF']
  },
  'investment.ppmSentDate': {
    key: 'investment.ppmSentDate',
    label: 'PPM Sent Date',
    group: 'Smart Facts: Subscription',
    valueShape: 'date',
    format: 'date',
    ruleSummary: 'Uses the PPM sent date from the order/disclosure form.',
    sourceForms: ['BAIODF']
  },
  'advisor.rrName': {
    key: 'advisor.rrName',
    label: 'RR Name',
    group: 'Smart Facts: Advisor',
    valueShape: 'string',
    ruleSummary: 'Uses the registered representative name from the selected source forms.',
    sourceForms: ['INVESTOR_PROFILE', 'SFC', 'BAIODF', 'BAIV_506C']
  },
  'advisor.rrNumber': {
    key: 'advisor.rrNumber',
    label: 'RR Number',
    group: 'Smart Facts: Advisor',
    valueShape: 'string',
    ruleSummary: 'Uses the registered representative number from the selected source forms.',
    sourceForms: ['INVESTOR_PROFILE', 'SFC', 'BAIODF', 'BAIV_506C']
  },
  'client.customerNames': {
    key: 'client.customerNames',
    label: 'Customer Name(s)',
    group: 'Smart Facts: Client',
    valueShape: 'string',
    ruleSummary: 'Uses customer name(s) from the website forms, falling back to the canonical full name.',
    sourceForms: ['INVESTOR_PROFILE', 'SFC', 'BAIODF', 'BAIV_506C']
  },
  'client.legalAddressLine1': {
    key: 'client.legalAddressLine1',
    label: 'Primary Legal Address',
    group: 'Smart Facts: Client',
    valueShape: 'string',
    ruleSummary: 'Uses the primary account holder legal street address from Investor Profile.',
    sourceForms: ['INVESTOR_PROFILE']
  },
  'client.legalAddressCityStateZip': {
    key: 'client.legalAddressCityStateZip',
    label: 'Primary City, State, ZIP',
    group: 'Smart Facts: Client',
    valueShape: 'string',
    ruleSummary: 'Combines primary account holder city, state, and postal code from Investor Profile.',
    sourceForms: ['INVESTOR_PROFILE']
  },
  'joint.fullName': {
    key: 'joint.fullName',
    label: 'Joint / Additional Holder Name',
    group: 'Smart Facts: Joint / Control Person',
    valueShape: 'string',
    ruleSummary: 'Uses the additional holder, trustee, or entity manager name from Investor Profile step 4.',
    sourceForms: ['INVESTOR_PROFILE_ADDITIONAL_HOLDER']
  },
  'joint.legalAddressLine1': {
    key: 'joint.legalAddressLine1',
    label: 'Joint / Additional Holder Address',
    group: 'Smart Facts: Joint / Control Person',
    valueShape: 'string',
    ruleSummary: 'Uses the additional holder legal street address from Investor Profile step 4.',
    sourceForms: ['INVESTOR_PROFILE_ADDITIONAL_HOLDER']
  },
  'joint.legalAddressCityStateZip': {
    key: 'joint.legalAddressCityStateZip',
    label: 'Joint / Additional Holder City, State, ZIP',
    group: 'Smart Facts: Joint / Control Person',
    valueShape: 'string',
    ruleSummary: 'Combines additional holder city, state, and postal code from Investor Profile step 4.',
    sourceForms: ['INVESTOR_PROFILE_ADDITIONAL_HOLDER']
  }
};

export function isFactKey(key: string): boolean {
  return key in FACT_REGISTRY;
}

export function factDefinitions(): FactDefinition[] {
  return Object.values(FACT_REGISTRY).sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
}

function entry(lookup: ProfileLookup, canonicalKey: string): { value: unknown; sourceFormCode: string } | undefined {
  return lookup[canonicalKey];
}

function selectedOneHot(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const selected = Object.entries(value as Record<string, unknown>)
    .filter(([, isSelected]) => isSelected === true)
    .map(([key]) => key);
  return selected.length === 1 ? selected[0]! : null;
}

function source(lookup: ProfileLookup, canonicalKey: string): string {
  return entry(lookup, canonicalKey)?.sourceFormCode ?? 'unknown';
}

function numberValue(lookup: ProfileLookup, canonicalKey: string): number | null {
  const value = entry(lookup, canonicalKey)?.value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function complete(
  key: string,
  value: unknown,
  explanation: string,
  sourceFields: string[],
  confidence: FactConfidence = 'high',
  needsReview = false
): FactResolution {
  return { key, value, explanation, sourceFields, confidence, needsReview, missingInputs: [] };
}

function unresolved(key: string, explanation: string, missingInputs: string[], sourceFields: string[] = []): FactResolution {
  return { key, value: undefined, explanation, sourceFields, confidence: 'blocked', needsReview: true, missingInputs };
}

function registration(lookup: ProfileLookup): string | null {
  return selectedOneHot(entry(lookup, 'account.registrationType')?.value);
}

function directCanonicalFact(key: string, canonicalKey: string, lookup: ProfileLookup, explanation: string): FactResolution {
  const found = entry(lookup, canonicalKey);
  if (!found) return unresolved(key, `${explanation} Missing source value.`, [canonicalKey]);
  return complete(key, found.value, explanation, [`${found.sourceFormCode}:${canonicalKey}`]);
}

function cityStateZipFact(
  key: string,
  prefix: string,
  lookup: ProfileLookup,
  explanation: string
): FactResolution {
  const cityKey = `${prefix}.city`;
  const stateKey = `${prefix}.stateProvince`;
  const zipKey = `${prefix}.postalCode`;
  const city = entry(lookup, cityKey);
  const state = entry(lookup, stateKey);
  const zip = entry(lookup, zipKey);
  const missing = [cityKey, stateKey, zipKey].filter((canonicalKey) => !entry(lookup, canonicalKey));
  if (missing.length > 0) return unresolved(key, `${explanation} Missing address component.`, missing);
  const cityState = [city?.value, state?.value].filter(Boolean).join(', ');
  const value = [cityState, zip?.value].filter(Boolean).join(' ');
  const sourceFields = [
    city ? `${city.sourceFormCode}:${cityKey}` : null,
    state ? `${state.sourceFormCode}:${stateKey}` : null,
    zip ? `${zip.sourceFormCode}:${zipKey}` : null
  ].filter((field): field is string => !!field);
  return complete(
    key,
    value,
    explanation,
    sourceFields
  );
}

export function resolveFact(key: string, lookup: ProfileLookup): FactResolution | null {
  if (!isFactKey(key)) return null;

  const type = registration(lookup);
  const registrationSource = entry(lookup, 'account.registrationType');
  const registrationField = registrationSource ? [`${registrationSource.sourceFormCode}:account.registrationType`] : [];

  switch (key) {
    case 'account.isNaturalPerson': {
      if (!type) return unresolved(key, 'Account registration is required to determine natural-person status.', ['account.registrationType']);
      const value = !RGPIF_ENTITY_TYPES.has(type);
      return complete(key, value, value ? 'Registration is treated as a natural-person account.' : 'Registration is not treated as a natural-person account.', registrationField);
    }
    case 'account.isJoint': {
      if (!type) return unresolved(key, 'Account registration is required to determine joint status.', ['account.registrationType']);
      const value = type === 'jointTenant' || type === 'transferOnDeathJoint';
      return complete(key, value, value ? 'Registration requires joint-owner handling.' : 'Registration does not require joint-owner handling.', registrationField);
    }
    case 'account.isEntity': {
      if (!type) return unresolved(key, 'Account registration is required to determine entity status.', ['account.registrationType']);
      const value = RGPIF_ENTITY_TYPES.has(type);
      return complete(key, value, value ? 'Registration is treated as an entity account.' : 'Registration is not treated as an entity account.', registrationField);
    }
    case 'account.isTrust': {
      if (!type) return unresolved(key, 'Account registration is required to determine trust status.', ['account.registrationType']);
      return complete(key, type === 'trust', type === 'trust' ? 'Registration is trust.' : 'Registration is not trust.', registrationField);
    }
    case 'account.requiresJointOwner': {
      if (!type) return unresolved(key, 'Account registration is required to determine joint-owner requirement.', ['account.registrationType']);
      const value = type === 'jointTenant' || type === 'transferOnDeathJoint';
      return complete(key, value, value ? 'Joint owner section applies.' : 'Joint owner section does not apply.', registrationField);
    }
    case 'account.requiresControlPerson': {
      if (!type) return unresolved(key, 'Account registration is required to determine control-person requirement.', ['account.registrationType']);
      const value = RGPIF_ENTITY_TYPES.has(type);
      return complete(key, value, value ? 'Entity/control-person section applies.' : 'Entity/control-person section does not apply.', registrationField);
    }
    case 'account.rgpifInvestmentType': {
      if (!type) return unresolved(key, 'Account registration is required to choose an RGPIF investment type.', ['account.registrationType']);
      const mapped = RGPIF_INVESTMENT_TYPE_MAP[type];
      if (!mapped) {
        return unresolved(key, `Registration type "${type}" does not have a safe RGPIF checkbox mapping.`, ['admin review'], registrationField);
      }
      return complete(key, { [mapped]: true }, `Registration type "${type}" maps to RGPIF checkbox "${mapped}".`, registrationField);
    }
    case 'accreditation.naturalPersonNetWorthQualified': {
      if (!type) {
        return unresolved(key, 'Account registration is required before filling a natural-person net worth accreditation checkbox.', ['account.registrationType']);
      }
      const netWorth = numberValue(lookup, 'financial.netWorthExPrimaryResidence');
      if (netWorth === null) {
        return unresolved(
          key,
          'Net worth accreditation requires SFC net worth excluding primary residence.',
        ['financial.netWorthExPrimaryResidence']
        );
      }
      const natural = !RGPIF_ENTITY_TYPES.has(type);
      const qualified = natural && netWorth > 1_000_000;
      return complete(
        key,
        qualified,
        `Net worth excluding primary residence is ${netWorth}; threshold is greater than 1000000.`,
        [`${source(lookup, 'financial.netWorthExPrimaryResidence')}:financial.netWorthExPrimaryResidence`, ...registrationField],
        'high'
      );
    }
    case 'accreditation.naturalPersonIncomeQualified':
      return unresolved(
        key,
        'Income accreditation requires two prior-year income values and current-year expectation; V1 does not collect those exact inputs.',
        ['priorYearIncome1', 'priorYearIncome2', 'currentYearIncomeExpectation']
      );
    case 'accreditation.baivAcknowledgementsComplete': {
      const keys = [
        'accreditation.rule506cGuidelineAcknowledged',
        'accreditation.secRuleReviewedAndUnderstood',
        'accreditation.incomeOrNetWorthVerified',
        'accreditation.documentationReviewed'
      ];
      const missing = keys.filter((canonicalKey) => entry(lookup, canonicalKey)?.value !== true);
      if (missing.length > 0) {
        return unresolved(key, 'All BAIV 506(c) acknowledgements must be accepted.', missing, keys.filter((canonicalKey) => entry(lookup, canonicalKey)).map((canonicalKey) => `${source(lookup, canonicalKey)}:${canonicalKey}`));
      }
      return complete(
        key,
        true,
        'All BAIV 506(c) acknowledgement values are accepted.',
        keys.map((canonicalKey) => `${source(lookup, canonicalKey)}:${canonicalKey}`),
        'high'
      );
    }
    case 'accreditation.documentationAcknowledged': {
      const found = entry(lookup, 'accreditation.documentationReviewed');
      if (!found) return unresolved(key, 'Documentation-reviewed acknowledgement is missing.', ['accreditation.documentationReviewed']);
      return complete(key, found.value === true, 'BAIV documentation-reviewed acknowledgement is captured.', [`${found.sourceFormCode}:accreditation.documentationReviewed`], 'high');
    }
    case 'accreditation.entityAccreditationCandidate': {
      if (!type) return unresolved(key, 'Entity accreditation requires account registration type.', ['account.registrationType']);
      if (!RGPIF_ENTITY_TYPES.has(type)) {
        return complete(key, false, 'Registration is not an entity registration.', registrationField, 'high');
      }
      return unresolved(
        key,
        'V1 can identify entity registration, but exact entity assets/all-owner accreditation evidence requires admin review.',
        ['entity.totalAssets', 'entity.notFormedForSpecificInvestment', 'entity.allEquityOwnersAccredited'],
        registrationField
      );
    }
    case 'investment.subscriptionAmount':
      return directCanonicalFact(key, 'investment.amount', lookup, 'Subscription amount comes from proposed principal amount.');
    case 'investment.productName':
      return directCanonicalFact(key, 'investment.productName', lookup, 'Product name comes from the order/disclosure form.');
    case 'investment.sponsorIssuer':
      return directCanonicalFact(key, 'investment.sponsorIssuer', lookup, 'Sponsor/issuer comes from the order/disclosure form.');
    case 'investment.ppmDate':
      return directCanonicalFact(key, 'investment.ppmDate', lookup, 'PPM date comes from the order/disclosure form.');
    case 'investment.ppmSentDate':
      return directCanonicalFact(key, 'investment.ppmSentDate', lookup, 'PPM sent date comes from the order/disclosure form.');
    case 'advisor.rrName':
      return directCanonicalFact(key, 'advisor.rrName', lookup, 'RR name comes from the selected website forms.');
    case 'advisor.rrNumber':
      return directCanonicalFact(key, 'advisor.rrNumber', lookup, 'RR number comes from the selected website forms.');
    case 'client.customerNames': {
      const found = entry(lookup, 'person.fullName');
      if (!found) return unresolved(key, 'Customer name(s) require a resolved client/person name.', ['person.fullName']);
      return complete(key, found.value, 'Customer name(s) fall back to the canonical client/person full name.', [`${found.sourceFormCode}:person.fullName`]);
    }
    case 'client.legalAddressLine1':
      return directCanonicalFact(key, 'address.legal.line1', lookup, 'Primary legal address comes from Investor Profile.');
    case 'client.legalAddressCityStateZip':
      return cityStateZipFact(key, 'address.legal', lookup, 'Primary city/state/ZIP comes from Investor Profile.');
    case 'joint.fullName':
      return directCanonicalFact(key, 'person2.fullName', lookup, 'Additional holder/control-person name comes from Investor Profile step 4.');
    case 'joint.legalAddressLine1':
      return directCanonicalFact(key, 'person2.address.legal.line1', lookup, 'Additional holder/control-person address comes from Investor Profile step 4.');
    case 'joint.legalAddressCityStateZip':
      return cityStateZipFact(key, 'person2.address.legal', lookup, 'Additional holder/control-person city/state/ZIP comes from Investor Profile step 4.');
    default:
      return null;
  }
}
