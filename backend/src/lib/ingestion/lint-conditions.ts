import { isRepeatBlock, type FormQuestionV2, type FormSchemaV2 } from './schema-v2.js';

/**
 * Detect DEAD branch conditions: a showIf/requiredIf that compares a choice
 * field to a value the field can never hold (because that value isn't one of
 * its options). These make a step/question unreachable (the 0.78-audit defect
 * class). Pure — used as a validation/regression gate.
 */
export interface DeadCondition {
  where: string; // step number or question id
  field: string;
  value: string;
  options: string[];
}

export function findDeadConditions(schema: FormSchemaV2): DeadCondition[] {
  const optionsByField = new Map<string, Set<string>>();
  for (const it of schema.items) {
    if (isRepeatBlock(it)) continue;
    const q = it as FormQuestionV2;
    if (q.options && q.options.length > 0) optionsByField.set(q.id, new Set(q.options.map((o) => String(o.value))));
  }

  const dead: DeadCondition[] = [];
  const checkExpr = (expr: string | null | undefined, where: string) => {
    if (!expr) return;
    const scan = (field: string, values: string[]) => {
      const opts = optionsByField.get(field);
      if (!opts) return; // field isn't a known choice field — can't judge, skip
      for (const v of values) if (!opts.has(v)) dead.push({ where, field, value: v, options: [...opts] });
    };
    for (const m of expr.matchAll(/([\w.]+)\s+in\s+\[([^\]]+)\]/g)) {
      scan(m[1]!, m[2]!.split(',').map((v) => v.replace(/['"\s]/g, '')).filter(Boolean));
    }
    for (const m of expr.matchAll(/([\w.]+)\s*==\s*'([^']+)'/g)) scan(m[1]!, [m[2]!]);
  };

  for (const s of schema.steps) checkExpr(s.requiredIf, `step ${s.number}`);
  for (const it of schema.items) if (!isRepeatBlock(it)) checkExpr((it as FormQuestionV2).showIf, (it as FormQuestionV2).id);
  return dead;
}
