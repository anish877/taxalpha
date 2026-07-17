const FORM_DISPLAY_NAMES: Record<string, string> = {
  INVESTOR_PROFILE: 'Investor Profile',
  SFC: 'Statement of Financial Condition',
  BAIODF: 'Brokerage Alternative Investment Order and Disclosure Form',
  BAIV_506C: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'
};

export function formDisplayName(code: string, fallback?: string | null): string {
  return FORM_DISPLAY_NAMES[code] ?? fallback ?? 'Client form';
}

export function formShortDescription(code: string): string {
  switch (code) {
    case 'INVESTOR_PROFILE':
      return 'Basic client, account, identity, and suitability information.';
    case 'SFC':
      return 'Financial position, income, assets, liabilities, and acknowledgements.';
    case 'BAIODF':
      return 'Investment-specific order, disclosure, and acknowledgement details.';
    case 'BAIV_506C':
      return 'Accredited investor verification for offerings under SEC Rule 506(c).';
    default:
      return 'Client onboarding document.';
  }
}
