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

import { getApiKey } from '../ipc';

export async function chatWithActiveProvider(
  messages: ProviderMessage[],
  options?: ChatOptions
): Promise<string> {
  const settings = useSettingsStore.getState();
  const provider = getActiveProvider();

  let resolvedApiKey = options?.apiKey;
  if (!resolvedApiKey) {
    if (provider.id === 'claude') {
      resolvedApiKey = settings.claudeApiKey;
      if (!resolvedApiKey) {
        try {
          resolvedApiKey = await getApiKey('claude');
        } catch {
          // not found in keychain
        }
      }
    } else if (provider.id === 'openai') {
      resolvedApiKey = settings.openaiApiKey;
      if (!resolvedApiKey) {
        try {
          resolvedApiKey = await getApiKey('openai');
        } catch {
          // not found in keychain
        }
      }
    }
  }

  const mergedOptions: ChatOptions = {
    ...options,
    model:
      options?.model ||
      (provider.id === 'ollama' ? settings.ollamaModel : undefined),
    apiKey: resolvedApiKey,
  };

  return provider.chat(messages, mergedOptions);
}
