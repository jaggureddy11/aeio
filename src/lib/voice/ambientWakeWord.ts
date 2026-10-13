import { spotWakeWordInAudio, WakeWordSpotResult } from '../ipc';

export interface WakeWordEvent {
  keyword: string;
  command: string;
  confidence: number;
  timestamp: number;
  engine: 'vad_offline' | 'web_speech';
}

export interface VadEnergyEvent {
  rms: number;
  decibels: number;
  isSpeaking: boolean;
  noiseFloor: number;
}

export type VadSensitivity = 'low' | 'medium' | 'high';

/**
 * Encodes a mono Float32Array of audio samples into a standard 16-bit PCM RIFF/WAV base64 string.
 */
export function encodeFloat32ToWav(samples: Float32Array, sampleRate: number = 16000): string {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // Helper to write ASCII strings into DataView
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // 1. RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true); // ChunkSize
  writeString(8, 'WAVE');

  // 2. fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16-bit)

  // 3. data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true); // Subchunk2Size

  // 4. Write 16-bit PCM samples with clipping protection
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  // Convert ArrayBuffer to binary string then base64
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }

  return btoa(binary);
}

/**
 * Ambient Wake-Word Engine ("Hey Aeio")
 * Features:
 * - Low-power Web Audio Voice Activity Detection (VAD)
 * - Dynamic background noise floor adaptation
 * - Dual-layer keyword spotting (Offline Rust acoustic matcher + Web Speech API)
 * - Automatic hands-free command tail extraction & debounce protection
 */
