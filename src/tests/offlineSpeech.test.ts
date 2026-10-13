import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSpeechEngineStatus,
  spotWakeWordInAudio,
  SpeechEngineStatus,
  WakeWordSpotResult,
} from '../lib/ipc';
import {
  globalVoiceEngine,
  spotWakeWordOffline,
  getOfflineSpeechStatus,
} from '../lib/voice/voiceEngine';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('Offline Speech Recognition & Keyword Spotting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries speech engine status from Rust backend', async () => {
    const mockStatus: SpeechEngineStatus = {
      whisperBinPath: '/usr/local/bin/whisper',
      ffmpegPath: '/usr/local/bin/ffmpeg',
      hasPythonWhisper: false,
      isOfflineCapable: true,
      defaultEngine: 'whisper_cli',
      supportedModels: ['tiny.en', 'base.en', 'small.en'],
    };

    (invoke as any).mockResolvedValueOnce(mockStatus);

    const status = await getSpeechEngineStatus();
    expect(invoke).toHaveBeenCalledWith('get_speech_engine_status');
    expect(status.isOfflineCapable).toBe(true);
    expect(status.defaultEngine).toBe('whisper_cli');
  });

  it('spots wake word and extracts command tail via Rust backend', async () => {
    const mockResult: WakeWordSpotResult = {
      detected: true,
      keyword: 'hey aeio',
      command: 'play jazz on spotify',
      confidence: 0.95,
      engineUsed: 'whisper',
      transcription: 'hey aeio play jazz on spotify',
    };

    (invoke as any).mockResolvedValueOnce(mockResult);

    const result = await spotWakeWordInAudio('dGVzdC1hdWRpby1ieXRlcw==', 'wav');
    expect(invoke).toHaveBeenCalledWith('spot_wake_word_in_audio', {
      audioBase64: 'dGVzdC1hdWRpby1ieXRlcw==',
      format: 'wav',
    });
    expect(result.detected).toBe(true);
    expect(result.command).toBe('play jazz on spotify');
  });

  it('dispatches to wakeWordListeners when spotWakeWordOffline detects keyword', async () => {
    const mockResult: WakeWordSpotResult = {
      detected: true,
      keyword: 'hey aeio',
      command: 'summarize open tabs',
      confidence: 0.95,
      engineUsed: 'offline_matcher',
      transcription: 'hey aeio summarize open tabs',
    };

    (invoke as any).mockResolvedValueOnce(mockResult);

    const listener = vi.fn();
    const unsub = globalVoiceEngine.onWakeWord(listener);

    const result = await spotWakeWordOffline('dGVzdC1ieXRlcw==');
    expect(result.detected).toBe(true);
    expect(listener).toHaveBeenCalledWith('summarize open tabs');

    unsub();
  });

  it('retrieves offline speech diagnostic status through voice engine helper', async () => {
    const mockStatus: SpeechEngineStatus = {
      whisperBinPath: null,
      ffmpegPath: '/usr/local/bin/ffmpeg',
      hasPythonWhisper: false,
      isOfflineCapable: false,
      defaultEngine: 'web_speech_or_vad',
      supportedModels: ['base.en'],
    };

    (invoke as any).mockResolvedValueOnce(mockStatus);

    const status = await getOfflineSpeechStatus();
    expect(status.defaultEngine).toBe('web_speech_or_vad');
  });
});
