import { create } from 'zustand';

export type LLMProviderType = 'ollama' | 'claude' | 'openai';

export interface SettingsState {
  activeProvider: LLMProviderType;
  ollamaModel: string;
  claudeApiKey: string;
  openaiApiKey: string;
  setActiveProvider: (provider: LLMProviderType) => void;
  setOllamaModel: (model: string) => void;
  setClaudeApiKey: (key: string) => void;
  setOpenaiApiKey: (key: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  activeProvider: 'ollama',
  ollamaModel: 'llama3.2',
  claudeApiKey: '',
  openaiApiKey: '',
  setActiveProvider: (activeProvider) => set({ activeProvider }),
  setOllamaModel: (ollamaModel) => set({ ollamaModel }),
  setClaudeApiKey: (claudeApiKey) => set({ claudeApiKey }),
  setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
}));
