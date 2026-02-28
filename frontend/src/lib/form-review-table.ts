export type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

export type FieldInputKind = 'boolean' | 'number' | 'date' | 'text' | 'array-empty';

export interface FlattenedFieldRow {
  pathKey: string;
  pathSegments: string[];
  sectionKey: string;
  sectionLabel: string;
  label: string;
  inputKind: FieldInputKind;
  value: JsonLike;
  arrayPathSegments: string[] | null;
  arrayIndex: number | null;
}

export interface ReviewArrayContainer {
  pathKey: string;
  pathSegments: string[];
  sectionKey: string;
  sectionLabel: string;
  label: string;
}

function isIntegerSegment(segment: string): boolean {
  return /^\d+$/.test(segment);
}

function findSectionKey(pathSegments: string[]): string {
  const section = pathSegments.find((segment) => !isIntegerSegment(segment));
  return section ?? 'root';
}

export function toTitleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function pathToKey(pathSegments: string[]): string {
  return pathSegments.join('.');
}

export function formatPathLabel(pathSegments: string[]): string {
  const parts: string[] = [];

  for (const segment of pathSegments) {
    if (isIntegerSegment(segment)) {
      const indexLabel = `#${Number(segment) + 1}`;
      if (parts.length === 0) {
        parts.push(indexLabel);
      } else {
        parts[parts.length - 1] = `${parts[parts.length - 1]} ${indexLabel}`;
      }
      continue;
    }

    parts.push(toTitleCase(segment));
  }

  return parts.join(' ');
}

function getInputKind(pathKey: string, value: JsonLike): FieldInputKind {
  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (isDatePath(pathKey)) {
    return 'date';
  }

  if (typeof value === 'number' || isNumericPath(pathKey)) {
    return 'number';
  }

  return 'text';
}

function getArrayContext(pathSegments: string[]): { arrayPathSegments: string[] | null; arrayIndex: number | null } {
  let numericIndex = -1;

  for (let index = pathSegments.length - 1; index >= 0; index -= 1) {
    if (isIntegerSegment(pathSegments[index])) {
      numericIndex = index;
      break;
    }
  }

  if (numericIndex < 0) {
    return { arrayPathSegments: null, arrayIndex: null };
  }

  return {
    arrayPathSegments: pathSegments.slice(0, numericIndex),
    arrayIndex: Number(pathSegments[numericIndex])
  };
}

export function flattenReviewFields(fields: JsonLike): {
  rows: FlattenedFieldRow[];
  arrays: ReviewArrayContainer[];
} {
  const rows: FlattenedFieldRow[] = [];
  const arrays = new Map<string, ReviewArrayContainer>();

  const walk = (value: JsonLike, pathSegments: string[]) => {
    const pathKey = pathToKey(pathSegments);
    const sectionKey = findSectionKey(pathSegments);
    const sectionLabel = toTitleCase(sectionKey);

    if (Array.isArray(value)) {
      if (pathSegments.length > 0 && !arrays.has(pathKey)) {
        arrays.set(pathKey, {
          pathKey,
          pathSegments,
          sectionKey,
          sectionLabel,
          label: formatPathLabel(pathSegments)
        });
      }

      if (value.length === 0) {
        rows.push({
          pathKey,
          pathSegments,
          sectionKey,
          sectionLabel,
          label: formatPathLabel(pathSegments),
          inputKind: 'array-empty',
          value: null,
          arrayPathSegments: pathSegments,
          arrayIndex: null
        });
        return;
      }

      value.forEach((item, index) => {
        walk((item ?? null) as JsonLike, [...pathSegments, String(index)]);
      });
      return;
    }

    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, JsonLike>);

      if (entries.length === 0 && pathSegments.length > 0) {
        rows.push({
          pathKey,
          pathSegments,
          sectionKey,
          sectionLabel,
          label: formatPathLabel(pathSegments),
          inputKind: 'text',
          value: null,
          arrayPathSegments: null,
          arrayIndex: null
        });
        return;
      }

      entries.forEach(([key, child]) => {
        walk((child ?? null) as JsonLike, [...pathSegments, key]);
      });
      return;
    }

    const arrayContext = getArrayContext(pathSegments);

    rows.push({
      pathKey,
      pathSegments,
      sectionKey,
      sectionLabel,
      label: formatPathLabel(pathSegments),
      inputKind: getInputKind(pathKey, value),
      value,
      arrayPathSegments: arrayContext.arrayPathSegments,
      arrayIndex: arrayContext.arrayIndex
    });
  };

  walk(fields, []);

  if (rows.length === 0) {
    rows.push({
      pathKey: '',
      pathSegments: [],
      sectionKey: 'root',
      sectionLabel: 'Root',
      label: 'Form Data',
      inputKind: 'text',
      value: null,
      arrayPathSegments: null,
      arrayIndex: null
    });
  }

  return {
    rows,
    arrays: [...arrays.values()]
  };
}

