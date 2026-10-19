import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentTool, AVAILABLE_AGENT_TOOLS } from '../lib/agent/toolRegistry';
import { evaluateMath, solveEquation, solveSystem, MathError, getUnknownVariables } from '../lib/agent/tools/mathTool';
import {
  extractInteractiveElements,
  verifyPageState,
  clickBrowserElement,
  fillBrowserField,
} from '../lib/agent/tools/visualBrowserTool';
import {
  SearchResultViewModel,
  SearxngSearchService,
  SearxngResultItem,
} from '../lib/agent/tools/searxngSearch';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useSettingsStore } from '../stores/settingsStore';
import * as ipc from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  readFile: vi.fn().mockResolvedValue('file-content-sample'),
  writeFile: vi.fn().mockResolvedValue(true),
  searchFiles: vi.fn().mockResolvedValue(['src/index.ts', 'src/App.tsx']),
  runShellCommand: vi.fn().mockResolvedValue({ stdout: 'git v2.39', stderr: '', exit_code: 0 }),
  openTarget: vi.fn().mockResolvedValue(true),
  openApp: vi.fn().mockResolvedValue(true),
  simulateKeyPress: vi.fn().mockResolvedValue(true),
  simulateScroll: vi.fn().mockResolvedValue(true),
  injectTextToActiveApp: vi.fn().mockResolvedValue(true),
  readClipboard: vi.fn().mockResolvedValue('clipboard-sample-text'),
  writeClipboard: vi.fn().mockResolvedValue(true),
  playSpotify: vi.fn().mockResolvedValue(true),
  setSystemVolume: vi.fn().mockResolvedValue(true),
  getSystemVolume: vi.fn().mockResolvedValue({ volume: 80, muted: false }),
  setSystemMute: vi.fn().mockResolvedValue(true),
  mediaControl: vi.fn().mockResolvedValue(true),
  searchMemories: vi.fn().mockResolvedValue([{ id: 'm-1', content: 'Prefers dark theme' }]),
  addMemory: vi.fn().mockResolvedValue({ id: 'm-2', content: 'Uses AWS us-east-1' }),
  lockScreen: vi.fn().mockResolvedValue(true),
  getSystemStatus: vi.fn().mockResolvedValue({ cpu: 12.5, memory: 45.0, battery: 98 }),
  sendSystemNotification: vi.fn().mockResolvedValue(true),
  listRunningApps: vi.fn().mockResolvedValue(['Code', 'Spotify', 'Terminal']),
  focusApp: vi.fn().mockResolvedValue(true),
  toggleDarkMode: vi.fn().mockResolvedValue(true),
  captureScreen: vi.fn().mockResolvedValue('/tmp/screenshot.png'),
  captureScreenData: vi.fn().mockResolvedValue({
    base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    width: 1920,
    height: 1080,
  }),
  fetchUrl: vi.fn().mockResolvedValue(`
    <html>
      <head><title>Mock Test Portal</title></head>
      <body>
        <button id="submit-btn" name="submit">Confirm Order</button>
        <button name="cancel">Cancel</button>
        <input type="text" id="username" name="user" placeholder="Enter username" />
        <input type="password" id="pass" name="password" />
        <input type="hidden" name="csrf" value="secret" />
        <a href="https://example.com/help">Help Center</a>
      </body>
    </html>
  `),
  searchWebPlatform: vi.fn().mockResolvedValue('Web platform search mock result'),
}));

vi.mock('../lib/safety/inputDriver', () => ({
  executeGuardedStep: vi.fn().mockResolvedValue({
    status: 'SUCCESS',
    success: true,
    message: 'Guarded step executed successfully',
    target: { x: 500, y: 300 },
  }),
}));

vi.mock('../lib/safety/groundingClient', () => ({
  resolveGroundingTarget: vi.fn().mockResolvedValue({
    found: true,
    coordinates: { x: 450, y: 280 },
    confidence: 0.95,
  }),
}));

