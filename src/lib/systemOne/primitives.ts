import { ChoiceQuestion, NoulQuestion, ScoreQuestion } from './types';

/**
 * Creates a Choice question: selects one option from a defined set.
 * The answer includes the selected option, distribution across options, and confidence.
 */
export function choice<T extends string = string>(
  instructions: string,
  options: Record<T, string | null>,
  criteria?: Record<string, string>
): ChoiceQuestion<T> {
  return {
    type: 'choice',
    instructions,
    options,
    criteria,
  };
}

/**
 * Creates a Noul question: evaluates whether a condition holds.
 * Returns the calibrated probability that the answer is yes (0.0 to 1.0).
 */
export function noul(
  instructions: string,
  criteria?: string | string[]
): NoulQuestion {
  return {
    type: 'noul',
    instructions,
    criteria,
  };
}

/**
 * Creates a Score question: rates content against ordered, descriptive levels.
 * Returns a score, a probability for each level, and confidence.
 */
export function score<T extends string = string>(
  instructions: string,
  levels: Record<T, string>
): ScoreQuestion<T> {
  return {
    type: 'score',
    instructions,
    levels,
  };
}
