import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executePuppeteerAction,
  executePuppeteerWorkflow,
  executeSearchAndNavigateWorkflow,
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

describe('Puppeteer Browser Automation Tool (Architecture, Workflows & Error Handling)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Parameter Validation & Headless Defaults
  // =========================================================================
  describe('Parameter Validation & Headless Defaults', () => {
    it('1. defaults to headless: true when not specified', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'navigate',
          url: 'https://example.com',
          title: 'Example Domain',
        }),
        stderr: '',
        exit_code: 0,
      });

      await executePuppeteerAction({
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(ipc.runShellCommand).toHaveBeenCalled();
      const calledCommand = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(calledCommand).toContain('"headless":true');
    });

    it('2. preserves headless: false when explicitly requested (headed mode)', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'navigate',
          url: 'https://example.com',
          title: 'Example Domain',
        }),
        stderr: '',
        exit_code: 0,
      });

      await executePuppeteerAction({
        action: 'navigate',
        url: 'https://example.com',
        headless: false,
      });

      const calledCommand = (ipc.runShellCommand as any).mock.calls[0][0];
      expect(calledCommand).toContain('"headless":false');
    });

    it('3. rejects actions missing a target URL without spawning the browser', async () => {
      const res = await executePuppeteerAction({
        action: 'navigate',
        url: '',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("requires a valid target 'url'");
      expect(ipc.runShellCommand).not.toHaveBeenCalled();
    });

    it('4. rejects search actions missing a search query string', async () => {
      const res = await executePuppeteerAction({
        action: 'search',
        query: '   ',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("requires a non-empty 'query'");
      expect(ipc.runShellCommand).not.toHaveBeenCalled();
    });

    it('5. rejects workflow action with empty steps array', async () => {
      const res = await executePuppeteerAction({
        action: 'workflow',
        steps: [],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("requires a non-empty array of 'steps'");
      expect(ipc.runShellCommand).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. End-to-End Workflow Automations (Search & Navigate, Multi-step)
  // =========================================================================
  describe('End-to-End Workflow Automations', () => {
    it('6. executes search_and_navigate flow (MrBeast DuckDuckGo search -> YouTube channel -> screenshot)', async () => {
      const mockResult = {
        success: true,
        action: 'search_and_navigate',
        query: 'MrBeast YouTube',
        engine: 'duckduckgo',
        targetMatch: 'youtube.com',
        matchedLink: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA',
        matchedTitle: 'MrBeast - YouTube',
        destinationUrl: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA',
        destinationTitle: 'MrBeast - YouTube',
        screenshotPath: '/tmp/mrbeast.png',
        fileSizeBytes: 156879,
        stepTrace: [
          { step: 1, name: 'open_search_engine', engine: 'duckduckgo' },
          { step: 2, name: 'resolve_target_result', matchedLink: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA' },
          { step: 3, name: 'navigate_to_destination', destinationUrl: 'https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA' },
          { step: 4, name: 'capture_screenshot', outputPath: '/tmp/mrbeast.png', fileSizeBytes: 156879 },
        ],
        durationMs: 4200,
      };

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify(mockResult),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeSearchAndNavigateWorkflow('MrBeast YouTube', 'youtube.com', '/tmp/mrbeast.png');

      expect(res.success).toBe(true);
      expect(res.action).toBe('search_and_navigate');
      expect(res.matchedLink).toContain('youtube.com');
      expect(res.destinationTitle).toBe('MrBeast - YouTube');
      expect(res.screenshotPath).toBe('/tmp/mrbeast.png');
      expect(res.stepTrace?.length).toBe(4);
    });

    it('7. executes multi-step sequential workflow via executePuppeteerWorkflow', async () => {
      const mockWorkflowResult = {
        success: true,
        action: 'workflow',
        totalSteps: 4,
        finalUrl: 'https://duckduckgo.com/?q=DuckDuckGo+Privacy',
        finalTitle: 'DuckDuckGo Privacy at DuckDuckGo',
        stepTrace: [
          { step: 1, type: 'navigate', url: 'https://duckduckgo.com' },
          { step: 2, type: 'fill', selector: 'textarea[name="q"]', typedLength: 18 },
          { step: 3, type: 'wait', waitedMs: 1500 },
          { step: 4, type: 'screenshot', outputPath: '/tmp/workflow.png', fileSizeBytes: 104500 },
        ],
        outputs: {
          screenshotPath: '/tmp/workflow.png',
          fileSizeBytes: 104500,
        },
        durationMs: 3800,
      };

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify(mockWorkflowResult),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerWorkflow([
        { type: 'navigate', url: 'https://duckduckgo.com' },
        { type: 'fill', selector: 'textarea[name="q"]', text: 'DuckDuckGo Privacy', press: 'Enter' },
        { type: 'wait', timeout: 1500 },
        { type: 'screenshot', outputPath: '/tmp/workflow.png' },
      ]);

      expect(res.success).toBe(true);
      expect(res.action).toBe('workflow');
      expect(res.totalSteps).toBe(4);
      expect(res.outputs?.screenshotPath).toBe('/tmp/workflow.png');
    });

    it('8. executes automated search flow on DuckDuckGo and parses results and screenshot', async () => {
      const mockResult = {
        success: true,
        action: 'search',
        query: 'MrBeast',
        engine: 'duckduckgo',
        url: 'https://duckduckgo.com/?q=MrBeast',
        title: 'MrBeast at DuckDuckGo',
        resultsCount: 2,
        results: [
          { title: 'MrBeast - YouTube', url: 'https://www.youtube.com/@MrBeast' },
          { title: 'MrBeast - Wikipedia', url: 'https://en.wikipedia.org/wiki/MrBeast' },
        ],
        screenshotPath: '/tmp/mrbeast.png',
        durationMs: 3400,
      };

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify(mockResult),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'search',
        query: 'MrBeast',
        engine: 'duckduckgo',
        outputPath: '/tmp/mrbeast.png',
      });

      expect(res.success).toBe(true);
      expect(res.action).toBe('search');
      expect(res.resultsCount).toBe(2);
      expect(res.results?.[0].title).toBe('MrBeast - YouTube');
      expect(res.screenshotPath).toBe('/tmp/mrbeast.png');
    });

    it('9. executes screenshot action and records output file size', async () => {
      const mockResult = {
        success: true,
        action: 'screenshot',
        url: 'https://www.youtube.com/@MrBeast',
        title: 'MrBeast - YouTube',
        outputPath: '/tmp/mrbeast.png',
        fileSizeBytes: 182400,
        fullPage: false,
        durationMs: 2100,
      };

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify(mockResult),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'screenshot',
        url: 'https://www.youtube.com/@MrBeast',
        outputPath: '/tmp/mrbeast.png',
      });

      expect(res.success).toBe(true);
      expect(res.outputPath).toBe('/tmp/mrbeast.png');
      expect(res.fileSizeBytes).toBe(182400);
    });

    it('10. executes scrape action on dynamic single-page applications', async () => {
      const mockResult = {
        success: true,
        action: 'scrape',
        url: 'https://app.example.com/dashboard',
        title: 'Dynamic SPA Dashboard',
        contentLength: 45000,
        textContent: 'Revenue: $120,000 | Active Users: 4,500',
        durationMs: 1800,
      };

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify(mockResult),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'scrape',
        url: 'https://app.example.com/dashboard',
        selector: '#stats-container',
      });

      expect(res.success).toBe(true);
      expect(res.textContent).toContain('Revenue: $120,000');
    });

    it('11. executes click action on interactive element selector', async () => {
      const mockResult = {
        success: true,
        action: 'click',
        targetUrl: 'https://shop.example.com',
        currentUrl: 'https://shop.example.com/cart',
        selector: '#add-to-cart',
        title: 'Shopping Cart',
        durationMs: 1200,
      };

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify(mockResult),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'click',
        url: 'https://shop.example.com',
        selector: '#add-to-cart',
      });

      expect(res.success).toBe(true);
      expect(res.action).toBe('click');
    });

    it('12. executes fill action for input fields', async () => {
      const mockResult = {
        success: true,
        action: 'fill',
        targetUrl: 'https://portal.example.com/login',
        selector: '#username-input',
        filledLength: 12,
        title: 'Login Portal',
        durationMs: 950,
      };

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify(mockResult),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'fill',
        url: 'https://portal.example.com/login',
        selector: '#username-input',
        text: 'automation_user',
      });

      expect(res.success).toBe(true);
      expect(res.action).toBe('fill');
    });

    it('13. executes pdf generation action with destination file', async () => {
      const mockResult = {
        success: true,
        action: 'pdf',
        url: 'https://docs.example.com',
        title: 'API Documentation',
        outputPath: '/tmp/docs.pdf',
        fileSizeBytes: 340000,
        durationMs: 2500,
      };

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify(mockResult),
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'pdf',
        url: 'https://docs.example.com',
        outputPath: '/tmp/docs.pdf',
      });

      expect(res.success).toBe(true);
      expect(res.outputPath).toBe('/tmp/docs.pdf');
    });
  });

  // =========================================================================
  // 3. Error Handling & Timeout Resilience
  // =========================================================================
  describe('Error Handling & Timeout Resilience', () => {
    it('14. handles shell execution failure with descriptive stderr message', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: '',
        stderr: 'node: command not found or permission denied',
        exit_code: 127,
      });

      const res = await executePuppeteerAction({
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Puppeteer execution failed');
      expect(res.error).toContain('node: command not found');
    });

    it('15. handles malformed stdout by attempting multi-line JSON recovery', async () => {
      const noisyOutput = `
[DevTools listening on ws://127.0.0.1:9222]
Fontconfig warning: ignoring UTF-8
${JSON.stringify({
  success: true,
  action: 'navigate',
  url: 'https://example.com',
  title: 'Recovered Title',
})}
      `;

      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: noisyOutput,
        stderr: '',
        exit_code: 0,
      });

      const res = await executePuppeteerAction({
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(res.success).toBe(true);
      expect(res.title).toBe('Recovered Title');
    });

    it('16. captures unparseable non-JSON output cleanly without throwing exceptions', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: 'Fatal error: Segmentation fault in core engine',
        stderr: '',
        exit_code: 1,
      });

      const res = await executePuppeteerAction({
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Could not parse Puppeteer JSON response');
    });

    it('17. handles underlying IPC invocation rejection cleanly', async () => {
      (ipc.runShellCommand as any).mockRejectedValueOnce(new Error('Tauri IPC socket closed unexpectedly'));

      const res = await executePuppeteerAction({
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Failed to execute Puppeteer runner');
      expect(res.error).toContain('Tauri IPC socket closed');
    });
  });

  // =========================================================================
  // 4. Tool Registry Dispatching & Schema Conformance
  // =========================================================================
  describe('Tool Registry Dispatching & Schema Conformance', () => {
    it('18. dispatches puppeteer_action through executeAgentTool', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'navigate',
          url: 'https://example.com',
          title: 'Dispatched Successfully',
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeAgentTool('puppeteer_action', {
        action: 'navigate',
        url: 'https://example.com',
      });

      expect(res.success).toBe(true);
      expect(res.title).toBe('Dispatched Successfully');
    });

    it('19. dispatches puppeteer_workflow through executeAgentTool', async () => {
      (ipc.runShellCommand as any).mockResolvedValueOnce({
        stdout: JSON.stringify({
          success: true,
          action: 'workflow',
          totalSteps: 2,
        }),
        stderr: '',
        exit_code: 0,
      });

      const res = await executeAgentTool('puppeteer_workflow', {
        steps: [
          { type: 'navigate', url: 'https://example.com' },
          { type: 'screenshot', outputPath: 'shot.png' },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.action).toBe('workflow');
    });

    it('20. dispatches puppeteer_search_and_navigate through executeAgentTool', async () => {
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

    it('21. verifies puppeteer_action and puppeteer_workflow schemas in AVAILABLE_AGENT_TOOLS', () => {
      const actionTool = AVAILABLE_AGENT_TOOLS.find((t) => t.name === 'puppeteer_action');
      expect(actionTool).toBeDefined();
      expect(actionTool?.parameters.properties.action.enum).toContain('search_and_navigate');
      expect(actionTool?.parameters.properties.action.enum).toContain('workflow');

      const workflowTool = AVAILABLE_AGENT_TOOLS.find((t) => t.name === 'puppeteer_workflow');
      expect(workflowTool).toBeDefined();
      expect(workflowTool?.parameters.required).toContain('steps');
    });
  });

  // =========================================================================
  // 5. System One Instant Action Pattern Matching
  // =========================================================================
  describe('System One Instant Action Matching', () => {
    it('22. instantly matches "puppeteer search MrBeast and screenshot to mrbeast.png"', () => {
      const match = matchInstantAction('puppeteer search MrBeast and screenshot to mrbeast.png');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_search_and_navigate');
      expect(match?.args.query).toBe('MrBeast');
      expect(match?.args.outputPath).toBe('mrbeast.png');
      expect(match?.args.headless).toBe(true);
    });

    it('23. instantly matches "puppeteer screenshot https://github.com to github.png"', () => {
      const match = matchInstantAction('puppeteer screenshot https://github.com to github.png');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('puppeteer_screenshot');
      expect(match?.args.url).toBe('https://github.com');
      expect(match?.args.outputPath).toBe('github.png');
    });
  });
});
