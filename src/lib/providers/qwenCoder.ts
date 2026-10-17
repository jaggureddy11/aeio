import { ChatOptions, LLMProvider, ProviderHealth, ProviderMessage } from './types';

const OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_QWEN_MODEL = 'qwen2.5:7b';

export async function getInstalledOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}

export async function resolveInstalledOllamaModel(requestedModel: string): Promise<string> {
  const installed = await getInstalledOllamaModels();
  if (installed.length === 0) return requestedModel;

  // 1. Exact match or tag prefix
  const exact = installed.find(
    (m) => m === requestedModel || m === `${requestedModel}:latest` || m.startsWith(`${requestedModel}:`)
  );
  if (exact) return exact;

  // 2. Matching requested prefix (e.g. "qwen2.5" matching "qwen2.5:7b")
  const prefixMatch = installed.find((m) => m.toLowerCase().includes(requestedModel.toLowerCase()));
  if (prefixMatch) return prefixMatch;

  // 3. Fallback to any installed qwen model
  const anyQwen = installed.find((m) => m.toLowerCase().includes('qwen'));
  if (anyQwen) return anyQwen;

  // 4. Fallback to first available installed model
  return installed[0];
}

/**
 * QwenCoderProvider
 * 
 * Specialized local-first provider for Qwen models.
 * Isolated behind the clean LLMProvider abstraction so the underlying
 * inference engine (Ollama, vLLM, llama.cpp, or custom local server)
 * can be swapped transparently without modifying business logic.
 * 
 * Hyperparameters are tuned specifically for local coding, reasoning,
 * deterministic tool calling, and high-speed execution.
 */
export class QwenCoderProvider implements LLMProvider {
  readonly id = 'qwen-coder';
  readonly name = 'Qwen 2.5 Coder (Local)';

  async checkHealth(): Promise<ProviderHealth> {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      if (!res.ok) {
        return { ok: false, message: `Ollama returned HTTP ${res.status}` };
      }
      const data = await res.json();
      const models: string[] = (data.models || []).map((m: { name: string }) => m.name);
      const hasQwen = models.some(
        (m) =>
          m.toLowerCase().includes('qwen3') ||
          m.toLowerCase().includes('qwen2.5') ||
          m.toLowerCase().includes('qwen')
      );

      return {
        ok: true,
        installedModels: models,
        message: hasQwen
          ? 'Qwen is ready for local inference.'
          : `Ollama is running, but Qwen model is not pulled yet. Run \`ollama pull qwen2.5:7b\` to pull the weights.`,
      };
    } catch {
      return {
        ok: false,
        message: 'Local inference engine (Ollama) is not running on http://localhost:11434. Start it with `ollama serve`.',
      };
    }
  }

  async chat(messages: ProviderMessage[], options?: ChatOptions): Promise<string> {
    const model = options?.model || DEFAULT_QWEN_MODEL;
    const payloadMessages = [...messages];

    if (options?.systemPrompt) {
      payloadMessages.unshift({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    const formattedMessages = payloadMessages.map((m) => {
      const msgObj: Record<string, any> = { role: m.role, content: m.content };
      if (m.images && m.images.length > 0) {
        msgObj.images = m.images.map((img) => img.replace(/^data:image\/\w+;base64,/, ''));
      }
      return msgObj;
    });

    // Local inference hyperparameters calibrated for Qwen models
    const requestBody = {
      model,
      messages: formattedMessages,
      stream: !!options?.onChunk,
      keep_alive: options?.keepAlive || '60m', // Keep model resident in Apple Silicon unified memory / GPU VRAM
      options: {
        temperature: options?.temperature ?? 0.2, // Low temperature for deterministic coding & tool execution
        top_p: options?.topP ?? 0.95,
        num_ctx: options?.numCtx ?? 32768, // Expanded 32k context window for code analysis
        stop: options?.stop || ['<|im_end|>', '<|endoftext|>', '<|im_start|>'],
      },
    };

    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 404 && errorText.includes('not found')) {
          const installed = await getInstalledOllamaModels();
          if (installed.length > 0) {
            throw new Error(
              `Model "${model}" not found in Ollama. Available installed models: [${installed.join(', ')}]. Select one in Settings or run \`ollama pull ${model}\`.`
            );
          }
          throw new Error(
            `Model "${model}" not found locally. Run \`ollama pull ${model}\` in your terminal to download it.`
          );
        }
        if (errorText.includes('llama-server binary not found')) {
          throw new Error(
            `Ollama server error: llama-server is missing from your local Ollama installation. Run \`brew install ollama\` or download the official app from https://ollama.com/download.`
          );
        }
        throw new Error(`Qwen error (${response.status}): ${errorText || response.statusText}`);
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
              // Ignore malformed partial stream chunks
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
          'Local AI engine is offline or unreachable at http://localhost:11434. Start Ollama with `ollama serve` to continue.'
        );
      }
      throw err;
    }
  }
}

export const qwenCoderProvider = new QwenCoderProvider();
