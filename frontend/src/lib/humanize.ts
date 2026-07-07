import type { IngestedQuestionType } from '../types/api';

/** Plain-English names for the field types (the dropdown + display). */
export const TYPE_LABELS: Record<IngestedQuestionType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  date: 'Date',
  number: 'Number',
  currency: 'Dollar amount',
  email: 'Email address',
  phone: 'Phone number',
  'ssn-ein': 'SSN / Tax ID',
  'single-choice-cards': 'Pick one option',
  'multi-select': 'Pick several options',
  checkbox: 'Yes / No checkbox',
  signature: 'Signature'
};

export const TYPE_OPTIONS: { value: IngestedQuestionType; label: string }[] = (
  Object.keys(TYPE_LABELS) as IngestedQuestionType[]
).map((value) => ({ value, label: TYPE_LABELS[value] }));

/**
 * Turn a machine condition like `investmentType in ['llc','corporation']`
 * into a readable sentence: "Ownership Type is LLC or Corporation".
 */
export function humanizeCondition(showIf: string | null | undefined): string | null {
  if (!showIf) return null;
  let s = showIf.trim();

  const prettyField = (raw: string): string => {
    const name = raw.split('.').pop() ?? raw;
    return name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase());
  };
  const prettyVal = (raw: string): string => {
    const v = raw.replace(/['"]/g, '').trim();
    if (v.toUpperCase() === v && v.length <= 5) return v; // keep acronyms like LLC, 1065
    return v.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  };

  // field in ['a','b'] -> Field is A or B
  s = s.replace(/([\w.]+)\s+in\s+\[([^\]]*)\]/g, (_m, field: string, list: string) => {
    const vals = list
      .split(',')
      .map((x) => prettyVal(x))
      .filter(Boolean);
    return `${prettyField(field)} is ${vals.join(' or ')}`;
  });

  // field == 'value' / field != 'value'
  s = s.replace(/([\w.]+)\s*==\s*('?[\w-]+'?)/g, (_m, f: string, v: string) => `${prettyField(f)} is ${prettyVal(v)}`);
  s = s.replace(/([\w.]+)\s*!=\s*('?[\w-]+'?)/g, (_m, f: string, v: string) => `${prettyField(f)} is not ${prettyVal(v)}`);
  s = s.replace(/([\w.]+)\s*==\s*true/gi, (_m, f: string) => `${prettyField(f)} is yes`);
  s = s.replace(/([\w.]+)\s*==\s*false/gi, (_m, f: string) => `${prettyField(f)} is no`);

  s = s.replace(/&&/g, ' and ').replace(/\|\|/g, ' or ');
  return s;
}
