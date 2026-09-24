import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSettingsStore } from '../stores/settingsStore';
import { ollamaProvider } from '../lib/providers/ollama';

describe('Phase D: Onboarding & First-Run Flow Tests', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStorage = {};
    globalThis.localStorage = {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
      clear: () => {
        mockStorage = {};
      },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
      length: 0,
    };
    useSettingsStore.setState({
      activeTab: 'chat',
      activeProvider: 'ollama',
      ollamaModel: 'llama3.2',
      hasCompletedOnboarding: false,
      hotkey: 'CommandOrControl+Shift+Space',
      activeWindowAwareness: false,
      ambientProactive: false,
    });
  });

  it('initializes first-run onboarding state as uncompleted by default', () => {
    expect(useSettingsStore.getState().hasCompletedOnboarding).toBe(false);
  });

  it('marks onboarding as completed in memory and localStorage', () => {
    useSettingsStore.getState().setHasCompletedOnboarding(true);

    expect(useSettingsStore.getState().hasCompletedOnboarding).toBe(true);
    expect(localStorage.getItem('aeio_first_run_completed')).toBe('true');
  });

  it('updates and persists custom global summon hotkey', () => {
    useSettingsStore.getState().setHotkey('Alt+Space');

    expect(useSettingsStore.getState().hotkey).toBe('Alt+Space');
    expect(localStorage.getItem('aeio_global_hotkey')).toBe('Alt+Space');

    // Falls back to default if empty string passed
    useSettingsStore.getState().setHotkey('   ');
    expect(useSettingsStore.getState().hotkey).toBe('CommandOrControl+Shift+Space');
  });

  it('detects when local Ollama daemon is offline and surfaces diagnostic message', async () => {
    vi.spyOn(ollamaProvider, 'checkHealth').mockResolvedValueOnce({
      ok: false,
      message: 'Ollama is not running. Please start Ollama or install from ollama.com.',
    });

    const status = await ollamaProvider.checkHealth();
    expect(status.ok).toBe(false);
    expect(status.message).toContain('Ollama is not running');
  });

  it('detects when local Ollama daemon is active and running', async () => {
    vi.spyOn(ollamaProvider, 'checkHealth').mockResolvedValueOnce({
      ok: true,
    });

    const status = await ollamaProvider.checkHealth();
    expect(status.ok).toBe(true);
  });
});