export class AmbientWakeWordEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;

  private isRunning: boolean = false;
  private noiseFloor: number = 0.008;
  private sensitivity: VadSensitivity = 'medium';

  private speechBuffer: Float32Array[] = [];
  private isSpeaking: boolean = false;
  private speechStartTime: number = 0;
  private silenceFramesCount: number = 0;
  private lastTriggerTime: number = 0;

  private webSpeechRecognition: any = null;
  private wakeListeners: ((event: WakeWordEvent) => void)[] = [];
  private energyListeners: ((event: VadEnergyEvent) => void)[] = [];

  constructor() {
    this.noiseFloor = 0.008;
  }

  public setSensitivity(level: VadSensitivity): void {
    this.sensitivity = level;
  }

  public getSensitivity(): VadSensitivity {
    return this.sensitivity;
  }

  public isActive(): boolean {
    return this.isRunning;
  }

  public onWakeWord(cb: (event: WakeWordEvent) => void): () => void {
    this.wakeListeners.push(cb);
    return () => {
      this.wakeListeners = this.wakeListeners.filter((l) => l !== cb);
    };
  }

  public onEnergy(cb: (event: VadEnergyEvent) => void): () => void {
    this.energyListeners.push(cb);
    return () => {
      this.energyListeners = this.energyListeners.filter((l) => l !== cb);
    };
  }

  private emitWake(event: WakeWordEvent): void {
    const now = Date.now();
    // 1.8s debounce cooldown against self-triggering from earcons or speech feedback
    if (now - this.lastTriggerTime < 1800) return;
    this.lastTriggerTime = now;

    this.wakeListeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[AmbientWakeWord] Listener error:', err);
      }
    });
  }

  private emitEnergy(event: VadEnergyEvent): void {
    this.energyListeners.forEach((fn) => {
      try {
        fn(event);
      } catch {}
    });
  }

  /**
   * Starts ambient continuous listening for the "Hey Aeio" wake word.
   */
  public async start(onWake?: (event: WakeWordEvent) => void): Promise<boolean> {
    if (this.isRunning) {
      if (onWake) this.onWakeWord(onWake);
      return true;
    }

    if (onWake) {
      this.onWakeWord(onWake);
    }

    if (typeof window === 'undefined') return false;

    // 1. Initialize Web Speech Recognition parallel stream if supported
    this.initWebSpeechLayer();

    // 2. Initialize Web Audio VAD stream
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        this.mediaStream = stream;
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx({ sampleRate: 16000 });
          if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
          }

          const source = this.audioContext.createMediaStreamSource(stream);
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 512;
          this.analyser.smoothingTimeConstant = 0.2;
          source.connect(this.analyser);

          this.isRunning = true;
          this.startVadLoop();
          return true;
        }
      }
    } catch (err) {
      console.warn('[AmbientWakeWord] AudioContext/Microphone initialization deferred:', err);
    }

    // If Web Audio failed but Web Speech is available, keep running in Web Speech mode
    if (this.webSpeechRecognition) {
      this.isRunning = true;
      return true;
    }

    return false;
  }

  /**
   * Stops the ambient wake-word listener and releases microphone streams.
   */
  public stop(): void {
    this.isRunning = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.webSpeechRecognition) {
      try {
        this.webSpeechRecognition.stop();
      } catch {}
      this.webSpeechRecognition = null;
    }

    this.speechBuffer = [];
    this.isSpeaking = false;
  }

  /**
   * Low-power voice activity detection loop.
   */
  private startVadLoop(): void {
    if (!this.analyser) return;

    const buffer = new Float32Array(this.analyser.fftSize);

    const getMultiplier = () => {
      switch (this.sensitivity) {
        case 'high':
          return 1.8;
        case 'low':
          return 3.2;
        case 'medium':
        default:
          return 2.4;
      }
    };

    const tick = () => {
      if (!this.isRunning || !this.analyser) return;

      this.analyser.getFloatTimeDomainData(buffer);

      // 1. Calculate Root-Mean-Square (RMS) audio energy
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        sumSquares += buffer[i] * buffer[i];
      }
      const rms = Math.sqrt(sumSquares / buffer.length);
      const decibels = rms > 0 ? 20 * Math.log10(rms) : -100;

      // 2. Dynamically adapt background noise floor
      if (rms < this.noiseFloor * 1.5) {
        this.noiseFloor = this.noiseFloor * 0.96 + rms * 0.04;
      }

      // 3. Evaluate speech activity threshold
      const multiplier = getMultiplier();
      const minThreshold = this.sensitivity === 'high' ? 0.012 : this.sensitivity === 'low' ? 0.028 : 0.018;
      const speechThreshold = Math.max(minThreshold, this.noiseFloor * multiplier);
      const isVoiceActive = rms > speechThreshold;

      this.emitEnergy({
        rms,
        decibels,
        isSpeaking: this.isSpeaking || isVoiceActive,
        noiseFloor: this.noiseFloor,
      });

      // 4. Voice Activity State Machine
      if (isVoiceActive) {
        if (!this.isSpeaking) {
          this.isSpeaking = true;
          this.speechStartTime = Date.now();
          this.speechBuffer = [];
        }
        this.silenceFramesCount = 0;
        // Keep up to ~3 seconds of speech samples (approx 48,000 samples @ 16kHz)
        this.speechBuffer.push(new Float32Array(buffer));
        if (this.speechBuffer.length > 90) {
          this.speechBuffer.shift();
        }
      } else if (this.isSpeaking) {
        this.silenceFramesCount++;
        this.speechBuffer.push(new Float32Array(buffer));

        // When silence persists for ~400ms (approx 12 ticks @ ~30fps)
        if (this.silenceFramesCount > 12) {
          this.isSpeaking = false;
          const duration = Date.now() - this.speechStartTime;
          if (duration >= 400 && this.speechBuffer.length > 8) {
            this.evaluateSpeechBuffer(this.speechBuffer);
          }
          this.speechBuffer = [];
        }
      }

      this.animFrameId = requestAnimationFrame(tick);
    };

    tick();
  }

  /**
   * Flattens PCM buffer, encodes to WAV base64, and tests against Rust keyword spotter.
   */
  private async evaluateSpeechBuffer(chunks: Float32Array[]): Promise<void> {
    try {
      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Float32Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const wavBase64 = encodeFloat32ToWav(merged, 16000);
      const spotResult: WakeWordSpotResult = await spotWakeWordInAudio(wavBase64, 'wav');

      if (spotResult && spotResult.detected) {
        this.emitWake({
          keyword: spotResult.keyword || 'hey aeio',
          command: spotResult.command || '',
          confidence: spotResult.confidence,
          timestamp: Date.now(),
          engine: 'vad_offline',
        });
      }
    } catch {
      // Speech buffer evaluation failure fallback
    }
  }

  /**
   * Initializes Web Speech API layer for continuous ambient keyword spotting.
   */
  private initWebSpeechLayer(): void {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      this.webSpeechRecognition = new SpeechRecognition();
      this.webSpeechRecognition.continuous = true;
      this.webSpeechRecognition.interimResults = true;
      this.webSpeechRecognition.lang = 'en-US';

      this.webSpeechRecognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const text = (event.results[i][0].transcript || '').trim();
          const match = text.match(/\b(?:hey\s+aeio|aeio|okay\s+aeio|hi\s+aeio)\b(?:\s+(.*))?/i);
          if (match) {
            const commandTail = (match[1] || '').trim();
            this.emitWake({
              keyword: 'hey aeio',
              command: commandTail,
              confidence: 0.98,
              timestamp: Date.now(),
              engine: 'web_speech',
            });
            break;
          }
        }
      };

      this.webSpeechRecognition.onerror = () => {
        if (this.isRunning) {
          setTimeout(() => {
            try {
              if (this.isRunning) this.webSpeechRecognition?.start();
            } catch {}
          }, 1000);
        }
      };

      this.webSpeechRecognition.onend = () => {
        if (this.isRunning) {
          try {
            this.webSpeechRecognition?.start();
          } catch {}
        }
      };

      this.webSpeechRecognition.start();
    } catch {
      // Speech recognition initialization optional
    }
  }
}

export const ambientWakeWordEngine = new AmbientWakeWordEngine();
