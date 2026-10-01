import { create } from 'zustand';
import {
  validateBundleForAllowlist,
  setComputerControlEnabledIpc,
  addToAllowlistIpc,
  removeFromAllowlistIpc,
} from '../lib/safety/allowlist';
import { ControlOverlayState } from '../lib/types/actionIntent';

export type LLMProviderType = 'qwen-coder' | 'ollama' | 'claude' | 'openai' | 'gemini' | 'aeio-free';

export type ActiveTab = 'chat' | 'memory' | 'settings';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface SettingsState {
  activeTab: ActiveTab;
  activeProvider: LLMProviderType;
  theme: ThemeMode;
  ollamaModel: string;
  activeWindowAwareness: boolean;
  ambientProactive: boolean;
  hasCompletedOnboarding: boolean;
  hotkey: string;
  telemetryOptIn: boolean;
  neverSendMemoriesToCloud: boolean;
  installationId: string;
  hostedProxyUrl: string;
  setActiveTab: (tab: ActiveTab) => void;
  setActiveProvider: (provider: LLMProviderType) => void;
  setTheme: (theme: ThemeMode) => void;
  setOllamaModel: (model: string) => void;
  setActiveWindowAwareness: (enabled: boolean) => void;
  setAmbientProactive: (enabled: boolean) => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
  setHotkey: (hotkey: string) => void;
  setTelemetryOptIn: (enabled: boolean) => void;
  setNeverSendMemoriesToCloud: (enabled: boolean) => void;
  setHostedProxyUrl: (url: string) => void;
  computerControlEnabled: boolean;
  computerControlAllowlist: string[];
  setComputerControlEnabled: (enabled: boolean) => void;
  addToComputerControlAllowlist: (
    bundleId: string,
    confirmBrowser?: boolean
  ) => { success: boolean; error?: string; requiresBrowserConfirm?: boolean; warning?: string };
  removeFromComputerControlAllowlist: (bundleId: string) => void;
  killSwitchTripped: boolean;
  killSwitchReason: string | null;
  setKillSwitchTripped: (tripped: boolean, reason?: string) => void;
  resetKillSwitchAction: () => Promise<void>;
  overlayState: ControlOverlayState | null;
  setOverlayState: (state: ControlOverlayState | null) => void;
  showOverlayAction: (
    targetAppName: string,
    targetAppBundleId: string,
    declaredIntent: string,
    currentStep?: number,
    totalSteps?: number
  ) => Promise<ControlOverlayState>;
  hideOverlayAction: () => Promise<void>;
  updateOverlayAction: (updates: {
    targetAppName?: string;
    declaredIntent?: string;
    currentStep?: number;
    totalSteps?: number;
  }) => Promise<ControlOverlayState>;
  groundingEndpointUrl: string;
  groundingModelType: 'ui-tars' | 'qwen2-vl' | 'custom';
  setGroundingEndpointUrl: (url: string) => void;
  setGroundingModelType: (modelType: 'ui-tars' | 'qwen2-vl' | 'custom') => void;
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

const getStoredJson = <T>(key: string, defaultVal: T): T => {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : defaultVal;
  } catch {
    return defaultVal;
  }
};

const getOrGenerateInstallationId = (): string => {
  try {
    const existing = localStorage.getItem('aeio_installation_id');
    if (existing && existing.trim()) return existing.trim();
    const newId = crypto.randomUUID();
    localStorage.setItem('aeio_installation_id', newId);
    return newId;
  } catch {
    return 'anon-' + Math.random().toString(36).substring(2, 15);
  }
};

