import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cleanSpokenTranscriptHeuristic,
  polishSpokenText,
  executeDictation,
} from '../lib/voice/dictationEngine';
import {
  rewriteSelectedText,
  executeInPlaceRewrite,
} from '../lib/voice/editSelectionEngine';
import * as ipc from '../lib/ipc';
import * as orchestrator from '../lib/providers/orchestrator';

vi.mock('../lib/ipc', () => ({
  injectTextToActiveApp: vi.fn().mockResolvedValue({ success: true, message: 'Text injected' }),
  captureSelectedTextFromActiveApp: vi.fn().mockResolvedValue('Original unformatted text here'),
  playSystemEarcon: vi.fn().mockResolvedValue(undefined),
  speakText: vi.fn().mockResolvedValue({ success: true, message: 'Spoken' }),
  stopSpeaking: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/providers/orchestrator', () => ({
  orchestrateChat: vi.fn().mockResolvedValue({
    content: 'Clean polished text output.',
    providerId: 'ollama',
    modelName: 'qwen2.5:7b',
    isLocal: true,
    taskType: 'conversational',
  }),
}));

describe('VoiceOS - Dictation Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cleans spoken transcripts with regex heuristics offline', () => {
    const raw = 'um hello uh can you like you know meet at three';
    const cleaned = cleanSpokenTranscriptHeuristic(raw);
    expect(cleaned).toBe('Hello can you meet at three.');
    expect(cleaned).not.toContain('um');
    expect(cleaned).not.toContain('uh');
  });

  it('polishes spoken text using orchestrator with strict prompt', async () => {
    const res = await polishSpokenText('um we need to ship the release by friday uh 5pm', 'standard');
    expect(orchestrator.orchestrateChat).toHaveBeenCalled();
    expect(res).toBe('Clean polished text output.');
  });

  it('executes dictation and automatically injects into active app', async () => {
    const result = await executeDictation('Hey team, meeting at 3pm today', {
      polishWithAI: true,
      autoInject: true,
    });

    expect(result.success).toBe(true);
    expect(result.injected).toBe(true);
    expect(ipc.injectTextToActiveApp).toHaveBeenCalledWith('Clean polished text output.');
  });

  it('handles empty transcript gracefully', async () => {
    const result = await executeDictation('   ');
    expect(result.success).toBe(false);
    expect(result.injected).toBe(false);
    expect(ipc.injectTextToActiveApp).not.toHaveBeenCalled();
  });
});

describe('VoiceOS - In-Place Selection Rewriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prompts orchestrator to rewrite selected text with voice instruction', async () => {
    const res = await rewriteSelectedText(
      'This is messy text that needs formatting.',
      'make it bullet points'
    );

    expect(orchestrator.orchestrateChat).toHaveBeenCalled();
    expect(res).toBe('Clean polished text output.');
  });

  it('executes end-to-end selection capture and replacement in active app', async () => {
    const result = await executeInPlaceRewrite('make it concise and professional');

    expect(result.success).toBe(true);
    expect(ipc.captureSelectedTextFromActiveApp).toHaveBeenCalled();
    expect(orchestrator.orchestrateChat).toHaveBeenCalled();
    expect(ipc.injectTextToActiveApp).toHaveBeenCalledWith('Clean polished text output.');
  });

  it('aborts safely if no text is highlighted in active app', async () => {
    vi.mocked(ipc.captureSelectedTextFromActiveApp).mockResolvedValueOnce('');

    const result = await executeInPlaceRewrite('translate to French');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No text is selected');
    expect(orchestrator.orchestrateChat).not.toHaveBeenCalled();
  });
});

describe('VoiceOS - VoiceStore Mode Switching', () => {
  it('switches between agent, dictation, and rewrite modes accurately', async () => {
    const { useVoiceStore } = await import('../stores/voiceStore');

    useVoiceStore.getState().closeVoiceHUD();
    expect(useVoiceStore.getState().isVoiceHUDOpen).toBe(false);

    // Open in dictation mode directly (via Cmd+Shift+D)
    useVoiceStore.getState().openVoiceHUD('dictation');
    expect(useVoiceStore.getState().isVoiceHUDOpen).toBe(true);
    expect(useVoiceStore.getState().activeMode).toBe('dictation');

    // Toggle to rewrite mode (via Cmd+Shift+E)
    useVoiceStore.getState().toggleVoiceHUD('rewrite');
    expect(useVoiceStore.getState().isVoiceHUDOpen).toBe(false);

    useVoiceStore.getState().openVoiceHUD('rewrite');
    expect(useVoiceStore.getState().isVoiceHUDOpen).toBe(true);
    expect(useVoiceStore.getState().activeMode).toBe('rewrite');

    // Switch mode
    useVoiceStore.getState().setMode('agent');
    expect(useVoiceStore.getState().activeMode).toBe('agent');
  });
});
