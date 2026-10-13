import {
  setSystemVolume,
  setSystemMute,
  playSpotify,
  mediaControl,
  searchWebPlatform,
  lockScreen,
  addMemory,
  AutomationResult,
  getSystemStatus,
  listRunningApps,
  focusApp,
  toggleDarkMode,
  captureScreen,
  speakText,
  stopSpeaking,
  playSystemEarcon,
  transcribeAudioBuffer,
  transcribeAudioFile,
  TranscriptionResult,
} from '../ipc';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface VoiceActionResult {
  handledDeterministically: boolean;
  actionType: string;
  feedbackText: string;
  rawTranscript: string;
  details?: AutomationResult | any;
  followUp?: string | null;
}

import { evaluateMath, solveEquation } from '../agent/tools/mathTool';
import { cleanDirective, matchUiCommand, executeMatchedUiCommand } from '../agent/uiCommands';

const NEXT_STEP_REGEX = /\s*(?:,\s*)?(?:and then|and|then)\s+(?=(?:browse|open|click|show|tell|read|check|look|go|see|book|order|compare|select|choose|pick|get|list|summari[sz]e|call|reserve|scroll|view|download|save|play|listen|watch|analyze|calculate|explain|find|write|summarize)\b)/i;

/**
 * Splits compound requests into the immediate OS action and follow-up autonomous agent task.
 * e.g., "search youtube for react 19 and summarize it" ->
 * ["search youtube for react 19", "summarize it"]
 */
export function splitFollowUp(s: string): [string, string | null] {
  const m = NEXT_STEP_REGEX.exec(s);
  return m ? [s.slice(0, m.index).trim(), s.slice(m.index + m[0].length).trim()] : [s.trim(), null];
}

// Web Audio API high-tech sound synthesizer (zero external sound file dependencies)
class EarconSynthesizer {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Subtle high-tech wake chime */
  playWakeTone(): void {
    playSystemEarcon('wake').catch(() => {});
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.0, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // Ignore audio context errors
    }
  }

  /** Action success confirmation chime */
  playSuccessTone(): void {
    playSystemEarcon('success').catch(() => {});
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880.0, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.15); // D6

      gain.gain.setValueAtTime(0.09, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Ignore
    }
  }

  /** Error or refusal chime */
  playErrorTone(): void {
    playSystemEarcon('error').catch(() => {});
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(329.63, ctx.currentTime); // E4
      osc.frequency.exponentialRampToValueAtTime(220.0, ctx.currentTime + 0.2); // A3

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.28);
    } catch {
      // Ignore
    }
  }
}

export const earcons = new EarconSynthesizer();

/**
 * Text-to-Speech vocal synthesizer prioritizing native OS audio subsystem,
 * with graceful browser SpeechSynthesis fallback.
 */
export function speakJARVISFeedback(text: string, onEnd?: () => void): void {
  // First attempt native OS speech synthesis (works in background, minimized, locked)
  speakText(text)
    .then((res) => {
      if (res && res.success) {
        if (onEnd) onEnd();
        return;
      }
      throw new Error(res?.message || 'Native speech returned unsuccessful');
    })
    .catch(() => {
      // Fallback: Browser SpeechSynthesis
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        if (onEnd) onEnd();
        return;
      }

      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.volume = 0.9;

        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(
          (v) =>
            (v.name.includes('Samantha') ||
              v.name.includes('Daniel') ||
              v.name.includes('Alex') ||
              v.name.includes('Natural') ||
              v.lang.startsWith('en')) &&
            !v.name.includes('Bad')
        );
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        utterance.onend = () => {
          if (onEnd) onEnd();
        };
        utterance.onerror = () => {
          if (onEnd) onEnd();
        };

        window.speechSynthesis.speak(utterance);
      } catch {
        if (onEnd) onEnd();
      }
    });
}

/**
 * Halts any ongoing speech immediately.
 */
