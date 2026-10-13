import { describe, it, expect, vi } from 'vitest';
import {
  evaluateMath,
  solveEquation,
  solveSystem,
  normalizeMathExpression,
  MathError,
} from '../lib/agent/tools/mathTool';
import {
  cleanDirective,
  matchUiCommand,
  findScreenElement,
  ScreenElement,
} from '../lib/agent/uiCommands';
import {
  matchAndExecuteFastAction,
  splitFollowUp,
} from '../lib/voice/voiceEngine';
import * as ipc from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  setSystemVolume: vi.fn().mockResolvedValue({ success: true, message: 'Volume set' }),
  getSystemVolume: vi.fn().mockResolvedValue({ volume: 50, is_muted: false }),
  setSystemMute: vi.fn().mockResolvedValue({ success: true, message: 'System muted' }),
  playSpotify: vi.fn().mockResolvedValue({ success: true, message: 'Playing track' }),
  mediaControl: vi.fn().mockResolvedValue({ success: true, message: 'Media control' }),
  searchWebPlatform: vi.fn().mockResolvedValue({ success: true, message: 'Searching web' }),
  lockScreen: vi.fn().mockResolvedValue({ success: true, message: 'Screen locked' }),
  addMemory: vi.fn().mockResolvedValue('mem-123'),
  simulateKeyPress: vi.fn().mockResolvedValue({ success: true, message: 'Key pressed', action_type: 'key_press' }),
  simulateScroll: vi.fn().mockResolvedValue({ success: true, message: 'Scrolled', action_type: 'scroll' }),
  openApp: vi.fn().mockResolvedValue({ success: true, message: 'App opened', action_type: 'open_app' }),
  injectTextToActiveApp: vi.fn().mockResolvedValue({ success: true, message: 'Text injected', action_type: 'inject_text' }),
  getSystemStatus: vi.fn().mockResolvedValue({ os_name: 'macos', battery_level: 85, is_charging: true, active_app: 'VS Code' }),
  sendSystemNotification: vi.fn().mockResolvedValue({ success: true, message: 'Notification sent' }),
  listRunningApps: vi.fn().mockResolvedValue(['Finder', 'Chrome', 'Slack']),
  focusApp: vi.fn().mockResolvedValue({ success: true, message: 'Focused app' }),
  toggleDarkMode: vi.fn().mockResolvedValue({ success: true, message: 'Dark mode is now enabled' }),
  captureScreen: vi.fn().mockResolvedValue('/tmp/shot.png'),
  playSystemEarcon: vi.fn().mockResolvedValue(undefined),
  speakText: vi.fn().mockResolvedValue({ success: true, message: 'Spoken', voiceUsed: 'Samantha' }),
  stopSpeaking: vi.fn().mockResolvedValue(undefined),
  listSystemVoices: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../stores/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: vi.fn().mockReturnValue({ activeWorkspace: { id: 'ws-test' } }),
  },
}));

