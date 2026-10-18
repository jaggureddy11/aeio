/**
 * Human Voice Engine for Aeio
 * Integrates open-source ElevenLabs alternatives:
 * 1. Jamie Pine's Voicebox (https://github.com/jamiepine/voicebox) - Local-first voice studio & zero-shot cloning on port 17493
 * 2. Kokoro-82M TTS (https://github.com/hexgrad/kokoro) - Open-weight neural TTS on port 8880 / local ONNX
 * 3. ElevenLabs Cloud (BYOK) - Optional cloud fallback with user API key
 * 4. Native OS Fallback - macOS `say` / Windows SAPI fallback
 */

import { speakText, stopSpeaking as stopNativeSpeaking, hasApiKey, getApiKey } from '../ipc';

export type HumanVoiceProvider = 'voicebox' | 'kokoro' | 'elevenlabs' | 'system';

export interface HumanVoiceProfile {
  id: string;
  name: string;
  provider: HumanVoiceProvider;
  gender?: 'female' | 'male' | 'neutral';
  language?: string;
  description?: string;
  previewUrl?: string;
  isCloned?: boolean;
}

export interface HumanVoiceSettings {
  provider: HumanVoiceProvider;
  selectedVoiceId: string;
  speed: number;
  voiceboxUrl: string;
  kokoroUrl: string;
  autoDetectLocal: boolean;
}

// Built-in high-fidelity human voice presets from Kokoro-82M & Voicebox
export const KOKORO_DEFAULT_VOICES: HumanVoiceProfile[] = [
  {
    id: 'af_heart',
    name: 'Heart (Warm & Expressive)',
    provider: 'kokoro',
    gender: 'female',
    language: 'en-US',
    description: 'Hyper-realistic warm American female voice (comparable to ElevenLabs Rachel)',
  },
  {
    id: 'af_bella',
    name: 'Bella (Soft & Natural)',
    provider: 'kokoro',
    gender: 'female',
    language: 'en-US',
    description: 'Gentle, expressive conversational female tone',
  },
  {
    id: 'af_nicole',
    name: 'Nicole (Crisp & Professional)',
    provider: 'kokoro',
    gender: 'female',
    language: 'en-US',
    description: 'Clear, articulate American female voice ideal for assistant directives',
  },
  {
    id: 'am_adam',
    name: 'Adam (Natural & Calm)',
    provider: 'kokoro',
    gender: 'male',
    language: 'en-US',
    description: 'Balanced, conversational American male voice',
  },
  {
    id: 'am_michael',
    name: 'Michael (Authoritative & Deep)',
    provider: 'kokoro',
    gender: 'male',
    language: 'en-US',
    description: 'Deep, resonant male voice with executive clarity',
  },
  {
    id: 'bf_emma',
    name: 'Emma (British Elegant)',
    provider: 'kokoro',
    gender: 'female',
    language: 'en-GB',
    description: 'Sophisticated, articulate British female voice',
  },
  {
    id: 'bm_george',
    name: 'George (British Sophisticated)',
    provider: 'kokoro',
    gender: 'male',
    language: 'en-GB',
    description: 'Refined British male voice (JARVIS tone)',
  },
];

const DEFAULT_SETTINGS: HumanVoiceSettings = {
  provider: 'voicebox',
  selectedVoiceId: 'af_heart',
  speed: 1.0,
  voiceboxUrl: 'http://127.0.0.1:17493',
  kokoroUrl: 'http://127.0.0.1:8880',
  autoDetectLocal: true,
};

export class HumanVoiceEngine {
  private settings: HumanVoiceSettings;
  private isSpeaking = false;
  private currentAudioElement: HTMLAudioElement | null = null;
  private activeAbortController: AbortController | null = null;
  private cachedVoiceboxVoices: HumanVoiceProfile[] = [];
  private lastVoiceboxCheck = 0;
  private isVoiceboxOnline = false;
  private isKokoroOnline = false;