export function createEmptyTemplate(value: JsonLike): JsonLike {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }

    return [createEmptyTemplate(value[0] as JsonLike)];
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, JsonLike> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = createEmptyTemplate(child as JsonLike);
    }
    return result;
  }

  if (typeof value === 'boolean') {
    return false;
  }

  if (typeof value === 'number') {
    return 0;
  }

  return null;
}

export function setValueAtPath(root: JsonLike, pathSegments: string[], nextValue: JsonLike): JsonLike {
  if (pathSegments.length === 0) {
    return nextValue;
  }

  const [head, ...tail] = pathSegments;

  if (Array.isArray(root)) {
    const index = Number(head);
    const next = [...root];
    const existing = (next[index] as JsonLike) ?? null;
    next[index] = setValueAtPath(existing, tail, nextValue);
    return next;
  }

  const source = root !== null && typeof root === 'object' && !Array.isArray(root) ? root : {};
  const nextObject = { ...(source as Record<string, JsonLike>) };
  const existing = (nextObject[head] as JsonLike) ?? null;
  nextObject[head] = setValueAtPath(existing, tail, nextValue);
  return nextObject;
}

export function removeArrayIndex(root: JsonLike, pathSegments: string[], removeIndex: number): JsonLike {
  if (pathSegments.length === 0) {
    if (!Array.isArray(root)) {
      return root;
    }

    return root.filter((_, index) => index !== removeIndex);
  }

  const [head, ...tail] = pathSegments;

  if (Array.isArray(root)) {
    const index = Number(head);
    const next = [...root];
    next[index] = removeArrayIndex(((next[index] as JsonLike) ?? null) as JsonLike, tail, removeIndex);
    return next;
  }

  const source = root !== null && typeof root === 'object' && !Array.isArray(root) ? root : {};
  const nextObject = { ...(source as Record<string, JsonLike>) };
  nextObject[head] = removeArrayIndex(((nextObject[head] as JsonLike) ?? null) as JsonLike, tail, removeIndex);
  return nextObject;
}

export function appendArrayItem(root: JsonLike, pathSegments: string[]): JsonLike {
  if (pathSegments.length === 0) {
    if (!Array.isArray(root)) {
      return root;
    }

    const template = root.length > 0 ? createEmptyTemplate(root[0] as JsonLike) : null;
    return [...root, template];
  }

  const [head, ...tail] = pathSegments;

  if (Array.isArray(root)) {
    const index = Number(head);
    const next = [...root];
    next[index] = appendArrayItem(((next[index] as JsonLike) ?? null) as JsonLike, tail);
    return next;
  }

  const source = root !== null && typeof root === 'object' && !Array.isArray(root) ? root : {};
  const nextObject = { ...(source as Record<string, JsonLike>) };
  nextObject[head] = appendArrayItem(((nextObject[head] as JsonLike) ?? null) as JsonLike, tail);
  return nextObject;
}

export function getValueAtPath(root: JsonLike, pathSegments: string[]): JsonLike {
  let current: JsonLike = root;

  for (const segment of pathSegments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = ((current[index] as JsonLike) ?? null) as JsonLike;
      continue;
    }

    if (current !== null && typeof current === 'object') {
      current = (((current as Record<string, JsonLike>)[segment] as JsonLike) ?? null) as JsonLike;
      continue;
    }

    return null;
  }

  return current;
}

export function isDatePath(pathKey: string): boolean {
  return /(^|\.)date([A-Z]|$|\.)|\bdate\b/i.test(pathKey);
}

export function isNumericPath(pathKey: string): boolean {
  return /(amount|value|number|year|percent|worth|liquid|income|asset|liabilit|total|net|equity|tax|entries)/i.test(
    pathKey
  );
}

