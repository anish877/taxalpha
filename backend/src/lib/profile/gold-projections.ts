/**
 * Explicit per-gold-form projection tables (spec Part 3.3, FIX C2).
 *
 * Gold forms are hand-coded TS with NO canonicalField annotations, so we map
 * each gold field PATH (within the merged per-step JSON the gold modules store)
 * to a canonical key. Paths below are verified against the gold step modules
 * (e.g. investor-profile-step3.ts: holder.taxId.ssn, holder.legalAddress.*).
 *
 * `sourceRank` = position in FORM_SEQUENCE (lower fills first / wins ties).
 */
export interface GoldProjection {
  /** dotted path within the merged gold-form fields */
  path: string;
  canonicalField: string;
}

export const GOLD_SOURCE_RANK: Record<string, number> = {
  INVESTOR_PROFILE: 0,
  INVESTOR_PROFILE_ADDITIONAL_HOLDER: 0,
  SFC: 1,
  BAIODF: 2,
  BAIV_506C: 3
};

export const GOLD_PROJECTIONS: Record<string, GoldProjection[]> = {
  INVESTOR_PROFILE: [
    { path: 'rrName', canonicalField: 'advisor.rrName' },
    { path: 'rrNo', canonicalField: 'advisor.rrNumber' },
    { path: 'typeOfAccount.primaryType', canonicalField: 'account.registrationType' },
    { path: 'holder.name', canonicalField: 'person.fullName' },
    { path: 'holder.taxId.ssn', canonicalField: 'person.ssn' },
    { path: 'holder.taxId.ein', canonicalField: 'entity.ein' },
    { path: 'holder.contact.email', canonicalField: 'person.email' },
    { path: 'holder.contact.dateOfBirth', canonicalField: 'person.dateOfBirth' },
    { path: 'holder.contact.phones.business', canonicalField: 'person.businessPhone' },
    { path: 'holder.contact.phones.home', canonicalField: 'person.homePhone' },
    { path: 'holder.contact.phones.mobile', canonicalField: 'person.phone' },
    { path: 'holder.legalAddress.line1', canonicalField: 'address.legal.line1' },
    { path: 'holder.legalAddress.city', canonicalField: 'address.legal.city' },
    { path: 'holder.legalAddress.stateProvince', canonicalField: 'address.legal.stateProvince' },
    { path: 'holder.legalAddress.postalCode', canonicalField: 'address.legal.postalCode' },
    { path: 'holder.legalAddress.country', canonicalField: 'address.legal.country' }
  ],
  INVESTOR_PROFILE_ADDITIONAL_HOLDER: [
    { path: 'holder.name', canonicalField: 'person2.fullName' },
    { path: 'holder.taxId.ssn', canonicalField: 'person2.ssn' },
    { path: 'holder.contact.email', canonicalField: 'person2.email' },
    { path: 'holder.contact.dateOfBirth', canonicalField: 'person2.dateOfBirth' },
    { path: 'holder.contact.phones.business', canonicalField: 'person2.businessPhone' },
    { path: 'holder.contact.phones.home', canonicalField: 'person2.homePhone' },
    { path: 'holder.contact.phones.mobile', canonicalField: 'person2.phone' },
    { path: 'holder.legalAddress.line1', canonicalField: 'person2.address.legal.line1' },
    { path: 'holder.legalAddress.city', canonicalField: 'person2.address.legal.city' },
    { path: 'holder.legalAddress.stateProvince', canonicalField: 'person2.address.legal.stateProvince' },
    { path: 'holder.legalAddress.postalCode', canonicalField: 'person2.address.legal.postalCode' },
    { path: 'holder.legalAddress.country', canonicalField: 'person2.address.legal.country' }
  ],
  SFC: [
    { path: 'accountRegistration.rrName', canonicalField: 'advisor.rrName' },
    { path: 'accountRegistration.rrNo', canonicalField: 'advisor.rrNumber' },
    { path: 'accountRegistration.customerNames', canonicalField: 'person.fullName' }
  ],
  BAIODF: [
    { path: 'accountRegistration.rrName', canonicalField: 'advisor.rrName' },
    { path: 'accountRegistration.rrNo', canonicalField: 'advisor.rrNumber' },
    { path: 'accountRegistration.customerNames', canonicalField: 'person.fullName' },
    { path: 'orderBasics.proposedPrincipalAmount', canonicalField: 'investment.amount' },
    { path: 'custodianAndProduct.nameOfProduct', canonicalField: 'investment.productName' },
    { path: 'custodianAndProduct.sponsorIssuer', canonicalField: 'investment.sponsorIssuer' },
    { path: 'custodianAndProduct.dateOfPpm', canonicalField: 'investment.ppmDate' },
    { path: 'custodianAndProduct.datePpmSent', canonicalField: 'investment.ppmSentDate' },
    { path: 'netWorthAndConcentration.totalNetWorth', canonicalField: 'financial.totalNetWorth' },
    { path: 'netWorthAndConcentration.liquidNetWorth', canonicalField: 'financial.liquidNetWorth' },
    { path: 'existingAltPositions.existingIlliquidAltPositions', canonicalField: 'alternatives.existingIlliquidPositions' },
    { path: 'existingAltPositions.existingSemiLiquidAltPositions', canonicalField: 'alternatives.existingSemiLiquidPositions' },
    { path: 'existingAltPositions.existingTaxAdvantageAltPositions', canonicalField: 'alternatives.existingTaxAdvantagePositions' }
  ],
  BAIV_506C: [
    { path: 'accountRegistration.rrName', canonicalField: 'advisor.rrName' },
    { path: 'accountRegistration.rrNo', canonicalField: 'advisor.rrNumber' },
    { path: 'accountRegistration.customerNames', canonicalField: 'person.fullName' },
    { path: 'acknowledgements.rule506cGuidelineAcknowledged', canonicalField: 'accreditation.rule506cGuidelineAcknowledged' },
    { path: 'acknowledgements.secRuleReviewedAndUnderstood', canonicalField: 'accreditation.secRuleReviewedAndUnderstood' },
    { path: 'acknowledgements.incomeOrNetWorthVerified', canonicalField: 'accreditation.incomeOrNetWorthVerified' },
    { path: 'acknowledgements.documentationReviewed', canonicalField: 'accreditation.documentationReviewed' }
  ]
};

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[seg];
    else return undefined;
  }
  return cur;
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '' ||
  (typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every((x) => x === false || x === '' || x == null));

export interface ProjectedEntry {
  canonicalField: string;
  value: unknown;
  sourceFormCode: string;
  sourceRank: number;
}

/** Extract canonical entries from one gold form's merged fields. */
export function projectGoldForm(formCode: string, mergedFields: unknown): ProjectedEntry[] {
  const table = GOLD_PROJECTIONS[formCode] ?? [];
  const rank = GOLD_SOURCE_RANK[formCode] ?? 99;
  const out: ProjectedEntry[] = [];
  for (const proj of table) {
    const value = getPath(mergedFields, proj.path);
    if (isEmpty(value)) continue;
    out.push({ canonicalField: proj.canonicalField, value, sourceFormCode: formCode, sourceRank: rank });
  }
  return out;
}
