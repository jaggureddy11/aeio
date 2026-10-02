import {
  SystemOneRequest,
  SystemOneResponse,
  SystemOneAnswer,
  ChoiceQuestion,
  NoulQuestion,
  ScoreQuestion,
  ChoiceAnswer,
  NoulAnswer,
  ScoreAnswer,
} from './types';
import { useSettingsStore } from '../../stores/settingsStore';
import { getProvider } from '../providers/providerRegistry';
import { systemOneEvaluate } from '../ipc';

/**
 * Executes a bundle of System One questions in parallel over a shared state.
 * Uses native Rust backend (system_one_evaluate) when running in Tauri desktop.
 */
export class SystemOneEngine {
  /**
   * Evaluates typed questions against state.
   */
  async evaluate(request: SystemOneRequest): Promise<SystemOneResponse> {
    const startTime = Date.now();
    const { state, questions } = request;
    const questionKeys = Object.keys(questions);

    if (questionKeys.length === 0) {
      return {
        answers: {},
        evaluatedAt: startTime,
        engine: 'system-one-noop',
        durationMs: 0,
      };
    }

    // 1. Attempt native Rust backend evaluation first
    try {
      const nativeResp = await systemOneEvaluate(request);
      if (nativeResp && nativeResp.answers) {
        return {
          answers: nativeResp.answers,
          evaluatedAt: nativeResp.evaluated_at || startTime,
          engine: nativeResp.engine || 'system-one-rust-native',
          durationMs: nativeResp.duration_ms ?? (Date.now() - startTime),
        };
      }
    } catch {
      // Fallback for non-Tauri / test environments
    }

    try {
      // 2. Attempt LLM-based structured evaluation if a provider is configured
      const answers = await this.evaluateWithLLM(state, questions);
      return {
        answers,
        evaluatedAt: startTime,
        engine: 'system-one-llm',
        durationMs: Date.now() - startTime,
      };
    } catch {
      // 3. Deterministic calibrated fallback (zero API key / offline resilience)
      const fallbackAnswers = this.evaluateFallback(state, questions);
      return {
        answers: fallbackAnswers,
        evaluatedAt: startTime,
        engine: 'system-one-deterministic',
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Prompts the active LLM provider with a strict structured decision schema.
   */
  private async evaluateWithLLM(
    state: Record<string, unknown>,
    questions: Record<string, any>
  ): Promise<Record<string, SystemOneAnswer>> {
    const settings = useSettingsStore.getState();
    const provider = getProvider(settings.activeProvider);

    if (!provider) {
      throw new Error(`Provider ${settings.activeProvider} not available`);
    }

    const systemPrompt = `You are a System One decision model. You evaluate application state and answer typed questions with calibrated numerical probabilities and choices.
DO NOT generate conversational chat or explanations. Output ONLY valid JSON matching this exact structure:
{
  "answers": {
    "<question_id>": {
      // If question type is 'choice':
      "choice": "<selected option key>",
      "probabilities": { "<option_key>": 0.xx, ... },
      "confidence": 0.xx,
      "rationale": "Short 1-line reason"

      // If question type is 'noul' (yes/no):
      "probability": 0.xx, // (0.0 to 1.0 probability of YES)
      "isAffirmative": true/false,
      "rationale": "Short 1-line reason"

      // If question type is 'score':
      "selectedLevel": "<level key>",
      "numericScore": 1.0,
      "levelProbabilities": { "<level_key>": 0.xx, ... },
      "confidence": 0.xx,
      "rationale": "Short 1-line reason"
    }
  }
}`;

    const userPayload = JSON.stringify({ state, questions }, null, 2);

    const responseText = await provider.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPayload },
      ],
      {
        temperature: 0.1,
      }
    );

    // Extract JSON block if surrounded by markdown fences
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse structured JSON from System One model response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed.answers !== 'object') {
      throw new Error('Malformed System One answers payload');
    }

