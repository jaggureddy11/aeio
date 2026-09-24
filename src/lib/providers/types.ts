export interface ProviderMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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
  onChunk?: (chunk: string) => void;
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
