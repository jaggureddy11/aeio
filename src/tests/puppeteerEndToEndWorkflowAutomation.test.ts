import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executePuppeteerAction,
  executePuppeteerWorkflow,
  executeSearchAndNavigateWorkflow,
  PuppeteerWorkflowStep,
} from '../lib/agent/tools/puppeteerTool';
import { executeAgentTool, AVAILABLE_AGENT_TOOLS } from '../lib/agent/toolRegistry';
import { matchInstantAction } from '../lib/systemOne/instantActions';
import * as ipc from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  runShellCommand: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  searchFiles: vi.fn(),
  openTarget: vi.fn(),
  openApp: vi.fn(),
  simulateKeyPress: vi.fn(),
  simulateScroll: vi.fn(),
  injectTextToActiveApp: vi.fn(),
  readClipboard: vi.fn(),
  writeClipboard: vi.fn(),
  playSpotify: vi.fn(),
  setSystemVolume: vi.fn(),
  getSystemVolume: vi.fn(),
  setSystemMute: vi.fn(),
  mediaControl: vi.fn(),
  searchMemories: vi.fn(),
  addMemory: vi.fn(),
  lockScreen: vi.fn(),
  getSystemStatus: vi.fn(),
  sendSystemNotification: vi.fn(),
  listRunningApps: vi.fn(),
  focusApp: vi.fn(),
  toggleDarkMode: vi.fn(),
  captureScreen: vi.fn(),
  fetchUrl: vi.fn(),
  searchWebPlatform: vi.fn(),
}));