    // Validate and normalize answers against question specifications
    const normalized: Record<string, SystemOneAnswer> = {};
    for (const [key, q] of Object.entries(questions)) {
      const rawAns = parsed.answers[key];
      if (!rawAns) {
        normalized[key] = this.evaluateSingleQuestionFallback(state, q);
      } else if (q.type === 'choice') {
        const validOptions = Object.keys(q.options);
        const choice = validOptions.includes(rawAns.choice) ? rawAns.choice : validOptions[0];
        normalized[key] = {
          choice,
          probabilities: rawAns.probabilities || { [choice]: 1.0 },
          confidence: typeof rawAns.confidence === 'number' ? rawAns.confidence : 0.85,
          rationale: rawAns.rationale,
        } as ChoiceAnswer;
      } else if (q.type === 'noul') {
        const prob = typeof rawAns.probability === 'number' ? rawAns.probability : 0.5;
        normalized[key] = {
          probability: Math.min(1.0, Math.max(0.0, prob)),
          isAffirmative: prob >= 0.5,
          rationale: rawAns.rationale,
        } as NoulAnswer;
      } else if (q.type === 'score') {
        const validLevels = Object.keys(q.levels);
        const level = validLevels.includes(rawAns.selectedLevel) ? rawAns.selectedLevel : validLevels[0];
        normalized[key] = {
          selectedLevel: level,
          numericScore: typeof rawAns.numericScore === 'number' ? rawAns.numericScore : 1.0,
          levelProbabilities: rawAns.levelProbabilities || { [level]: 1.0 },
          confidence: typeof rawAns.confidence === 'number' ? rawAns.confidence : 0.85,
          rationale: rawAns.rationale,
        } as ScoreAnswer;
      }
    }

