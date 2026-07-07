/**
 * showIf expression language (spec Part 1.3 / 5.4).
 *
 * Grammar (precedence low→high):  ||  →  &&  →  !  →  comparison  →  primary
 *   primary    := literal | path | ctxFn '(' path ')' | '(' expr ')'
 *   comparison := operand ('=='|'!='|'>'|'<'|'>='|'<=') operand
 *               | path 'in' '[' literal (',' literal)* ']'
 *   literal    := 'string' | number | true | false
 *
 * Identifiers are dotted paths (a.b.c). The ONLY allowed ctx.* names are the
 * registered allow-list below — anything else is a parse error.
 *
 * One-hot maps: a path whose value is a {key:boolean} object resolves to the
 * single true key (a string), so `primaryType == 'trust'` works against
 * `{trust:true, individual:false}`.
 */

export interface EvalContext {
  /** boolean flags + functions exposed to expressions, e.g. requiresJointOwnerSignature, isMinor(dateStr) */
  requiresJointOwnerSignature?: boolean;
  requiresStep4?: boolean;
  isMinor?: (dateStr: unknown) => boolean;
}

const CTX_FLAGS = new Set(['requiresJointOwnerSignature', 'requiresStep4']);
const CTX_FUNCS = new Set(['isMinor']);

// ---- tokenizer -------------------------------------------------------------
type Tok =
  | { t: 'str'; v: string }
  | { t: 'num'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'punc'; v: string };

class ParseError extends Error {}

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = '';
      while (j < n && src[j] !== c) { s += src[j]; j++; }
      if (j >= n) throw new ParseError('unterminated string');
      toks.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      if (src[j] === '-') j++;
      while (j < n && /[0-9.]/.test(src[j]!)) j++;
      toks.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < n && /[a-zA-Z0-9_.]/.test(src[j]!)) j++;
      const word = src.slice(i, j);
      if (word === 'true' || word === 'false') toks.push({ t: 'bool', v: word === 'true' });
      else if (word === 'in') toks.push({ t: 'op', v: 'in' });
      else toks.push({ t: 'id', v: word });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if (c === '>' || c === '<') { toks.push({ t: 'op', v: c }); i++; continue; }
    if (c === '!') { toks.push({ t: 'op', v: '!' }); i++; continue; }
    if (c === '(' || c === ')' || c === '[' || c === ']' || c === ',') { toks.push({ t: 'punc', v: c }); i++; continue; }
    throw new ParseError(`unexpected char '${c}'`);
  }
  return toks;
}

// ---- AST -------------------------------------------------------------------
type Node =
  | { k: 'lit'; v: string | number | boolean }
  | { k: 'path'; v: string }
  | { k: 'ctxFlag'; v: string }
  | { k: 'ctxCall'; fn: string; arg: Node }
  | { k: 'not'; e: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'in'; l: Node; list: Array<string | number | boolean> };

function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (v: string) => { const t = next(); if (!t || t.v !== v) throw new ParseError(`expected '${v}'`); };

  function parseOr(): Node {
    let l = parseAnd();
    while (peek() && peek()!.t === 'op' && peek()!.v === '||') { next(); l = { k: 'bin', op: '||', l, r: parseAnd() }; }
    return l;
  }
  function parseAnd(): Node {
    let l = parseNot();
    while (peek() && peek()!.t === 'op' && peek()!.v === '&&') { next(); l = { k: 'bin', op: '&&', l, r: parseNot() }; }
    return l;
  }
  function parseNot(): Node {
    if (peek() && peek()!.t === 'op' && peek()!.v === '!') { next(); return { k: 'not', e: parseNot() }; }
    return parseComparison();
  }
  function parseComparison(): Node {
    const l = parsePrimary();
    const t = peek();
    if (t && t.t === 'op' && t.v === 'in') {
      next(); expect('[');
      const list: Array<string | number | boolean> = [];
      while (peek() && !(peek()!.t === 'punc' && peek()!.v === ']')) {
        const lit = next();
        if (!lit || (lit.t !== 'str' && lit.t !== 'num' && lit.t !== 'bool')) throw new ParseError('expected literal in list');
        list.push(lit.v);
        if (peek() && peek()!.t === 'punc' && peek()!.v === ',') next();
      }
      expect(']');
      return { k: 'in', l, list };
    }
    if (t && t.t === 'op' && ['==', '!=', '>', '<', '>=', '<='].includes(t.v)) {
      next();
      return { k: 'bin', op: t.v, l, r: parsePrimary() };
    }
    return l;
  }
  function parsePrimary(): Node {
    const t = next();
    if (!t) throw new ParseError('unexpected end');
    if (t.t === 'punc' && t.v === '(') { const e = parseOr(); expect(')'); return e; }
    if (t.t === 'str' || t.t === 'num' || t.t === 'bool') return { k: 'lit', v: t.v };
    if (t.t === 'id') {
      if (t.v.startsWith('ctx.')) {
        const name = t.v.slice(4);
        if (CTX_FUNCS.has(name)) {
          expect('(');
          const arg = parsePrimary();
          expect(')');
          return { k: 'ctxCall', fn: name, arg };
        }
        if (CTX_FLAGS.has(name)) return { k: 'ctxFlag', v: name };
        throw new ParseError(`unknown ctx.${name}`);
      }
      return { k: 'path', v: t.v };
    }
    throw new ParseError(`unexpected token ${JSON.stringify(t)}`);
  }

  const node = parseOr();
  if (p !== toks.length) throw new ParseError('trailing tokens');
  return node;
}

