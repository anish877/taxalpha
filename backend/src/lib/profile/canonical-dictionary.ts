import type { RuleName } from '../validators.js';

/**
 * Canonical investor-profile dictionary (spec Part 3.2).
 * The fixed set of legal cross-form keys, each with a value shape, the
 * validation rule its stored value must satisfy (over-fill guard, 3.4), and —
 * for enum one-hot fields — per-form key remaps (FIX C7).
 */
export type CanonicalValueShape = 'string' | 'date' | 'number' | 'boolean' | 'enum-onehot' | 'composite';

export interface CanonicalEntry {
  shape: CanonicalValueShape;
  rule?: RuleName;
  /** for enum-onehot: per-form { sourceKey -> targetKey | null } */
  remap?: Record<string, Record<string, string | null>>;
}

export const CANONICAL_DICTIONARY: Record<string, CanonicalEntry> = {
  // identity
  'person.fullName': { shape: 'string', rule: 'requiredString' },
  'person.ssn': { shape: 'string', rule: 'ssnOrEin' },
  'person.dateOfBirth': { shape: 'date', rule: 'pastDate' },
  'person.email': { shape: 'string', rule: 'email' },
  'person.phone': { shape: 'string', rule: 'phone' },
  'person.businessPhone': { shape: 'string', rule: 'phone' },
  'person.homePhone': { shape: 'string', rule: 'phone' },
  'person2.fullName': { shape: 'string', rule: 'requiredString' },
  'person2.ssn': { shape: 'string', rule: 'ssnOrEin' },
  'person2.dateOfBirth': { shape: 'date', rule: 'pastDate' },
  'person2.email': { shape: 'string', rule: 'email' },
  'person2.phone': { shape: 'string', rule: 'phone' },
  'person2.businessPhone': { shape: 'string', rule: 'phone' },
  'person2.homePhone': { shape: 'string', rule: 'phone' },
  // entity
  'entity.name': { shape: 'string', rule: 'requiredString' },
  'entity.ein': { shape: 'string', rule: 'ssnOrEin' },
  'entity.taxForm': { shape: 'string' },
  // address (composite leaves stored individually too)
  'address.legal.line1': { shape: 'string', rule: 'noPoBox' },
  'address.legal.city': { shape: 'string', rule: 'requiredString' },
  'address.legal.stateProvince': { shape: 'string', rule: 'requiredString' },
  'address.legal.postalCode': { shape: 'string', rule: 'requiredString' },
  'address.legal.country': { shape: 'string', rule: 'countryCode2' },
  'person2.address.legal.line1': { shape: 'string', rule: 'noPoBox' },
  'person2.address.legal.city': { shape: 'string', rule: 'requiredString' },
  'person2.address.legal.stateProvince': { shape: 'string', rule: 'requiredString' },
  'person2.address.legal.postalCode': { shape: 'string', rule: 'requiredString' },
  'person2.address.legal.country': { shape: 'string', rule: 'countryCode2' },
  // advisor
  'advisor.rrName': { shape: 'string' },
  'advisor.rrNumber': { shape: 'string' },
  // primary broker selected during client intake
  'broker.firmName': { shape: 'string' },
  'broker.brokerDealerCrdNumber': { shape: 'string' },
  'broker.representativeName': { shape: 'string' },
  'broker.representativeCrdNumber': { shape: 'string' },
  'broker.branchAddressLine1': { shape: 'string' },
  'broker.branchAddressLine2': { shape: 'string' },
  'broker.branchCity': { shape: 'string' },
  'broker.branchState': { shape: 'string' },
  'broker.branchPostalCode': { shape: 'string' },
  'broker.branchCityStateZip': { shape: 'string' },
  'broker.branchFullAddress': { shape: 'string' },
  'broker.branchPhone': { shape: 'string', rule: 'phone' },
  'broker.email': { shape: 'string', rule: 'email' },
  // investment / financial
  'investment.amount': { shape: 'number', rule: 'nonNegativeNumber' },
  'investment.productName': { shape: 'string' },
  'investment.sponsorIssuer': { shape: 'string' },
  'investment.ppmDate': { shape: 'date' },
  'investment.ppmSentDate': { shape: 'date' },
  'financial.totalNetWorth': { shape: 'number', rule: 'nonNegativeNumber' },
  'financial.netWorthExPrimaryResidence': { shape: 'number', rule: 'nonNegativeNumber' },
  'financial.liquidNetWorth': { shape: 'number', rule: 'nonNegativeNumber' },
  'financial.totalAnnualIncome': { shape: 'number', rule: 'nonNegativeNumber' },
  'financial.totalLiquidAssets': { shape: 'number', rule: 'nonNegativeNumber' },
  'financial.totalLiabilities': { shape: 'number', rule: 'nonNegativeNumber' },
  'financial.totalPotentialLiquidity': { shape: 'number', rule: 'nonNegativeNumber' },
  'alternatives.existingIlliquidPositions': { shape: 'number', rule: 'nonNegativeNumber' },
  'alternatives.existingSemiLiquidPositions': { shape: 'number', rule: 'nonNegativeNumber' },
  'alternatives.existingTaxAdvantagePositions': { shape: 'number', rule: 'nonNegativeNumber' },
  'accreditation.rule506cGuidelineAcknowledged': { shape: 'boolean' },
  'accreditation.secRuleReviewedAndUnderstood': { shape: 'boolean' },
  'accreditation.incomeOrNetWorthVerified': { shape: 'boolean' },
  'accreditation.documentationReviewed': { shape: 'boolean' },
  // signatures
  'signature.accountOwner.printedName': { shape: 'string', rule: 'requiredString' },
  // account registration — one-hot enum with per-form key maps
  'account.registrationType': {
    shape: 'enum-onehot',
    remap: {
      // gold Investor Profile 16-key taxonomy -> RGPIF 6-key taxonomy (verified
      // gold keys from investor-profile-step1.ts PRIMARY_TYPE_KEYS)
      RGP_INCOME_FUND_II_SUB: {
        individual: 'individual',
        jointTenant: 'joint',
        transferOnDeathJoint: 'joint',
        transferOnDeathIndividual: 'individual',
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
      }
    }
  }
};

