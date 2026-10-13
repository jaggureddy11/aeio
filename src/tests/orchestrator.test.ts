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

    it('prioritizes local Ollama when activeProvider is set to ollama', async () => {
      const { useSettingsStore } = await import('../stores/settingsStore');
      useSettingsStore.setState({ activeProvider: 'ollama', ollamaModel: 'qwen2.5:7b' });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('11434')) {
          return {
            ok: true,
            json: async () => ({
              message: { content: 'Local response from Ollama' },
            }),
          } as any;
        }
        throw new Error('Should not reach cloud');
      });

      try {
        const result = await orchestrateChat([
          { role: 'user', content: 'Organize my daily task plan' },
        ]);

        expect(result.isLocal).toBe(true);
        expect(result.content).toBe('Local response from Ollama');
      } finally {
        globalThis.fetch = originalFetch;
        useSettingsStore.setState({ activeProvider: 'aeio-free' });
      }
    });

    it('strictly confines execution to local providers when neverSendMemoriesToCloud is enabled', async () => {
      const { useSettingsStore } = await import('../stores/settingsStore');
      useSettingsStore.setState({ neverSendMemoriesToCloud: true, ollamaModel: 'llama3.1' });

      const originalFetch = globalThis.fetch;
      let requestedLocal = false;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('11434')) {
          requestedLocal = true;
          return {
            ok: true,
            json: async () => ({
              message: { content: 'Private local response' },
            }),
          } as any;
        }
        throw new Error('Privacy violation: cloud URL reached!');
      });

      try {
        const result = await orchestrateChat([
          { role: 'user', content: 'Remember my private SSN and account details' },
        ]);

        expect(requestedLocal).toBe(true);
        expect(result.isLocal).toBe(true);
        expect(result.content).toBe('Private local response');
      } finally {
        globalThis.fetch = originalFetch;
        useSettingsStore.setState({ neverSendMemoriesToCloud: false });
      }
    });

    it('gracefully fails over to secondary candidate if primary candidate throws', async () => {
      vi.mocked(ipc.getApiKey).mockImplementation(async (target: string) => {
        if (target === 'gemini') return 'test_gemini_key';
        return '';
      });

      const { useSettingsStore } = await import('../stores/settingsStore');
      useSettingsStore.setState({ activeProvider: 'aeio-free' });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        // Gemini fails (e.g. rate limit HTTP 429)
        if (url.includes('generativelanguage.googleapis.com')) {
          return {
            ok: false,
            status: 429,
            text: async () => 'Rate limit exceeded',
          } as any;
        }
        // Fallback to Free proxy
        if (url.includes('aeio') || url.includes('/v1/chat/completions') || url.includes('/api/')) {
          return {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: 'Resilient fallback response' } }],
            }),
          } as any;
        }
        return {
          ok: true,
          json: async () => ({
            message: { content: 'Fallback response' },
          }),
        } as any;
      });

      try {
        const result = await orchestrateChat([
          { role: 'user', content: 'Tell me a joke' },
        ]);

        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
