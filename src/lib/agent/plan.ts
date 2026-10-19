import { ActionIntent } from '../types/actionIntent';
import { isHardBlocked, classifyActionRiskWithAllowlist } from '../safety/allowlist';
import { useSettingsStore } from '../../stores/settingsStore';

export interface PlanStep {
  id: string;
  stepNumber: number;
  description: string;
  toolName: string;
  args: Record<string, any>;
  isDestructive: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: any;
  error?: string;
}

export interface ExecutionPlan {
  id: string;
  title: string;
  steps: PlanStep[];
  status: 'pending_approval' | 'running' | 'completed' | 'failed' | 'cancelled';
  hasDestructiveSteps: boolean;
  currentStepIndex: number;
  stoppedReason?: string;
  summary?: string;
}

const DESTRUCTIVE_PATTERNS = [
  'rm ', 'rm\t', 'rmdir', 'del ', 'del\t', 'erase ', 'unlink ', 'shred ',
  'format ', 'dd ', 'mkfs', 'fdisk', 'parted', 'wipefs', 'srm ',
  'chmod -r', 'chmod 777', 'chown -r', '> /dev/', '> /etc/', '> /system/',
  ':(){ :|:& };:', 'drop database', 'drop table', 'drop schema', 'truncate table',
  'git reset --hard', 'git clean', 'killall', 'shutdown', 'reboot', 'halt'
];

export function isDestructiveCommandClient(command: string): boolean {
  const lower = command.trim().toLowerCase();
  return DESTRUCTIVE_PATTERNS.some((p) => lower.includes(p));
}

export function extractActionIntentFromArgs(args: any): ActionIntent | null {
  if (!args || typeof args !== 'object') return null;
  const rawIntent = args.intent || args;
  const targetAppBundleId =
    rawIntent.targetAppBundleId ||
    rawIntent.bundle_id ||
    rawIntent.bundleId ||
    rawIntent.target_app ||
    rawIntent.targetApp ||
    args.targetAppBundleId ||
    args.bundle_id ||
    args.bundleId ||
    '';
  const naturalLanguageIntent =
    rawIntent.naturalLanguageIntent ||
    rawIntent.natural_language ||
    rawIntent.intent ||
    args.naturalLanguageIntent ||
    args.intent ||
    '';
  const targetElementDescription =
    rawIntent.targetElementDescription ||
    rawIntent.element ||
    rawIntent.target_element ||
    args.targetElementDescription ||
    args.element ||
    '';
  const intendedStateChange =
    rawIntent.intendedStateChange ||
    rawIntent.intended_state_change ||
    rawIntent.state_change ||
    args.intendedStateChange ||
    'Unknown';

  if (!targetAppBundleId && !naturalLanguageIntent) {
    return null;
  }

  return {
    targetAppBundleId,
    naturalLanguageIntent,
    targetElementDescription,
    intendedStateChange,
  };
}

export function isGuiActionDestructive(args: any): boolean {
  try {
    const settings = useSettingsStore.getState();
    if (!settings.computerControlEnabled) {
      return true;
    }

    const intent = extractActionIntentFromArgs(args);
    if (!intent || !intent.targetAppBundleId) {
      return true;
    }

    const bundle = intent.targetAppBundleId.trim().toLowerCase();
    if (isHardBlocked(bundle)) {
      return true;
    }

    const allowlist = (settings.computerControlAllowlist || []).map((b) => b.trim().toLowerCase());
    if (!allowlist.includes(bundle)) {
      return true;
    }

    const risk = classifyActionRiskWithAllowlist(intent, allowlist, true);
    return risk !== 'Low';
  } catch {
    return true;
  }
}