describe('Deep Tool Abilities, Precision Actions & System Capabilities (55 Tests)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      activeWorkspace: {
        id: 'ws-deep-test',
        name: 'Deep Test Workspace',
        is_active: true,
        is_archived: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    });
    useSettingsStore.setState({
      searxngUrl: 'http://localhost:8080',
    });
  });

  // =========================================================================
  // 1. Mathematical Engine Capabilities & Scientific Precision (Tests 1-12)
  // =========================================================================
  describe('Mathematical Engine Capabilities & Scientific Precision', () => {
    it('1. evaluates arithmetic precedence and nested operations accurately', () => {
      const res = evaluateMath('3 + 5 * (10 - 4) / 2');
      expect(res.value).toBe(18);
      expect(res.text).toBe('18');
    });

    it('2. evaluates square roots, cube roots, and exponential powers', () => {
      const resSqrt = evaluateMath('sqrt(256) + cbrt(27)');
      expect(resSqrt.value).toBe(19);

      const resPower = evaluateMath('2^8');
      expect(resPower.value).toBe(256);
    });

    it('3. evaluates trigonometric functions in degree mode by default', () => {
      const resSin = evaluateMath('sin(90)');
      expect(resSin.value).toBe(1);

      const resCos = evaluateMath('cos(0)');
      expect(resCos.value).toBe(1);

      const resTan = evaluateMath('tan(45)');
      expect(resTan.value).toBe(1);
    });

    it('4. evaluates trigonometric functions in radian mode when specified', () => {
      const resSin = evaluateMath('sin(pi / 2)', { angle: 'rad' });
      expect(resSin.value).toBe(1);

      const resCos = evaluateMath('cos(pi)', { angle: 'rad' });
      expect(resCos.value).toBe(-1);
    });

    it('5. prevents illegal domain calculations and throws descriptive MathErrors', () => {
      expect(() => evaluateMath('sqrt(-16)')).toThrow(MathError);
      expect(() => evaluateMath('ln(-5)')).toThrow(MathError);
      expect(() => evaluateMath('tan(90)', { angle: 'deg' })).toThrow(MathError);
    });

    it('6. solves simple linear equations with exact rational and decimal roots', () => {
      const sol = solveEquation('4x + 12 = 36');
      expect(sol.variable).toBe('x');
      expect(sol.roots).toEqual([6]);
      expect(sol.steps.length).toBeGreaterThan(1);
    });

    it('7. solves quadratic equations with distinct real roots', () => {
      const sol = solveEquation('x^2 - 7x + 10 = 0');
      expect(sol.variable).toBe('x');
      expect(sol.roots.sort()).toEqual([2, 5]);
      expect(sol.text).toContain('2');
      expect(sol.text).toContain('5');
    });

    it('8. detects quadratic equations with no real roots and flags negative discriminant', () => {
      const sol = solveEquation('x^2 + 4 = 0');
      expect(sol.roots).toEqual([]);
      expect(sol.text).toBe('No real solutions');
    });

    it('9. identifies algebraic identities and impossible contradictory statements', () => {
      const identity = solveEquation('x + 5 = x + 5');
      expect(identity.text).toBe('All real numbers');

      const impossible = solveEquation('x + 5 = x + 2');
      expect(impossible.text).toBe('No solution');
    });

    it('10. solves systems of two linear equations with two unknowns', () => {
      const sol = solveSystem(['2x + y = 10', 'x - y = 2']);
      expect(sol.values).toBeDefined();
      expect(sol.values['x']).toBe(4);
      expect(sol.values['y']).toBe(2);
      expect(sol.text).toContain('x = 4');
      expect(sol.text).toContain('y = 2');
    });

    it('11. extracts unknown variables accurately from math equations', () => {
      expect(getUnknownVariables('3a + 5 = 20')).toEqual(['a']);
      expect(getUnknownVariables('2x + 3y = 12')).toEqual(['x', 'y']);
      expect(getUnknownVariables('3 + 5 = 8')).toEqual([]);
    });

    it('12. preserves mathematical constants e and pi in evaluation', () => {
      const resPi = evaluateMath('2 * pi');
      expect(resPi.value).toBeCloseTo(6.2831853, 5);

      const resE = evaluateMath('exp(1)');
      expect(resE.value).toBeCloseTo(2.7182818, 5);
    });
  });

  // =========================================================================
  // 2. Web & Visual Browser Tool Actions (Tests 13-22)
  // =========================================================================
  describe('Web & Visual Browser Tool Actions', () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <header>
            <button id="login-button">Log In</button>
          </header>
          <main>
            <form id="checkout">
              <input type="text" id="cust-name" name="customer_name" placeholder="Full Name" />
              <input type="email" id="cust-email" name="email" />
              <input type="hidden" name="token" value="hidden123" />
              <button type="submit" name="pay">Submit Payment</button>
            </form>
            <a href="/terms" id="terms-link">Terms of Service</a>
            <a href="https://external.org">External Link</a>
          </main>
        </body>
      </html>
    `;

    it('13. extracts interactive DOM elements and assigns sequential indices', () => {
      const elements = extractInteractiveElements(sampleHtml);
      expect(elements.length).toBeGreaterThanOrEqual(4);
      expect(elements[0].index).toBe(1);
      expect(elements[1].index).toBe(2);
    });

    it('14. filters out hidden inputs while preserving actionable text and email inputs', () => {
      const elements = extractInteractiveElements(sampleHtml);
      const inputs = elements.filter((e) => e.tag === 'input');
      expect(inputs.some((i) => i.name === 'token')).toBe(false);
      expect(inputs.some((i) => i.name === 'customer_name')).toBe(true);
      expect(inputs.some((i) => i.name === 'email')).toBe(true);
    });

    it('15. discovers clickable buttons and generates exact CSS ID selectors', () => {
      const elements = extractInteractiveElements(sampleHtml);
      const loginBtn = elements.find((e) => e.selector === '#login-button');
      expect(loginBtn).toBeDefined();
      expect(loginBtn?.text).toBe('Log In');
    });

    it('16. simulates browser click on target element found by selector or index', async () => {
      const clickRes = await clickBrowserElement('https://mock-portal.com', 1);
      expect(clickRes.success).toBe(true);
      expect(clickRes.target).toBeDefined();
      expect(clickRes.message).toContain('Clicked');
    });

    it('17. handles browser click gracefully when element index is not found', async () => {
      const clickRes = await clickBrowserElement('https://mock-portal.com', 999);
      expect(clickRes.success).toBe(false);
      expect(clickRes.message).toContain('not found');
    });

    it('18. simulates filling form input fields with specified string values', async () => {
      const fillRes = await fillBrowserField('https://mock-portal.com', 'username', 'senior_tester');
      expect(fillRes.success).toBe(true);
      expect(fillRes.value).toBe('senior_tester');
      expect(fillRes.message).toContain('Filled input field');
    });

    it('19. handles browser fill gracefully when target input is missing', async () => {
      const fillRes = await fillBrowserField('https://mock-portal.com', 'non_existent_input', 'sample');
      expect(fillRes.success).toBe(false);
      expect(fillRes.message).toContain('not found');
    });

    it('20. verifies page state when expected confirmation string is present', () => {
      const html = '<div>Thank you! Your payment of $50.00 was successful. Reference: #99281</div>';
      const check = verifyPageState('payment of $50.00 was successful', html);
      expect(check.verified).toBe(true);
      expect(check.matchFound).toBe(true);
      expect(check.observation).toContain('State verification passed');
    });

    it('21. reports verification failure when expected substring is missing', () => {
      const html = '<div>Error: Credit card authorization failed. Please try again.</div>';
      const check = verifyPageState('Order Confirmed', html);
      expect(check.verified).toBe(false);
      expect(check.matchFound).toBe(false);
      expect(check.observation).toContain('State verification failed');
    });

    it('22. performs case-insensitive verification checks cleanly', () => {
      const html = '<div>DATABASE MIGRATION COMPLETED SUCCESSFULLY</div>';
      const check = verifyPageState('database migration completed', html);
      expect(check.verified).toBe(true);
    });
  });

  // =========================================================================
  // 3. GUI Vision & Desktop Interaction Tool Contracts (Tests 23-30)
  // =========================================================================
  describe('GUI Vision & Desktop Interaction Tool Contracts', () => {
    it('23. dispatches gui_click tool with explicit coordinates', async () => {
      const res = await executeAgentTool('gui_click', { x: 500, y: 300, app: 'Safari' });
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
    });

    it('24. dispatches gui_type tool with text payload and enter flag', async () => {
      const res = await executeAgentTool('gui_type', { text: 'git status\n', pressEnter: true });
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
    });

    it('25. dispatches gui_key_combo with modifier key combinations', async () => {
      const res = await executeAgentTool('gui_key_combo', { keys: ['cmd', 'shift', 'p'] });
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
    });

    it('26. dispatches gui_scroll with directional vectors and amounts', async () => {
      const res = await executeAgentTool('gui_scroll', { direction: 'down', amount: 8 });
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
    });

    it('27. dispatches gui_drag across coordinate boundaries', async () => {
      const res = await executeAgentTool('gui_drag', {
        startX: 100,
        startY: 100,
        endX: 400,
        endY: 400,
      });
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
    });

    it('28. dispatches gui_inspect_screen and captures screen layout metadata', async () => {
      const res = await executeAgentTool('gui_inspect_screen', {
        instruction: 'Find the blue submit button',
      });
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
    });

    it('29. dispatches browser_inspect tool to gather interactive page state', async () => {
      const res = await executeAgentTool('browser_inspect', {
        url: 'https://mock-portal.com',
        takeScreenshot: false,
      });
      expect(res).toBeDefined();
      expect(res.interactiveElements.length).toBeGreaterThan(0);
      expect(res.title).toBe('Mock Test Portal');
    });

    it('30. dispatches verify_page_state tool and returns verification status', async () => {
      const res = await executeAgentTool('verify_page_state', {
        expected: 'Confirm Order',
        content: '<button>Confirm Order</button>',
      });
      expect(res.verified).toBe(true);
    });
  });

  // =========================================================================
  // 4. SearXNG Relevance Heuristics & Information Filtering (Tests 31-40)
  // =========================================================================
  describe('SearXNG Relevance Heuristics & Information Filtering', () => {
    const mockItems: SearxngResultItem[] = [
      {
        title: 'TypeScript 5.4 Release Notes',
        url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-5-4/',
        content: 'TypeScript 5.4 introduces NoInfer utility types, closure type narrowing, and more.',
      },
      {
        title: 'What is Python GIL and how it works',
        url: 'https://realpython.com/python-gil/',
        content: 'The Python Global Interpreter Lock (GIL) allows only one thread to hold control of Python.',
      },
      {
        title: 'Understanding TypeScript Type Narrowing',
        url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html',
        content: 'Type narrowing in TypeScript refines types to more specific types based on control flow.',
      },
      {
        title: 'Rust Concurrency Patterns',
        url: 'https://doc.rust-lang.org/book/ch16-00-concurrency.html',
        content: 'Fearless concurrency in Rust with threads, message passing, and shared state.',
      },
    ];

    it('31. ranks relevant items higher when keywords match both title and content', async () => {
      const service = new SearxngSearchService();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: mockItems }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const vm = await service.search('TypeScript Type Narrowing');
      expect(vm.hasResults).toBe(true);
      expect(vm.essentialSources.length).toBeLessThanOrEqual(3);
      expect(vm.essentialSources[0].title).toContain('TypeScript');
    });

    it('32. filters out irrelevant items having zero keyword matches', async () => {
      const service = new SearxngSearchService();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: mockItems }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const vm = await service.search('Python GIL interpreter');
      expect(vm.essentialSources.length).toBe(1);
      expect(vm.essentialSources[0].title).toContain('Python GIL');
      expect(vm.essentialSources.some((s) => s.title.includes('Rust'))).toBe(false);
    });

    it('33. discards malformed result items lacking title or url', async () => {
      const service = new SearxngSearchService();
      const corruptedResults = [
        { title: '', url: 'https://bad.com', content: 'No title' },
        { title: 'No URL', url: '', content: 'No url' },
        { title: 'Valid Item', url: 'https://valid.com', content: 'Has title and url' },
      ];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: corruptedResults }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const vm = await service.search('Valid Item');
      expect(vm.essentialSources.length).toBe(1);
      expect(vm.essentialSources[0].domain).toBe('valid.com');
    });

    it('34. formats context for LLM with numbered results and sources list', () => {
      const vm = SearchResultViewModel.create('Test Query', [mockItems[0], mockItems[2]]);
      const context = vm.toContextForLlm();
      const toolOutput = vm.toToolOutput();

      expect(context).toContain('[Result 1]');
      expect(context).toContain('[Result 2]');
      expect(context).toContain('Title: TypeScript 5.4 Release Notes');

      expect(toolOutput).toContain('Web Search Context:');
      expect(toolOutput).toContain('Sources:');
      expect(toolOutput).toContain('1. [TypeScript 5.4 Release Notes]');
    });

    it('35. extracts clean top-level domain from subdomains and ports', () => {
      const vm = SearchResultViewModel.create('Domain Check', [
        {
          title: 'Internal API',
          url: 'http://sub.deep.portal.example.co.uk:8080/v1/api?query=1#hash',
          content: 'Internal service description',
        },
      ]);
      expect(vm.essentialSources[0].domain).toBe('sub.deep.portal.example.co.uk');
    });

    it('36. rebuilds SearchResultViewModel from raw output string (fromRawOutput)', () => {
      const rawOutput = `
Web Search Context:
[Result 1]
Title: Quantum Computing Overview
URL: https://ibm.com/quantum
Content: Quantum processors use qubits in superposition.

[Result 2]
Title: Qiskit SDK
URL: https://qiskit.org
Content: Open-source SDK for working with quantum computers.

Sources:
1. [Quantum Computing Overview](https://ibm.com/quantum)
2. [Qiskit SDK](https://qiskit.org)
      `;

      const vm = SearchResultViewModel.fromRawOutput(rawOutput, 'quantum computing');
      expect(vm).not.toBeNull();
      expect(vm?.hasResults).toBe(true);
      expect(vm?.essentialSources.length).toBe(2);
      expect(vm?.essentialSources[0].title).toBe('Quantum Computing Overview');
      expect(vm?.essentialSources[1].domain).toBe('qiskit.org');
    });

    it('37. handles empty or negative search response string cleanly in fromRawOutput', () => {
      const vm = SearchResultViewModel.fromRawOutput('No reliable information was found.', 'obscure fact');
      expect(vm).not.toBeNull();
      expect(vm?.hasResults).toBe(false);
      expect(vm?.essentialSources.length).toBe(0);
    });

    it('38. returns null when fromRawOutput receives unrelated conversational text', () => {
      const vm = SearchResultViewModel.fromRawOutput('Here is an explanation of the topic without search context.');
      expect(vm).toBeNull();
    });

    it('39. protects encapsulated state via defensive copying against external mutation', () => {
      const items: SearxngResultItem[] = [{ title: 'Original Item', url: 'https://test.org', content: 'Immutable' }];
      const vm = SearchResultViewModel.create('immutability', items);
      items.push({ title: 'Mutated Item', url: 'https://mutated.org', content: 'Injected' });

      expect(vm.count).toBe(1);
      expect(vm.essentialSources.length).toBe(1);
      expect(vm.essentialSources[0].title).toBe('Original Item');
    });

    it('40. handles network timeout without throwing uncaught exceptions', async () => {
      const service = new SearxngSearchService();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Fetch timed out')));

      const vm = await service.search('failing query');
      expect(vm.hasResults).toBe(false);
      expect(vm.summary).toContain('No reliable information');
    });
  });

  // =========================================================================
  // 5. Agent Tool Registry Execution & Parameter Normalization (Tests 41-50)
  // =========================================================================
  describe('Agent Tool Registry Execution & Parameter Normalization', () => {
    it('41. dispatches read_file with parameter alias resolution', async () => {
      const res = await executeAgentTool('read_file', { filepath: 'src/config.json' });
      expect(ipc.readFile).toHaveBeenCalledWith('src/config.json');
      expect(res).toBe('file-content-sample');
    });

    it('42. dispatches write_file with code and text aliases', async () => {
      const res = await executeAgentTool('write_file', {
        file: 'notes.txt',
        code: 'Hello Antigravity developer',
      });
      expect(ipc.writeFile).toHaveBeenCalledWith('notes.txt', 'Hello Antigravity developer');
      expect(res).toBe(true);
    });

    it('43. dispatches search_files with dir and pattern parameters', async () => {
      const res = await executeAgentTool('search_files', { dir: 'src', pattern: '*.ts' });
      expect(ipc.searchFiles).toHaveBeenCalledWith('src', '*.ts');
      expect(res).toEqual(['src/index.ts', 'src/App.tsx']);
    });

    it('44. dispatches safe run_shell command and receives output object', async () => {
      const res = await executeAgentTool('run_shell', { command: 'git --version' });
      expect(ipc.runShellCommand).toHaveBeenCalledWith('git --version', undefined);
      expect(res.stdout).toBe('git v2.39');
    });

    it('45. blocks destructive run_shell commands before invoking IPC', async () => {
      await expect(executeAgentTool('run_shell', { command: 'rm -rf /usr/local' })).rejects.toThrow(
        /Destructive command detected/
      );
      expect(ipc.runShellCommand).not.toHaveBeenCalled();
    });

    it('46. dispatches open_target for both URLs and local filepaths', async () => {
      await executeAgentTool('open_target', { target: 'https://github.com' });
      expect(ipc.openTarget).toHaveBeenCalledWith('https://github.com');

      await executeAgentTool('open_target', { path: '/Users/apple/Desktop' });
      expect(ipc.openTarget).toHaveBeenCalledWith('/Users/apple/Desktop');
    });

    it('47. dispatches open_app to launch desktop programs', async () => {
      await executeAgentTool('open_app', { name: 'Spotify' });
      expect(ipc.openApp).toHaveBeenCalledWith('Spotify');
    });

    it('48. dispatches clipboard reading and writing operations', async () => {
      const text = await executeAgentTool('read_clipboard', {});
      expect(ipc.readClipboard).toHaveBeenCalled();
      expect(text).toBe('clipboard-sample-text');

      const writeRes = await executeAgentTool('write_clipboard', { text: 'New clipboard value' });
      expect(ipc.writeClipboard).toHaveBeenCalledWith('New clipboard value');
      expect(writeRes).toContain('written to clipboard');
    });

    it('49. dispatches search_memory and scopes query to active workspace', async () => {
      const res = await executeAgentTool('search_memory', { query: 'theme' });
      expect(ipc.searchMemories).toHaveBeenCalledWith('theme', 'ws-deep-test', false, 5);
      expect(res[0].content).toBe('Prefers dark theme');
    });

    it('50. dispatches add_memory and attaches active workspace ID', async () => {
      const res = await executeAgentTool('add_memory', {
        content: 'Uses AWS us-east-1',
        category: 'preference',
      });
      expect(ipc.addMemory).toHaveBeenCalledWith('Uses AWS us-east-1', 'preference', 'ws-deep-test');
      expect(res.id).toBe('m-2');
    });
  });

  // =========================================================================
  // 6. Safety Interceptors, Finish Flow & Registry Integrity (Tests 51-55)
  // =========================================================================
  describe('Safety Interceptors, Finish Flow & Registry Integrity', () => {
    it('51. dispatches finish tool and returns structured completion summary', async () => {
      const res = await executeAgentTool('finish', { summary: 'All 100+ test suites fully verified.' });
      expect(res.status).toBe('completed');
      expect(res.summary).toBe('All 100+ test suites fully verified.');
    });

    it('52. rejects unknown or hallucinated tool names with a descriptive error', async () => {
      await expect(executeAgentTool('hallucinated_teleport_tool', {})).rejects.toThrow(
        /Unknown tool: hallucinated_teleport_tool/
      );
    });

    it('53. verifies all AVAILABLE_AGENT_TOOLS have valid names and JSON schemas', () => {
      expect(AVAILABLE_AGENT_TOOLS.length).toBeGreaterThanOrEqual(20);
      for (const tool of AVAILABLE_AGENT_TOOLS) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe('string');
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe('object');
      }
    });

    it('54. dispatches get_system_status tool and retrieves hardware metrics', async () => {
      const res = await executeAgentTool('get_system_status', {});
      expect(ipc.getSystemStatus).toHaveBeenCalled();
      expect(res.cpu).toBe(12.5);
      expect(res.memory).toBe(45.0);
    });

    it('55. dispatches send_notification tool with title and message payload', async () => {
      await executeAgentTool('send_notification', {
        title: 'Deployment Status',
        message: 'Build passed with zero errors',
      });
      expect(ipc.sendSystemNotification).toHaveBeenCalledWith(
        'Deployment Status',
        'Build passed with zero errors'
      );
    });
  });
});
