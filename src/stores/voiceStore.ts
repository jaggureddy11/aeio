import { create } from 'zustand';
import { globalVoiceEngine } from '../lib/voice/voiceEngine';

export type VoiceHUDMode = 'agent' | 'dictation' | 'rewrite';

interface VoiceStoreState {
  isVoiceHUDOpen: boolean;
  activeMode: VoiceHUDMode;
  isDocked: boolean;
  wakeWordEnabled: boolean;
  openVoiceHUD: (mode?: VoiceHUDMode) => void;
  closeVoiceHUD: () => void;
  toggleVoiceHUD: (mode?: VoiceHUDMode) => void;
  setDocked: (docked: boolean) => void;
  setMode: (mode: VoiceHUDMode) => void;
  setWakeWordEnabled: (enabled: boolean) => void;
  toggleWakeWord: () => void;
}

export const useVoiceStore = create<VoiceStoreState>((set, get) => ({
  isVoiceHUDOpen: false,
  activeMode: 'agent',
  isDocked: false,
  wakeWordEnabled: false,
  openVoiceHUD: (mode) =>
    set((state) => ({
      isVoiceHUDOpen: true,
      activeMode: mode ?? state.activeMode,
    })),
  closeVoiceHUD: () => set({ isVoiceHUDOpen: false }),
  toggleVoiceHUD: (mode) =>
    set((state) => ({
      isVoiceHUDOpen: !state.isVoiceHUDOpen,
      activeMode: mode ?? state.activeMode,
    })),
  setDocked: (docked) => set({ isDocked: docked }),
  setMode: (mode) => set({ activeMode: mode }),
  setWakeWordEnabled: (enabled) => {
    if (enabled) {
      globalVoiceEngine.startWakeWordListener((_tail) => {
        const store = get();
        store.openVoiceHUD('agent');
      });
    } else {
      globalVoiceEngine.stopWakeWordListener();
    }
    set({ wakeWordEnabled: enabled });
  },
  toggleWakeWord: () => {
    const next = !get().wakeWordEnabled;
    get().setWakeWordEnabled(next);
  },
}));
