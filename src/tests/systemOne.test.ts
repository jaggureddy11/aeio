import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  choice,
  noul,
  score,
  SystemOneEngine,
  routeUserIntent,
  judgeCommandRisk,
  rerankMemoriesSystemOne,
} from '../lib/systemOne';
import { MemorySearchResult } from '../lib/ipc';

describe('TypeSafe System One Engine & Primitives', () => {
  let engine: SystemOneEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new SystemOneEngine();
  });

  describe('Primitives construction', () => {
    it('creates a Choice question with options and instructions', () => {
      const q = choice('Select best routing target', {
        local: 'Runs on device',
        cloud: 'Runs on server',
      });
      expect(q.type).toBe('choice');
      expect(q.instructions).toBe('Select best routing target');
      expect(q.options.local).toBe('Runs on device');
      expect(q.options.cloud).toBe('Runs on server');
    });

    it('creates a Noul question with criteria', () => {
      const q = noul('Is this code safe to execute?', ['No file deletion', 'No network access']);
      expect(q.type).toBe('noul');
      expect(q.instructions).toBe('Is this code safe to execute?');
      expect(q.criteria).toEqual(['No file deletion', 'No network access']);
    });

    it('creates a Score question with descriptive levels', () => {
      const q = score('Rate memory relevance', {
        low: 'Irrelevant',
        medium: 'Contextually related',
        high: 'Directly answers query',
      });
      expect(q.type).toBe('score');
      expect(q.levels.high).toBe('Directly answers query');
    });
  });

  describe('SystemOneEngine evaluation', () => {
    it('evaluates multiple heterogeneous questions in parallel over shared state', async () => {
      const req = {
        state: {
          command: 'git status',
          target_file: 'src/App.tsx',
        },
        questions: {
          task_category: choice('What is this task?', {
            git: 'Version control operations',
            system: 'OS commands',
          }),
          is_safe: noul('Is this a safe read-only operation?', ['status check', 'non-mutating']),
          priority: score('What is the operational urgency?', {
            p0: 'Immediate emergency',
            p1: 'Normal priority',
          }),
        },
      };

      const result = await engine.evaluate(req);
      expect(result.answers).toBeDefined();
      expect(result.answers.task_category).toBeDefined();
      expect(result.answers.is_safe).toBeDefined();
      expect(result.answers.priority).toBeDefined();

      const choiceAns = result.answers.task_category as any;
      expect(choiceAns.choice).toBe('git');
      expect(choiceAns.confidence).toBeGreaterThan(0.5);

      const noulAns = result.answers.is_safe as any;
      expect(typeof noulAns.probability).toBe('number');
      expect(noulAns.probability).toBeGreaterThan(0.5);
      expect(noulAns.isAffirmative).toBe(true);

      const scoreAns = result.answers.priority as any;
      expect(scoreAns.selectedLevel).toBeDefined();
      expect(scoreAns.numericScore).toBeGreaterThanOrEqual(1);
    });
  });

  describe('TypeSafe Intent Routing', () => {
    it('routes code-focused tasks to "code"', async () => {
      const result = await routeUserIntent('Fix the TypeScript error in src/index.ts');
      expect(result.taskType).toBe('code');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes multi-step plan tasks to "planning"', async () => {
      const result = await routeUserIntent('Create a step-by-step plan to organize the migration workflow');
      expect(result.taskType).toBe('planning');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes memory recall requests to "search_retrieval"', async () => {
      const result = await routeUserIntent('Find my saved memory regarding the API keys');
      expect(result.taskType).toBe('search_retrieval');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('routes general conversation to "conversational"', async () => {
      const result = await routeUserIntent('What is your philosophy on modern software engineering?');
      expect(result.taskType).toBe('conversational');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('TypeSafe Safety Judgments & Destructive Command Gating', () => {
    it('evaluates rm -rf as destructive with high probability and requires approval', async () => {
      const verdict = await judgeCommandRisk('rm -rf /tmp/scratch');
      expect(verdict.isDestructive).toBe(true);
      expect(verdict.destructiveProbability).toBeGreaterThan(0.4);
      expect(verdict.requiresUpfrontApproval).toBe(true);
    });

    it('evaluates git status as safe with low severity and does not require approval', async () => {
      const verdict = await judgeCommandRisk('git status');
      expect(verdict.isDestructive).toBe(false);
      expect(verdict.severity).toBe('low');
    });

    it('evaluates file formatting commands as destructive', async () => {
      const verdict = await judgeCommandRisk('mkfs.ext4 /dev/sdb1');
      expect(verdict.isDestructive).toBe(true);
      expect(verdict.requiresUpfrontApproval).toBe(true);
    });
  });

  describe('TypeSafe Memory Re-Ranking', () => {
    it('re-ranks candidate memories based on semantic relevance to user query', async () => {
      const candidates: MemorySearchResult[] = [
        {
          memory: {
            id: 'mem-irrelevant',
            content: 'The user loves drinking green tea in the morning.',
            category: 'preference',
            created_at: 1000,
            updated_at: 1000,
          },
          score: 1.2,
        },
        {
          memory: {
            id: 'mem-relevant',
            content: 'User requires strict TypeScript and forbids plain any types in the codebase.',
            category: 'preference',
            created_at: 1000,
            updated_at: 1000,
          },
          score: 1.5,
        },
      ];

      const query = 'How should I configure TypeScript types in this project?';
      const reranked = await rerankMemoriesSystemOne(query, candidates);

      expect(reranked.length).toBeGreaterThan(0);
      // The relevant memory should be scored high and appear at top
      expect(reranked[0].searchResult.memory.id).toBe('mem-relevant');
      expect(reranked[0].relevanceLevel).toBe('high');
      expect(reranked[0].relevanceScore).toBeGreaterThan(0.8);
    });

    it('handles empty candidates array gracefully', async () => {
      const reranked = await rerankMemoriesSystemOne('Some query', []);
      expect(reranked).toEqual([]);
    });
  });
});
