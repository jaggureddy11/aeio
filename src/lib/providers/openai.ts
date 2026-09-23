import { ChatOptions, LLMProvider, ProviderMessage } from './types';

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';

  async chat(_messages: ProviderMessage[], _options?: ChatOptions): Promise<string> {
    // Logic will be wired in Step 2
    return '';
  }
}

export const openAIProvider = new OpenAIProvider();