export function cleanDisplayContent(text: string): string {
  if (!text) return '';
  return text
    // 1. Remove complete or unclosed think tags
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    // 2. Remove complete or unclosed remember tags
    .replace(/<remember(?:\s+[^>]*)?>[\s\S]*?<\/remember>/gi, '')
    .replace(/<remember[\s\S]*$/i, '')
    // 3. Remove complete plan tags
    .replace(/<plan\b[^>]*>[\s\S]*?<\/plan>/gi, '')
    // 4. Remove unclosed plan tag up to end of string
    .replace(/<plan\b[\s\S]*$/i, '')
    // 5. Remove complete or unclosed step tags (if outside plan)
    .replace(/<step\b[^>]*>[\s\S]*?<\/step>/gi, '')
    .replace(/<step\b[\s\S]*$/i, '')
    // 6. Remove complete XML and JSON tool calls
    .replace(/(?:```(?:xml|json)?\s*)?<tool_call(?:\s+name=(?:"[^"]*"|'[^']*'|[^\s>]+))?(?:\s+args=(?:"[^"]*"|'[^']*'|[^\s>]+))?>[\s\S]*?<\/tool_call>(?:\s*```)?/gi, '')
    .replace(/(?:```(?:xml|json)?\s*)?<tool_call(?:\s+[^>]*)?>[\s\S]*?<\/tool_call>(?:\s*```)?/gi, '')
    .replace(/<tool_call(?:\s+[^>]*)\/>/gi, '')
    // 7. Remove unclosed tool_call
    .replace(/(?:```(?:xml|json)?\s*)?<tool_call[\s\S]*$/i, '')
    // 8. Clean trailing markdown code blocks or artifact wrappers
    .replace(/```(?:xml|json)?\s*$/i, '')
    .trim();
}

export const PLAN_BLOCK_REGEX = /<plan\b(?:\s+title=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?[^>]*>([\s\S]*?)<\/plan>/i;

export function normalizeToolName(name: string): string {
  const lower = name.toLowerCase().trim();
  if (lower === 'run_shell_command' || lower === 'shell' || lower === 'bash' || lower === 'sh') return 'run_shell';
  if (lower === 'open_url' || lower === 'open_file' || lower === 'open') return 'open_target';
  if (lower === 'create_file' || lower === 'save_file' || lower === 'write' || lower === 'write_file') return 'write_file';
  if (lower === 'view_file' || lower === 'cat' || lower === 'read' || lower === 'read_file') return 'read_file';
  if (lower === 'list_directory' || lower === 'list_dir' || lower === 'ls' || lower === 'dir') return 'list_directory';
  if (lower === 'fetch_url' || lower === 'web_fetch' || lower === 'fetch' || lower === 'curl' || lower === 'http_get' || lower === 'web_search') return 'fetch_url';
  if (lower === 'search_memory' || lower === 'search_memories' || lower === 'recall_memory' || lower === 'query_memory') return 'search_memory';
  if (
    lower === 'gui_action' ||
    lower === 'computer_action' ||
    lower === 'computer_control' ||
    lower === 'desktop_action' ||
    lower === 'gui'
  ) return 'gui_action';
  if (lower === 'play_spotify' || lower === 'spotify' || lower === 'play_music' || lower === 'play_song') return 'play_spotify';
  if (lower === 'set_volume' || lower === 'volume' || lower === 'set_system_volume') return 'set_system_volume';
  if (lower === 'get_volume' || lower === 'get_system_volume') return 'get_system_volume';
  if (lower === 'mute' || lower === 'unmute' || lower === 'set_mute' || lower === 'set_system_mute') return 'set_system_mute';
  if (lower === 'media_control' || lower === 'media' || lower === 'playback' || lower === 'pause' || lower === 'play') return 'media_control';
  if (lower === 'search_web' || lower === 'youtube_search' || lower === 'youtube' || lower === 'google_search') return 'search_web';
  if (lower === 'lock_screen' || lower === 'lock') return 'lock_screen';
  if (lower === 'math_evaluate' || lower === 'calculate' || lower === 'eval_math' || lower === 'calc') return 'math_evaluate';
  if (lower === 'math_solve' || lower === 'solve_equation' || lower === 'solve_math') return 'math_solve';
  if (lower === 'ui_command' || lower === 'voice_ui' || lower === 'shortcut') return 'ui_command';
  if (lower === 'open_app' || lower === 'launch_app') return 'open_app';
  if (lower === 'simulate_key_press' || lower === 'key_press' || lower === 'press_key') return 'simulate_key_press';
  if (lower === 'simulate_scroll' || lower === 'scroll_page') return 'simulate_scroll';
  if (lower === 'inject_text' || lower === 'type_text') return 'inject_text';
  if (lower === 'browse_page' || lower === 'browse' || lower === 'web_browse' || lower === 'read_webpage') return 'browse_page';
  if (lower === 'get_system_status' || lower === 'system_status') return 'get_system_status';
  if (lower === 'send_notification' || lower === 'notify' || lower === 'notification' || lower === 'display_notification') return 'send_notification';
  if (lower === 'list_running_apps' || lower === 'running_apps' || lower === 'list_apps' || lower === 'open_apps') return 'list_running_apps';
  if (lower === 'focus_app' || lower === 'activate_app' || lower === 'switch_to_app' || lower === 'bring_to_front') return 'focus_app';
  if (lower === 'toggle_dark_mode' || lower === 'dark_mode' || lower === 'toggle_theme' || lower === 'toggle_appearance') return 'toggle_dark_mode';
  if (lower === 'manage_window' || lower === 'window_control' || lower === 'tile_window' || lower === 'maximize_window') return 'manage_window';
  if (lower === 'search_local_files' || lower === 'spotlight_search' || lower === 'find_file' || lower === 'locate_file') return 'search_local_files';
  if (lower === 'get_power_status' || lower === 'power_status' || lower === 'battery' || lower === 'battery_status' || lower === 'battery_level') return 'get_power_status';
  if (lower === 'take_screenshot' || lower === 'capture_screen' || lower === 'screenshot' || lower === 'screen_capture') return 'take_screenshot';
  if (lower === 'gui_click' || lower === 'click' || lower === 'mouse_click') return 'gui_click';
  if (lower === 'gui_move' || lower === 'move' || lower === 'mouse_move' || lower === 'move_cursor' || lower === 'move_mouse') return 'gui_move';
  if (lower === 'gui_type' || lower === 'type' || lower === 'type_text') return 'gui_type';
  if (lower === 'gui_key_combo' || lower === 'key_combo' || lower === 'press_key' || lower === 'hotkey') return 'gui_key_combo';
  if (lower === 'gui_scroll' || lower === 'scroll' || lower === 'mouse_scroll') return 'gui_scroll';
  if (lower === 'gui_drag' || lower === 'drag' || lower === 'mouse_drag') return 'gui_drag';
  if (lower === 'gui_inspect_screen' || lower === 'inspect_screen' || lower === 'look_at_screen') return 'gui_inspect_screen';
  if (lower === 'browser_inspect' || lower === 'inspect_page' || lower === 'inspect_webpage') return 'browser_inspect';
  if (lower === 'browser_click' || lower === 'click_element' || lower === 'click_browser_element') return 'browser_click';
  if (lower === 'browser_fill' || lower === 'fill_field' || lower === 'fill_form' || lower === 'fill_browser_field') return 'browser_fill';
  if (lower === 'verify_page_state' || lower === 'verify_page' || lower === 'verify_state') return 'verify_page_state';
  return lower;
}

export function parsePlanFromResponse(rawText: string): { plan: ExecutionPlan | null; cleanedText: string } {
  const planMatch = PLAN_BLOCK_REGEX.exec(rawText);
  if (!planMatch) {
    return { plan: null, cleanedText: cleanDisplayContent(rawText) };
  }

  const title = (planMatch[1] ?? planMatch[2] ?? planMatch[3] ?? '').trim() || 'Execution Plan';
  const innerContent = planMatch[4]?.trim() || '';

  const steps: PlanStep[] = [];

  // Try JSON inside <plan>
  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(innerContent);
  } catch {
    // Check if inner content has a JSON block inside markdown codeblock
    const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(innerContent);
    if (codeBlockMatch) {
      try {
        parsedJson = JSON.parse(codeBlockMatch[1].trim());
      } catch {
        parsedJson = null;
      }
    }
  }

  if (parsedJson && Array.isArray(parsedJson.steps)) {
    const jsonTitle = parsedJson.title || title;
    parsedJson.steps.forEach((s: any, idx: number) => {
      const rawTool = s.tool || s.toolName || s.name || 'run_shell';
      const toolName = normalizeToolName(rawTool);
      const args = s.args || s.arguments || s.parameters || {};
      const command = args.command || (typeof args === 'string' ? args : '');
      // Independent evaluation: NEVER trust model's declared destructive field
      const isDestructive =
        toolName === 'run_shell' && command
          ? isDestructiveCommandClient(command)
          : toolName === 'gui_action'
          ? isGuiActionDestructive(args)
          : toolName === 'write_file'
          ? true
          : toolName.includes('delete') || toolName.includes('remove');

      steps.push({
        id: crypto.randomUUID(),
        stepNumber: s.step || s.stepNumber || idx + 1,
        description: s.description || `Execute ${toolName}`,
        toolName,
        args: typeof args === 'string' ? { command: args } : args,
        isDestructive,
        status: 'pending',
      });
    });

    const cleanedText = cleanDisplayContent(rawText);
    const hasDestructiveSteps = steps.some((s) => s.isDestructive);

    return {
      plan: {
        id: crypto.randomUUID(),
        title: jsonTitle,
        steps,
        status: hasDestructiveSteps ? 'pending_approval' : 'running',
        hasDestructiveSteps,
        currentStepIndex: 0,
      },
      cleanedText,
    };
  }

  // Parse XML <step> format
  let stepMatch: RegExpExecArray | null;
  const stepRegex = /<step\b([^>]*)>([\s\S]*?)<\/step>/gi;
  let stepIndex = 1;

  while ((stepMatch = stepRegex.exec(innerContent)) !== null) {
    const attrString = stepMatch[1] || '';
    const payload = stepMatch[2]?.trim() || '{}';

    const numMatch = /number=["']?(\d+)["']?/i.exec(attrString);
    const toolMatch = /tool=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrString);
    const descMatch = /description=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrString);

    const stepNum = numMatch ? parseInt(numMatch[1], 10) : stepIndex;
    const rawTool = toolMatch ? (toolMatch[1] ?? toolMatch[2] ?? toolMatch[3] ?? '').trim() : 'run_shell';
    const toolName = normalizeToolName(rawTool);
    const description = descMatch ? (descMatch[1] ?? descMatch[2] ?? descMatch[3] ?? '').trim() : `Step ${stepNum}: Execute ${toolName}`;

    let args: Record<string, any> = {};
    try {
      args = JSON.parse(payload);
    } catch {
      args = { command: payload };
    }

    const command = args.command || '';
    // Independent evaluation: NEVER trust model's declared destructive field
    const isDestructive =
      toolName === 'run_shell' && command
        ? isDestructiveCommandClient(command)
        : toolName === 'gui_action'
        ? isGuiActionDestructive(args)
        : toolName === 'write_file'
        ? true
        : toolName.includes('delete') || toolName.includes('remove');

    steps.push({
      id: crypto.randomUUID(),
      stepNumber: stepNum,
      description,
      toolName,
      args,
      isDestructive,
      status: 'pending',
    });

    stepIndex++;
  }

  if (steps.length === 0) {
    return { plan: null, cleanedText: cleanDisplayContent(rawText) };
  }

  const cleanedText = cleanDisplayContent(rawText);
  const hasDestructiveSteps = steps.some((s) => s.isDestructive);

  return {
    plan: {
      id: crypto.randomUUID(),
      title,
      steps,
      status: hasDestructiveSteps ? 'pending_approval' : 'running',
      hasDestructiveSteps,
      currentStepIndex: 0,
    },
    cleanedText,
  };
}

