export class MathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MathError';
  }
}

export type AngleMode = 'deg' | 'rad';

let currentAngleMode: AngleMode = 'deg';
const toRad = (x: number) => (currentAngleMode === 'deg' ? (x * Math.PI) / 180 : x);
const fromRad = (x: number) => (currentAngleMode === 'deg' ? (x * 180) / Math.PI : x);
const roundTrig = (v: number) => (Math.abs(v) < 1e-12 ? 0 : Math.abs(v - Math.round(v)) < 1e-12 ? Math.round(v) : v);

const need = (ok: boolean, message: string) => {
  if (!ok) throw new MathError(message);
};

export const MATH_FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: (x: number) => {
    need(x >= 0, 'The square root of a negative number is not a real number');
    return Math.sqrt(x);
  },
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: (x: number) => {
    need(x > 0, 'ln requires a number strictly greater than 0');
    return Math.log(x);
  },
  log: (x: number) => {
    need(x > 0, 'log requires a number strictly greater than 0');
    return Math.log10(x);
  },
  sin: (x: number) => roundTrig(Math.sin(toRad(x))),
  cos: (x: number) => roundTrig(Math.cos(toRad(x))),
  tan: (x: number) => {
    need(Math.abs(Math.cos(toRad(x))) > 1e-12, `tan is undefined at ${currentAngleMode === 'deg' ? `${x}°` : x}`);
    return roundTrig(Math.tan(toRad(x)));
  },
  asin: (x: number) => {
    need(x >= -1 && x <= 1, 'sin⁻¹ requires a value between −1 and 1');
    return roundTrig(fromRad(Math.asin(x)));
  },
  acos: (x: number) => {
    need(x >= -1 && x <= 1, 'cos⁻¹ requires a value between −1 and 1');
    return roundTrig(fromRad(Math.acos(x)));
  },
  atan: (x: number) => roundTrig(fromRad(Math.atan(x))),
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
};

MATH_FUNCTIONS.arcsin = MATH_FUNCTIONS.asin;
MATH_FUNCTIONS.arccos = MATH_FUNCTIONS.acos;
MATH_FUNCTIONS.arctan = MATH_FUNCTIONS.atan;

export const MATH_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

export function normalizeMathExpression(text: string): string {
  let s = String(text || '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:times|cdot)/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pi/g, 'pi')
    .replace(/\\sqrt\s*\{([^}]*)\}/g, 'sqrt($1)')
    .replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '(($1)/($2))')
    .replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'))
    .replace(/[×✕✖·∙•]/g, '*')
    .replace(/(\d|\))\s*[xX]\s*(?=\d|\()/g, '$1*')
    .replace(/[÷∕⁄:]/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/\*\*/g, '^')
    .replace(/√/g, 'sqrt')
    .replace(/π/g, 'pi')
    .replace(/[²]/g, '^2')
    .replace(/[³]/g, '^3')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .trim();

  s = s.replace(/=\s*\??\s*$/, '').trim();
  return s;
}

interface Token {
  t: 'num' | 'id' | 'op';
  v: any;
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const re = /\s*(?:(\d+\.?\d*|\.\d+)(?:e([+-]?\d+))?|([a-z]+)|(\S))/giy;
  let m: RegExpExecArray | null;

  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1] !== undefined) {
      tokens.push({ t: 'num', v: Number(m[1] + (m[2] !== undefined ? `e${m[2]}` : '')) });
    } else if (m[3] !== undefined) {
      const id = m[3].toLowerCase();
      if (id in MATH_FUNCTIONS || id in MATH_CONSTANTS || id.length === 1) {
        tokens.push({ t: 'id', v: id });
      } else {
        for (const ch of id) {
          tokens.push({ t: 'id', v: ch });
        }
      }
    } else if (m[4] !== undefined) {
      if (!'+-*/^()!%|'.includes(m[4])) {
        throw new MathError(`Unexpected character "${m[4]}" in expression`);
      }
      tokens.push({ t: 'op', v: m[4] });
    }
  }

  return tokens;
}