export function isCanonicalKey(key: string): boolean {
  return key in CANONICAL_DICTIONARY;
}

/**
 * Aliases the ingestion LLM tends to invent → fixed dictionary keys (FIX: the
 * model free-forms canonical names; auto-fill requires the dictionary keyspace).
 */
const CANONICAL_ALIASES: Record<string, string> = {
  'identity.taxId': 'person.ssn',
  'identity.ssn': 'person.ssn',
  'identity.tin': 'person.ssn',
  'identity.ein': 'entity.ein',
  'identity.fullName': 'person.fullName',
  'identity.name': 'person.fullName',
  'identity.dateOfBirth': 'person.dateOfBirth',
  'identity.dob': 'person.dateOfBirth',
  'contact.email': 'person.email',
  'contact.phone': 'person.phone',
  'phone.home': 'person.phone',
  'tax.id': 'person.ssn',
  'taxId': 'person.ssn',
  'ssn': 'person.ssn',
  'email': 'person.email',
  'dateOfBirth': 'person.dateOfBirth',
  'fullName': 'person.fullName',
  'name': 'person.fullName',
  'entityName': 'entity.name',
  'ein': 'entity.ein'
};

/** Normalize an LLM-produced canonicalField to a dictionary key (or null). */
export function normalizeCanonicalKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = raw.trim();
  if (k in CANONICAL_DICTIONARY) return k;
  if (k in CANONICAL_ALIASES) return CANONICAL_ALIASES[k]!;
  // tolerate "person2.*" style by checking the suffix against the dictionary
  return null;
}

/** Translate a one-hot enum value from a source form's keyspace to a target form's. */
export function remapEnumOneHot(
  canonicalField: string,
  targetFormCode: string,
  value: Record<string, boolean>
): Record<string, boolean> | null {
  const entry = CANONICAL_DICTIONARY[canonicalField];
  if (!entry || entry.shape !== 'enum-onehot') return value;
  const map = entry.remap?.[targetFormCode];
  if (!map) return null; // no map for this form -> cannot safely prefill
  const onKey = Object.entries(value).find(([, v]) => v === true)?.[0];
  if (!onKey) return null;
  const target = map[onKey];
  if (!target) return null; // unmapped source key -> leave empty (question shown)
  return { [target]: true };
}
