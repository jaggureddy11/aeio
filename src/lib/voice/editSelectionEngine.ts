import { captureSelectedTextFromActiveApp, injectTextToActiveApp } from '../ipc';
import { orchestrateChat } from '../providers/orchestrator';
import { earcons } from './voiceEngine';

export interface RewriteResult {
  success: boolean;
  originalText: string;
  rewrittenText: string;
  instruction: string;
  error?: string;
}

/**
 * Transforms arbitrary highlighted text based on the user's spoken voice command.
 */
export async function rewriteSelectedText(
  originalText: string,
  instruction: string
): Promise<string> {
  const trimmed = originalText.trim();
  if (!trimmed) {
    throw new Error('No text was selected to rewrite.');
  }

  const systemPrompt = `You are Aeio VoiceOS In-Place Editor.
The user highlighted text in an active desktop application and gave a voice directive to transform it.

STRICT INSTRUCTIONS:
1. Apply the user's spoken directive with high accuracy (e.g. rephrase, summarize, fix grammar, translate, format as bullet points, refactor code, change tone).
2. Maintain the context, formatting, and intent of the original text.
3. Output ONLY the transformed replacement text.
4. Do NOT include preambles like "Here is the rewritten text:", do NOT wrap in extra quotes unless requested, and do NOT add conversational commentary.`;

  const userPrompt = `ORIGINAL SELECTED TEXT:
"""
${trimmed}
"""

USER'S SPOKEN DIRECTIVE:
"${instruction.trim()}"`;

  const res = await orchestrateChat(
    [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    {
      systemPrompt,
      temperature: 0.2,
    }
  );

  return res.content.trim();
}

/**
 * End-to-end VoiceOS In-Place Edit Workflow:
 * 1. Captures highlighted text from the user's active window (Cmd+C / Ctrl+C)
 * 2. Uses LLM with the spoken instruction to transform the text
 * 3. Injects the result back into the active application (Cmd+V / Ctrl+V)
 */
export async function executeInPlaceRewrite(
  instruction: string
): Promise<RewriteResult> {
  const instr = instruction.trim();
  if (!instr) {
    return {
      success: false,
      originalText: '',
      rewrittenText: '',
      instruction: '',
      error: 'Empty voice instruction provided',
    };
  }

  try {
    // 1. Capture highlighted text from foreground application
    const captured = await captureSelectedTextFromActiveApp();
    if (!captured || captured.trim().length === 0) {
      return {
        success: false,
        originalText: '',
        rewrittenText: '',
        instruction: instr,
        error: 'No text is selected. Highlight text in any application and try again.',
      };
    }

    // 2. Perform intelligent transformation
    const rewritten = await rewriteSelectedText(captured, instr);

    // 3. Inject replacement back into foreground application
    const injectRes = await injectTextToActiveApp(rewritten);
    if (!injectRes.success) {
      return {
        success: false,
        originalText: captured,
        rewrittenText: rewritten,
        instruction: instr,
        error: injectRes.message || 'Failed to inject transformed text into active app.',
      };
    }

    earcons.playSuccessTone();

    return {
      success: true,
      originalText: captured,
      rewrittenText: rewritten,
      instruction: instr,
    };
  } catch (err: any) {
    return {
      success: false,
      originalText: '',
      rewrittenText: '',
      instruction: instr,
      error: err?.message || 'In-place edit failed',
    };
  }
}
