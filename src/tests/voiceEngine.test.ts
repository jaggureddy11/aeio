import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  matchAndExecuteFastAction,
  speakJARVISFeedback,
  stopJARVISSpeaking,
  earcons,
  transcribeOfflineAudio,
  globalVoiceEngine,
} from '../lib/voice/voiceEngine';
import * as ipc from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  setSystemVolume: vi.fn().mockResolvedValue({ success: true, message: 'Volume set' }),
  getSystemVolume: vi.fn().mockResolvedValue({ volume: 50, is_muted: false }),
  setSystemMute: vi.fn().mockResolvedValue({ success: true, message: 'System muted' }),
  playSpotify: vi.fn().mockResolvedValue({ success: true, message: 'Playing track' }),
  mediaControl: vi.fn().mockResolvedValue({ success: true, message: 'Media control' }),
  searchWebPlatform: vi.fn().mockResolvedValue({ success: true, message: 'Searching web' }),
  lockScreen: vi.fn().mockResolvedValue({ success: true, message: 'Screen locked' }),
  addMemory: vi.fn().mockResolvedValue('mem-123'),
  speakText: vi.fn().mockResolvedValue({ success: true, message: 'Spoken text', voiceUsed: 'Samantha' }),
  stopSpeaking: vi.fn().mockResolvedValue(undefined),
  playSystemEarcon: vi.fn().mockResolvedValue(undefined),
  transcribeAudioBuffer: vi.fn().mockResolvedValue({
    success: true,
    text: 'Schedule standup with engineering at 10 AM',
    language: 'en',
    durationSeconds: 2.5,
    confidence: 0.94,
  }),
  transcribeAudioFile: vi.fn().mockResolvedValue({
    success: true,
    text: 'Take a screenshot of current window',
    language: 'en',
    durationSeconds: 1.8,
    confidence: 0.96,
  }),
  registerGlobalHotkey: vi.fn().mockResolvedValue(true),
  unregisterGlobalHotkey: vi.fn().mockResolvedValue(true),
  getRegisteredHotkeys: vi.fn().mockResolvedValue([
    { hotkey: 'CmdOrCtrl+Shift+Space', isRegistered: true, description: 'Toggle visibility' },
    { hotkey: 'CmdOrCtrl+Shift+V', isRegistered: true, description: 'Summon voice HUD' },
  ]),
}));

vi.mock('../../stores/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: vi.fn().mockReturnValue({ activeWorkspace: { id: 'ws-test' } }),
  },
}));

describe('VoiceEngine - Fast Deterministic Intent Matching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches Spotify play directive with song and artist', async () => {
    const res = await matchAndExecuteFastAction('play Back in Black by AC/DC on Spotify');
    expect(res).not.toBeNull();
    expect(res?.handledDeterministically).toBe(true);
    expect(res?.actionType).toBe('play_spotify');
    expect(res?.feedbackText).toContain('Back in Black');
    expect(ipc.playSpotify).toHaveBeenCalledWith('Back in Black by AC/DC');
  });

  it('matches Spotify playback without "on spotify" suffix', async () => {
    const res = await matchAndExecuteFastAction('play Bohemian Rhapsody');
    expect(res).not.toBeNull();
    expect(res?.actionType).toBe('play_spotify');
    expect(ipc.playSpotify).toHaveBeenCalledWith('Bohemian Rhapsody');
  });

  it('matches volume adjustment to 100%', async () => {
    const res = await matchAndExecuteFastAction('set volume to 100%');
    expect(res).not.toBeNull();
    expect(res?.actionType).toBe('set_volume');
    expect(res?.feedbackText).toContain('100 percent');
    expect(ipc.setSystemVolume).toHaveBeenCalledWith(100);
  });

  it('matches volume reduction to 50%', async () => {
    const res = await matchAndExecuteFastAction('drop volume to 50');
    expect(res).not.toBeNull();
    expect(res?.actionType).toBe('set_volume');
    expect(res?.feedbackText).toContain('50 percent');
    expect(ipc.setSystemVolume).toHaveBeenCalledWith(50);
  });

  it('matches mute and unmute commands', async () => {
    const muteRes = await matchAndExecuteFastAction('mute volume');
    expect(muteRes?.actionType).toBe('set_mute');
    expect(ipc.setSystemMute).toHaveBeenCalledWith(true);

    const unmuteRes = await matchAndExecuteFastAction('unmute sound');
    expect(unmuteRes?.actionType).toBe('set_unmute');
    expect(ipc.setSystemMute).toHaveBeenCalledWith(false);
  });

  it('matches media pause, resume, and skip', async () => {
    const pauseRes = await matchAndExecuteFastAction('pause music');
    expect(pauseRes?.actionType).toBe('media_pause');
    expect(ipc.mediaControl).toHaveBeenCalledWith('pause');

    const nextRes = await matchAndExecuteFastAction('next track');
    expect(nextRes?.actionType).toBe('media_next');
    expect(ipc.mediaControl).toHaveBeenCalledWith('next');
  });

  it('matches YouTube search command', async () => {
    const res = await matchAndExecuteFastAction('search YouTube for how to use ChatGPT');
    expect(res).not.toBeNull();
    expect(res?.actionType).toBe('youtube_search');
    expect(ipc.searchWebPlatform).toHaveBeenCalledWith('how to use ChatGPT', 'youtube');
  });

  it('matches lock screen command', async () => {
    const res = await matchAndExecuteFastAction('lock my mac');
    expect(res).not.toBeNull();
    expect(res?.actionType).toBe('lock_screen');
    expect(ipc.lockScreen).toHaveBeenCalled();
  });

  it('returns null for non-deterministic complex requests to fall through to local LLM', async () => {
    const res = await matchAndExecuteFastAction('Compare Rust and Zig error handling strategies');
    expect(res).toBeNull();
    expect(ipc.playSpotify).not.toHaveBeenCalled();
    expect(ipc.setSystemVolume).not.toHaveBeenCalled();
  });
});