describe('Deterministic Mathematical Engine (Bigfoot & CAS Pattern)', () => {
  it('evaluates arithmetic with correct operator precedence and functions', () => {
    expect(evaluateMath('25 * 40 + 12').value).toBe(1012);
    expect(evaluateMath('(15 + 5) * 4 / 2').value).toBe(40);
    expect(evaluateMath('sqrt(144) + 2^5').value).toBe(44);
    expect(evaluateMath('5!').value).toBe(120);
    expect(evaluateMath('50% * 200').value).toBe(100);
  });

  it('evaluates trigonometric functions in degrees and radians', () => {
    expect(evaluateMath('sin(90)', { angle: 'deg' }).value).toBe(1);
    expect(evaluateMath('cos(0)', { angle: 'deg' }).value).toBe(1);
    expect(evaluateMath('tan(45)', { angle: 'deg' }).value).toBe(1);
  });

  it('normalizes Unicode math symbols and LaTeX notation', () => {
    const expr = normalizeMathExpression('25 × 4 ÷ 2 + \\sqrt{16}');
    expect(expr).toBe('25 * 4 / 2 + sqrt(16)');
    expect(evaluateMath(expr).value).toBe(54);
  });

  it('solves single-variable linear equations', () => {
    const solution = solveEquation('3x + 9 = 24');
    expect(solution.variable).toBe('x');
    expect(solution.roots).toEqual([5]);
    expect(solution.text).toContain('x = 5');
    expect(solution.steps.length).toBeGreaterThan(1);
  });

  it('solves single-variable quadratic equations', () => {
    const solution = solveEquation('x^2 - 5x + 6 = 0');
    expect(solution.variable).toBe('x');
    expect(solution.roots).toEqual([2, 3]);
    expect(solution.text).toContain('x = 2, 3');
  });

  it('handles quadratic equations with no real solutions', () => {
    const solution = solveEquation('x^2 + 16 = 0');
    expect(solution.roots).toEqual([]);
    expect(solution.text).toBe('No real solutions');
  });

  it('solves systems of linear equations via Gaussian elimination', () => {
    const sys = solveSystem(['x + y = 10', 'x - y = 2']);
    expect(sys.values['x']).toBe(6);
    expect(sys.values['y']).toBe(4);
    expect(sys.text).toContain('x = 6');
    expect(sys.text).toContain('y = 4');
  });

  it('throws MathError for illegal math operations', () => {
    expect(() => evaluateMath('10 / 0')).toThrow(MathError);
    expect(() => evaluateMath('sqrt(-4)')).toThrow(MathError);
  });
});

describe('Zero-AI UI Command Engine (Bigfoot Pattern)', () => {
  it('strips polite conversational prefixes', () => {
    expect(cleanDirective('Hey Aeio, can you please press enter')).toBe('press enter');
    expect(cleanDirective('Could you please scroll down')).toBe('scroll down');
    expect(cleanDirective('I need you to refresh the page')).toBe('refresh the page');
  });

  it('matches keyboard commands directly', () => {
    const cmd1 = matchUiCommand('press enter');
    expect(cmd1?.kind).toBe('key');
    expect(cmd1?.keys).toBe('enter');

    const cmd2 = matchUiCommand('hit escape');
    expect(cmd2?.kind).toBe('key');
    expect(cmd2?.keys).toBe('escape');

    const cmd3 = matchUiCommand('press tab');
    expect(cmd3?.kind).toBe('key');
    expect(cmd3?.keys).toBe('tab');
  });

  it('matches navigation and page refresh commands', () => {
    expect(matchUiCommand('go back')?.keys).toBe('alt+left');
    expect(matchUiCommand('go forward')?.keys).toBe('alt+right');
    expect(matchUiCommand('refresh page')?.keys).toBe('f5');
  });

  it('matches scrolling commands with calibrated step sizes', () => {
    const cmdNormal = matchUiCommand('scroll down');
    expect(cmdNormal?.kind).toBe('scroll');
    expect(cmdNormal?.amount).toBe(6);

    const cmdLot = matchUiCommand('scroll down a lot');
    expect(cmdLot?.amount).toBe(12);

    const cmdLittle = matchUiCommand('scroll up a little');
    expect(cmdLittle?.amount).toBe(3);
  });

  it('matches text typing and app launching', () => {
    const typeCmd = matchUiCommand('type "Welcome to Aeio"');
    expect(typeCmd?.kind).toBe('type');
    expect(typeCmd?.text).toBe('Welcome to Aeio');

    const appCmd = matchUiCommand('open Spotify');
    expect(appCmd?.kind).toBe('open_app');
    expect(appCmd?.appName).toBe('Spotify');
  });

  it('resolves accessibility screen elements with fuzzy scoring and spatial deduplication', () => {
    const elements: ScreenElement[] = [
      { name: 'Sign in to your account', kind: 'item', center: { x: 100, y: 200 } },
      { name: 'Sign in', kind: 'button', center: { x: 100, y: 200 } }, // Overlapping centroid -> prefers button
      { name: 'Cancel', kind: 'button', center: { x: 300, y: 400 } },
    ];

    const matched = findScreenElement(elements, 'Sign in');
    expect(matched).not.toBeNull();
    expect(matched?.kind).toBe('button');
    expect(matched?.name).toBe('Sign in');
  });
});

