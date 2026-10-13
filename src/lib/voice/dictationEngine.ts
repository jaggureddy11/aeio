import { injectTextToActiveApp } from '../ipc';
import { orchestrateChat } from '../providers/orchestrator';
import { earcons } from './voiceEngine';

export type DictationTone = 'standard' | 'formal' | 'casual' | 'bullet_points';

export interface DictationOptions {
  polishWithAI?: boolean;
  tone?: DictationTone;
  autoInject?: boolean;
}

export interface DictationResult {
  success: boolean;
  rawText: string;
  polishedText: string;
  injected: boolean;
  error?: string;
}

/**
 * Fast client-side fallback cleaner for offline mode or instant typing.
 * Strips common verbal tics, normalizes whitespace and punctuation.
 */
export function cleanSpokenTranscriptHeuristic(raw: string): string {
  let cleaned = raw
    .replace(/\b(um+|uh+|er+|ah+|you know|like)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) return '';

  // Capitalize first character
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  // Ensure trailing punctuation if complete sentence
  if (!/[.!?]$/.test(cleaned) && cleaned.split(' ').length > 2) {
    cleaned += '.';
  }

  return cleaned;
}

/**
 * AI VoiceOS Dictation Polisher:
 * Transforms stream-of-consciousness spoken speech into crisp, punctuated, formatted text.
 */
export async function polishSpokenText(
  rawTranscript: string,
  tone: DictationTone = 'standard'
): Promise<string> {
  const trimmed = rawTranscript.trim();
  if (!trimmed) return '';

  const toneGuidelines: Record<DictationTone, string> = {
    standard: 'Clean, polished, natural, and properly punctuated modern prose.',
    formal: 'Executive, formal business communication suitable for professional emails and reports.',
    casual: 'Friendly, modern conversational tone without robotic formality.',
    bullet_points: 'A clear, concise bulleted list format with dashes (-).',
  };

  const systemPrompt = `You are Aeio VoiceOS Executive Dictation Engine.
Convert spoken transcript into pristine text.
Target Style: ${toneGuidelines[tone]}

STRICT RULES:
1. Strip verbal pauses, stutters, and filler words (um, uh, like, you know, I mean).
2. Fix capitalization, grammar, numbers (e.g., "$5 million", "3:30 PM", "October 14th"), and punctuation.
3. Preserve programming language syntax, API names, product names, and technical terms precisely.
4. Output ONLY the polished content. Never include commentary, greetings, quotes, or preambles.`;

  try {
    const res = await orchestrateChat(
      [
        {
          role: 'user',
          content: `Spoken transcript to format:\n"${trimmed}"`,
        },
      ],
      {
        systemPrompt,
        temperature: 0.2,
      }
    );

    const polished = res.content.trim();
    // Guard against models enclosing response in markdown quotes or preamble
    return polished.replace(/^"(.*)"$/s, '$1').trim();
  } catch (err) {
    console.warn('[DictationEngine] AI polishing unavailable, falling back to heuristics:', err);
    return cleanSpokenTranscriptHeuristic(trimmed);
  }
}

/**
 * Executes VoiceOS System Dictation:
 * Cleans audio transcript and automatically injects it into whatever desktop app is focused.
 */
export async function executeDictation(
  transcript: string,
  options: DictationOptions = {}
): Promise<DictationResult> {
  const { polishWithAI = true, tone = 'standard', autoInject = true } = options;

  const raw = transcript.trim();
  if (!raw) {
    return {
      success: false,
      rawText: '',
      polishedText: '',
      injected: false,
      error: 'Empty transcript provided',
    };
  }

  try {
    const polishedText = polishWithAI ? await polishSpokenText(raw, tone) : cleanSpokenTranscriptHeuristic(raw);

    let injected = false;
    if (autoInject && polishedText) {
      const injectRes = await injectTextToActiveApp(polishedText);
      injected = injectRes.success;
      if (injected) {
        earcons.playSuccessTone();
      }
    }

    return {
      success: true,
      rawText: raw,
      polishedText,
      injected,
    };
  } catch (err: any) {
    return {
      success: false,
      rawText: raw,
      polishedText: cleanSpokenTranscriptHeuristic(raw),
      injected: false,
      error: err?.message || 'Dictation execution failed',
    };
  }
}