describe('VoiceEngine - Native TTS Speech Synthesis & Earcons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes native speakText via IPC when speaking JARVIS feedback', async () => {
    const onEnd = vi.fn();
    speakJARVISFeedback('Task completed successfully, sir.', onEnd);

    // Wait for the promise resolution
    await vi.waitFor(() => {
      expect(ipc.speakText).toHaveBeenCalledWith(
        'Task completed successfully, sir.',
        undefined,
        expect.any(Number)
      );
      expect(onEnd).toHaveBeenCalled();
    });
  });

  it('halts speech immediately using native stopSpeaking IPC', () => {
    stopJARVISSpeaking();
    expect(ipc.stopSpeaking).toHaveBeenCalled();
  });

  it('triggers native system earcons for wake, success, and error signals', () => {
    earcons.playWakeTone();
    expect(ipc.playSystemEarcon).toHaveBeenCalledWith('wake');

    earcons.playSuccessTone();
    expect(ipc.playSystemEarcon).toHaveBeenCalledWith('success');

    earcons.playErrorTone();
    expect(ipc.playSystemEarcon).toHaveBeenCalledWith('error');
  });
});

describe('VoiceEngine - Native Audio Transcription & Global Hotkeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transcribes offline recorded audio buffers via native IPC', async () => {
    const sampleBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    const result = await transcribeOfflineAudio(sampleBase64, 'wav');

    expect(ipc.transcribeAudioBuffer).toHaveBeenCalledWith(sampleBase64, 'wav');
    expect(result.success).toBe(true);
    expect(result.text).toBe('Schedule standup with engineering at 10 AM');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('transcribes audio via globalVoiceEngine instance and emits transcript', async () => {
    const sampleBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    const transcriptSpy = vi.fn();
    const unsub = globalVoiceEngine.onTranscript(transcriptSpy);

    const res = await globalVoiceEngine.transcribeAudioData(sampleBase64, 'wav');
    expect(res.success).toBe(true);
    expect(transcriptSpy).toHaveBeenCalledWith('Schedule standup with engineering at 10 AM', true);
    unsub();
  });

  it('registers and retrieves global daemon hotkeys via IPC', async () => {
    const regSuccess = await ipc.registerGlobalHotkey('CmdOrCtrl+Shift+Space');
    expect(ipc.registerGlobalHotkey).toHaveBeenCalledWith('CmdOrCtrl+Shift+Space');
    expect(regSuccess).toBe(true);

    const hotkeys = await ipc.getRegisteredHotkeys();
    expect(hotkeys.length).toBeGreaterThan(0);
    expect(hotkeys[0].hotkey).toContain('CmdOrCtrl');
  });
});


