import { score } from './primitives';
import { systemOneEngine } from './engine';
import { ScoreAnswer } from './types';
import { MemorySearchResult } from '../ipc';

export interface RerankedMemory {
  searchResult: MemorySearchResult;
  relevanceScore: number; // 0.0 to 1.0
  relevanceLevel: 'high' | 'moderate' | 'none';
  confidence: number;
}

/**
 * TypeSafe Re-Ranking Pattern:
 * Evaluates candidate memories retrieved from vector/BM25 search against the user prompt.
 * Discards irrelevant distractors and sorts by calibrated semantic relevance.
 */
export async function rerankMemoriesSystemOne(
  query: string,
  candidates: MemorySearchResult[]
): Promise<RerankedMemory[]> {
  if (candidates.length === 0) return [];

  const questions: Record<string, any> = {};
  for (let i = 0; i < candidates.length; i++) {
    questions[`mem_${i}`] = score<'high' | 'moderate' | 'none'>(
      `How relevant is this stored memory to the user query "${query}"?`,
      {
        high: 'Directly answers or provides essential user preference, fact, or project context needed for the prompt',
        moderate: 'Provides potentially helpful background or related topic context',
        none: 'Unrelated topic, coincidental keyword overlap, or irrelevant distractor',
      }
    );
  }

  const stateItems: Record<string, string> = {};
  candidates.forEach((c, idx) => {
    stateItems[`candidate_${idx}`] = `${c.memory.category}: ${c.memory.content}`;
  });

  const evaluation = await systemOneEngine.evaluate({
    state: {
      userQuery: query,
      candidates: stateItems,
    },
    questions,
  });

  const reranked: RerankedMemory[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const ans = evaluation.answers[`mem_${i}`] as ScoreAnswer<'high' | 'moderate' | 'none'>;
    const level = ans ? ans.selectedLevel : 'moderate';
    const confidence = ans ? ans.confidence : 0.7;

    const numericWeight = level === 'high' ? 1.0 : level === 'moderate' ? 0.5 : 0.0;
    // Composite scoring: combine vector/BM25 retrieval score with TypeSafe System One judgment
    const combinedScore = candidates[i].score * 0.4 + numericWeight * 0.6;

    reranked.push({
      searchResult: candidates[i],
      relevanceScore: combinedScore,
      relevanceLevel: level,
      confidence,
    });
  }

  // Sort descending by combined score and filter out zero-relevance memories
  return reranked
    .filter((r) => r.relevanceLevel !== 'none')
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}
