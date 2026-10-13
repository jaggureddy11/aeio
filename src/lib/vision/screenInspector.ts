import { captureScreenData, getActiveWindow, ScreenData, ActiveWindowInfo } from '../ipc';
import { orchestrateChat } from '../providers/orchestrator';

export interface ScreenInspectionResult {
  analysis: string;
  screenData: ScreenData;
  activeWindow: ActiveWindowInfo | null;
  summary: string;
  detectedErrors?: string[];
  suggestedActions?: string[];
  timestamp: number;
}

/**
 * Captures the current desktop screen frame and performs multi-modal visual inspection
 * with the active window context.
 */
export async function inspectActiveScreen(
  customPrompt?: string,
  existingScreenData?: ScreenData
): Promise<ScreenInspectionResult> {
  // 1. Capture screen frame data (or reuse pre-captured frame)
  const screenData = existingScreenData || (await captureScreenData());

  // 2. Query active window context (app name, title, bounds)
  let activeWindow: ActiveWindowInfo | null = null;
  try {
    activeWindow = await getActiveWindow();
  } catch {
    // Window context optional if running in restricted permission mode
  }

  const windowDesc = activeWindow?.app_name
    ? `[Active App: ${activeWindow.app_name} | Window: "${activeWindow.title}"]`
    : '[Desktop Display]';

  const userQuery =
    customPrompt && customPrompt.trim().length > 0
      ? customPrompt.trim()
      : `What am I looking at right now? Explain what is currently visible on my screen in ${windowDesc}, diagnose any visible code errors, UI layouts, or diagrams, and recommend the best next steps.`;

  const systemPrompt = `You are Aeio's Multi-Modal Visual Screen Inspector. You have direct vision of the user's active desktop screen.
Context: ${windowDesc}.

Instructions:
1. Explain what is visible on screen clearly and concisely.
2. If code, terminal, or build output is visible: identify any syntax errors, compiler diagnostics, or stack traces and explain the direct fix.
3. If an interface, web page, or diagram is visible: break down the core components, key data points, or workflow steps.
4. Conclude with 2-3 concise, actionable next steps.`;

  // 3. Dispatch to multi-modal vision reasoning engine
  const orchestration = await orchestrateChat(
    [
      {
        role: 'user',
        content: userQuery,
        images: [screenData.base64],
      },
    ],
    {
      systemPrompt,
    }
  );

  const analysis = orchestration.content.trim();

  // 4. Extract highlights / summary
  const firstSentence = analysis.split('\n')[0] || 'Desktop visual inspection completed.';
  const summary = firstSentence.replace(/^#+\s*/, '').slice(0, 140);

  // Parse any bullet points as suggested actions
  const suggestedActions: string[] = [];
  const actionRegex = /^[*-]\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = actionRegex.exec(analysis)) !== null && suggestedActions.length < 3) {
    suggestedActions.push(match[1].trim());
  }

  return {
    analysis,
    screenData,
    activeWindow,
    summary,
    suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
    timestamp: Date.now(),
  };
}
