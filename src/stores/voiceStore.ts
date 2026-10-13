import { create } from 'zustand';

export type VoiceHUDMode = 'agent' | 'dictation' | 'rewrite';

interface VoiceStoreState {
  isVoiceHUDOpen: boolean;
  activeMode: VoiceHUDMode;
  isDocked: boolean;
  openVoiceHUD: (mode?: VoiceHUDMode) => void;
  closeVoiceHUD: () => void;
  toggleVoiceHUD: (mode?: VoiceHUDMode) => void;
  setDocked: (docked: boolean) => void;
  setMode: (mode: VoiceHUDMode) => void;
}

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  isVoiceHUDOpen: false,
  activeMode: 'agent',
  isDocked: false,
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
}));