export function parseTokens(src: string, vars: Record<string, number> = {}): number {
  const tokens = tokenize(src);
  let i = 0;

  const peek = () => tokens[i];
  const isOp = (v: string) => peek() && peek().t === 'op' && peek().v === v;
  const take = (v: string) => {
    if (!isOp(v)) throw new MathError(`Expected "${v}"`);
    i++;
  };

  function expr(): number {
    let v = term();
    while (isOp('+') || isOp('-')) {
      v = tokens[i++].v === '+' ? v + term() : v - term();
    }
    return v;
  }

  function startsPrimary(): boolean {
    const t = peek();
    return !!t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '('));
  }

  function term(): number {
    let v = unary();
    for (;;) {
      if (isOp('*')) {
        i++;
        v *= unary();
      } else if (isOp('/')) {
        i++;
        const d = unary();
        if (d === 0) throw new MathError('Cannot divide by zero');
        v /= d;
      } else if (startsPrimary()) {
        v *= power();
      } else {
        return v;
      }
    }
  }

  function unary(): number {
    if (isOp('-')) {
      i++;
      return -unary();
    }
    if (isOp('+')) {
      i++;
      return unary();
    }
    return power();
  }

  function power(): number {
    const base = postfix();
    if (isOp('^')) {
      i++;
      return Math.pow(base, unary());
    }
    return base;
  }

  function postfix(): number {
    let v = primary();
    for (;;) {
      if (isOp('!')) {
        i++;
        if (!Number.isInteger(v) || v < 0 || v > 170) {
          throw new MathError('Factorial requires a non-negative whole number up to 170');
        }
        let f = 1;
        for (let k = 2; k <= v; k++) f *= k;
        v = f;
      } else if (isOp('%')) {
        i++;
        v /= 100;
      } else {
        return v;
      }
    }
  }

  function primary(): number {
    const t = peek();
    if (!t) throw new MathError('Expression terminates prematurely');
    if (t.t === 'num') {
      i++;
      return t.v;
    }
    if (t.t === 'op' && t.v === '(') {
      i++;
      const v = expr();
      take(')');
      return v;
    }
    if (t.t === 'op' && t.v === '|') {
      i++;
      const v = expr();
      take('|');
      return Math.abs(v);
    }
    if (t.t === 'id') {
      i++;
      if (t.v in vars) return vars[t.v];
      if (t.v in MATH_CONSTANTS) return MATH_CONSTANTS[t.v];
      if (t.v in MATH_FUNCTIONS) {
        return MATH_FUNCTIONS[t.v](isOp('(') ? primary() : power());
      }
      throw new MathError(`Unknown variable or function "${t.v}"`);
    }
    throw new MathError(`Unexpected token "${t.v}"`);
  }

  if (!tokens.length) throw new MathError('Empty expression');
  const result = expr();
  if (i < tokens.length) throw new MathError(`Unexpected token "${tokens[i].v}" at end of expression`);
  if (Number.isNaN(result)) throw new MathError('Expression does not yield a real number');
  if (!Number.isFinite(result)) throw new MathError('Calculation result exceeded numerical limits');
  return result;
}

export function formatNumber(v: number): string {
  if (Object.is(v, -0)) v = 0;
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
    return v.toExponential(9).replace(/\.?0+e/, 'e');
  }
  return String(Number(v.toPrecision(12)));
}

export function niceRatioOrDecimal(v: number): string {
  if (Math.abs(v - Math.round(v)) < 1e-9) return formatNumber(Math.round(v));
  for (let d = 2; d <= 16; d++) {
    const n = Math.round(v * d);
    if (Math.abs(v * d - n) < 1e-9) return `${n}/${d}`;
  }
  return formatNumber(Number(v.toPrecision(10)));
}

/** Evaluate an arithmetic expression accurately without LLM hallucination */
export function evaluateMath(
  text: string,
  options: { angle?: AngleMode } = {}
): { expression: string; value: number; text: string } {
  const expression = normalizeMathExpression(text);
  if (expression.includes('=')) throw new MathError('Input is an equation, use solveEquation instead');

  const tokens = tokenize(expression);
  const hasUnknownVar = tokens.some((t) => t.t === 'id' && !(t.v in MATH_FUNCTIONS) && !(t.v in MATH_CONSTANTS));
  if (hasUnknownVar) throw new MathError('Expression contains an undefined variable');

  currentAngleMode = options.angle === 'rad' ? 'rad' : 'deg';
  try {
    const value = parseTokens(expression);
    return { expression, value, text: formatNumber(value) };
  } finally {
    currentAngleMode = 'deg';
  }
}

