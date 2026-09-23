import { ChatOptions, LLMProvider, ProviderMessage } from './types';

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local)';

  async chat(_messages: ProviderMessage[], _options?: ChatOptions): Promise<string> {
    // Logic will be wired in Step 2
    return '';
  }
}

export const ollamaProvider = new OllamaProvider();
