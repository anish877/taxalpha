import type { PdfMappingRect, PdfMappingTarget } from '../ingestion/schema-v2.js';

export type SourceValueType = 'text' | 'date' | 'money' | 'boolean' | 'onehot';
export type SourceSensitivity = 'normal' | 'tax_id' | 'legal_review' | 'signature';

export interface SourceFormFieldPath {
  path: string;
  label: string;
  meaning: string;
  valueType: SourceValueType;
  sourceGroup: string;
  sensitivity?: SourceSensitivity;
}

export interface SourceFormDefinition {
  code: string;
  title: string;
  fieldPaths: SourceFormFieldPath[];
}

export interface PdfFieldIntent {
  variableKey: string;
  optionValue?: string;
  format?: PdfMappingTarget['format'];
  confidence?: number;
  label?: string;
  skip?: boolean;
}

export interface DestinationProfile {
  fingerprint: string;
  title: string;
  knownFieldIntents: Record<string, PdfFieldIntent>;
  signatureZones: Array<{ page: number; rect: PdfMappingRect }>;
  skipRules: string[];
}

export interface FormIntelligenceCorpus {
  version: 1;
  sourceForms: SourceFormDefinition[];
  destinationProfiles: DestinationProfile[];
}

export const FORM_INTELLIGENCE_CORPUS: FormIntelligenceCorpus = {
  version: 1,
  sourceForms: [
    {
      code: 'INVESTOR_PROFILE',
      title: 'Investor Profile',
      fieldPaths: [
        {
          path: 'step1.typeOfAccount.primaryType',
          label: 'Account registration type',
          meaning: 'Determines individual, joint, trust, LLC, corporation, and entity routing.',
          valueType: 'onehot',
          sourceGroup: 'Account'
        },
        { path: 'step1.rrName', label: 'RR name', meaning: 'Registered representative name.', valueType: 'text', sourceGroup: 'Advisor' },
        { path: 'step1.rrNo', label: 'RR number', meaning: 'Registered representative number.', valueType: 'text', sourceGroup: 'Advisor' },
        { path: 'step3.holder.name', label: 'Primary holder name', meaning: 'Primary owner or investor full legal name.', valueType: 'text', sourceGroup: 'Primary holder' },
        { path: 'step3.holder.taxId.ssn', label: 'Primary SSN', meaning: 'Primary owner tax identifier.', valueType: 'text', sourceGroup: 'Tax', sensitivity: 'tax_id' },
        { path: 'step3.holder.taxId.ein', label: 'Entity EIN', meaning: 'Entity tax identifier when applicable.', valueType: 'text', sourceGroup: 'Tax', sensitivity: 'tax_id' },
        { path: 'step3.holder.contact.dateOfBirth', label: 'Primary date of birth', meaning: 'Primary natural-person DOB.', valueType: 'date', sourceGroup: 'Primary holder' },
        { path: 'step3.holder.contact.email', label: 'Primary email', meaning: 'Primary owner email address.', valueType: 'text', sourceGroup: 'Primary holder' },
        { path: 'step3.holder.contact.phones.business', label: 'Primary business phone', meaning: 'Primary owner business phone.', valueType: 'text', sourceGroup: 'Primary holder' },
        { path: 'step3.holder.contact.phones.home', label: 'Primary home phone', meaning: 'Primary owner home phone.', valueType: 'text', sourceGroup: 'Primary holder' },
        { path: 'step3.holder.legalAddress', label: 'Primary legal address', meaning: 'Primary owner residential or principal address.', valueType: 'text', sourceGroup: 'Address' },
        { path: 'step7.signatures', label: 'Investor Profile signatures', meaning: 'Signature blocks are intentionally skipped in V1.', valueType: 'text', sourceGroup: 'Signatures', sensitivity: 'signature' }
      ]
    },
    {
      code: 'INVESTOR_PROFILE_ADDITIONAL_HOLDER',
      title: 'Investor Profile Additional Holder',
      fieldPaths: [
        { path: 'step4.holder.name', label: 'Additional holder name', meaning: 'Joint owner, trustee, or entity manager/control-person name.', valueType: 'text', sourceGroup: 'Additional holder' },
        { path: 'step4.holder.taxId.ssn', label: 'Additional holder SSN', meaning: 'Additional holder tax identifier.', valueType: 'text', sourceGroup: 'Tax', sensitivity: 'tax_id' },
        { path: 'step4.holder.contact.dateOfBirth', label: 'Additional holder date of birth', meaning: 'Additional holder DOB.', valueType: 'date', sourceGroup: 'Additional holder' },
        { path: 'step4.holder.contact.email', label: 'Additional holder email', meaning: 'Additional holder email address.', valueType: 'text', sourceGroup: 'Additional holder' },
        { path: 'step4.holder.contact.phones.business', label: 'Additional holder business phone', meaning: 'Additional holder business phone.', valueType: 'text', sourceGroup: 'Additional holder' },
        { path: 'step4.holder.contact.phones.home', label: 'Additional holder home phone', meaning: 'Additional holder home phone.', valueType: 'text', sourceGroup: 'Additional holder' },
        { path: 'step4.holder.legalAddress', label: 'Additional holder legal address', meaning: 'Joint owner, trustee, or control-person address.', valueType: 'text', sourceGroup: 'Address' }
      ]
    },
    {
      code: 'SFC',
      title: 'Statement of Financial Condition',
      fieldPaths: [
        { path: 'step1.assets', label: 'Assets', meaning: 'Financial assets used for suitability and net worth calculations.', valueType: 'money', sourceGroup: 'Financial condition' },
        { path: 'step1.liabilities', label: 'Liabilities', meaning: 'Liabilities used for suitability and net worth calculations.', valueType: 'money', sourceGroup: 'Financial condition' },
        { path: 'computed.financial.netWorthExPrimaryResidence', label: 'Net worth excluding primary residence', meaning: 'Computed SFC net worth used for natural-person accreditation threshold.', valueType: 'money', sourceGroup: 'Accreditation', sensitivity: 'legal_review' },
        { path: 'computed.financial.totalAnnualIncome', label: 'Annual income', meaning: 'Current annual income only; not enough by itself for 506(c) income accreditation.', valueType: 'money', sourceGroup: 'Accreditation', sensitivity: 'legal_review' },
        { path: 'step2.signatures', label: 'SFC signatures', meaning: 'Signature blocks are intentionally skipped in V1.', valueType: 'text', sourceGroup: 'Signatures', sensitivity: 'signature' }
      ]
    },
    {
      code: 'BAIODF',
      title: 'Brokerage Alternative Investment Order and Disclosure Form',
      fieldPaths: [
        { path: 'step1.orderBasics.proposedPrincipalAmount', label: 'Proposed principal amount', meaning: 'Subscription or investment amount.', valueType: 'money', sourceGroup: 'Subscription' },
        { path: 'step2.custodianAndProduct.nameOfProduct', label: 'Product name', meaning: 'Selected alternative investment product.', valueType: 'text', sourceGroup: 'Subscription' },
        { path: 'step2.custodianAndProduct.sponsorIssuer', label: 'Sponsor / issuer', meaning: 'Product sponsor or issuer.', valueType: 'text', sourceGroup: 'Subscription' },
        { path: 'step2.custodianAndProduct.dateOfPpm', label: 'PPM date', meaning: 'Private placement memorandum date.', valueType: 'date', sourceGroup: 'Subscription' },
        { path: 'step2.custodianAndProduct.datePpmSent', label: 'PPM sent date', meaning: 'Date PPM was sent to customer.', valueType: 'date', sourceGroup: 'Subscription' },
        { path: 'step2.netWorthAndConcentration', label: 'Net worth and concentration', meaning: 'Suitability inputs for alternative investment concentration.', valueType: 'money', sourceGroup: 'Suitability', sensitivity: 'legal_review' },
        { path: 'step3.signatures', label: 'BAIODF signatures', meaning: 'Signature blocks are intentionally skipped in V1.', valueType: 'text', sourceGroup: 'Signatures', sensitivity: 'signature' }
      ]
    },
    {
      code: 'BAIV_506C',
      title: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)',
      fieldPaths: [
        { path: 'step1.accountRegistration.rrName', label: 'RR name', meaning: 'Registered representative name on the 506(c) form.', valueType: 'text', sourceGroup: 'Advisor' },
        { path: 'step1.accountRegistration.rrNo', label: 'RR number', meaning: 'Registered representative number on the 506(c) form.', valueType: 'text', sourceGroup: 'Advisor' },
        { path: 'step1.accountRegistration.customerNames', label: 'Customer names', meaning: 'Customer names shown in the 506(c) header.', valueType: 'text', sourceGroup: 'Client' },
        { path: 'step2.acknowledgements', label: '506(c) acknowledgements', meaning: 'Acknowledgement checkboxes and documentation review status.', valueType: 'boolean', sourceGroup: 'Accreditation', sensitivity: 'legal_review' },
        { path: 'step2.signatures', label: '506(c) signatures', meaning: 'Signature and printed-name/date blocks are intentionally skipped in V1.', valueType: 'text', sourceGroup: 'Signatures', sensitivity: 'signature' }
      ]
    }
  ],
  destinationProfiles: [
    {
      fingerprint: '4a67040bd29afb5863ac0c60340b642bd99948f91bf10306eb1bc77757bc896e',
      title: '506(c) Policy and Accreditation Form',
      knownFieldIntents: {
        'RR Name': { variableKey: 'fact:advisor.rrName', format: 'text', confidence: 0.98, label: 'RR Name' },
        'RR No': { variableKey: 'fact:advisor.rrNumber', format: 'text', confidence: 0.98, label: 'RR Number' },
        'Customer Names': { variableKey: 'fact:client.customerNames', format: 'text', confidence: 0.98, label: 'Customer Name(s)' },
        'Acct Owner Name': { variableKey: 'signature:skipped', skip: true },
        'Acct Owner Date': { variableKey: 'signature:skipped', skip: true },
        'Jt Acct Owner Name': { variableKey: 'signature:skipped', skip: true },
        'Jt Acct Owner Date': { variableKey: 'signature:skipped', skip: true },
        'FP Name': { variableKey: 'signature:skipped', skip: true },
        'FP Date': { variableKey: 'signature:skipped', skip: true },
        'Supervisor Name': { variableKey: 'signature:skipped', skip: true },
        'Supervisor Date': { variableKey: 'signature:skipped', skip: true }
      },
      signatureZones: [{ page: 1, rect: { x: 25, y: 40, width: 560, height: 300 } }],
      skipRules: ['Skip all account owner, joint owner, financial professional, and supervisor signature-adjacent name/date fields.']
    },
    {
      fingerprint: '541873bb610366a9888f7da13a9ce1376f6ae4e59d1bc2c58f0a2fff0634f90a',
      title: 'RGPIF II Subscription Agreement',
      knownFieldIntents: {
        Investment: { variableKey: 'fact:investment.subscriptionAmount', format: 'currency', confidence: 0.98, label: 'Total Purchase Price' },
        'Check Box3': { variableKey: 'fact:account.rgpifInvestmentType', optionValue: 'individual', confidence: 0.92, label: 'Individual or Separate Property' },
        'Check Box5': { variableKey: 'fact:account.rgpifInvestmentType', optionValue: 'joint_survivorship', confidence: 0.92, label: 'Joint Tenants with Right of Survivorship' },
        'Check Box6': { variableKey: 'fact:account.rgpifInvestmentType', optionValue: 'joint_survivorship', confidence: 0.86, label: 'Tenants in Common' },
        'Check Box8': { variableKey: 'fact:account.rgpifInvestmentType', optionValue: 'trust', confidence: 0.9, label: 'Trust' },
        'Check Box9': { variableKey: 'fact:account.rgpifInvestmentType', optionValue: 'partnership', confidence: 0.9, label: 'Partnership' },
        'Check Box10': { variableKey: 'fact:account.rgpifInvestmentType', optionValue: 'llc', confidence: 0.9, label: 'Limited Liability Company' },
        'Check Box11': { variableKey: 'fact:account.rgpifInvestmentType', optionValue: 'corporation', confidence: 0.9, label: 'Corporation' },
        'Primary Owner Information': { variableKey: 'canonical:person.fullName', format: 'text', confidence: 0.94, label: 'Primary Owner Name' },
        'Address of Principal Place of Residence no PO Box': { variableKey: 'fact:client.legalAddressLine1', format: 'text', confidence: 0.9, label: 'Primary Address' },
        '1_2': { variableKey: 'fact:client.legalAddressCityStateZip', format: 'text', confidence: 0.86, label: 'Primary City, State, ZIP' },
        'Phone Business': { variableKey: 'canonical:person.businessPhone', format: 'phone', confidence: 0.82, label: 'Primary Business Phone' },
        Home: { variableKey: 'canonical:person.homePhone', format: 'phone', confidence: 0.82, label: 'Primary Home Phone' },
        'Primary State of Residence': { variableKey: 'canonical:address.legal.stateProvince', format: 'text', confidence: 0.9, label: 'Primary State of Residence' },
        'Date of Birth': { variableKey: 'canonical:person.dateOfBirth', format: 'date', confidence: 0.92, label: 'Primary Date of Birth' },
        'Social Security or Federal Tax ID Number TIN': { variableKey: 'canonical:person.ssn', format: 'ssn', confidence: 0.88, label: 'Primary TIN' },
        'Email Address': { variableKey: 'canonical:person.email', format: 'text', confidence: 0.9, label: 'Primary Email' },
        Name: { variableKey: 'fact:joint.fullName', format: 'text', confidence: 0.86, label: 'Joint Owner Name' },
        'Address of Principal Place of Residence no PO Box 1': { variableKey: 'fact:joint.legalAddressLine1', format: 'text', confidence: 0.84, label: 'Joint Owner Address' },
        'Address of Principal Place of Residence no PO Box 2': { variableKey: 'fact:joint.legalAddressCityStateZip', format: 'text', confidence: 0.82, label: 'Joint Owner City, State, ZIP' },
        'Phone Business_2': { variableKey: 'canonical:person2.businessPhone', format: 'phone', confidence: 0.78, label: 'Joint Business Phone' },
        Home_2: { variableKey: 'canonical:person2.homePhone', format: 'phone', confidence: 0.78, label: 'Joint Home Phone' },
        'Primary State of Residence_2': { variableKey: 'canonical:person2.address.legal.stateProvince', format: 'text', confidence: 0.82, label: 'Joint State of Residence' },
        'Date of Birth_2': { variableKey: 'canonical:person2.dateOfBirth', format: 'date', confidence: 0.82, label: 'Joint Date of Birth' },
        'Social Security or Federal Tax ID Number TIN_2': { variableKey: 'canonical:person2.ssn', format: 'ssn', confidence: 0.78, label: 'Joint TIN' },
        'Email Address_2': { variableKey: 'canonical:person2.email', format: 'text', confidence: 0.78, label: 'Joint Email' },
        'Check Box27': { variableKey: 'fact:accreditation.naturalPersonIncomeQualified', confidence: 0.72, label: 'Income Accreditation' },
        'Check Box28': { variableKey: 'fact:accreditation.naturalPersonNetWorthQualified', confidence: 0.84, label: 'Net Worth Accreditation' },
        'Registered Representative Name Print': { variableKey: 'fact:advisor.rrName', format: 'text', confidence: 0.9, label: 'Registered Representative Name' },
        'CRD No': { variableKey: 'canonical:broker.representativeCrdNumber', format: 'text', confidence: 0.84, label: 'Registered Representative CRD No.' },
        'Broker-Dealer Firm Name': { variableKey: 'canonical:broker.firmName', format: 'text', confidence: 0.96, label: 'Broker-Dealer Firm Name' },
        'Broker-Dealer CRD No': { variableKey: 'canonical:broker.brokerDealerCrdNumber', format: 'text', confidence: 0.94, label: 'Broker-Dealer CRD No.' },
        'Registered Representative CRD No': { variableKey: 'canonical:broker.representativeCrdNumber', format: 'text', confidence: 0.96, label: 'Registered Representative CRD No.' },
        'Rep Code': { variableKey: 'canonical:broker.repCode', format: 'text', confidence: 0.98, label: 'Rep Code' },
        RepCode: { variableKey: 'canonical:broker.repCode', format: 'text', confidence: 0.98, label: 'Rep Code' },
        'Representative Code': { variableKey: 'canonical:broker.repCode', format: 'text', confidence: 0.96, label: 'Rep Code' },
        'Registered Representative Branch Address': { variableKey: 'canonical:broker.branchAddressLine1', format: 'text', confidence: 0.92, label: 'Registered Representative Branch Address' },
        'Registered Representative Branch City State Zip': { variableKey: 'canonical:broker.branchCityStateZip', format: 'text', confidence: 0.92, label: 'Registered Representative Branch City, State, ZIP' },
        'Broker Email Address': { variableKey: 'canonical:broker.email', format: 'text', confidence: 0.92, label: 'Broker E-mail Address' },
        'BrokerDealer Firm Name': { variableKey: 'canonical:broker.firmName', format: 'text', confidence: 0.99, label: 'Broker-Dealer Firm Name' },
        BrokerDealer: { variableKey: 'canonical:broker.brokerDealerCrdNumber', format: 'text', confidence: 0.99, label: 'Broker-Dealer CRD No.' },
        'Registered Representative': { variableKey: 'canonical:broker.representativeCrdNumber', format: 'text', confidence: 0.99, label: 'Registered Representative CRD No.' },
        'Registered Representatives Branch Address City State Zip': { variableKey: 'canonical:broker.branchFullAddress', format: 'text', confidence: 0.99, label: 'Registered Representative Branch Address, City, State, ZIP' },
        'Branch Phone Number': { variableKey: 'canonical:broker.branchPhone', format: 'phone', confidence: 0.99, label: 'Branch Phone Number' },
        'Email Address_8': { variableKey: 'canonical:broker.email', format: 'text', confidence: 0.99, label: 'Broker E-mail Address' }
      },
      signatureZones: [
        { page: 5, rect: { x: 30, y: 560, width: 552, height: 170 } },
        { page: 10, rect: { x: 30, y: 360, width: 552, height: 240 } },
        { page: 12, rect: { x: 30, y: 80, width: 552, height: 180 } },
        { page: 14, rect: { x: 30, y: 40, width: 552, height: 210 } }
      ],
      skipRules: ['Skip signature widgets and adjacent printed-name/date fields.', 'Leave legal/evidence-heavy accreditation statements blank unless deterministic.']
    }
  ]
};

export function destinationProfileForFingerprint(fingerprint: string): DestinationProfile | null {
  return FORM_INTELLIGENCE_CORPUS.destinationProfiles.find((profile) => profile.fingerprint === fingerprint) ?? null;
}

export function sourceFormTitle(code: string): string {
  if (code === 'PRIMARY_BROKER') return 'Primary Broker';
  return FORM_INTELLIGENCE_CORPUS.sourceForms.find((form) => form.code === code)?.title ?? code;
}
