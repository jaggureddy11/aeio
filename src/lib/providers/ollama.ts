import { ChatOptions, LLMProvider, ProviderHealth, ProviderMessage } from './types';

const OLLAMA_BASE_URL = 'http://localhost:11434';

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local)';

  async checkHealth(): Promise<ProviderHealth> {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      if (!res.ok) {
        return { ok: false, message: `Ollama returned HTTP ${res.status}` };
      }
      return { ok: true };
    } catch {
      return {
        ok: false,
        message: 'Ollama is not running. Please start Ollama or install from ollama.com.',
      };
    }
  }

  async chat(messages: ProviderMessage[], options?: ChatOptions): Promise<string> {
    const model = options?.model || 'llama3.1';
    const payloadMessages = [...messages];

    if (options?.systemPrompt) {
      payloadMessages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: payloadMessages,
          stream: !!options?.onChunk,
          options: {
            temperature: options?.temperature ?? 0.7,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error (${response.status}): ${errorText || response.statusText}`);
      }

      if (options?.onChunk && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              const chunk = parsed.message?.content || '';
              if (chunk) {
                fullText += chunk;
                options.onChunk(chunk);
              }
            } catch {
              // ignore malformed partial chunks
            }
          }
        }
        return fullText;
      } else {
        const data = await response.json();
        return data.message?.content || '';
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('Failed to fetch') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('NetworkError')
      ) {
        throw new Error(
          'Ollama is offline or unreachable on http://localhost:11434. Start the daemon with `ollama serve` or download Ollama from https://ollama.com.'
        );
      }
      throw err;
    }
  }
}

export const ollamaProvider = new OllamaProvider();