export function getUnknownVariables(expression: string): string[] {
  return [
    ...new Set(
      tokenize(expression.replace(/=/g, '+'))
        .filter((t) => t.t === 'id' && !(t.v in MATH_FUNCTIONS) && !(t.v in MATH_CONSTANTS))
        .map((t) => t.v)
    ),
  ];
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function showPrettyMath(s: string): string {
  return String(s)
    .replace(/\^\(?(\d+)\)?/g, (_, d) => [...d].map((c) => SUP[parseInt(c, 10)]).join(''))
    .replace(/(\d)\*(?=[a-z(])/gi, '$1')
    .replace(/\*/g, '·')
    .replace(/-/g, '−')
    .replace(/\s*([=+−])\s*/g, ' $1 ')
    .replace(/\(\s*−\s*/g, '(−')
    .replace(/^\s*−\s*/, '−')
    .replace(/\s+/g, ' ')
    .trim();
}

function sumText(terms: [number, string][]): string {
  const parts: string[] = [];
  for (const [k, name] of terms) {
    if (Math.abs(k) < 1e-12) continue;
    const n = niceRatioOrDecimal(Math.abs(k));
    const body = !name ? n : n === '1' ? name : n.includes('/') ? `(${n})${name}` : `${n}${name}`;
    parts.push(parts.length ? `${k < 0 ? '−' : '+'} ${body}` : `${k < 0 ? '−' : ''}${body}`);
  }
  return parts.length ? parts.join(' ') : '0';
}

const signed = (n: number) => (n < 0 ? `(−${niceRatioOrDecimal(-n)})` : niceRatioOrDecimal(n));
const minus = (s: string) => s.replace(/(^|[\s(=,])-(?=\d)/g, '$1−');

export interface EquationSolution {
  expression: string;
  variable: string;
  roots: number[];
  text: string;
  steps: string[];
}

/**
 * Solves single-variable equations (linear and quadratic) with complete analytical steps.
 */
export function solveEquation(text: string): EquationSolution {
  const expression = normalizeMathExpression(text);
  const sides = expression.split('=');
  if (sides.length !== 2 || !sides[0].trim() || !sides[1].trim()) {
    throw new MathError('Not a valid equation with two sides separated by =');
  }

  const names = getUnknownVariables(expression);
  if (!names.length) throw new MathError('No unknown variable found in equation');
  if (names.length > 1) {
    throw new MathError('Multiple unknown variables detected. Use solveSystem for systems of equations.');
  }

  const [v] = names;
  const f = (x: number) => {
    try {
      return parseTokens(sides[0], { [v]: x }) - parseTokens(sides[1], { [v]: x });
    } catch (err: any) {
      if (err instanceof MathError && /divide|limit|Factorial/i.test(err.message)) return NaN;
      throw err;
    }
  };

  f(0.123); // Validate syntax

  const [fm, f0, fp] = [f(-1), f(0), f(1)];
  const a = (fp + fm) / 2 - f0;
  const b = (fp - fm) / 2;
  const c = f0;

  const fits = [2, 3, -2.5, 0.5, 7].every((x) => {
    const got = f(x);
    return Number.isFinite(got) && Math.abs(got - (a * x * x + b * x + c)) <= 1e-7 * Math.max(1, Math.abs(got));
  });

  const tiny = (n: number) => Math.abs(n) < 1e-12;
  const steps: string[] = [showPrettyMath(expression)];
  let roots: number[] = [];

  if (fits && tiny(a)) {
    // Linear equation: bx + c = 0
    steps.push(`Bring everything to one side: ${sumText([[b, v], [c, '']])} = 0`);
    if (tiny(b)) {
      steps.push(tiny(c) ? 'Both sides are always equal (identity)' : `Equation resolves to ${niceRatioOrDecimal(c)} = 0, which is impossible`);
      return {
        expression,
        variable: v,
        roots: [],
        text: tiny(c) ? 'All real numbers' : 'No solution',
        steps: steps.map(minus),
      };
    }
    steps.push(`${sumText([[b, v]])} = ${niceRatioOrDecimal(-c)}`);
    if (Math.abs(b - 1) > 1e-12) {
      steps.push(`Divide both sides by ${signed(b)}: ${v} = ${niceRatioOrDecimal(-c)} ÷ ${signed(b)}`);
    }
    roots = [-c / b];
  } else if (fits) {
    // Quadratic equation: ax^2 + bx + c = 0
    const disc = b * b - 4 * a * c;
    steps.push(`Standard form: ${sumText([[a, `${v}²`], [b, v], [c, '']])} = 0   (a = ${niceRatioOrDecimal(a)}, b = ${niceRatioOrDecimal(b)}, c = ${niceRatioOrDecimal(c)})`);
    steps.push(`Discriminant: Δ = b² − 4ac = ${signed(b)}² − 4·${signed(a)}·${signed(c)} = ${niceRatioOrDecimal(disc)}`);

    if (disc < -1e-12) {
      steps.push('Discriminant is negative: No real solutions exist.');
      return {
        expression,
        variable: v,
        roots: [],
        text: 'No real solutions',
        steps: steps.map(minus),
      };
    }

    const r = Math.sqrt(Math.max(0, disc));
    steps.push(`${v} = (−b ± √Δ) ÷ 2a = (${niceRatioOrDecimal(-b)} ± ${niceRatioOrDecimal(r)}) ÷ ${niceRatioOrDecimal(2 * a)}`);
    roots = tiny(r) ? [-b / (2 * a)] : [(-b - r) / (2 * a), (-b + r) / (2 * a)];
  } else {
    // Numerical root finder for higher-order polynomials / transcendental equations
    steps.push('Equation is nonlinear: using numerical bisection root refinement');
    const step = 0.05;
    let px = -200;
    let py = f(px);

    for (let x = px + step; x <= 200 && roots.length < 4; x += step) {
      const y = f(x);
      if (Number.isFinite(py) && Number.isFinite(y) && Math.sign(py) !== Math.sign(y)) {
        let lo = px;
        let hi = x;
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2;
          if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid;
          else hi = mid;
        }
        const root = (lo + hi) / 2;
        if (Math.abs(f(root)) < 1e-6) roots.push(root);
      }
      px = x;
      py = y;
    }

    if (!roots.length) throw new MathError('No real roots could be located');
  }

  roots = roots.map((r) => (Object.is(r, -0) ? 0 : r)).sort((p, q) => p - q);
  const answer = `${v} = ${roots.map(niceRatioOrDecimal).join(', ')}`;
  steps.push(roots.length > 1 ? roots.map((r) => `${v} = ${niceRatioOrDecimal(r)}`).join('  or  ') : answer);

  return {
    expression,
    variable: v,
    roots,
    text: answer,
    steps: steps.map(minus),
  };
}

export interface SystemSolution {
  values: Record<string, number>;
  text: string;
  steps: string[];
}

function linearForm(sides: string[], names: string[]): { c: number; coef: number[] } | null {
  const f = (vals: Record<string, number>) => parseTokens(sides[0], vals) - parseTokens(sides[1], vals);
  const zero = Object.fromEntries(names.map((n) => [n, 0]));
  let c: number;
  let coef: number[];
  try {
    c = f(zero);
    coef = names.map((n) => f({ ...zero, [n]: 1 }) - c);
    for (const t of [1.7, -2.3, 3.1, 0.45]) {
      const vals = Object.fromEntries(names.map((n, i) => [n, t * (i + 1.3) - i]));
      const got = f(vals);
      const want = c + names.reduce((s, n, i) => s + coef[i] * vals[n], 0);
      if (!Number.isFinite(got) || Math.abs(got - want) > 1e-7 * Math.max(1, Math.abs(got))) {
        return null;
      }
    }
  } catch {
    return null;
  }
  return { c, coef };
}

/**
 * Solves a system of linear equations using Gaussian elimination with partial pivoting.
 */
export function solveSystem(texts: string[]): SystemSolution {
  const eqs = texts.map(normalizeMathExpression).filter((e) => e.split('=').length === 2);
  const names = [...new Set(eqs.flatMap(getUnknownVariables))].sort();

  if (names.length < 2 || eqs.length < names.length) {
    throw new MathError('System requires at least as many equations as unknown variables');
  }

  const rows = eqs.map((e) => {
    const form = linearForm(e.split('='), names);
    if (!form) throw new MathError('Only linear systems are supported by the exact solver');
    return [...form.coef, -form.c];
  });

  const m = names.length;
  const rowText = (r: number[]) => `${sumText(names.map((n, j) => [r[j], n]))} = ${niceRatioOrDecimal(r[m])}`;
  const steps: string[] = eqs.map((e, i) => `(${i + 1})  ${showPrettyMath(e)}`);

  for (let col = 0; col < m; col++) {
    let pivot = col;
    for (let r = col + 1; r < rows.length; r++) {
      if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
    }
    if (Math.abs(rows[pivot][col]) < 1e-10) {
      throw new MathError('Equations do not possess a single unique solution');
    }
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];

    for (let r = 0; r < rows.length; r++) {
      if (r === col) continue;
      const k = rows[r][col] / rows[col][col];
      if (Math.abs(k) < 1e-12) continue;
      for (let j = col; j <= m; j++) rows[r][j] -= k * rows[col][j];
      if (steps.length < 14) {
        steps.push(`Eliminate ${names[col]} from equation ${r + 1}: ${rowText(rows[r])}`);
      }
    }
  }

  for (let r = m; r < rows.length; r++) {
    if (Math.abs(rows[r][m]) > 1e-7) {
      throw new MathError('System contains contradictory constraints');
    }
  }

  const values: Record<string, number> = Object.fromEntries(names.map((n, i) => [n, rows[i][m] / rows[i][i]]));
  names.forEach((n, i) => {
    if (Math.abs(rows[i][i] - 1) > 1e-12) {
      steps.push(`Solve: ${n} = ${niceRatioOrDecimal(values[n])}`);
    }
  });

  const answer = names.map((n) => `${n} = ${niceRatioOrDecimal(values[n])}`).join(', ');
  steps.push(`Solution: ${answer}`);

  return { values, text: answer, steps: steps.map(minus) };
}
