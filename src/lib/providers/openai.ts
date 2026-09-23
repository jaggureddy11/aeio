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

    const response = await fetch(OPENAI_ENDPOINT, {
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

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errText || response.statusText}`);
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
