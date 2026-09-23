import { ChatOptions, LLMProvider, ProviderHealth, ProviderMessage } from './types';

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';

  async checkHealth(options?: ChatOptions): Promise<ProviderHealth> {
    if (!options?.apiKey) {
      return { ok: false, message: 'OpenAI API key is not configured.' };
    }
    return { ok: true };
  }

  async chat(messages: ProviderMessage[], options?: ChatOptions): Promise<string> {
    if (!options?.apiKey) {
      throw new Error('OpenAI API key required. Please configure it in Settings.');
    }

    const model = options.model || 'gpt-4o';
    const payloadMessages = [...messages];

    if (options.systemPrompt) {
      payloadMessages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    let response: Response;
    try {
      response = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: payloadMessages,
          stream: !!options.onChunk,
          temperature: options.temperature ?? 0.7,
        }),
      });
    } catch (netErr: unknown) {
      const msg = netErr instanceof Error ? netErr.message : String(netErr);
      if (
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('ENOTFOUND')
      ) {
        throw new Error(
          'Network offline or OpenAI API unreachable. You can switch to your local Ollama model to continue offline.'
        );
      }
      throw netErr;
    }

    if (!response.ok) {
      const errText = await response.text();
      let parsedMessage = '';
      try {
        const parsed = JSON.parse(errText);
        parsedMessage = parsed.error?.message || parsed.message || '';
      } catch {}

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Invalid or expired OpenAI API key (HTTP ${response.status}). Please verify your key or quota in Settings.`
        );
      }
      if (response.status === 429) {
        throw new Error(
          `OpenAI rate limit or quota exceeded (HTTP 429). Please check your account usage at platform.openai.com.`
        );
      }

      throw new Error(
        `OpenAI API error (${response.status}): ${parsedMessage || errText || response.statusText}`
      );
    }

    if (options.onChunk && response.body) {
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
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const chunk = parsed.choices?.[0]?.delta?.content || '';
              if (chunk) {
                fullText += chunk;
                options.onChunk(chunk);
              }
            } catch {
              // ignore partial json
            }
          }
        }
      }
      return fullText;
    } else {
      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    }
  }
}

export const openAIProvider = new OpenAIProvider();
