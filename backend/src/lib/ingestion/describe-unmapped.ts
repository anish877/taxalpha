import type { ExtractedField } from './schema.js';

/**
 * Turn the leftover unmapped AcroForm boxes into something a human admin can
 * understand. The raw boxes (e.g. "undefined_8" on a "Phone: Business (___)
 * Home (___)" line, or a bare underline "undefined_6") are meaningless on
 * their own — so we classify each by its printed context and, when its own
 * text is blank, borrow the nearest labelled box ABOVE it on the same page.
 */
export type UnmappedCategory = 'phone' | 'address' | 'name' | 'signature' | 'checkbox' | 'date' | 'writeIn' | 'other';

export interface UnmappedDetail {
  name: string;
  page: number;
  hint: string;
  category: UnmappedCategory;
  reason?: string;
  recommendedAction?: string;
  source?: string;
  confidence?: number;
}

const CATEGORY_LABEL: Record<UnmappedCategory, string> = {
  phone: 'Phone numbers',
  address: 'Address lines',
  name: 'Names',
  signature: 'Signatures',
  checkbox: 'Checkboxes / options',
  date: 'Dates',
  writeIn: 'Blank write-in lines',
  other: 'Other boxes'
};

export const categoryLabel = (c: UnmappedCategory): string => CATEGORY_LABEL[c];

const UNDERSCORE_ONLY = /^[\s_().,·:-]*$/;

/** Pull the most meaningful printed phrase from a field's own context. */
function ownText(f: ExtractedField): string {
  const candidates = [f.inferredLabel ?? '', ...f.nearbyText]
    .map((t) => t.replace(/_{2,}/g, ' ').replace(/\(\s*\)/g, '').trim())
    .filter((t) => t && !UNDERSCORE_ONLY.test(t) && /[a-zA-Z]{2,}/.test(t));
  // prefer the longest meaningful phrase
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? '';
}

function classify(text: string, type: string): UnmappedCategory {
  const t = text.toLowerCase();
  if (type.startsWith('checkbox') || type.startsWith('radio')) return 'checkbox';
  if (type === 'signature' || /signature/.test(t)) return 'signature';
  if (/phone|business\s*\(|home\s*\(|\bfax\b|area code|mobile/.test(t)) return 'phone';
  if (/address|p\.?o\.?\s*box|city|state|zip|postal|street|residence/.test(t)) return 'address';
  if (/\bname\b|trustee|trust \(/.test(t)) return 'name';
  if (/date|d\.?o\.?b|birth/.test(t)) return 'date';
  return text ? 'other' : 'writeIn';
}

/** y of a field's top edge (PDF coords: larger y = higher on page). */
const topY = (f: ExtractedField): number => Math.max(f.rect[1], f.rect[3]);

export function describeUnmapped(extracted: ExtractedField[], unmappedNames: string[]): UnmappedDetail[] {
  const byName = new Map(extracted.map((f) => [f.fieldName, f]));
  // labelled fields per page (have real own-text), for the "borrow from above" step
  const labelledByPage = new Map<number, ExtractedField[]>();
  for (const f of extracted) {
    if (ownText(f)) {
      const arr = labelledByPage.get(f.page) ?? [];
      arr.push(f);
      labelledByPage.set(f.page, arr);
    }
  }

  return unmappedNames.map((name) => {
    const f = byName.get(name);
    if (!f) return { name, page: 0, hint: 'Unlabeled box', category: 'other' as UnmappedCategory };

    let text = ownText(f);
    let borrowed = false;
    if (!text) {
      // borrow the nearest labelled box ABOVE on the same page
      const above = (labelledByPage.get(f.page) ?? [])
        .filter((c) => topY(c) > topY(f))
        .sort((a, b) => topY(a) - topY(b) - (topY(f) - topY(f))) // closest above
        .sort((a, b) => Math.abs(topY(a) - topY(f)) - Math.abs(topY(b) - topY(f)))[0];
      if (above) { text = ownText(above); borrowed = true; }
    }

    const category = classify(text, f.type);
    let hint: string;
    if (category === 'phone') hint = `Phone number field (area code / number)${text ? ` — “${text.slice(0, 60)}”` : ''}`;
    else if (category === 'checkbox') hint = text ? `Checkbox: ${text.slice(0, 70)}` : 'A checkbox (office-use or rarely-needed)';
    else if (category === 'signature') hint = 'A signature box';
    else if (!text) hint = 'Blank write-in line (often office-use)';
    else hint = borrowed ? `Write-in line under “${text.slice(0, 60)}”` : text.slice(0, 90);

    return { name, page: f.page, hint, category };
  });
}
