import { LLMProvider } from './types';
import { ollamaProvider } from './ollama';
import { claudeProvider } from './claude';
import { openAIProvider } from './openai';
import { LLMProviderType } from '../../stores/settingsStore';

export const providers: Record<LLMProviderType, LLMProvider> = {
  ollama: ollamaProvider,
  claude: claudeProvider,
  openai: openAIProvider,
};

export function getProvider(type: LLMProviderType): LLMProvider {
  return providers[type] || ollamaProvider;
}