    return normalized;
  }

  /**
   * Deterministic semantic evaluation fallback when offline or no model is configured.
   */
  private evaluateFallback(
    state: Record<string, unknown>,
    questions: Record<string, any>
  ): Record<string, SystemOneAnswer> {
    const answers: Record<string, SystemOneAnswer> = {};
    for (const [key, q] of Object.entries(questions)) {
      answers[key] = this.evaluateSingleQuestionFallback(state, q);
    }
    return answers;
  }

  private evaluateSingleQuestionFallback(
    state: Record<string, unknown>,
    question: any
  ): SystemOneAnswer {
    const stateStr = JSON.stringify(state).toLowerCase();

    if (question.type === 'choice') {
      const q = question as ChoiceQuestion;
      const optionKeys = Object.keys(q.options);
      let bestOption = optionKeys[0];
      let bestScore = -1;

      const stateTokens = new Set(
        stateStr
          .split(/[^a-z0-9_-]+/)
          .filter((w) => w.length > 2)
      );

      for (const opt of optionKeys) {
        const optText = `${opt} ${q.options[opt] || ''}`.toLowerCase();
        const optTokens = optText.split(/[^a-z0-9_-]+/).filter((w) => w.length > 2);
        let matchCount = 0;

        for (const token of optTokens) {
          if (stateTokens.has(token)) {
            matchCount += 3;
            continue;
          }
          for (const sToken of stateTokens) {
            if (
              (token.length >= 4 && sToken.startsWith(token.slice(0, 4))) ||
              (sToken.length >= 4 && token.startsWith(sToken.slice(0, 4)))
            ) {
              matchCount += 2;
              break;
            }
          }
        }

        if (matchCount > bestScore) {
          bestScore = matchCount;
          bestOption = opt;
        }
      }

      const probabilities: Record<string, number> = {};
      for (const opt of optionKeys) {
        probabilities[opt] = opt === bestOption ? 0.8 : 0.2 / (optionKeys.length - 1 || 1);
      }

      return {
        choice: bestOption,
        probabilities,
        confidence: bestScore > 0 ? 0.85 : 0.55,
        rationale: `Deterministic match based on semantic tokens (${bestScore} matches)`,
      } as ChoiceAnswer;
    }

    if (question.type === 'noul') {
      const q = question as NoulQuestion;
      const criteriaList = Array.isArray(q.criteria)
        ? q.criteria
        : typeof q.criteria === 'string'
        ? [q.criteria]
        : [q.instructions];

      let matchScore = 0;
      for (const crit of criteriaList) {
        const words = crit.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
        for (const w of words) {
          if (stateStr.includes(w)) matchScore++;
        }
      }

      const probability = matchScore > 0 ? Math.min(0.95, 0.5 + matchScore * 0.15) : 0.05;
      return {
        probability,
        isAffirmative: probability >= 0.5,
        rationale: `Evaluated ${matchScore} criteria matches against state context`,
      } as NoulAnswer;
    }

    if (question.type === 'score') {
      const q = question as ScoreQuestion;
      const levelKeys = Object.keys(q.levels);

      // Memory Re-ranking specific semantic scorer
      if (typeof state.userQuery === 'string' && state.candidates) {
        const queryTokens = (state.userQuery as string)
          .toLowerCase()
          .split(/[^a-z0-9_-]+/)
          .filter((w) => w.length > 3);

        const candidatesObj = state.candidates as Record<string, string>;
        // Extract candidate text from instruction if embedded or scan candidate pool
        let candidateText = '';
        for (const [cKey, text] of Object.entries(candidatesObj)) {
          if (question.instructions.includes(cKey) || question.instructions.includes(text.slice(0, 20))) {
            candidateText = text;
            break;
          }
        }
        if (!candidateText && Object.values(candidatesObj).length > 0) {
          // If not directly identified in instruction, search in candidate pool
          for (const text of Object.values(candidatesObj)) {
            const matches = queryTokens.filter((tok) => text.toLowerCase().includes(tok));
            if (matches.length > 0) {
              candidateText = text;
              break;
            }
          }
        }

        let overlapCount = 0;
        const candLower = (candidateText || '').toLowerCase();
        for (const tok of queryTokens) {
          if (candLower.includes(tok)) overlapCount++;
        }

        let selectedLevel = levelKeys[levelKeys.length - 1]; // default low/none
        if (overlapCount >= 2 && levelKeys.includes('high')) {
          selectedLevel = 'high';
        } else if (overlapCount === 1 && levelKeys.includes('moderate')) {
          selectedLevel = 'moderate';
        } else if (levelKeys.includes('none')) {
          selectedLevel = overlapCount > 0 ? 'moderate' : 'none';
        }

        const numericScore = selectedLevel === 'high' ? 3 : selectedLevel === 'moderate' ? 2 : 1;
        return {
          selectedLevel,
          numericScore,
          levelProbabilities: { [selectedLevel]: 1.0 },
          confidence: overlapCount > 0 ? 0.88 : 0.65,
          rationale: `Evaluated query keyword overlap (${overlapCount} matches)`,
        } as ScoreAnswer;
      }

      // Generic level matcher
      let bestLevel = levelKeys[0];
      let bestMatch = -1;
      for (const lvl of levelKeys) {
        const desc = (q.levels[lvl] || lvl).toLowerCase();
        const words = desc.split(/\W+/).filter((w) => w.length > 2);
        let matches = 0;
        for (const w of words) {
          if (stateStr.includes(w)) matches++;
        }
        if (matches > bestMatch) {
          bestMatch = matches;
          bestLevel = lvl;
        }
      }

      const numericScore = levelKeys.indexOf(bestLevel) + 1;
      return {
        selectedLevel: bestLevel,
        numericScore,
        levelProbabilities: { [bestLevel]: 1.0 },
        confidence: bestMatch > 0 ? 0.8 : 0.6,
        rationale: `Matched ${bestMatch} semantic tokens in level criteria`,
      } as ScoreAnswer;
    }

    throw new Error(`Unsupported question type: ${question.type}`);
  }
}

export const systemOneEngine = new SystemOneEngine();
