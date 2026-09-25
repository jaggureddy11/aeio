import { create } from 'zustand';

export type LLMProviderType = 'qwen-coder' | 'ollama' | 'claude' | 'openai';

export type ActiveTab = 'chat' | 'memory' | 'settings';

export interface SettingsState {
  activeTab: ActiveTab;
  activeProvider: LLMProviderType;
  ollamaModel: string;
  activeWindowAwareness: boolean;
  ambientProactive: boolean;
  hasCompletedOnboarding: boolean;
  hotkey: string;
  telemetryOptIn: boolean;
  neverSendMemoriesToCloud: boolean;
  setActiveTab: (tab: ActiveTab) => void;
  setActiveProvider: (provider: LLMProviderType) => void;
  setOllamaModel: (model: string) => void;
  setActiveWindowAwareness: (enabled: boolean) => void;
  setAmbientProactive: (enabled: boolean) => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
  setHotkey: (hotkey: string) => void;
  setTelemetryOptIn: (enabled: boolean) => void;
  setNeverSendMemoriesToCloud: (enabled: boolean) => void;
}

const getStoredBool = (key: string, defaultVal: boolean): boolean => {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val === 'true' : defaultVal;
  } catch {
    return defaultVal;
  }
};

const getStoredString = (key: string, defaultVal: string): string => {
  try {
    const val = localStorage.getItem(key);
    return val && val.trim() ? val.trim() : defaultVal;
  } catch {
    return defaultVal;
  }
};

export const useSettingsStore = create<SettingsState>((set) => ({
  activeTab: 'chat',
  activeProvider: 'qwen-coder',
  ollamaModel: 'qwen3-coder',
  activeWindowAwareness: getStoredBool('aeio_active_window_awareness', false),
  ambientProactive: getStoredBool('aeio_ambient_proactive', false),
  hasCompletedOnboarding: getStoredBool('aeio_first_run_completed', false),
  hotkey: getStoredString('aeio_global_hotkey', 'CommandOrControl+Shift+Space'),
  telemetryOptIn: getStoredBool('aeio_telemetry_opt_in', false),
  neverSendMemoriesToCloud: getStoredBool('aeio_never_send_memories_to_cloud', false),
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
  setHasCompletedOnboarding: (completed: boolean) => {
    try {
      localStorage.setItem('aeio_first_run_completed', String(completed));
    } catch {}
    set({ hasCompletedOnboarding: completed });
  },
  setHotkey: (hotkey: string) => {
    const clean = hotkey.trim() || 'CommandOrControl+Shift+Space';
    try {
      localStorage.setItem('aeio_global_hotkey', clean);
    } catch {}
    set({ hotkey: clean });
  },
  setTelemetryOptIn: (enabled: boolean) => {
    try {
      localStorage.setItem('aeio_telemetry_opt_in', String(enabled));
    } catch {}
    set({ telemetryOptIn: enabled });
  },
  setNeverSendMemoriesToCloud: (enabled: boolean) => {
    try {
      localStorage.setItem('aeio_never_send_memories_to_cloud', String(enabled));
    } catch {}
    set({ neverSendMemoriesToCloud: enabled });
  },
}));

