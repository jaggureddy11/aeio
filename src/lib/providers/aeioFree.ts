import { ChatOptions, LLMProvider, ProviderHealth, ProviderMessage } from './types';
import { useSettingsStore } from '../../stores/settingsStore';

export const DEFAULT_HOSTED_PROXY_URL = 'https://aeio-free-proxy.aeio-free.workers.dev';

export class RateLimitError extends Error {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt?: string;

  constructor(message: string, limit = 30, remaining = 0, resetAt?: string) {
    super(message);
    this.name = 'RateLimitError';
    this.limit = limit;
    this.remaining = remaining;
    this.resetAt = resetAt;
  }
}

export class AeioFreeProvider implements LLMProvider {
  readonly id = 'aeio-free';
  readonly name = 'Aeio Free (Hosted)';

  async checkHealth(): Promise<ProviderHealth> {
    const proxyUrl = useSettingsStore.getState().hostedProxyUrl?.trim();
    if (!proxyUrl) {
      return {
        ok: false,
        message: 'Aeio Free proxy URL is not configured yet. Deploy your Cloudflare Worker and configure the URL in Settings.',
      };
    }
    try {
      const res = await fetch(`${proxyUrl}/health`);
      if (res.ok) {
        return { ok: true, message: 'Aeio Free proxy online' };
      }
      return { ok: false, message: `Proxy health check returned HTTP ${res.status}` };
    } catch {
      return { ok: false, message: `Could not reach Aeio Free proxy at ${proxyUrl}` };
    }
  }

  async chat(messages: ProviderMessage[], options?: ChatOptions): Promise<string> {
    const settings = useSettingsStore.getState();
    const proxyUrl = settings.hostedProxyUrl?.trim();
    if (!proxyUrl) {
      throw new Error(
        'Aeio Free hosted proxy is not configured yet. Run "npx wrangler deploy" in server/ and enter your live workers.dev URL in Settings, or select Ollama / BYOK keys.'
      );
    }
    const installationId = settings.installationId;

    const formattedMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model: options?.model || 'claude-3-5-haiku-20241022',
      messages: formattedMessages,
      stream: !!options?.onChunk,
    };

    if (options?.systemPrompt) {
      body.systemPrompt = options.systemPrompt;
    }

    let response: Response;
    try {
      response = await fetch(`${proxyUrl}/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Installation-Id': installationId,
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
          'Network offline or Aeio Free hosted service unreachable. You can switch to local Ollama or your BYOK keys in Settings.'
        );
      }
      throw netErr;
    }

    if (response.status === 429) {
      let errPayload: any = {};
      try {
        errPayload = await response.json();
      } catch {}
      const msg =
        errPayload.message ||
        "You've used today's free messages — add your own API key for unlimited use, or wait until tomorrow.";
      throw new RateLimitError(msg, errPayload.limit, errPayload.remaining, errPayload.resetAt);
    }

    if (!response.ok) {
      let errText = '';
      try {
        const errJson = await response.json();
        errText = errJson.message || errJson.error || JSON.stringify(errJson);
      } catch {
        errText = await response.text();
      }
      throw new Error(`Aeio Free service error (${response.status}): ${errText}`);
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
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              // Handle Anthropic stream event format
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                const chunk = parsed.delta.text;
                fullText += chunk;
                options.onChunk(chunk);
              }
              // Handle OpenAI stream event format
              else if (parsed.choices?.[0]?.delta?.content) {
                const chunk = parsed.choices[0].delta.content;
                fullText += chunk;
                options.onChunk(chunk);
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }
      return fullText;
    } else {
      const data = await response.json();
      // Handle Anthropic non-streaming schema
      if (data.content && Array.isArray(data.content)) {
        return (
          data.content
            .filter((b: { type: string; text?: string }) => b.type === 'text')
            .map((b: { text?: string }) => b.text)
            .join('') || ''
        );
      }
      // Handle OpenAI non-streaming schema
      if (data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content;
      }
      return typeof data === 'string' ? data : JSON.stringify(data);
    }
  }
}

export const aeioFreeProvider = new AeioFreeProvider();
