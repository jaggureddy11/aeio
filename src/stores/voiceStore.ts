import { create } from 'zustand';
import { globalVoiceEngine } from '../lib/voice/voiceEngine';
import { ambientWakeWordEngine } from '../lib/voice/ambientWakeWord';

export type VoiceHUDMode = 'agent' | 'dictation' | 'rewrite';

export interface VoiceStoreState {
  isVoiceHUDOpen: boolean;
  activeMode: VoiceHUDMode;
  isDocked: boolean;
  wakeWordEnabled: boolean;
  pendingVoiceCommand: string | null;
  vadEnergy: number;
  vadSpeaking: boolean;
  openVoiceHUD: (mode?: VoiceHUDMode, initialCommand?: string) => void;
  closeVoiceHUD: () => void;
  toggleVoiceHUD: (mode?: VoiceHUDMode) => void;
  setDocked: (docked: boolean) => void;
  setMode: (mode: VoiceHUDMode) => void;
  setWakeWordEnabled: (enabled: boolean) => void;
  toggleWakeWord: () => void;
  consumePendingCommand: () => string | null;
  setVadState: (energy: number, isSpeaking: boolean) => void;
}

export const useVoiceStore = create<VoiceStoreState>((set, get) => ({
  isVoiceHUDOpen: false,
  activeMode: 'agent',
  isDocked: false,
  wakeWordEnabled: false,
  pendingVoiceCommand: null,
  vadEnergy: 0,
  vadSpeaking: false,

  openVoiceHUD: (mode, initialCommand) =>
    set((state) => ({
      isVoiceHUDOpen: true,
      activeMode: mode ?? state.activeMode,
      pendingVoiceCommand: initialCommand ?? null,
    })),

  closeVoiceHUD: () =>
    set({
      isVoiceHUDOpen: false,
      pendingVoiceCommand: null,
    }),

  toggleVoiceHUD: (mode) =>
    set((state) => ({
      isVoiceHUDOpen: !state.isVoiceHUDOpen,
      activeMode: mode ?? state.activeMode,
      pendingVoiceCommand: null,
    })),

  setDocked: (docked) => set({ isDocked: docked }),
  setMode: (mode) => set({ activeMode: mode }),

  consumePendingCommand: () => {
    const cmd = get().pendingVoiceCommand;
    if (cmd) {
      set({ pendingVoiceCommand: null });
    }
    return cmd;
  },

  setVadState: (energy, isSpeaking) =>
    set({ vadEnergy: energy, vadSpeaking: isSpeaking }),

  setWakeWordEnabled: (enabled) => {
    if (enabled) {
      ambientWakeWordEngine
        .start((event) => {
          const tail = event.command?.trim() || null;
          get().openVoiceHUD('agent', tail || undefined);
        })
        .catch(() => {});

      ambientWakeWordEngine.onEnergy((energyEvent) => {
        set({
          vadEnergy: energyEvent.rms,
          vadSpeaking: energyEvent.isSpeaking,
        });
      });

      globalVoiceEngine.startWakeWordListener((tail) => {
        const cmd = tail?.trim() || null;
        get().openVoiceHUD('agent', cmd || undefined);
      });
    } else {
      ambientWakeWordEngine.stop();
      globalVoiceEngine.stopWakeWordListener();
      set({ vadEnergy: 0, vadSpeaking: false });
    }
    set({ wakeWordEnabled: enabled });
  },

  toggleWakeWord: () => {
    const next = !get().wakeWordEnabled;
    get().setWakeWordEnabled(next);
  },
}));
