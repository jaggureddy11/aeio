import { create } from 'zustand';

export type LLMProviderType = 'ollama' | 'claude' | 'openai';

export type ActiveTab = 'chat' | 'memory' | 'settings';

export interface SettingsState {
  activeTab: ActiveTab;
  activeProvider: LLMProviderType;
  ollamaModel: string;
  activeWindowAwareness: boolean;
  ambientProactive: boolean;
  setActiveTab: (tab: ActiveTab) => void;
  setActiveProvider: (provider: LLMProviderType) => void;
  setOllamaModel: (model: string) => void;
  setActiveWindowAwareness: (enabled: boolean) => void;
  setAmbientProactive: (enabled: boolean) => void;
}

const getStoredBool = (key: string, defaultVal: boolean): boolean => {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val === 'true' : defaultVal;
  } catch {
    return defaultVal;
  }
};

export const useSettingsStore = create<SettingsState>((set) => ({
  activeTab: 'chat',
  activeProvider: 'ollama',
  ollamaModel: 'llama3.2',
  activeWindowAwareness: getStoredBool('aeio_active_window_awareness', false),
  ambientProactive: getStoredBool('aeio_ambient_proactive', false),
  setActiveTab: (activeTab) => set({ activeTab }),
  setActiveProvider: (activeProvider) => set({ activeProvider }),
  setOllamaModel: (ollamaModel) => set({ ollamaModel }),
  setActiveWindowAwareness: (enabled) => {
    try {
      localStorage.setItem('aeio_active_window_awareness', String(enabled));
    } catch {}
    set({ activeWindowAwareness: enabled });
  },
  setAmbientProactive: (enabled) => {
    try {
      localStorage.setItem('aeio_ambient_proactive', String(enabled));
    } catch {}
    set({ ambientProactive: enabled });
  },
}));
