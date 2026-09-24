import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../lib/providers/ollama';
import { ClaudeProvider } from '../lib/providers/claude';
import { OpenAIProvider } from '../lib/providers/openai';
import { ProviderMessage } from '../lib/providers/types';

describe('LLM Providers Unit Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('OllamaProvider', () => {
    it('sends correct request shape to http://localhost:11434/api/chat', async () => {
      const provider = new OllamaProvider();
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = url.toString();
        capturedInit = init;
        return new Response(JSON.stringify({ message: { content: 'Local response from Llama' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const messages: ProviderMessage[] = [{ role: 'user', content: 'Hello local' }];
      const result = await provider.chat(messages, {
        model: 'llama3.2',
        temperature: 0.5,
        systemPrompt: 'You are Aeio.',
      });

      expect(capturedUrl).toBe('http://localhost:11434/api/chat');
      expect(capturedInit?.method).toBe('POST');
      const body = JSON.parse(capturedInit?.body as string);
      expect(body.model).toBe('llama3.2');
      expect(body.options.temperature).toBe(0.5);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are Aeio.' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello local' });
      expect(result).toBe('Local response from Llama');
    });

    it('reports health status accurately when Ollama is running or down', async () => {
      const provider = new OllamaProvider();

      // Healthy
      globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 }));
      const healthOk = await provider.checkHealth();
      expect(healthOk.ok).toBe(true);

      // Down / unreachable
      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Connection refused'));
      const healthDown = await provider.checkHealth();
      expect(healthDown.ok).toBe(false);
      expect(healthDown.message).toContain('Ollama is not running');
    });
  });

  describe('ClaudeProvider', () => {
    it('sends correct headers and Anthropic messages schema', async () => {
      const provider = new ClaudeProvider();
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any;

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            content: [{ type: 'text', text: 'Hello from Claude' }],
          }),
          { status: 200 }
        );
      });

      const messages: ProviderMessage[] = [{ role: 'user', content: 'Draft response' }];
      const result = await provider.chat(messages, {
        apiKey: 'sk-ant-test-key-12345',
        model: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'Aeio assistant prompt',
      });

      expect(capturedHeaders['x-api-key']).toBe('sk-ant-test-key-12345');
      expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
      expect(capturedHeaders['anthropic-dangerous-direct-browser-access']).toBe('true');
      expect(capturedBody.system).toBe('Aeio assistant prompt');
      expect(capturedBody.model).toBe('claude-3-5-sonnet-20241022');
      expect(capturedBody.messages).toEqual([{ role: 'user', content: 'Draft response' }]);
      expect(result).toBe('Hello from Claude');
    });

    it('throws descriptive error if API key is missing', async () => {
      const provider = new ClaudeProvider();
      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], { apiKey: '' })
      ).rejects.toThrow('Claude API key required');
    });
  });

  describe('OpenAIProvider', () => {
    it('sends correct Bearer authorization and chat completions schema', async () => {
      const provider = new OpenAIProvider();
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any;

      globalThis.fetch = vi.fn().mockImplementation(async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = init?.headers as Record<string, string>;
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Response from GPT-4o' } }],
          }),
          { status: 200 }
        );
      });

      const messages: ProviderMessage[] = [{ role: 'user', content: 'Calculate metrics' }];
      const result = await provider.chat(messages, {
        apiKey: 'sk-openai-test-key-abcde',
        model: 'gpt-4o',
        systemPrompt: 'System instructions',
        temperature: 0.2,
      });

      expect(capturedHeaders['Authorization']).toBe('Bearer sk-openai-test-key-abcde');
      expect(capturedBody.model).toBe('gpt-4o');
      expect(capturedBody.temperature).toBe(0.2);
      expect(capturedBody.messages[0]).toEqual({ role: 'system', content: 'System instructions' });
      expect(capturedBody.messages[1]).toEqual({ role: 'user', content: 'Calculate metrics' });
      expect(result).toBe('Response from GPT-4o');
    });

    it('throws descriptive error if API key is missing', async () => {
      const provider = new OpenAIProvider();
      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], { apiKey: '' })
      ).rejects.toThrow('OpenAI API key required');
    });
  });
});
