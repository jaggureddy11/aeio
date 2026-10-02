/**
 * TypeSafe-inspired System One Types & Decision Primitives
 * 
 * Based on the TypeSafe AI / System One architecture:
 * Fast, focused, typed judgments and calibrated probabilities that code can combine.
 * Primitives: Choice (one of N), Noul (yes/no probability), Score (ordered dimensional scale).
 */

export interface ChoiceQuestion<T extends string = string> {
  type: 'choice';
  instructions: string;
  options: Record<T, string | null>;
  criteria?: Record<string, string>;
}

export interface ChoiceAnswer<T extends string = string> {
  choice: T;
  probabilities: Record<T, number>;
  confidence: number;
  rationale?: string;
}

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: string | string[];
}

export interface NoulAnswer {
  /** Calibrated probability that the condition is YES (0.0 to 1.0) */
  probability: number;
  isAffirmative: boolean;
  rationale?: string;
}

export interface ScoreQuestion<T extends string = string> {
  type: 'score';
  instructions: string;
  levels: Record<T, string>;
}

export interface ScoreAnswer<T extends string = string> {
  selectedLevel: T;
  numericScore: number;
  levelProbabilities: Record<T, number>;
  confidence: number;
  rationale?: string;
}

export type SystemOneQuestion =
  | ChoiceQuestion<any>
  | NoulQuestion
  | ScoreQuestion<any>;

export type SystemOneAnswer =
  | ChoiceAnswer<any>
  | NoulAnswer
  | ScoreAnswer<any>;

export type SystemOneState = Record<string, unknown>;

export interface SystemOneRequest {
  state: SystemOneState;
  questions: Record<string, SystemOneQuestion>;
}

export interface SystemOneResponse {
  answers: Record<string, SystemOneAnswer>;
  evaluatedAt: number;
  engine: string;
  durationMs: number;
}