export const useSettingsStore = create<SettingsState>((set) => ({
  activeTab: 'chat',
  activeProvider: 'gemini',
  theme: (getStoredString('aeio_theme_mode', 'light') as ThemeMode) || 'light',
  ollamaModel: 'qwen3-coder',
  activeWindowAwareness: getStoredBool('aeio_active_window_awareness', false),
  ambientProactive: getStoredBool('aeio_ambient_proactive', false),
  hasCompletedOnboarding: getStoredBool('aeio_first_run_completed', false),
  hotkey: getStoredString('aeio_global_hotkey', 'CommandOrControl+Shift+Space'),
  telemetryOptIn: getStoredBool('aeio_telemetry_opt_in', false),
  neverSendMemoriesToCloud: getStoredBool('aeio_never_send_memories_to_cloud', false),
  installationId: getOrGenerateInstallationId(),
  hostedProxyUrl: getStoredString('aeio_hosted_proxy_url', 'https://aeio-free-proxy.aeio-free.workers.dev'),
  setActiveTab: (activeTab) => set({ activeTab }),
  setActiveProvider: (activeProvider) => set({ activeProvider }),
  setTheme: (theme: ThemeMode) => {
    try {
      localStorage.setItem('aeio_theme_mode', theme);
    } catch {}
    set({ theme });
  },
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
  setHostedProxyUrl: (url: string) => {
    const clean = url.trim() || 'https://proxy.aeio.internal';
    try {
      localStorage.setItem('aeio_hosted_proxy_url', clean);
    } catch {}
    set({ hostedProxyUrl: clean });
  },
  computerControlEnabled: getStoredBool('aeio_computer_control_enabled', false),
  computerControlAllowlist: getStoredJson<string[]>('aeio_computer_control_allowlist', []),
  setComputerControlEnabled: (enabled) => {
    try {
      localStorage.setItem('aeio_computer_control_enabled', String(enabled));
    } catch {}
    set({ computerControlEnabled: enabled });
    setComputerControlEnabledIpc(enabled).catch(() => {});
  },
  addToComputerControlAllowlist: (bundleId: string, confirmBrowser: boolean = false) => {
    const validation = validateBundleForAllowlist(bundleId);
    if (validation.type === 'Blocked') {
      return { success: false, error: validation.reason };
    }
    if (validation.type === 'RequiresBrowserWarning' && !confirmBrowser) {
      return { success: false, requiresBrowserConfirm: true, warning: validation.warning };
    }

    const clean = bundleId.trim().toLowerCase();
    set((state) => {
      if (state.computerControlAllowlist.includes(clean)) {
        return state;
      }
      const updated = [...state.computerControlAllowlist, clean];
      try {
        localStorage.setItem('aeio_computer_control_allowlist', JSON.stringify(updated));
      } catch {}
      return { computerControlAllowlist: updated };
    });

    addToAllowlistIpc(clean).catch(() => {});
    return { success: true };
  },
  removeFromComputerControlAllowlist: (bundleId: string) => {
    const clean = bundleId.trim().toLowerCase();
    set((state) => {
      const updated = state.computerControlAllowlist.filter((b) => b !== clean);
      try {
        localStorage.setItem('aeio_computer_control_allowlist', JSON.stringify(updated));
      } catch {}
      return { computerControlAllowlist: updated };
    });
    removeFromAllowlistIpc(clean).catch(() => {});
  },
  killSwitchTripped: false,
  killSwitchReason: null,
  setKillSwitchTripped: (tripped: boolean, reason?: string) => {
    set({
      killSwitchTripped: tripped,
      killSwitchReason: tripped ? reason || 'Escape held for >= 300ms' : null,
    });
  },
  resetKillSwitchAction: async () => {
    set({ killSwitchTripped: false, killSwitchReason: null });
    const { resetKillSwitch } = await import('../lib/safety/killSwitch');
    await resetKillSwitch();
  },
  overlayState: null,
  setOverlayState: (state) => set({ overlayState: state }),
  showOverlayAction: async (targetAppName, targetAppBundleId, declaredIntent, currentStep = 1, totalSteps = 1) => {
    const { showControlOverlay } = await import('../lib/safety/overlay');
    const state = await showControlOverlay(targetAppName, targetAppBundleId, declaredIntent, currentStep, totalSteps);
    set({ overlayState: state });
    return state;
  },
  hideOverlayAction: async () => {
    const { hideControlOverlay } = await import('../lib/safety/overlay');
    const state = await hideControlOverlay();
    set({ overlayState: state });
  },
  updateOverlayAction: async (updates) => {
    const { updateControlOverlay } = await import('../lib/safety/overlay');
    const state = await updateControlOverlay(updates);
    set({ overlayState: state });
    return state;
  },
  groundingEndpointUrl: getStoredString('aeio_grounding_endpoint_url', ''),
  groundingModelType: (getStoredString('aeio_grounding_model_type', 'ui-tars') as 'ui-tars' | 'qwen2-vl' | 'custom') || 'ui-tars',
  setGroundingEndpointUrl: (url: string) => {
    const clean = url.trim();
    try {
      localStorage.setItem('aeio_grounding_endpoint_url', clean);
    } catch {}
    set({ groundingEndpointUrl: clean });
  },
  setGroundingModelType: (modelType) => {
    try {
      localStorage.setItem('aeio_grounding_model_type', modelType);
    } catch {}
    set({ groundingModelType: modelType });
  },
}));


