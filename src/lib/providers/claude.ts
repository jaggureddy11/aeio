import { ChatOptions, LLMProvider, ProviderMessage } from './types';

export class ClaudeProvider implements LLMProvider {
  readonly id = 'claude';
  readonly name = 'Anthropic Claude';

  async chat(_messages: ProviderMessage[], _options?: ChatOptions): Promise<string> {
    // Logic will be wired in Step 2
    return '';
  }
}

export const claudeProvider = new ClaudeProvider();
