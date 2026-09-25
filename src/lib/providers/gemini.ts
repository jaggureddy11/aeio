import { ChatOptions, LLMProvider, ProviderHealth, ProviderMessage } from './types';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.7-flash';

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';

  async checkHealth(options?: ChatOptions): Promise<ProviderHealth> {
    if (!options?.apiKey) {
      return { ok: false, message: 'Google Gemini API key is not configured.' };
    }
    return { ok: true };
  }

  async chat(messages: ProviderMessage[], options?: ChatOptions): Promise<string> {
    if (!options?.apiKey) {
      throw new Error('Google Gemini API key required. Please configure it in Settings.');
    }

    const model = options.model || DEFAULT_GEMINI_MODEL;
    const isStreaming = !!options.onChunk;
    const endpoint = isStreaming
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(options.apiKey)}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(options.apiKey)}`;

    // Convert messages to Gemini format (roles: 'user' | 'model')
    const contents = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
      },
    };

    if (options.systemPrompt) {
      body.system_instruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
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
          'Network offline or Google Gemini API unreachable. Switch to your local Ollama model to continue offline.'
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

      if (response.status === 400 || response.status === 403) {
        throw new Error(
          `Invalid Google Gemini API key or request error (HTTP ${response.status}): ${parsedMessage || errText}`
        );
      }
      if (response.status === 429) {
        throw new Error(
          `Google Gemini rate limit exceeded (HTTP 429). Please check your quota or wait before retrying.`
        );
      }

      throw new Error(
        `Google Gemini API error (${response.status}): ${parsedMessage || errText || response.statusText}`
      );
    }

    if (isStreaming && response.body && options.onChunk) {
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
            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr);
              const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (textPart) {
                fullText += textPart;
                options.onChunk(textPart);
              }
            } catch {
              // ignore partial chunk json
            }
          }
        }
      }
      return fullText;
    } else {
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
  }
}

export const geminiProvider = new GeminiProvider();