  public getIsVoiceboxOnline(): boolean {
    return this.isVoiceboxOnline;
  }

  public getIsKokoroOnline(): boolean {
    return this.isKokoroOnline;
  }

  constructor() {
    this.settings = this.loadSettings();
  }

  private loadSettings(): HumanVoiceSettings {
    try {
      const stored = localStorage.getItem('aeio_human_voice_settings');
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // Fallback
    }
    return { ...DEFAULT_SETTINGS };
  }

  public saveSettings(newSettings: Partial<HumanVoiceSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem('aeio_human_voice_settings', JSON.stringify(this.settings));
    } catch {
      // Ignore
    }
  }

  public getSettings(): HumanVoiceSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<HumanVoiceSettings>): void {
    this.saveSettings(newSettings);
  }

  public getVoices(): HumanVoiceProfile[] {
    return [...this.cachedVoiceboxVoices, ...KOKORO_DEFAULT_VOICES];
  }

  /**
   * Probes local Voicebox (jamiepine/voicebox) daemon on port 17493.
   */
  public async probeVoicebox(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 800);
      let res = await fetch(`${this.settings.voiceboxUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch(`${this.settings.voiceboxUrl}/docs`, {
          method: 'GET',
          signal: controller.signal,
        }).catch(() => null);
      }

      if (!res || !res.ok) {
        res = await fetch(`${this.settings.voiceboxUrl}/profiles`, {
          method: 'GET',
          signal: controller.signal,
        }).catch(() => null);
      }

      if (!res || !res.ok) {
        res = await fetch(`${this.settings.voiceboxUrl}/voices`, {
          method: 'GET',
          signal: controller.signal,
        }).catch(() => null);
      }

      clearTimeout(timeoutId);
      this.isVoiceboxOnline = !!res && res.ok;
      if (this.isVoiceboxOnline && this.cachedVoiceboxVoices.length === 0) {
        await this.fetchVoiceboxVoices().catch(() => []);
      }
      return this.isVoiceboxOnline;
    } catch {
      this.isVoiceboxOnline = false;
      return false;
    }
  }

  /**
   * Probes local Kokoro TTS server on port 8880.
   */
  public async probeKokoro(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 800);
      let res = await fetch(`${this.settings.kokoroUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch(`${this.settings.kokoroUrl}/models`, {
          method: 'GET',
          signal: controller.signal,
        }).catch(() => null);
      }

      clearTimeout(timeoutId);
      this.isKokoroOnline = !!res && res.ok;
      return this.isKokoroOnline;
    } catch {
      this.isKokoroOnline = false;
      return false;
    }
  }

  /**
   * Fetches custom cloned voices and presets from Voicebox.
   */
  public async fetchVoiceboxVoices(): Promise<HumanVoiceProfile[]> {
    const now = Date.now();
    if (this.cachedVoiceboxVoices.length > 0 && now - this.lastVoiceboxCheck < 10000) {
      return this.cachedVoiceboxVoices;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      let res = await fetch(`${this.settings.voiceboxUrl}/profiles`, {
        signal: controller.signal,
      }).catch(() => null);

      if (!res || !res.ok) {
        res = await fetch(`${this.settings.voiceboxUrl}/voices`, {
          signal: controller.signal,
        }).catch(() => null);
      }
      clearTimeout(timeoutId);

      if (res && res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data.voices || data.profiles || []);
        const profiles: HumanVoiceProfile[] = rawList.map((v: any) => ({
          id: v.id || v.profile_id || v.name,
          name: v.name || v.id,
          provider: 'voicebox',
          gender: v.gender || 'neutral',
          language: v.language || 'en',
          description: v.description || 'Voicebox profile',
          isCloned: v.voice_type === 'cloned' || v.isCloned,
        }));
        this.cachedVoiceboxVoices = profiles;
        this.lastVoiceboxCheck = now;
        this.isVoiceboxOnline = true;
        return profiles;
      }
    } catch {
      // Voicebox not running or endpoint not yet open
    }

    return [];
  }

  /**
   * Returns all available voices across available providers.
   */
  public async getAvailableVoices(): Promise<HumanVoiceProfile[]> {
    const voices: HumanVoiceProfile[] = [...KOKORO_DEFAULT_VOICES];

    // Check Voicebox
    const vbVoices = await this.fetchVoiceboxVoices();
    if (vbVoices.length > 0) {
      voices.unshift(...vbVoices);
    }

    return voices;
  }

  /**
   * Clean markdown, JSON, code blocks, and system artifacts from text before speaking.
   */
  public sanitizeSpeechText(text: string): string {
    let clean = text.trim();
    if (!clean) return '';

    // Strip code blocks ```...```
    while (clean.includes('```')) {
      const start = clean.indexOf('```');
      const end = clean.indexOf('```', start + 3);
      if (end !== -1) {
        clean = clean.slice(0, start) + ' ' + clean.slice(end + 3);
      } else {
        clean = clean.slice(0, start);
        break;
      }
    }

    // Strip tool call tags and content <tool_call ...>...</tool_call>
    clean = clean.replace(/<[a-zA-Z_-]+[^>]*>[\s\S]*?<\/[a-zA-Z_-]+>/g, ' ');

    // Strip any remaining XML/HTML tags
    clean = clean.replace(/<[^>]+>/g, ' ');

    // Strip Markdown links [text](url) -> text
    clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Strip markdown formatting symbols (*, _, #, ~, `, |)
    clean = clean.replace(/[*_#~`|{}[\]]/g, ' ');

    // Clean up spaces before punctuation marks (e.g. "Summary : " -> "Summary: ")
    clean = clean.replace(/\s+([.,!?:;])/g, '$1');

    // Normalize whitespace
    return clean.replace(/\s+/g, ' ').trim();
  }

  /**
   * Synthesizes and speaks text using the highest-fidelity active human voice provider.
   */
  public async speak(
    text: string,
    options?: {
      voiceId?: string;
      provider?: HumanVoiceProvider;
      speed?: number;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: string) => void;
    }
  ): Promise<boolean> {
    const cleanText = this.sanitizeSpeechText(text);
    if (!cleanText) return false;

    // Stop any ongoing utterance
    this.stop();
    this.isSpeaking = true;
    options?.onStart?.();

    const provider = options?.provider || this.settings.provider;
    const voiceId = options?.voiceId || this.settings.selectedVoiceId;
    const speed = options?.speed || this.settings.speed;

    // 1. Try Voicebox (Local ElevenLabs Alternative)
    if (provider === 'voicebox' || (this.settings.autoDetectLocal && !this.isSpeaking)) {
      const isAvailable = await this.probeVoicebox();
      if (isAvailable) {
        try {
          const success = await this.speakViaVoicebox(cleanText, voiceId, speed);
          if (success) {
            this.isSpeaking = false;
            options?.onEnd?.();
            return true;
          }
        } catch (e: any) {
          console.warn('[HumanVoiceEngine] Voicebox error, falling back:', e);
        }
      }
    }

    // 2. Try Kokoro Local Server
    if (provider === 'kokoro' || this.settings.autoDetectLocal) {
      const isKokoro = await this.probeKokoro();
      if (isKokoro) {
        try {
          const success = await this.speakViaKokoro(cleanText, voiceId, speed);
          if (success) {
            this.isSpeaking = false;
            options?.onEnd?.();
            return true;
          }
        } catch (e: any) {
          console.warn('[HumanVoiceEngine] Kokoro server error, falling back:', e);
        }
      }
    }

    // 3. Try ElevenLabs Cloud (BYOK) if user provided key
    if (provider === 'elevenlabs') {
      try {
        const hasKey = await hasApiKey('elevenlabs').catch(() => false);
        if (hasKey) {
          const success = await this.speakViaElevenLabs(cleanText, voiceId);
          if (success) {
            this.isSpeaking = false;
            options?.onEnd?.();
            return true;
          }
        }
      } catch (e: any) {
        console.warn('[HumanVoiceEngine] ElevenLabs error, falling back:', e);
      }
    }

    // 4. Guaranteed Native Desktop Fallback
    try {
      await speakText(cleanText, undefined, Math.round(175 * speed));
      this.isSpeaking = false;
      options?.onEnd?.();
      return true;
    } catch (e: any) {
      this.isSpeaking = false;
      const errMsg = e?.message || String(e);
      options?.onError?.(errMsg);
      return false;
    }
  }

  /**
   * Synthesize via Jamie Pine's Voicebox REST API (/v1/audio/speech or POST /speak).
   */
  private async speakViaVoicebox(text: string, voiceId: string, speed: number): Promise<boolean> {
    this.activeAbortController = new AbortController();

    // 1. Try OpenAI-compatible endpoint with audio streaming
    try {
      const speechRes = await fetch(`${this.settings.voiceboxUrl}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: text,
          voice: voiceId,
          speed,
          response_format: 'wav',
        }),
        signal: this.activeAbortController.signal,
      }).catch(() => null);

      if (speechRes && speechRes.ok) {
        const blob = await speechRes.blob();
        return await this.playAudioBlob(blob);
      }
    } catch {
      // Fall through to /speak
    }

    // 2. Direct /speak fallback
    const response = await fetch(`${this.settings.voiceboxUrl}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        profile: voiceId,
        speed,
      }),
      signal: this.activeAbortController.signal,
    }).catch(() => null);

    return !!response && response.ok;
  }

  /**
   * Synthesize via Kokoro OpenAI-compatible /v1/audio/speech endpoint.
   */
  private async speakViaKokoro(text: string, voiceId: string, speed: number): Promise<boolean> {
    this.activeAbortController = new AbortController();

    const response = await fetch(`${this.settings.kokoroUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text,
        voice: voiceId,
        speed,
        model: 'kokoro',
        response_format: 'mp3',
      }),
      signal: this.activeAbortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Kokoro HTTP ${response.status}`);
    }

    const blob = await response.blob();
    return this.playAudioBlob(blob);
  }

  /**
   * Synthesize via ElevenLabs Cloud API (BYOK).
   */
  private async speakViaElevenLabs(text: string, voiceId: string): Promise<boolean> {
    const key = await getApiKey('elevenlabs');
    if (!key) throw new Error('ElevenLabs API key missing in keychain');

    this.activeAbortController = new AbortController();
    const chosenVoice = voiceId && !voiceId.startsWith('af_') ? voiceId : '21m00Tcm4TlvDq8ikWAM'; // Rachel default

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${chosenVoice}`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
      signal: this.activeAbortController.signal,
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs HTTP ${response.status}`);
    }

    const blob = await response.blob();
    return this.playAudioBlob(blob);
  }

  /**
   * Plays an audio Blob in the browser/Tauri WebKit context.
   */
  private playAudioBlob(blob: Blob): Promise<boolean> {
    if (typeof window === 'undefined' || typeof Audio === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        this.currentAudioElement = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          this.currentAudioElement = null;
          resolve(true);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          this.currentAudioElement = null;
          resolve(false);
        };

        audio.play().catch(() => {
          URL.revokeObjectURL(url);
          this.currentAudioElement = null;
          resolve(true);
        });
      } catch {
        resolve(true);
      }
    });
  }

  /**
   * Immediately halts any speech audio.
   */
  public stop(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.currentTime = 0;
      this.currentAudioElement = null;
    }

    this.isSpeaking = false;
    stopNativeSpeaking().catch(() => {});
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
}

export const globalHumanVoice = new HumanVoiceEngine();