export function stopJARVISSpeaking(): void {
  stopSpeaking().catch(() => {});
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Fast-path intent matching: parses natural spoken directives and executes
 * in under 1 millisecond without waiting for LLM round trip!
 */
export async function matchAndExecuteFastAction(transcript: string): Promise<VoiceActionResult | null> {
  const trimmed = transcript.trim();
  if (!trimmed) return null;

  const cleaned = cleanDirective(trimmed);

  // 1. Exact Math Calculation & Equation Solving
  // e.g., "what is 25 * 40 + 12", "calculate sqrt(144) * 8", "solve 3x + 9 = 24"
  const solveMatch = cleaned.match(/^(?:solve(?:\s+equation)?|find\s+x\s+for)\s+(.+)$/i);
  if (solveMatch) {
    try {
      const solution = solveEquation(solveMatch[1]);
      earcons.playSuccessTone();
      return {
        handledDeterministically: true,
        actionType: 'math_solve',
        feedbackText: `Solution: ${solution.text}.`,
        rawTranscript: transcript,
        details: solution,
      };
    } catch {
      // Fall through to agent if equation is non-elementary
    }
  }

  const calcMatch = cleaned.match(/^(?:what\s+is|calculate|evaluate|compute)\s+(.+)$/i);
  if (calcMatch) {
    try {
      const result = evaluateMath(calcMatch[1]);
      earcons.playSuccessTone();
      return {
        handledDeterministically: true,
        actionType: 'math_evaluate',
        feedbackText: `The answer is ${result.text}.`,
        rawTranscript: transcript,
        details: result,
      };
    } catch {
      // Fall through
    }
  }

  // 2. Direct On-Screen UI Commands (keys, scrolling, back/forward, typing, launch apps)
  const uiCmd = matchUiCommand(cleaned);
  if (uiCmd) {
    try {
      const details = await executeMatchedUiCommand(uiCmd);
      earcons.playSuccessTone();
      return {
        handledDeterministically: true,
        actionType: `ui_${uiCmd.kind}`,
        feedbackText: uiCmd.reply,
        rawTranscript: transcript,
        details,
      };
    } catch {
      // Fall through if UI command execution failed
    }
  }

  // 3. Spotify / Music Playback
  // e.g., "play Back in Black by AC/DC on Spotify", "play Queen", "play hotel california"
  const spotifyMatch = trimmed.match(/^(?:hey\s+aeio\s+|aeio\s+)?(?:open\s+spotify\s+and\s+play|play\s+on\s+spotify|play\s+spotify|play)\s+(.+?)(?:\s+on\s+spotify|\s+in\s+spotify)?$/i);
  if (spotifyMatch) {
    const rawSong = spotifyMatch[1].trim();
    const lowerSong = rawSong.toLowerCase();
    // Guard against generic words like "video", "youtube", "volume"
    if (!lowerSong.startsWith('youtube') && !lowerSong.startsWith('video') && !lowerSong.startsWith('volume')) {
      const details = await playSpotify(rawSong);
      const feedbackText = `Playing ${rawSong} on Spotify.`;
      earcons.playSuccessTone();
      return {
        handledDeterministically: true,
        actionType: 'play_spotify',
        feedbackText,
        rawTranscript: transcript,
        details,
      };
    }
  }

  // 4. Media Controls: pause, resume, next, previous
  if (/^(?:hey\s+aeio\s+|aeio\s+)?(pause|stop)(?:\s+(?:the\s+)?(?:music|song|playback))?$/i.test(trimmed)) {
    const details = await mediaControl('pause');
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'media_pause',
      feedbackText: 'Music paused.',
      rawTranscript: transcript,
      details,
    };
  }

  if (/^(?:hey\s+aeio\s+|aeio\s+)?(resume|play|unpause)(?:\s+(?:the\s+)?(?:music|song|playback))?$/i.test(trimmed)) {
    const details = await mediaControl('play');
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'media_resume',
      feedbackText: 'Resuming playback.',
      rawTranscript: transcript,
      details,
    };
  }

  if (/^(?:hey\s+aeio\s+|aeio\s+)?(next|skip)(?:\s+(?:track|song))?$/i.test(trimmed)) {
    const details = await mediaControl('next');
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'media_next',
      feedbackText: 'Next track.',
      rawTranscript: transcript,
      details,
    };
  }

  if (/^(?:hey\s+aeio\s+|aeio\s+)?(previous|prev)(?:\s+(?:track|song))?$/i.test(trimmed)) {
    const details = await mediaControl('previous');
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'media_previous',
      feedbackText: 'Previous track.',
      rawTranscript: transcript,
      details,
    };
  }

  // 5. System Volume Controls
  // e.g., "set volume to 100%", "turn volume up to 50", "drop volume to 30%", "volume 80"
  const volumeMatch = trimmed.match(/(?:set|turn|drop|put|change|make)?\s*volume\s+(?:to|at)?\s*(\d{1,3})%?/i);
  if (volumeMatch) {
    const level = Math.min(100, Math.max(0, parseInt(volumeMatch[1], 10)));
    const details = await setSystemVolume(level);
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'set_volume',
      feedbackText: `Volume set to ${level} percent.`,
      rawTranscript: transcript,
      details,
    };
  }

  // Mute / Unmute
  if (/^(?:hey\s+aeio\s+|aeio\s+)?mute(?:\s+(?:the\s+)?(?:volume|sound|audio))?$/i.test(trimmed)) {
    const details = await setSystemMute(true);
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'set_mute',
      feedbackText: 'System muted.',
      rawTranscript: transcript,
      details,
    };
  }

  if (/^(?:hey\s+aeio\s+|aeio\s+)?unmute(?:\s+(?:the\s+)?(?:volume|sound|audio))?$/i.test(trimmed)) {
    const details = await setSystemMute(false);
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'set_unmute',
      feedbackText: 'System unmuted.',
      rawTranscript: transcript,
      details,
    };
  }

  // 6. Web & Video Search with Compound Follow-Up Chaining
  // e.g., "open YouTube and search how to use ChatGPT", "search YouTube for X and summarize it"
  const youtubeMatch = trimmed.match(/(?:search\s+youtube\s+for|open\s+youtube\s+and\s+search(?:\s+for)?|youtube\s+search)\s+(.+)/i);
  if (youtubeMatch) {
    const rawTarget = youtubeMatch[1].trim();
    const [query, followUp] = splitFollowUp(rawTarget);
    const details = await searchWebPlatform(query, 'youtube');
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'youtube_search',
      feedbackText: `Searching YouTube for ${query}.`,
      rawTranscript: transcript,
      details,
      followUp: followUp ? `${followUp} (A YouTube search for "${query}" is already open in the browser: continue from those results.)` : null,
    };
  }

  const googleMatch = trimmed.match(/(?:search\s+google\s+for|google\s+search(?:\s+for)?)\s+(.+)/i);
  if (googleMatch) {
    const rawTarget = googleMatch[1].trim();
    const [query, followUp] = splitFollowUp(rawTarget);
    const details = await searchWebPlatform(query, 'google');
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'google_search',
      feedbackText: `Searching Google for ${query}.`,
      rawTranscript: transcript,
      details,
      followUp: followUp ? `${followUp} (A Google search for "${query}" is already open in the browser: continue from those results.)` : null,
    };
  }

  // 7. System Lock
  if (/^(?:hey\s+aeio\s+|aeio\s+)?lock(?:\s+(?:the\s+)?(?:screen|my\s+screen|my\s+mac|my\s+laptop|my\s+computer))?$/i.test(trimmed)) {
    const details = await lockScreen();
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'lock_screen',
      feedbackText: 'Screen locked.',
      rawTranscript: transcript,
      details,
    };
  }

  // 8. Voice Memory Capture ("Aeio, remember that...")
  const rememberMatch = trimmed.match(/(?:remember\s+(?:that)?|save\s+to\s+memory(?:\s+that)?)\s+(.+)/i);
  if (rememberMatch) {
    const note = rememberMatch[1].trim();
    const wsId = useWorkspaceStore.getState().activeWorkspace?.id;
    await addMemory(note, 'preference', wsId);
    earcons.playSuccessTone();
    return {
      handledDeterministically: true,
      actionType: 'add_memory',
      feedbackText: 'Saved to memory.',
      rawTranscript: transcript,
    };
  }

  // 9. Battery & System Hardware Status
  if (/^(?:hey\s+aeio\s+|aeio\s+)?(?:check\s+battery|battery\s+status|battery\s+level|what\s+is\s+my\s+battery|system\s+status)/i.test(trimmed)) {
    try {
      const status = await getSystemStatus();
      earcons.playSuccessTone();
      let text = `Running on ${status.os_name}.`;
      if (status.battery_level !== undefined && status.battery_level !== null) {
        text = `Battery is at ${status.battery_level} percent${status.is_charging ? ', charging' : ''}.`;
      }
      if (status.active_app) {
        text += ` Active app is ${status.active_app}.`;
      }
      return {
        handledDeterministically: true,
        actionType: 'system_status',
        feedbackText: text,
        rawTranscript: transcript,
        details: status,
      };
    } catch {
      // Fall through
    }
  }

  // 10. Toggle Dark Mode
  if (/^(?:hey\s+aeio\s+|aeio\s+)?(?:toggle\s+dark\s+mode|switch\s+to\s+dark\s+mode|switch\s+to\s+light\s+mode|toggle\s+theme)/i.test(trimmed)) {
    try {
      const details = await toggleDarkMode();
      earcons.playSuccessTone();
      return {
        handledDeterministically: true,
        actionType: 'toggle_dark_mode',
        feedbackText: details.message,
        rawTranscript: transcript,
        details,
      };
    } catch {
      // Fall through
    }
  }

  // 11. Screen Capture / Screenshot
  if (/^(?:hey\s+aeio\s+|aeio\s+)?(?:take\s+a\s+screenshot|capture\s+screen|screenshot|screen\s+capture)/i.test(trimmed)) {
    try {
      const shotPath = `/tmp/aeio_shot_${Date.now()}.png`;
      await captureScreen(shotPath);
      earcons.playSuccessTone();
      return {
        handledDeterministically: true,
        actionType: 'take_screenshot',
        feedbackText: 'Screenshot captured.',
        rawTranscript: transcript,
        details: { path: shotPath },
      };
    } catch {
      // Fall through
    }
  }

  // 12. List Running Applications
  if (/^(?:hey\s+aeio\s+|aeio\s+)?(?:what\s+apps\s+are\s+open|list\s+running\s+apps|which\s+apps\s+are\s+running)/i.test(trimmed)) {
    try {
      const apps = await listRunningApps();
      earcons.playSuccessTone();
      const topApps = apps.slice(0, 5).join(', ');
      return {
        handledDeterministically: true,
        actionType: 'list_running_apps',
        feedbackText: `Open applications: ${topApps}.`,
        rawTranscript: transcript,
        details: apps,
      };
    } catch {
      // Fall through
    }
  }

  // 13. Focus / Switch Application
  const focusMatch = trimmed.match(/^(?:hey\s+aeio\s+|aeio\s+)?(?:bring\s+(.+?)\s+to\s+(?:the\s+)?front|switch\s+to\s+(.+?)|focus\s+(.+?))$/i);
  if (focusMatch) {
    const target = (focusMatch[1] || focusMatch[2] || focusMatch[3]).trim();
    if (target && !target.toLowerCase().startsWith('tab') && !target.toLowerCase().startsWith('window')) {
      try {
        const details = await focusApp(target);
        earcons.playSuccessTone();
        return {
          handledDeterministically: true,
          actionType: 'focus_app',
          feedbackText: `Switched to ${target}.`,
          rawTranscript: transcript,
          details,
        };
      } catch {
        // Fall through
      }
    }
  }

  return null;
}

