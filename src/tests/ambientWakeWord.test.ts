import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AmbientWakeWordEngine,
  encodeFloat32ToWav,
  WakeWordEvent,
} from '../lib/voice/ambientWakeWord';
import * as ipc from '../lib/ipc';
import { useVoiceStore } from '../stores/voiceStore';

describe('Ambient Wake-Word Engine ("Hey Aeio")', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    useVoiceStore.getState().setWakeWordEnabled(false);
  });

  describe('WAV Audio Encoding (encodeFloat32ToWav)', () => {
    it('encodes Float32Array PCM samples into standard 16-bit mono RIFF/WAV base64', () => {
      // 100 samples of a simple sine/triangle wave
      const samples = new Float32Array(100);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin((i / 100) * Math.PI * 2);
      }

      const wavBase64 = encodeFloat32ToWav(samples, 16000);
      expect(typeof wavBase64).toBe('string');
      expect(wavBase64.length).toBeGreaterThan(50);

      // Decode base64 to check header
      const binary = atob(wavBase64);
      expect(binary.slice(0, 4)).toBe('RIFF');
      expect(binary.slice(8, 12)).toBe('WAVE');
      expect(binary.slice(12, 16)).toBe('fmt ');
      expect(binary.slice(36, 40)).toBe('data');
    });

    it('handles clipping and zero sample edge cases properly', () => {
      const samples = new Float32Array([1.5, -1.5, 0.0, 0.5, -0.5]);
      const wavBase64 = encodeFloat32ToWav(samples, 16000);
      const binary = atob(wavBase64);

      expect(binary.slice(0, 4)).toBe('RIFF');
      // 44 header bytes + 5 samples * 2 bytes = 54 bytes
      expect(binary.length).toBe(54);
    });
  });

  describe('Engine Lifecycle & Sensitivity', () => {
    it('initializes in inactive state and allows sensitivity calibration', () => {
      const engine = new AmbientWakeWordEngine();
      expect(engine.isActive()).toBe(false);

      expect(engine.getSensitivity()).toBe('medium');
      engine.setSensitivity('high');
      expect(engine.getSensitivity()).toBe('high');
      engine.setSensitivity('low');
      expect(engine.getSensitivity()).toBe('low');
    });

    it('stops cleanly and unsubscribes listeners', () => {
      const engine = new AmbientWakeWordEngine();
      const mockCb = vi.fn();
      const unsub = engine.onWakeWord(mockCb);

      engine.stop();
      expect(engine.isActive()).toBe(false);

      unsub();
    });
  });

  describe('Wake-Word Event Dispatching & Debounce', () => {
    it('dispatches wake events with command tail to registered listeners', () => {
      const engine = new AmbientWakeWordEngine();
      const received: WakeWordEvent[] = [];

      engine.onWakeWord((evt) => {
        received.push(evt);
      });

      // Invoke internal emitWake via prototype or event trigger
      (engine as any).emitWake({
        keyword: 'hey aeio',
        command: 'play bohemian rhapsody on spotify',
        confidence: 0.98,
        timestamp: Date.now(),
        engine: 'vad_offline',
      });

      expect(received.length).toBe(1);
      expect(received[0].keyword).toBe('hey aeio');
      expect(received[0].command).toBe('play bohemian rhapsody on spotify');
      expect(received[0].engine).toBe('vad_offline');
    });

    it('debounces rapid double triggers within cooldown window', () => {
      const engine = new AmbientWakeWordEngine();
      const received: WakeWordEvent[] = [];

      engine.onWakeWord((evt) => {
        received.push(evt);
      });

      const now = Date.now();
      (engine as any).emitWake({
        keyword: 'hey aeio',
        command: 'turn volume up',
        confidence: 0.95,
        timestamp: now,
        engine: 'web_speech',
      });

      // Immediate second trigger attempt (e.g. echo or acoustic bounce)
      (engine as any).emitWake({
        keyword: 'hey aeio',
        command: 'turn volume up',
        confidence: 0.95,
        timestamp: now + 50,
        engine: 'web_speech',
      });

      // Only the first trigger should fire
      expect(received.length).toBe(1);
    });
  });

  describe('voiceStore Hands-Free Wake-Word Coordination', () => {
    it('sets wakeWordEnabled and handles wake-word trigger with command tail', async () => {
      vi.spyOn(ipc, 'spotWakeWordInAudio').mockResolvedValue({
        detected: true,
        keyword: 'hey aeio',
        command: 'what am I looking at right now',
        confidence: 0.98,
        engineUsed: 'offline_matcher',
        transcription: 'hey aeio what am I looking at right now',
      });

      useVoiceStore.getState().closeVoiceHUD();
      expect(useVoiceStore.getState().isVoiceHUDOpen).toBe(false);
      expect(useVoiceStore.getState().pendingVoiceCommand).toBeNull();

      useVoiceStore.getState().setWakeWordEnabled(true);
      expect(useVoiceStore.getState().wakeWordEnabled).toBe(true);

      // Simulate wake event with command tail
      useVoiceStore.getState().openVoiceHUD('agent', 'what am I looking at right now');

      expect(useVoiceStore.getState().isVoiceHUDOpen).toBe(true);
      expect(useVoiceStore.getState().pendingVoiceCommand).toBe('what am I looking at right now');

      // Consume pending command for execution
      const consumed = useVoiceStore.getState().consumePendingCommand();
      expect(consumed).toBe('what am I looking at right now');
      expect(useVoiceStore.getState().pendingVoiceCommand).toBeNull();
    });

    it('toggles wakeWordEnabled state cleanly', () => {
      useVoiceStore.getState().setWakeWordEnabled(false);
      expect(useVoiceStore.getState().wakeWordEnabled).toBe(false);

      useVoiceStore.getState().toggleWakeWord();
      expect(useVoiceStore.getState().wakeWordEnabled).toBe(true);

      useVoiceStore.getState().toggleWakeWord();
      expect(useVoiceStore.getState().wakeWordEnabled).toBe(false);
    });

    it('tracks VAD energy and speech state in store', () => {
      useVoiceStore.getState().setVadState(0.045, true);
      expect(useVoiceStore.getState().vadEnergy).toBe(0.045);
      expect(useVoiceStore.getState().vadSpeaking).toBe(true);

      useVoiceStore.getState().setVadState(0.005, false);
      expect(useVoiceStore.getState().vadEnergy).toBe(0.005);
      expect(useVoiceStore.getState().vadSpeaking).toBe(false);
    });
  });
});
