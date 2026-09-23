import { ChatOptions, LLMProvider, ProviderMessage } from './types';
import { ollamaProvider } from './ollama';
import { claudeProvider } from './claude';
import { openAIProvider } from './openai';
import { LLMProviderType, useSettingsStore } from '../../stores/settingsStore';

export const providers: Record<LLMProviderType, LLMProvider> = {
  ollama: ollamaProvider,
  claude: claudeProvider,
  openai: openAIProvider,
};

export function getProvider(type: LLMProviderType): LLMProvider {
  return providers[type] || ollamaProvider;
}

export function getActiveProvider(): LLMProvider {
  const activeType = useSettingsStore.getState().activeProvider;
  return getProvider(activeType);
}

export async function chatWithActiveProvider(
  messages: ProviderMessage[],
  options?: ChatOptions
): Promise<string> {
  const settings = useSettingsStore.getState();
  const provider = getActiveProvider();

  const mergedOptions: ChatOptions = {
    ...options,
    model:
      options?.model ||
      (provider.id === 'ollama' ? settings.ollamaModel : undefined),
    apiKey:
      options?.apiKey ||
      (provider.id === 'claude'
        ? settings.claudeApiKey
        : provider.id === 'openai'
        ? settings.openaiApiKey
        : undefined),
  };

  return provider.chat(messages, mergedOptions);
}
