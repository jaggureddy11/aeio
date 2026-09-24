import { ChatOptions, LLMProvider, ProviderHealth, ProviderMessage } from './types';

const OLLAMA_BASE_URL = 'http://localhost:11434';
export const DEFAULT_QWEN_MODEL = 'qwen3-coder';

/**
 * QwenCoderProvider
 * 
 * Specialized local-first provider for Qwen3-Coder models.
 * Isolated behind the clean LLMProvider abstraction so the underlying
 * inference engine (Ollama, vLLM, llama.cpp, or custom local server)
 * can be swapped transparently without modifying business logic.
 * 
 * Hyperparameters are tuned specifically for local coding, reasoning,
 * deterministic tool calling, and high-speed execution.
 */
export class QwenCoderProvider implements LLMProvider {
  readonly id = 'qwen-coder';
  readonly name = 'Qwen3-Coder (Local)';

  async checkHealth(): Promise<ProviderHealth> {
    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      if (!res.ok) {
        return { ok: false, message: `Ollama returned HTTP ${res.status}` };
      }
      const data = await res.json();
      const models: string[] = (data.models || []).map((m: { name: string }) => m.name);
      const hasQwen = models.some(
        (m) => m.toLowerCase().includes('qwen3-coder') || m.toLowerCase().includes('qwen2.5-coder')
      );

      return {
        ok: true,
        installedModels: models,
        message: hasQwen
          ? 'Qwen3-Coder is installed and ready for local inference.'
          : 'Ollama is running, but Qwen3-Coder is not pulled yet. Run `ollama run qwen3-coder` to pull the weights.',
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

    // Local inference hyperparameters calibrated for Qwen3-Coder
    const requestBody = {
      model,
      messages: payloadMessages,
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
          throw new Error(
            `Model "${model}" not found locally. Run \`ollama pull ${model}\` in your terminal to download it.`
          );
        }
        throw new Error(`Qwen3-Coder error (${response.status}): ${errorText || response.statusText}`);
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
