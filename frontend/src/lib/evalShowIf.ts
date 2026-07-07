import type { IngestedQuestion } from '../types/api';

type Answers = Record<string, unknown>;

/**
 * Best-effort evaluation of a question's `showIf` condition against current
 * answers. Fails OPEN — if we can't parse/evaluate, the question is shown
 * (better to show an extra field than to hide a required one).
 *
 * Supports: `field == 'x'`, `field != 'x'`, `field == true/false`,
 * `field in ['a','b']`, joined by && / ||.
 */
export function isVisible(question: IngestedQuestion, answers: Answers): boolean {
  const cond = question.showIf;
  if (!cond) return true;

  try {
    const orParts = cond.split('||');
    return orParts.some((orPart) =>
      orPart.split('&&').every((clause) => evalClause(clause.trim(), answers))
    );
  } catch {
    return true;
  }
}

function lookup(field: string, answers: Answers): unknown {
  // conditions may reference dotted/logical names; try exact id, then last segment
  if (field in answers) return answers[field];
  const last = field.split('.').pop() ?? field;
  return answers[last];
}

const norm = (v: unknown): string => String(v ?? '').toLowerCase().replace(/['"]/g, '').trim();

function evalClause(clause: string, answers: Answers): boolean {
  // field in ['a','b']
  const inMatch = clause.match(/^([\w.]+)\s+in\s+\[([^\]]*)\]$/);
  if (inMatch) {
    const val = norm(lookup(inMatch[1], answers));
    const set = inMatch[2].split(',').map((x) => norm(x));
    return set.includes(val);
  }
  // field == value / field != value
  const cmp = clause.match(/^([\w.]+)\s*(==|!=)\s*(.+)$/);
  if (cmp) {
    const val = norm(lookup(cmp[1], answers));
    const target = norm(cmp[3]);
    return cmp[2] === '==' ? val === target : val !== target;
  }
  // truthiness: bare field
  const bare = clause.match(/^([\w.]+)$/);
  if (bare) return Boolean(lookup(bare[1], answers));

  return true; // unknown form -> fail open
}