/**
 * Universal Voice Controller & Speech Recognition Engine.
 */
export class VoiceEngine {
  private recognition: any = null;
  private isListening: boolean = false;
  private stateChangeListeners: ((state: VoiceState) => void)[] = [];
  private transcriptListeners: ((transcript: string, isFinal: boolean) => void)[] = [];
  private statusListeners: ((message: string) => void)[] = [];

  constructor() {
    this.initRecognition();
  }

  private initRecognition(): void {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.emitState('listening');
        this.emitStatus('Listening for command...');
        earcons.playWakeTone();
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        const text = finalTranscript || interimTranscript;
        this.emitTranscript(text, !!finalTranscript);
      };

      this.recognition.onerror = (event: any) => {
        this.isListening = false;
        this.emitState('idle');
        this.emitStatus(`Microphone error: ${event.error}`);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.emitState('idle');
      };
    } catch {
      // Ignore
    }
  }

  public isAvailable(): boolean {
    return !!this.recognition;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public startListening(): void {
    if (!this.recognition) {
      this.initRecognition();
      if (!this.recognition) {
        this.emitStatus('Speech recognition not supported in this browser environment.');
        return;
      }
    }

    try {
      if (this.isListening) {
        this.recognition.stop();
      }
      this.recognition.start();
    } catch (e) {
      // In case start is called while already starting
      this.emitStatus('Microphone ready');
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
      this.isListening = false;
      this.emitState('idle');
    }
  }

  public onStateChange(fn: (state: VoiceState) => void): () => void {
    this.stateChangeListeners.push(fn);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== fn);
    };
  }

  public onTranscript(fn: (transcript: string, isFinal: boolean) => void): () => void {
    this.transcriptListeners.push(fn);
    return () => {
      this.transcriptListeners = this.transcriptListeners.filter((l) => l !== fn);
    };
  }

  public onStatus(fn: (message: string) => void): () => void {
    this.statusListeners.push(fn);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== fn);
    };
  }

  private emitState(state: VoiceState): void {
    this.stateChangeListeners.forEach((fn) => fn(state));
  }

  private emitTranscript(transcript: string, isFinal: boolean): void {
    this.transcriptListeners.forEach((fn) => fn(transcript, isFinal));
  }

  private emitStatus(message: string): void {
    this.statusListeners.forEach((fn) => fn(message));
  }

  public async transcribeAudioData(audioBase64: string, format?: string): Promise<TranscriptionResult> {
    const res = await transcribeAudioBuffer(audioBase64, format);
    if (res.success && res.text) {
      this.emitTranscript(res.text, true);
    }
    return res;
  }
}

export const globalVoiceEngine = new VoiceEngine();

/**
 * Transcribes recorded base64 audio directly via the native whisper / OS transcription engine.
 */
export async function transcribeOfflineAudio(audioBase64: string, format?: string): Promise<TranscriptionResult> {
  return transcribeAudioBuffer(audioBase64, format);
}

export { transcribeAudioFile };
export type { TranscriptionResult };