describe('Compound Intent & Follow-up Splitting', () => {
  it('splits compound multi-step directives into instant action and follow-up', () => {
    const [action1, followUp1] = splitFollowUp('search youtube for react tutorials and then summarize them');
    expect(action1).toBe('search youtube for react tutorials');
    expect(followUp1).toBe('summarize them');

    const [action2, followUp2] = splitFollowUp('google machine learning and list the top 5 papers');
    expect(action2).toBe('google machine learning');
    expect(followUp2).toBe('list the top 5 papers');

    const [simpleAction, noFollowUp] = splitFollowUp('search youtube for lo-fi beats');
    expect(simpleAction).toBe('search youtube for lo-fi beats');
    expect(noFollowUp).toBeNull();
  });

  it('fast action executes instant math calculation without LLM call', async () => {
    const res = await matchAndExecuteFastAction('what is 25 * 40 + 50');
    expect(res).not.toBeNull();
    expect(res?.handledDeterministically).toBe(true);
    expect(res?.actionType).toBe('math_evaluate');
    expect(res?.feedbackText).toContain('1050');
  });

  it('fast action solves equations instantly without LLM call', async () => {
    const res = await matchAndExecuteFastAction('solve 3x + 9 = 24');
    expect(res).not.toBeNull();
    expect(res?.handledDeterministically).toBe(true);
    expect(res?.actionType).toBe('math_solve');
    expect(res?.feedbackText).toContain('x = 5');
  });

  it('fast action executes instant UI commands without LLM call', async () => {
    const res = await matchAndExecuteFastAction('press enter');
    expect(res).not.toBeNull();
    expect(res?.handledDeterministically).toBe(true);
    expect(res?.actionType).toBe('ui_key');
    expect(ipc.simulateKeyPress).toHaveBeenCalledWith('enter');
  });

  it('compound YouTube search populates followUp context for agent runner', async () => {
    const res = await matchAndExecuteFastAction('search YouTube for Next.js tutorial and summarize it');
    expect(res).not.toBeNull();
    expect(res?.actionType).toBe('youtube_search');
    expect(res?.followUp).toContain('summarize it');
    expect(res?.followUp).toContain('Next.js tutorial');
    expect(ipc.searchWebPlatform).toHaveBeenCalledWith('Next.js tutorial', 'youtube');
  });

  it('fast action inspects battery and system status instantly', async () => {
    const res = await matchAndExecuteFastAction('check battery');
    expect(res).not.toBeNull();
    expect(res?.actionType).toBe('system_status');
    expect(res?.feedbackText).toContain('85 percent');
    expect(ipc.getSystemStatus).toHaveBeenCalled();
  });

  it('fast action toggles dark mode instantly', async () => {
    const res = await matchAndExecuteFastAction('toggle dark mode');
    expect(res).not.toBeNull();
    expect(res?.actionType).toBe('toggle_dark_mode');
    expect(ipc.toggleDarkMode).toHaveBeenCalled();
  });

  it('fast action captures screenshot instantly', async () => {
    const res = await matchAndExecuteFastAction('take a screenshot');
    expect(res).not.toBeNull();
    expect(res?.actionType).toBe('take_screenshot');
    expect(ipc.captureScreen).toHaveBeenCalled();
  });

  it('fast action lists running apps and focuses specific app', async () => {
    const listRes = await matchAndExecuteFastAction('what apps are open');
    expect(listRes).not.toBeNull();
    expect(listRes?.actionType).toBe('list_running_apps');
    expect(listRes?.feedbackText).toContain('Finder, Chrome, Slack');

    const focusRes = await matchAndExecuteFastAction('bring Chrome to front');
    expect(focusRes).not.toBeNull();
    expect(focusRes?.actionType).toBe('focus_app');
    expect(focusRes?.feedbackText).toContain('Switched to Chrome');
    expect(ipc.focusApp).toHaveBeenCalledWith('Chrome');
  });
});
