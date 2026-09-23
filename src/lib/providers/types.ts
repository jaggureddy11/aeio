export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  model?: string;
  apiKey?: string;
  temperature?: number;
  systemPrompt?: string;
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  chat(messages: ProviderMessage[], options?: ChatOptions): Promise<string>;
}
