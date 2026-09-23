import { ChatOptions, LLMProvider, ProviderHealth, ProviderMessage } from './types';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class ClaudeProvider implements LLMProvider {
  readonly id = 'claude';
  readonly name = 'Anthropic Claude';

  async checkHealth(options?: ChatOptions): Promise<ProviderHealth> {
    if (!options?.apiKey) {
      return { ok: false, message: 'Anthropic API key is not configured.' };
    }
    return { ok: true };
  }

  async chat(messages: ProviderMessage[], options?: ChatOptions): Promise<string> {
    if (!options?.apiKey) {
      throw new Error('Claude API key required. Please configure it in Settings.');
    }

    const model = options.model || 'claude-3-5-sonnet-20241022';
    const formattedMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      messages: formattedMessages,
      stream: !!options.onChunk,
    };

    if (options.systemPrompt) {
      body.system = options.systemPrompt;
    }

    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errText || response.statusText}`);
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
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                const chunk = parsed.delta.text;
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
      return (
        data.content
          ?.filter((b: { type: string; text?: string }) => b.type === 'text')
          .map((b: { text?: string }) => b.text)
          .join('') || ''
      );
    }
  }
}

export const claudeProvider = new ClaudeProvider();