// ---- evaluation ------------------------------------------------------------
function resolvePath(path: string, fields: Record<string, unknown>): unknown {
  let cur: unknown = fields;
  for (const seg of path.split('.')) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[seg];
    else return undefined;
  }
  // one-hot map -> its single true key
  if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
    const entries = Object.entries(cur as Record<string, unknown>);
    if (entries.length > 0 && entries.every(([, v]) => typeof v === 'boolean')) {
      const on = entries.find(([, v]) => v === true);
      return on ? on[0] : null;
    }
  }
  return cur;
}

function operand(node: Node, fields: Record<string, unknown>, ctx: EvalContext): unknown {
  switch (node.k) {
    case 'lit': return node.v;
    case 'path': return resolvePath(node.v, fields);
    case 'ctxFlag': return Boolean((ctx as Record<string, unknown>)[node.v]);
    case 'ctxCall': {
      if (node.fn === 'isMinor') return ctx.isMinor ? Boolean(ctx.isMinor(operand(node.arg, fields, ctx))) : false;
      return false;
    }
    default: return evalNode(node, fields, ctx);
  }
}

function evalNode(node: Node, fields: Record<string, unknown>, ctx: EvalContext): boolean {
  switch (node.k) {
    case 'not': return !evalNode(node.e, fields, ctx);
    case 'ctxFlag': return Boolean((ctx as Record<string, unknown>)[node.v]);
    case 'ctxCall': return Boolean(operand(node, fields, ctx));
    case 'in': {
      const l = operand(node.l, fields, ctx);
      return node.list.map(String).includes(String(l));
    }
    case 'bin': {
      if (node.op === '&&') return evalNode(node.l, fields, ctx) && evalNode(node.r, fields, ctx);
      if (node.op === '||') return evalNode(node.l, fields, ctx) || evalNode(node.r, fields, ctx);
      const l = operand(node.l, fields, ctx);
      const r = operand(node.r, fields, ctx);
      switch (node.op) {
        case '==': return String(l) === String(r);
        case '!=': return String(l) !== String(r);
        case '>': return Number(l) > Number(r);
        case '<': return Number(l) < Number(r);
        case '>=': return Number(l) >= Number(r);
        case '<=': return Number(l) <= Number(r);
        default: return false;
      }
    }
    case 'path': return Boolean(operand(node, fields, ctx)); // bare truthiness
    case 'lit': return Boolean(node.v);
    default: return false;
  }
}

/**
 * Evaluate a showIf expression. `failClosed` (server default) returns false on
 * parse/eval error and logs; the client passes failClosed=false so a parse
 * failure shows the question (never silently skip). Null/empty expr → visible.
 */
export function evaluateShowIf(
  expr: string | null | undefined,
  fields: Record<string, unknown>,
  ctx: EvalContext = {},
  failClosed = true
): boolean {
  if (expr == null || String(expr).trim() === '') return true;
  try {
    return evalNode(parse(tokenize(String(expr))), fields, ctx);
  } catch (e) {
    if (failClosed) {
      console.warn(`[showIf] unparseable expression hidden: ${expr} (${(e as Error).message})`);
      return false;
    }
    return true;
  }
}
