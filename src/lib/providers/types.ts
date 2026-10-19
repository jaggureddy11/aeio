export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
}

export interface ChatOptions {
  model?: string;
  apiKey?: string;
  temperature?: number;
  systemPrompt?: string;
  numCtx?: number;
  topP?: number;
  stop?: string[];
  keepAlive?: string;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
  _isCredentialRetry?: boolean;
}

export interface ProviderHealth {
  ok: boolean;
  message?: string;
  installedModels?: string[];
}

export interface LLMProvider {
  readonly id: string;
  readonly name: string;
  chat(messages: ProviderMessage[], options?: ChatOptions): Promise<string>;
  checkHealth?(options?: ChatOptions): Promise<ProviderHealth>;
}