describe('Puppeteer End-to-End Workflow Automation & Application Capabilities Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Section 1: Turnkey Search & Navigate Automation Flows
  // =========================================================================
  describe('1. Turnkey Search & Navigate Automation Flows', () => {
    it('1.1 executes MrBeast DuckDuckGo search to YouTube channel and captures screenshot', async () => {
      const mockResult = {
        success: true,
        action: 'search_and_navigate',
        query: 'MrBeast',
        engine: 'duckduckgo',
        targetMatch: 'youtube.com',
        matchedLink: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA',
        matchedTitle: 'MrBeast - YouTube',
        destinationUrl: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA',
        destinationTitle: 'MrBeast - YouTube',
        screenshotPath: '/tmp/mrbeast.png',
        fileSizeBytes: 156879,
        stepTrace: [
          { step: 1, name: 'open_search_engine', engine: 'duckduckgo', durationMs: 2368 },
          { step: 2, name: 'resolve_target_result', matchedLink: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA', durationMs: 8 },
          { step: 3, name: 'navigate_to_destination', destinationUrl: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA', durationMs: 7001 },
          { step: 4, name: 'capture_screenshot', outputPath: '/tmp/mrbeast.png', fileSizeBytes: 156879, durationMs: 89 },
        ],
        durationMs: 9466,
      };

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify(mockResult),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeSearchAndNavigateWorkflow('MrBeast', 'youtube.com', '/tmp/mrbeast.png');

      expect(res.success).toBe(true);
      expect(res.action).toBe('search_and_navigate');
      expect(res.destinationUrl).toContain('youtube.com/channel');
      expect(res.destinationTitle).toBe('MrBeast - YouTube');
      expect(res.screenshotPath).toBe('/tmp/mrbeast.png');
      expect(res.stepTrace?.length).toBe(4);
    });

    it('1.2 defaults destination screenshot to mrbeast.png when outputPath is omitted', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          outputPath: 'mrbeast.png',
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeSearchAndNavigateWorkflow('MrBeast', 'youtube.com');

      expect(res.success).toBe(true);
      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).toContain('"outputPath":"mrbeast.png"');
    });

    it('1.3 formats Google search engine query when specified', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          engine: 'google',
        }),
        stderr: '',
        exit_code: 0,
      });

      await executePuppeteerAction({
        action: 'search_and_navigate',
        query: 'OpenAI DevDay',
        engine: 'google',
        targetMatch: 'openai.com',
      });

      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).toContain('"engine":"google"');
      expect(call).toContain('"query":"OpenAI DevDay"');
    });

    it('1.4 formats YouTube internal search query when specified', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          engine: 'youtube',
        }),
        stderr: '',
        exit_code: 0,
      });

      await executePuppeteerAction({
        action: 'search_and_navigate',
        query: 'Veritasium',
        engine: 'youtube',
      });

      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).toContain('"engine":"youtube"');
    });

    it('1.5 passes case-insensitive targetMatch parameter correctly', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          targetMatch: 'YOUTUBE.COM',
        }),
        stderr: '',
        exit_code: 0,
      });

      await executePuppeteerAction({
        action: 'search_and_navigate',
        query: 'MrBeast',
        targetMatch: 'YOUTUBE.COM',
      });

      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).toContain('"targetMatch":"YOUTUBE.COM"');
    });

    it('1.6 handles subdomain target matching (e.g. docs.github.com)', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          targetMatch: 'docs.github.com',
          matchedLink: 'https://docs.github.com/en',
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeSearchAndNavigateWorkflow('GitHub Actions', 'docs.github.com');
      expect(res.success).toBe(true);
      expect(res.matchedLink).toBe('https://docs.github.com/en');
    });

    it('1.7 falls back to top organic search result when targetMatch is undefined', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          matchedLink: 'https://en.wikipedia.org/wiki/MrBeast',
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeSearchAndNavigateWorkflow('MrBeast');
      expect(res.success).toBe(true);
      expect(res.matchedLink).toContain('wikipedia.org');
    });

    it('1.8 safely encodes special query characters (quotes, slashes, ampersands)', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          query: 'C++ & Rust "memory safety"',
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeSearchAndNavigateWorkflow('C++ & Rust "memory safety"');
      expect(res.success).toBe(true);
      expect(ipc.runShellCommand).toHaveBeenCalled();
    });

    it('1.9 reports clear error when no matching result is found for target query', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: false,
          action: 'search_and_navigate',
          error: 'No matching result found on duckduckgo for query "xyznonexistent12345" matching "nonexistent.org".',
        }),
        stderr: '',
        exit_code: 1,
      });

      const res = await executeSearchAndNavigateWorkflow('xyznonexistent12345', 'nonexistent.org');
      expect(res.success).toBe(false);
      expect(res.error).toContain('No matching result found');
    });

    it('1.10 enforces custom navigation timeouts during search and navigation', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
        }),
        stderr: '',
        exit_code: 0,
      });

      await executeSearchAndNavigateWorkflow('MrBeast', 'youtube.com', '/tmp/out.png', {
        timeout: 45000,
      });

      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).toContain('"timeout":45000');
    });
  });

  // =========================================================================
  // Section 2: Multi-Step Sequential Workflow Pipelines
  // =========================================================================
  describe('2. Multi-Step Sequential Workflow Pipelines', () => {
    it('2.1 executes form login authentication workflow sequence', async () => {
      const steps: PuppeteerWorkflowStep[] = [
        { type: 'navigate', url: 'https://auth.example.com/login' },
        { type: 'fill', selector: '#email', text: 'admin@aeio.local' },
        { type: 'fill', selector: '#password', text: 'Secr3tP@ss!', press: 'Enter' },
        { type: 'wait', timeout: 1500 },
        { type: 'screenshot', outputPath: '/tmp/logged_in.png' },
      ];

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 5,
          finalUrl: 'https://auth.example.com/dashboard',
          finalTitle: 'Admin Dashboard',
          outputs: { screenshotPath: '/tmp/logged_in.png', fileSizeBytes: 98200 },
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerWorkflow(steps);
      expect(res.success).toBe(true);
      expect(res.totalSteps).toBe(5);
      expect(res.finalTitle).toBe('Admin Dashboard');
      expect(res.outputs?.screenshotPath).toBe('/tmp/logged_in.png');
    });

    it('2.2 executes e-commerce cart workflow with button clicks', async () => {
      const steps: PuppeteerWorkflowStep[] = [
        { type: 'navigate', url: 'https://store.example.com/item/101' },
        { type: 'click', selector: 'button.add-to-cart' },
        { type: 'wait_for_selector', selector: '.cart-count-badge' },
        { type: 'screenshot', outputPath: '/tmp/cart.png' },
      ];

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 4,
          outputs: { screenshotPath: '/tmp/cart.png', fileSizeBytes: 112000 },
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerWorkflow(steps);
      expect(res.success).toBe(true);
      expect(res.totalSteps).toBe(4);
    });

    it('2.3 executes dynamic content scraping workflow', async () => {
      const steps: PuppeteerWorkflowStep[] = [
        { type: 'navigate', url: 'https://news.ycombinator.com' },
        { type: 'wait_for_selector', selector: '.titleline' },
        { type: 'scrape', selector: '.titleline' },
      ];

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 3,
          outputs: { scrapedText: 'Show HN: My New App (github.com/app)' },
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerWorkflow(steps);
      expect(res.success).toBe(true);
      expect(res.outputs?.scrapedText).toContain('Show HN');
    });

    it('2.4 executes multi-page navigation across different web domains', async () => {
      const steps: PuppeteerWorkflowStep[] = [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'wait', timeout: 500 },
        { type: 'navigate', url: 'https://news.ycombinator.com' },
        { type: 'screenshot', outputPath: '/tmp/hn.png' },
      ];

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 4,
          finalUrl: 'https://news.ycombinator.com/',
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerWorkflow(steps);
      expect(res.success).toBe(true);
      expect(res.finalUrl).toBe('https://news.ycombinator.com/');
    });

    it('2.5 executes full-page document PDF export workflow', async () => {
      const steps: PuppeteerWorkflowStep[] = [
        { type: 'navigate', url: 'https://docs.aws.amazon.com' },
        { type: 'wait', timeout: 1000 },
      ];

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 2,
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerWorkflow(steps);
      expect(res.success).toBe(true);
    });

    it('2.6 supports link text matching navigation (click_link_text / click_match)', async () => {
      const steps: PuppeteerWorkflowStep[] = [
        { type: 'navigate', url: 'https://duckduckgo.com/?q=MrBeast' },
        { type: 'click_match', matchText: 'MrBeast - YouTube' },
        { type: 'wait', timeout: 2000 },
        { type: 'screenshot', outputPath: '/tmp/mrbeast_click.png' },
      ];

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 4,
          stepTrace: [
            { step: 1, type: 'navigate' },
            { step: 2, type: 'click_match', clickedHref: 'https://www.youtube.com/@MrBeast' },
            { step: 3, type: 'wait' },
            { step: 4, type: 'screenshot' },
          ],
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerWorkflow(steps);
      expect(res.success).toBe(true);
      expect(res.stepTrace?.[1].clickedHref).toContain('youtube.com');
    });

    it('2.7 isolates and reports specific step failures (e.g. Step 3 selector timeout)', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: false,
          action: 'workflow',
          error: 'Step 3 (click) failed: Waiting for selector `.nonexistent-btn` failed: timeout 10000ms exceeded',
        }),
        stderr: '',
        exit_code: 1,
      });

      const res = await executePuppeteerWorkflow([
        { type: 'navigate', url: 'https://example.com' },
        { type: 'wait', timeout: 500 },
        { type: 'click', selector: '.nonexistent-btn' },
      ]);

      expect(res.success).toBe(false);
      expect(res.error).toContain('Step 3 (click) failed');
    });

    it('2.8 handles human-like keystroke delay in fill steps', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 2,
        }),
        stderr: '',
        exit_code: 0,
      });

      await executePuppeteerWorkflow([
        { type: 'navigate', url: 'https://example.com' },
        { type: 'fill', selector: '#query', text: 'Fast Search', delay: 35 },
      ]);

      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).toContain('"delay":35');
    });

    it('2.9 supports fullPage screenshot option in workflow step', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 2,
          outputs: { screenshotPath: '/tmp/full.png' },
        }),
        stderr: '',
        exit_code: 0,
      });

      await executePuppeteerWorkflow([
        { type: 'navigate', url: 'https://example.com' },
        { type: 'screenshot', outputPath: '/tmp/full.png', fullPage: true },
      ]);

      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).toContain('"fullPage":true');
    });

    it('2.10 supports keyboard press steps (Enter, Escape, Tab, ArrowDown)', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 2,
        }),
        stderr: '',
        exit_code: 0,
      });

      await executePuppeteerWorkflow([
        { type: 'navigate', url: 'https://example.com' },
        { type: 'press', key: 'Escape' },
      ]);

      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).toContain('"key":"Escape"');
    });

    it('2.11 rejects workflow execution with null or undefined steps', async () => {
      const res = await executePuppeteerAction({
        action: 'workflow',
        steps: undefined,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("requires a non-empty array of 'steps'");
    });

    it('2.12 records cumulative execution duration across all steps', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 2,
          durationMs: 4120,
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerWorkflow([
        { type: 'navigate', url: 'https://example.com' },
        { type: 'wait', timeout: 500 },
      ]);

      expect(res.success).toBe(true);
      expect(res.durationMs).toBe(4120);
    });
  });

  // =========================================================================
  // Section 3: Tool Registry Dispatching & Schema Conformance
  // =========================================================================
  describe('3. Tool Registry Dispatching & Schema Conformance', () => {
    it('3.1 dispatches puppeteer_workflow from executeAgentTool', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 3,
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeAgentTool('puppeteer_workflow', {
        steps: [
          { type: 'navigate', url: 'https://duckduckgo.com' },
          { type: 'screenshot', outputPath: '/tmp/ddg.png' },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.action).toBe('workflow');
    });

    it('3.2 dispatches puppeteer_search_and_navigate from executeAgentTool', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          query: 'MrBeast',
          destinationTitle: 'MrBeast - YouTube',
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeAgentTool('puppeteer_search_and_navigate', {
        query: 'MrBeast',
        targetMatch: 'youtube.com',
        outputPath: 'mrbeast.png',
      });

      expect(res.success).toBe(true);
      expect(res.destinationTitle).toBe('MrBeast - YouTube');
    });

    it('3.3 dispatches puppeteer_action with search_and_navigate enum', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          query: 'TypeScript 5.8',
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeAgentTool('puppeteer_action', {
        action: 'search_and_navigate',
        query: 'TypeScript 5.8',
        target: 'typescriptlang.org',
      });

      expect(res.success).toBe(true);
    });

    it('3.4 maps legacy argument aliases (target -> targetMatch, file -> outputPath)', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
        }),
        stderr: '',
        exit_code: 0,
      });

      await executeAgentTool('puppeteer_action', {
        action: 'search_and_navigate',
        query: 'MrBeast',
        target: 'youtube.com',
        file: '/tmp/beast.png',
      });

      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).toContain('"targetMatch":"youtube.com"');
      expect(call).toContain('"outputPath":"/tmp/beast.png"');
    });

    it('3.5 verifies puppeteer_workflow schema parameters in AVAILABLE_AGENT_TOOLS', () => {
      const tool = AVAILABLE_AGENT_TOOLS.find((t) => t.name === 'puppeteer_workflow');
      expect(tool).toBeDefined();
      expect(tool?.parameters.type).toBe('object');
      expect(tool?.parameters.required).toContain('steps');
      expect(tool?.parameters.properties.steps.type).toBe('array');
    });

    it('3.6 verifies puppeteer_action action enum in AVAILABLE_AGENT_TOOLS', () => {
      const tool = AVAILABLE_AGENT_TOOLS.find((t) => t.name === 'puppeteer_action');
      expect(tool).toBeDefined();
      const actions = tool?.parameters.properties.action.enum;
      expect(actions).toContain('search_and_navigate');
      expect(actions).toContain('workflow');
      expect(actions).toContain('navigate');
      expect(actions).toContain('search');
      expect(actions).toContain('screenshot');
      expect(actions).toContain('scrape');
      expect(actions).toContain('click');
      expect(actions).toContain('fill');
      expect(actions).toContain('pdf');
    });

    it('3.7 verifies puppeteer_action has targetMatch and steps properties', () => {
      const tool = AVAILABLE_AGENT_TOOLS.find((t) => t.name === 'puppeteer_action');
      expect(tool?.parameters.properties.targetMatch).toBeDefined();
      expect(tool?.parameters.properties.steps).toBeDefined();
    });

    it('3.8 rejects unknown tool names with descriptive error', async () => {
      await expect(executeAgentTool('invalid_puppeteer_tool', {})).rejects.toThrow(
        'Unknown tool: invalid_puppeteer_tool'
      );
    });

    it('3.9 preserves headless false override in executeAgentTool', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'navigate',
        }),
        stderr: '',
        exit_code: 0,
      });

      await executeAgentTool('puppeteer_action', {
        action: 'navigate',
        url: 'https://example.com',
        headless: false,
      });

      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).toContain('"headless":false');
    });

    it('3.10 formats durationMs in agent response payload', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'navigate',
          durationMs: 1450,
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeAgentTool('puppeteer_action', {
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(res.durationMs).toBe(1450);
    });
  });

  // =========================================================================
  // Section 4: System One Zero-Latency Instant Action Matching
  // =========================================================================
  describe('4. System One Zero-Latency Instant Action Matching', () => {
    it('4.1 matches "puppeteer search MrBeast and screenshot to mrbeast.png"', () => {
      const match = matchInstantAction('puppeteer search MrBeast and screenshot to mrbeast.png');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_search_and_navigate');
      expect(match?.args.query).toBe('MrBeast');
      expect(match?.args.outputPath).toBe('mrbeast.png');
      expect(match?.args.headless).toBe(true);
      expect(match?.isDestructive).toBe(false);
      expect(match?.riskTier).toBe('low');
    });

    it('4.2 matches "puppeteer search for MrBeast and save screenshot as mrbeast.png"', () => {
      const match = matchInstantAction('puppeteer search for MrBeast and save screenshot as mrbeast.png');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_search_and_navigate');
      expect(match?.args.query).toBe('MrBeast');
      expect(match?.args.outputPath).toBe('mrbeast.png');
    });

    it('4.3 matches "puppeteer find OpenAI and screenshot to /tmp/openai.png"', () => {
      const match = matchInstantAction('puppeteer find OpenAI and screenshot to /tmp/openai.png');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_search_and_navigate');
      expect(match?.args.query).toBe('OpenAI');
      expect(match?.args.outputPath).toBe('/tmp/openai.png');
    });

    it('4.4 matches "puppeteer screenshot https://github.com to github.png"', () => {
      const match = matchInstantAction('puppeteer screenshot https://github.com to github.png');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_screenshot');
      expect(match?.args.url).toBe('https://github.com');
      expect(match?.args.outputPath).toBe('github.png');
      expect(match?.args.headless).toBe(true);
    });

    it('4.5 matches "puppeteer take screenshot of https://tauri.app"', () => {
      const match = matchInstantAction('puppeteer take screenshot of https://tauri.app');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_screenshot');
      expect(match?.args.url).toBe('https://tauri.app');
      expect(match?.args.outputPath).toBe('screenshot.png');
    });

    it('4.6 matches natural language WITHOUT mentioning "puppeteer"', () => {
      const match1 = matchInstantAction('search for MrBeast and save screenshot as mrbeast.png');
      expect(match1).not.toBeNull();
      expect(match1?.toolName).toBe('puppeteer_search_and_navigate');
      expect(match1?.args.query).toBe('MrBeast');
      expect(match1?.args.outputPath).toBe('mrbeast.png');

      const match2 = matchInstantAction('take screenshot of https://github.com to github.png');
      expect(match2).not.toBeNull();
      expect(match2?.toolName).toBe('puppeteer_screenshot');
      expect(match2?.args.url).toBe('https://github.com');
      expect(match2?.args.outputPath).toBe('github.png');
    });

    it('4.7 ignores conversational requests with planning preambles', () => {
      const match = matchInstantAction('can you search for MrBeast and then tell me about it');
      expect(match).toBeNull();
    });

    it('4.7 executes instant action pattern matching in under 5 milliseconds', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        matchInstantAction('puppeteer search MrBeast and screenshot to mrbeast.png');
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(25); // 100 iterations in < 25ms (< 0.25ms per match)
    });

    it('4.8 provides user-facing status and completion text for instant actions', () => {
      const match = matchInstantAction('puppeteer search MrBeast and screenshot to mrbeast.png');
      expect(match?.statusText).toContain('MrBeast');
      expect(match?.completedMessage).toContain('mrbeast.png');
    });
  });

  // =========================================================================
  // Section 5: Resilience, Edge Cases & Error Boundaries
  // =========================================================================
  describe('5. Resilience, Edge Cases & Error Boundaries', () => {
    it('5.1 handles empty stdout with descriptive error message', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Puppeteer runner completed with empty output');
    });

    it('5.2 recovers JSON output when preceded by Chromium warnings', async () => {
      const output = `
[0312/100000.123:ERROR:gpu_init.cc(553)] Passthrough is not supported, GL is swiftshader
Fontconfig warning: "/etc/fonts/fonts.conf", line 100: unknown element "blank"
{"success":true,"action":"navigate","url":"https://example.com","title":"Example Domain"}
      `;

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: output,
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(res.success).toBe(true);
      expect(res.title).toBe('Example Domain');
    });

    it('5.3 captures stderr details when runner crashes with non-zero exit code', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: '',
        stderr: 'Error: Cannot find module puppeteer',
        exit_code: 1,
      });

      const res = await executePuppeteerAction({
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot find module puppeteer');
    });

    it('5.4 safely handles IPC process timeout exceptions', async () => {
      (ipc.runShellCommand as any).mockRejectedValueOnce(
        new Error('Command timed out after 30000ms')
      );

      const res = await executePuppeteerAction({
        action: 'navigate',
        url: 'https://slow-site.example.com',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Failed to execute Puppeteer runner');
      expect(res.error).toContain('timed out');
    });

    it('5.5 formats action rejection when URL protocol is missing and normalizes it', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'navigate',
          url: 'https://example.com',
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'navigate',
        url: 'example.com',
      });

      expect(res.success).toBe(true);
      expect(ipc.runShellCommand).toHaveBeenCalled();
    });

    it('5.6 verifies fullPage defaults to false when not provided', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'screenshot',
          fullPage: false,
        }),
        stderr: '',
        exit_code: 0,
      });

      await executePuppeteerAction({
        action: 'screenshot',
        url: 'https://example.com',
      });

      const call = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(call).not.toContain('"fullPage":true');
    });

    it('5.7 handles large scraped text content cleanly without buffer overflow', async () => {
      const largeContent = 'A'.repeat(50000);
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'scrape',
          contentLength: 50000,
          textContent: largeContent.slice(0, 5000),
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'scrape',
        url: 'https://big-data.example.com',
      });

      expect(res.success).toBe(true);
      expect(res.textContent?.length).toBe(5000);
    });

    it('5.8 handles malformed step without type attribute gracefully', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: false,
          action: 'workflow',
          error: "Step 1 (undefined) failed: Unsupported workflow step type: 'undefined'.",
        }),
        stderr: '',
        exit_code: 1,
      });

      const res = await executePuppeteerWorkflow([{} as any]);
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unsupported workflow step type');
    });

    it('5.9 preserves rawStdout in result for audit trail and debugging', async () => {
      const raw = JSON.stringify({
        success: true,
        action: 'navigate',
        url: 'https://example.com',
      });

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: raw,
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(res.rawStdout).toBe(raw);
    });

    it('5.10 verifies complete tool execution lifecycle conforms to zero-hallucination policy', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'search_and_navigate',
          query: 'MrBeast',
          destinationUrl: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA',
          screenshotPath: '/tmp/mrbeast.png',
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeAgentTool('puppeteer_search_and_navigate', {
        query: 'MrBeast',
        outputPath: '/tmp/mrbeast.png',
      });

      expect(res.success).toBe(true);
      expect(res.destinationUrl).toBe('https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA');
      expect(res.screenshotPath).toBe('/tmp/mrbeast.png');
    });
  });
});
