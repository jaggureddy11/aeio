import { describe, it, expect } from 'vitest';
import {
  evaluateMath,
  solveEquation,
  solveSystem,
  normalizeMathExpression,
  formatNumber,
  niceRatioOrDecimal,
  MathError,
} from '../lib/agent/tools/mathTool';

describe('Math Engine Comprehensive Benchmarks (50 Test Cases)', () => {
  describe('Expression Normalization & Sanitization (10 tests)', () => {
    it('1. normalizes LaTeX multiplication and division symbols', () => {
      expect(normalizeMathExpression('5 \\times 4 \\div 2')).toBe('5 * 4 / 2');
    });

    it('2. normalizes LaTeX square root and fraction macros', () => {
      expect(normalizeMathExpression('\\sqrt{64} + \\frac{10}{2}')).toBe('sqrt(64) + ((10)/(2))');
    });

    it('3. normalizes Unicode multiplication dots and multiplication signs', () => {
      expect(normalizeMathExpression('7 · 8 × 2 • 3')).toBe('7 * 8 * 2 * 3');
    });

    it('4. normalizes Unicode minus signs and dashes', () => {
      expect(normalizeMathExpression('15 − 5 – 2 — 1')).toBe('15 - 5 - 2 - 1');
    });

    it('5. normalizes superscript exponents ² and ³', () => {
      expect(normalizeMathExpression('4² + 2³')).toBe('4^2 + 2^3');
    });

    it('6. normalizes square root symbol √', () => {
      expect(normalizeMathExpression('√100 + √25')).toBe('sqrt100 + sqrt25');
    });

    it('7. normalizes pi Greek letter π to pi identifier', () => {
      expect(normalizeMathExpression('2 * π * 5')).toBe('2 * pi * 5');
    });

    it('8. normalizes thousands separator commas', () => {
      expect(normalizeMathExpression('1,000 + 2,500,000')).toBe('1000 + 2500000');
    });

    it('9. strips trailing equals and question mark', () => {
      expect(normalizeMathExpression('12 * 12 = ?')).toBe('12 * 12');
    });

    it('10. handles curly braces substitution to standard parentheses', () => {
      expect(normalizeMathExpression('{5 + 3} * {2 + 1}')).toBe('(5 + 3) * (2 + 1)');
    });
  });

  describe('Arithmetic, Operator Precedence & Special Functions (15 tests)', () => {
    it('11. respects strict PEMDAS order of operations', () => {
      expect(evaluateMath('10 + 20 * 3 - 40 / 2').value).toBe(50);
    });

    it('12. evaluates nested parentheses correctly', () => {
      expect(evaluateMath('((2 + 3) * (4 + 1)) / (5 - 0)').value).toBe(5);
    });

    it('13. calculates exponents with right-associativity / power precedence', () => {
      expect(evaluateMath('2 ^ 3 ^ 2').value).toBe(512);
    });

    it('14. calculates factorials up to bounds', () => {
      expect(evaluateMath('0!').value).toBe(1);
      expect(evaluateMath('1!').value).toBe(1);
      expect(evaluateMath('6!').value).toBe(720);
      expect(evaluateMath('7!').value).toBe(5040);
    });

    it('15. evaluates percentages in arithmetic expressions', () => {
      expect(evaluateMath('250 * 20%').value).toBe(50);
      expect(evaluateMath('100 + 15% * 100').value).toBe(115);
    });

    it('16. handles absolute value vertical bars', () => {
      expect(evaluateMath('|-45| + |30 - 50|').value).toBe(65);
    });

    it('17. computes square roots and cube roots', () => {
      expect(evaluateMath('sqrt(169)').value).toBe(13);
      expect(evaluateMath('cbrt(27)').value).toBe(3);
    });

    it('18. computes exponential and natural log functions', () => {
      const res = evaluateMath('ln(e)');
      expect(res.value).toBeCloseTo(1, 6);
      expect(evaluateMath('exp(0)').value).toBe(1);
    });

    it('19. computes base-10 log', () => {
      expect(evaluateMath('log(1000)').value).toBe(3);
      expect(evaluateMath('log(100000)').value).toBe(5);
    });

    it('20. computes trigonometric functions in degree mode (default)', () => {
      expect(evaluateMath('sin(90)').value).toBe(1);
      expect(evaluateMath('cos(0)').value).toBe(1);
      expect(evaluateMath('tan(45)').value).toBe(1);
    });

    it('21. computes trigonometric functions in radian mode when specified', () => {
      expect(evaluateMath('sin(pi / 2)', { angle: 'rad' }).value).toBe(1);
      expect(evaluateMath('cos(pi)', { angle: 'rad' }).value).toBe(-1);
    });

    it('22. computes inverse trigonometric functions', () => {
      expect(evaluateMath('asin(1)').value).toBe(90);
      expect(evaluateMath('acos(1)').value).toBe(0);
      expect(evaluateMath('atan(1)').value).toBe(45);
    });

    it('23. computes hyperbolic functions', () => {
      expect(evaluateMath('sinh(0)').value).toBe(0);
      expect(evaluateMath('cosh(0)').value).toBe(1);
      expect(evaluateMath('tanh(0)').value).toBe(0);
    });

    it('24. handles unary plus and negative signs correctly', () => {
      expect(evaluateMath('-10 + -20 * -2').value).toBe(30);
      expect(evaluateMath('+5 - -5').value).toBe(10);
    });

    it('25. formats numbers into standard readable strings and fractions', () => {
      expect(formatNumber(1000)).toBe('1000');
      expect(niceRatioOrDecimal(0.75)).toBe('3/4');
      expect(niceRatioOrDecimal(0.333333333333)).toBe('1/3');
      expect(niceRatioOrDecimal(2.5)).toBe('5/2');
    });
  });

  describe('Single-Variable Equation Solver (10 tests)', () => {
    it('26. solves simple linear equations with integer roots', () => {
      const sol = solveEquation('2x + 6 = 14');
      expect(sol.variable).toBe('x');
      expect(sol.roots).toEqual([4]);
      expect(sol.text).toBe('x = 4');
    });

    it('27. solves linear equations with fractional roots', () => {
      const sol = solveEquation('3y - 5 = 6');
      expect(sol.variable).toBe('y');
      expect(sol.roots[0]).toBeCloseTo(11 / 3, 5);
      expect(sol.text).toBe('y = 11/3');
    });

    it('28. solves linear equations where variable appears on both sides', () => {
      const sol = solveEquation('5z + 10 = 2z + 25');
      expect(sol.variable).toBe('z');
      expect(sol.roots).toEqual([5]);
    });

    it('29. detects equations with no solution', () => {
      const sol = solveEquation('x + 5 = x + 10');
      expect(sol.roots).toEqual([]);
      expect(sol.text).toBe('No solution');
    });

    it('30. detects identity equations with infinite real solutions', () => {
      const sol = solveEquation('2x + 4 = 2x + 4');
      expect(sol.roots).toEqual([]);
      expect(sol.text).toBe('All real numbers');
    });

    it('31. solves quadratic equations with two distinct integer roots', () => {
      const sol = solveEquation('x^2 - 5x + 6 = 0');
      expect(sol.variable).toBe('x');
      expect(sol.roots).toEqual([2, 3]);
    });

    it('32. solves quadratic equations with a single repeated root', () => {
      const sol = solveEquation('x^2 - 4x + 4 = 0');
      expect(sol.variable).toBe('x');
      expect(sol.roots).toEqual([2]);
    });

    it('33. detects quadratic equations with no real solutions', () => {
      const sol = solveEquation('x^2 + 16 = 0');
      expect(sol.roots).toEqual([]);
      expect(sol.text).toBe('No real solutions');
    });

    it('34. solves quadratic equations with non-zero right hand side', () => {
      const sol = solveEquation('x^2 + 2x = 8');
      expect(sol.roots).toEqual([-4, 2]);
    });

    it('35. solves cubic equations using numerical bisection solver', () => {
      const sol = solveEquation('x^3 - 8 = 0');
      expect(sol.variable).toBe('x');
      expect(sol.roots[0]).toBeCloseTo(2, 2);
    });
  });

  describe('Linear Systems Solver (8 tests)', () => {
    it('36. solves a 2-variable linear system with unique integer roots', () => {
      const sol = solveSystem(['x + y = 10', 'x - y = 2']);
      expect(sol.values.x).toBe(6);
      expect(sol.values.y).toBe(4);
    });

    it('37. solves a 2-variable linear system with fractional roots', () => {
      const sol = solveSystem(['2x + 3y = 7', 'x - y = 1']);
      expect(sol.values.x).toBe(2);
      expect(sol.values.y).toBe(1);
    });

    it('38. solves a 3-variable linear system accurately', () => {
      const sol = solveSystem([
        'x + y + z = 6',
        '2y + 5z = -4',
        '2x + 5y - z = 27',
      ]);
      expect(sol.values.x).toBeCloseTo(5, 5);
      expect(sol.values.y).toBeCloseTo(3, 5);
      expect(sol.values.z).toBeCloseTo(-2, 5);
    });

    it('39. throws error when system has fewer equations than variables', () => {
      expect(() => solveSystem(['x + y + z = 10', 'x - y = 2'])).toThrow(
        /requires at least as many equations as unknown variables/i
      );
    });

    it('40. throws error on linearly dependent singular systems', () => {
      expect(() => solveSystem(['x + y = 5', '2x + 2y = 10'])).toThrow(
        /do not possess a single unique solution/i
      );
    });

    it('41. throws error on contradictory linear systems', () => {
      expect(() => solveSystem(['x + y = 5', 'x + y = 10'])).toThrow(
        /do not possess a single unique solution/i
      );
    });

    it('42. formats multi-variable solution steps clearly', () => {
      const sol = solveSystem(['a + b = 20', 'a - b = 4']);
      expect(sol.steps.length).toBeGreaterThan(0);
      expect(sol.text).toContain('a = 12');
      expect(sol.text).toContain('b = 8');
    });

    it('43. handles systems with reordered variable positions', () => {
      const sol = solveSystem(['y + 2x = 8', '3x - y = 7']);
      expect(sol.values.x).toBe(3);
      expect(sol.values.y).toBe(2);
    });
  });

  describe('Error Handling & Boundary Conditions (7 tests)', () => {
    it('44. throws MathError on division by zero in evaluateMath', () => {
      expect(() => evaluateMath('50 / 0')).toThrow(MathError);
      expect(() => evaluateMath('50 / 0')).toThrow(/Cannot divide by zero/i);
    });

    it('45. throws MathError on square root of negative numbers', () => {
      expect(() => evaluateMath('sqrt(-16)')).toThrow(
        /square root of a negative number is not a real number/i
      );
    });

    it('46. throws MathError on logarithm of zero or negative numbers', () => {
      expect(() => evaluateMath('ln(0)')).toThrow(/strictly greater than 0/i);
      expect(() => evaluateMath('log(-10)')).toThrow(/strictly greater than 0/i);
    });

    it('47. throws MathError on factorial of negative or non-integer numbers', () => {
      expect(() => evaluateMath('(-3)!')).toThrow(/Factorial requires a non-negative whole number/i);
      expect(() => evaluateMath('3.5!')).toThrow(/Factorial requires a non-negative whole number/i);
    });

    it('48. throws MathError on factorial exceeding 170', () => {
      expect(() => evaluateMath('171!')).toThrow(/up to 170/i);
    });

    it('49. throws MathError on undefined variables passed to evaluateMath', () => {
      expect(() => evaluateMath('2 * x + 5')).toThrow(/contains an undefined variable/i);
    });

    it('50. throws MathError on invalid characters or unbalanced expressions', () => {
      expect(() => evaluateMath('5 + @ 3')).toThrow(/Unexpected character/i);
      expect(() => evaluateMath('(5 + 3')).toThrow(/Expected "\)"/i);
    });
  });
});
