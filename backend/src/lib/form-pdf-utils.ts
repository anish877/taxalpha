const INVESTOR_PROFILE_FORM_CODE = 'INVESTOR_PROFILE';
const INVESTOR_PROFILE_ADDITIONAL_HOLDER_FORM_CODE = 'INVESTOR_PROFILE_ADDITIONAL_HOLDER';
const STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE = 'SFC';
const BAIODF_FORM_CODE = 'BAIODF';
const BAIV_506C_FORM_CODE = 'BAIV_506C';

export const PDF_CALLBACK_SECRET_HEADER = 'x-taxalpha-callback-secret';

export const SUPPORTED_PDF_CALLBACK_FORM_CODES = new Set<string>([
  INVESTOR_PROFILE_FORM_CODE,
  INVESTOR_PROFILE_ADDITIONAL_HOLDER_FORM_CODE,
  STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE,
  BAIODF_FORM_CODE,
  BAIV_506C_FORM_CODE
]);

export const WORKSPACE_FORM_TITLES: Record<string, string> = {
  [INVESTOR_PROFILE_FORM_CODE]: 'Investor Profile',
  [STATEMENT_OF_FINANCIAL_CONDITION_FORM_CODE]: 'Statement of Financial Condition',
  [BAIODF_FORM_CODE]: 'Brokerage Alternative Investment Order and Disclosure Form',
  [BAIV_506C_FORM_CODE]: 'Brokerage Accredited Investor Verification Form for SEC Rule 506(c)'
};

export const CALLBACK_FORM_TITLES: Record<string, string> = {
  ...WORKSPACE_FORM_TITLES,
  [INVESTOR_PROFILE_ADDITIONAL_HOLDER_FORM_CODE]: 'Additional Holder'
};

export function getWorkspaceFormCode(formCode: string): string {
  if (formCode === INVESTOR_PROFILE_ADDITIONAL_HOLDER_FORM_CODE) {
    return INVESTOR_PROFILE_FORM_CODE;
  }

  return formCode;
}

export function buildFormPdfCallbackUrl(
  backendPublicUrl: string,
  clientId: string,
  formCode: string
): string {
  const normalizedBaseUrl = backendPublicUrl.replace(/\/+$/, '');
  return `${normalizedBaseUrl}/api/n8n/clients/${encodeURIComponent(clientId)}/forms/${encodeURIComponent(
    formCode
  )}/pdfs`;
}

export function getWorkspaceFormTitle(formCode: string): string {
  return WORKSPACE_FORM_TITLES[getWorkspaceFormCode(formCode)] ?? getWorkspaceFormCode(formCode);
}

export function getCallbackFormTitle(formCode: string): string {
  return CALLBACK_FORM_TITLES[formCode] ?? formCode;
}
