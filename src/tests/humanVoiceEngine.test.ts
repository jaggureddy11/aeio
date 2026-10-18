import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HumanVoiceEngine,
  KOKORO_DEFAULT_VOICES,
} from '../lib/voice/humanVoiceEngine';
import * as ipc from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  speakText: vi.fn().mockResolvedValue({ success: true, message: 'Spoken', voiceUsed: 'Daniel' }),
  stopSpeaking: vi.fn().mockResolvedValue(undefined),
  hasApiKey: vi.fn().mockResolvedValue(false),
  getApiKey: vi.fn().mockResolvedValue(null),
}));

describe('HumanVoiceEngine - Voicebox & Kokoro-82M ElevenLabs Alternatives', () => {
  let engine: HumanVoiceEngine;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
    engine = new HumanVoiceEngine();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    engine.stop();
  });

  describe('Text Sanitization for Clean Vocalization', () => {
    it('strips code blocks from speech output to avoid reading raw code aloud', () => {
      const input = 'Here is the solution: ```python\nprint("hello world")\n``` It runs smoothly.';
      const sanitized = engine.sanitizeSpeechText(input);
      expect(sanitized).toBe('Here is the solution: It runs smoothly.');
      expect(sanitized).not.toContain('python');
      expect(sanitized).not.toContain('hello world');
    });

    it('strips XML tool call tags', () => {
      const input = 'Executing automation: <tool_call name="open_app">Spotify</tool_call> Ready.';
      const sanitized = engine.sanitizeSpeechText(input);
      expect(sanitized).toBe('Executing automation: Ready.');
    });

    it('converts markdown links to plain anchor text', () => {
      const input = 'Check out [Voicebox GitHub](https://github.com/jamiepine/voicebox) for details.';
      const sanitized = engine.sanitizeSpeechText(input);
      expect(sanitized).toBe('Check out Voicebox GitHub for details.');
      expect(sanitized).not.toContain('http');
    });

    it('removes markdown formatting symbols like asterisks and headers', () => {
      const input = '### **Summary**: _All_ systems are *operational*!';
      const sanitized = engine.sanitizeSpeechText(input);
      expect(sanitized).toBe('Summary: All systems are operational!');
    });
  });

  describe('Voice Catalog & Preset Management', () => {
    it('provides built-in studio human voices from Kokoro-82M', () => {
      const voices = engine.getVoices();
      expect(voices.length).toBeGreaterThanOrEqual(KOKORO_DEFAULT_VOICES.length);

      const heartVoice = voices.find((v) => v.id === 'af_heart');
      expect(heartVoice).toBeDefined();
      expect(heartVoice?.provider).toBe('kokoro');
      expect(heartVoice?.name).toContain('Heart');

      const adamVoice = voices.find((v) => v.id === 'am_adam');
      expect(adamVoice).toBeDefined();
      expect(adamVoice?.gender).toBe('male');
    });

    it('persists and updates settings including voice provider and speed', () => {
      engine.updateSettings({
        provider: 'kokoro',
        selectedVoiceId: 'af_bella',
        speed: 1.15,
      });

      const current = engine.getSettings();
      expect(current.provider).toBe('kokoro');
      expect(current.selectedVoiceId).toBe('af_bella');
      expect(current.speed).toBe(1.15);
    });
  });

  describe('Jamie Pine Voicebox Integration (Port 17493)', () => {
    it('probes Voicebox daemon status on 127.0.0.1:17493', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('17493/voices') || url.includes('17493/docs')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { id: 'custom-clone-1', name: 'Studio Clone 1', language: 'en-US' },
            ],
          });
        }
        return Promise.reject(new Error('Connection refused'));
      });

      const isOnline = await engine.probeVoicebox();
      expect(isOnline).toBe(true);

      const voices = engine.getVoices();
      expect(voices.some((v) => v.id === 'custom-clone-1')).toBe(true);
    });

    it('dispatches speech synthesis to Voicebox /speak endpoint when active', async () => {
      let requestedUrl = '';
      let requestBody: any = null;

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
        requestedUrl = url;
        if (init?.body) {
          requestBody = JSON.parse(init.body);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'playing' }),
        });
      });

      engine.updateSettings({ provider: 'voicebox', autoDetectLocal: false });

      const onEnd = vi.fn();
      const success = await engine.speak('Good morning, Mr. Stark.', { onEnd });

      expect(success).toBe(true);
      expect(requestedUrl).toContain('17493/speak');
      expect(requestBody.text).toBe('Good morning, Mr. Stark.');
      expect(onEnd).toHaveBeenCalled();
    });
  });

  describe('Kokoro-82M TTS Integration (Port 8880)', () => {
    it('dispatches OpenAI-compatible /v1/audio/speech payload when using Kokoro provider', async () => {
      let requestedUrl = '';
      let requestBody: any = null;

      // Mock probe and audio endpoint
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: any) => {
        requestedUrl = url;
        if (url.endsWith('/models') || url.endsWith('/health')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ data: [{ id: 'kokoro-82m' }] }),
          });
        }
        if (url.endsWith('/v1/audio/speech')) {
          if (init?.body) requestBody = JSON.parse(init.body);
          return Promise.resolve({
            ok: true,
            blob: async () => new Blob(['audio-data'], { type: 'audio/wav' }),
          });
        }
        return Promise.reject(new Error('Connection refused'));
      });

      engine.updateSettings({
        provider: 'kokoro',
        selectedVoiceId: 'af_heart',
        speed: 1.0,
        autoDetectLocal: false,
      });

      // Mock audio playback
      const onEnd = vi.fn();
      const success = await engine.speak('Autonomous systems active and standing by.', { onEnd });

      expect(success).toBe(true);
      expect(requestedUrl).toContain('8880/v1/audio/speech');
      expect(requestBody.voice).toBe('af_heart');
      expect(requestBody.input).toBe('Autonomous systems active and standing by.');
    });
  });

  describe('Native OS Speech Fallback Guarantee', () => {
    it('gracefully falls back to native desktop TTS when local daemons are offline', async () => {
      // Simulate both Voicebox and Kokoro being offline
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      engine.updateSettings({
        provider: 'voicebox',
        autoDetectLocal: true,
        speed: 1.0,
      });

      const onEnd = vi.fn();
      const success = await engine.speak('Voicebox is offline, routing to native speech.', { onEnd });

      expect(success).toBe(true);
      expect(ipc.speakText).toHaveBeenCalledWith(
        'Voicebox is offline, routing to native speech.',
        undefined,
        175
      );
      expect(onEnd).toHaveBeenCalled();
    });
  });
});
