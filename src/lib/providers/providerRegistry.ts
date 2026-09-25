import { ChatOptions, LLMProvider, ProviderMessage } from './types';
import { qwenCoderProvider } from './qwenCoder';
import { ollamaProvider } from './ollama';
import { claudeProvider } from './claude';
import { openAIProvider } from './openai';
import { geminiProvider } from './gemini';
import { aeioFreeProvider } from './aeioFree';
import { LLMProviderType, useSettingsStore } from '../../stores/settingsStore';

export const providers: Record<LLMProviderType, LLMProvider> = {
  'qwen-coder': qwenCoderProvider,
  ollama: ollamaProvider,
  claude: claudeProvider,
  openai: openAIProvider,
  gemini: geminiProvider,
  'aeio-free': aeioFreeProvider,
};

export function getProvider(type: LLMProviderType): LLMProvider {
  return providers[type] || qwenCoderProvider;
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
      try {
        resolvedApiKey = await getApiKey('claude');
      } catch {
        // not found in keychain
      }
    } else if (provider.id === 'openai') {
      try {
        resolvedApiKey = await getApiKey('openai');
      } catch {
        // not found in keychain
      }
    } else if (provider.id === 'gemini') {
      try {
        resolvedApiKey = await getApiKey('gemini');
      } catch {
        // not found in keychain
      }
    }
  }

  const mergedOptions: ChatOptions = {
    ...options,
    model:
      options?.model ||
      (provider.id === 'qwen-coder' || provider.id === 'ollama' ? settings.ollamaModel : undefined),
    apiKey: resolvedApiKey,
  };

  return provider.chat(messages, mergedOptions);
}
