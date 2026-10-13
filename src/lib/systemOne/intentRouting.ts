import { choice } from './primitives';
import { systemOneEngine } from './engine';
import { ChoiceAnswer } from './types';

export type TaskType =
  | 'code'
  | 'planning'
  | 'os_control'
  | 'private_notes'
  | 'search_retrieval'
  | 'conversational';

export interface IntentRoutingResult {
  taskType: TaskType;
  confidence: number;
  probabilities: Record<TaskType, number>;
  rationale?: string;
  isHighConfidence: boolean;
}

/**
 * TypeSafe Intent Routing Pattern:
 * Classifies user requests using a discrete Choice question with calibrated confidence.
 */
export async function routeUserIntent(
  prompt: string,
  extraState?: Record<string, unknown>
): Promise<IntentRoutingResult> {
  const requestQuestion = choice<TaskType>(
    'What is the primary technical capability required to fulfill this user request?',
    {
      planning:
        'plan planning step-by-step workflow organize automate multi-step migration orchestration execute',
      code:
        'code coding script fix error bug compile typescript javascript python rust programming syntax terminal',
      os_control:
        'volume brightness spotify music song play pause mute unmute launch open close screenshot click scroll dock battery system',
      private_notes:
        'private note save note note down diary journal secret password credential personal',
      search_retrieval:
        'search find retrieve memory memories recall remember saved lookup document inspect files',
      conversational:
        'conversational chat discuss explain philosophy talk greeting hello thoughts perspective general',
    }
  );

  const evaluation = await systemOneEngine.evaluate({
    state: {
      prompt,
      ...extraState,
    },
    questions: {
      intent: requestQuestion,
    },
  });

  const answer = evaluation.answers.intent as ChoiceAnswer<TaskType>;
  const isHighConfidence = answer.confidence >= 0.75;

  return {
    taskType: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities as Record<TaskType, number>,
    rationale: answer.rationale,
    isHighConfidence,
  };
}
