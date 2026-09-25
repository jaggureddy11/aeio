import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyUserTask, orchestrateChat } from '../lib/providers/orchestrator';
import * as ipc from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  getApiKey: vi.fn(),
}));

describe('Backend AI Orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('classifyUserTask', () => {
    it('identifies code tasks', () => {
      expect(classifyUserTask('Write a Python function to parse JSON')).toBe('code');
      expect(classifyUserTask('Fix this Rust compilation error in build.rs')).toBe('code');
      expect(classifyUserTask('Run git status in shell')).toBe('code');
    });

    it('identifies multi-step planning tasks', () => {
      expect(classifyUserTask('Create a step-by-step plan to organize my project workflows')).toBe('planning');
      expect(classifyUserTask('Automate this workflow')).toBe('planning');
    });

    it('identifies search and memory retrieval tasks', () => {
      expect(classifyUserTask('Search local files for App.tsx')).toBe('search_retrieval');
      expect(classifyUserTask('What do you remember about my preferences?')).toBe('search_retrieval');
    });

    it('defaults to conversational for general prompts', () => {
      expect(classifyUserTask('Hello there, how are you?')).toBe('conversational');
      expect(classifyUserTask('Explain the history of computing')).toBe('conversational');
    });
  });

  describe('orchestrateChat', () => {
    it('successfully routes with Gemini API key', async () => {
      vi.mocked(ipc.getApiKey).mockImplementation(async (target: string) => {
        if (target === 'gemini') return 'test_gemini_key';
        return '';
      });

      // Mock global fetch for Gemini
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Orchestrated response from Gemini' }],
              },
            },
          ],
        }),
      } as any);

      try {
        const result = await orchestrateChat([
          { role: 'user', content: 'What is the speed of light?' },
        ]);

        expect(result.content).toBe('Orchestrated response from Gemini');
        expect(result.providerId).toBe('gemini');
        expect(result.isLocal).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