export async function classifyPlanSafety(
  plan: ExecutionPlan,
  checkDestructiveIpc?: (cmd: string) => Promise<boolean>
): Promise<ExecutionPlan> {
  const updatedSteps: PlanStep[] = [];

  for (const step of plan.steps) {
    const normalizedTool = normalizeToolName(step.toolName);
    let isDestructive = false;

    if (normalizedTool === 'run_shell' && step.args?.command) {
      if (checkDestructiveIpc) {
        try {
          isDestructive = await checkDestructiveIpc(step.args.command);
        } catch {
          isDestructive = isDestructiveCommandClient(step.args.command);
        }
      } else {
        isDestructive = isDestructiveCommandClient(step.args.command);
      }
    } else if (normalizedTool === 'gui_action') {
      isDestructive = isGuiActionDestructive(step.args);
    } else if (
      normalizedTool === 'write_file' ||
      normalizedTool.includes('delete') ||
      normalizedTool.includes('remove') ||
      normalizedTool.includes('drop') ||
      normalizedTool.includes('truncate')
    ) {
      isDestructive = true;
    }

    updatedSteps.push({
      ...step,
      toolName: normalizedTool,
      isDestructive,
    });
  }

  const hasDestructiveSteps = updatedSteps.some((s) => s.isDestructive);

  return {
    ...plan,
    steps: updatedSteps,
    hasDestructiveSteps,
    status: hasDestructiveSteps ? 'pending_approval' : 'running',
  };
}
