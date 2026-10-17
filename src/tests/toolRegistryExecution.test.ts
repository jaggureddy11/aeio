import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeAgentTool, getAvailableAgentTools, AVAILABLE_AGENT_TOOLS } from '../lib/agent/toolRegistry';
import * as ipc from '../lib/ipc';
import * as browserTool from '../lib/agent/tools/browserTool';
import * as guiVisionTool from '../lib/agent/tools/guiVisionTool';
import * as visualBrowserTool from '../lib/agent/tools/visualBrowserTool';

vi.mock('../lib/ipc', () => ({
  searchWebPlatform: vi.fn().mockResolvedValue('search results'),
  fetchUrl: vi.fn().mockResolvedValue('page body'),
  readFile: vi.fn().mockResolvedValue('file content'),
  writeFile: vi.fn().mockResolvedValue(true),
  searchFiles: vi.fn().mockResolvedValue(['file1.ts', 'file2.ts']),
  runShellCommand: vi.fn().mockResolvedValue({ stdout: 'success', stderr: '', exit_code: 0 }),
  openTarget: vi.fn().mockResolvedValue(true),
  playSpotify: vi.fn().mockResolvedValue(true),
  setSystemVolume: vi.fn().mockResolvedValue(true),
  mediaControl: vi.fn().mockResolvedValue(true),
  searchMemories: vi.fn().mockResolvedValue([{ memory: { id: 'm1', content: 'test memory' } }]),
  addMemory: vi.fn().mockResolvedValue({ id: 'm2', content: 'new memory' }),
  lockScreen: vi.fn().mockResolvedValue(true),
  simulateKeyPress: vi.fn().mockResolvedValue({ success: true }),
  simulateScroll: vi.fn().mockResolvedValue({ success: true }),
  openApp: vi.fn().mockResolvedValue(true),
  getSystemStatus: vi.fn().mockResolvedValue({ battery_level: 95, is_charging: true, active_app: 'Terminal' }),
  sendSystemNotification: vi.fn().mockResolvedValue(true),
  listRunningApps: vi.fn().mockResolvedValue(['Chrome', 'Slack', 'Terminal']),
  focusApp: vi.fn().mockResolvedValue(true),
  toggleDarkMode: vi.fn().mockResolvedValue(true),
  captureScreen: vi.fn().mockResolvedValue('/tmp/screenshot.png'),
}));

vi.mock('../lib/agent/tools/guiVisionTool', () => ({
  guiClick: vi.fn().mockResolvedValue({ success: true, clicked: true }),
  guiType: vi.fn().mockResolvedValue({ success: true, typed: true }),
  guiKeyCombo: vi.fn().mockResolvedValue({ success: true, keys: ['cmd', 'c'] }),
  guiScroll: vi.fn().mockResolvedValue({ success: true, scrolled: true }),
  guiDrag: vi.fn().mockResolvedValue({ success: true, dragged: true }),
  guiInspectScreen: vi.fn().mockResolvedValue({ success: true, elements: [] }),
}));

vi.mock('../lib/agent/tools/browserTool', () => ({
  browsePage: vi.fn().mockResolvedValue({ title: 'Mock Page', markdown: '# Hello' }),
  extractPageLinks: vi.fn().mockResolvedValue([{ text: 'Home', href: 'https://example.com' }]),
}));

vi.mock('../lib/agent/tools/visualBrowserTool', () => ({
  inspectInteractivePage: vi.fn().mockResolvedValue({ url: 'https://example.com', elements: [] }),
  clickBrowserElement: vi.fn().mockResolvedValue({ success: true, clicked: 'btn-1' }),
  fillBrowserField: vi.fn().mockResolvedValue({ success: true, field: 'input-1' }),
  verifyPageState: vi.fn().mockImplementation((expected, content) => ({
    matched: content.includes(expected),
    expected,
  })),
}));

describe('Tool Registry Dispatcher Benchmarks (50 Test Cases)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Discovery & Registry Schema (5 tests)', () => {
    it('1. provides list of available built-in agent tools', () => {
      expect(AVAILABLE_AGENT_TOOLS.length).toBeGreaterThanOrEqual(20);
    });

    it('2. every built-in tool defines a non-empty name and description', () => {
      AVAILABLE_AGENT_TOOLS.forEach((tool) => {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
      });
    });

    it('3. every built-in tool defines parameter schema of type object', () => {
      AVAILABLE_AGENT_TOOLS.forEach((tool) => {
        expect(tool.parameters.type).toBe('object');
      });
    });

    it('4. getAvailableAgentTools combines core tools with MCP registered tools', () => {
      const tools = getAvailableAgentTools();
      expect(tools.length).toBeGreaterThanOrEqual(AVAILABLE_AGENT_TOOLS.length);
    });

    it('5. all tool names are lowercased and snake_case formatted', () => {
      AVAILABLE_AGENT_TOOLS.forEach((tool) => {
        expect(tool.name).toMatch(/^[a-z0-9_]+$/);
      });
    });
  });

  describe('Web & Information Retrieval Tools (5 tests)', () => {
    it('6. executes search_web with default google platform', async () => {
      await executeAgentTool('search_web', { query: 'TypeScript 5.0' });
      expect(ipc.searchWebPlatform).toHaveBeenCalledWith('TypeScript 5.0', 'google');
    });

    it('7. executes search_web with explicit search platform', async () => {
      await executeAgentTool('search_web', { query: 'Tauri docs', platform: 'duckduckgo' });
      expect(ipc.searchWebPlatform).toHaveBeenCalledWith('Tauri docs', 'duckduckgo');
    });

    it('8. executes fetch_url with provided URL', async () => {
      await executeAgentTool('fetch_url', { url: 'https://api.github.com' });
      expect(ipc.fetchUrl).toHaveBeenCalledWith('https://api.github.com');
    });

    it('9. executes browse_page via browserTool', async () => {
      const res = await executeAgentTool('browse_page', { url: 'https://news.ycombinator.com' });
      expect(browserTool.browsePage).toHaveBeenCalledWith('https://news.ycombinator.com');
      expect(res.title).toBe('Mock Page');
    });

    it('10. executes extract_links with domain restriction flag', async () => {
      await executeAgentTool('extract_links', { url: 'https://docs.aws.amazon.com', sameDomainOnly: true });
      expect(browserTool.extractPageLinks).toHaveBeenCalledWith('https://docs.aws.amazon.com', true);
    });
  });

  describe('File System Operations & Security Shell Guard (10 tests)', () => {
    it('11. executes read_file using path argument', async () => {
      await executeAgentTool('read_file', { path: '/tmp/test.txt' });
      expect(ipc.readFile).toHaveBeenCalledWith('/tmp/test.txt');
    });

    it('12. executes read_file using filepath alias argument', async () => {
      await executeAgentTool('read_file', { filepath: '/tmp/alias.txt' });
      expect(ipc.readFile).toHaveBeenCalledWith('/tmp/alias.txt');
    });

    it('13. executes write_file with path and content', async () => {
      await executeAgentTool('write_file', { path: '/tmp/out.json', content: '{"status":"ok"}' });
      expect(ipc.writeFile).toHaveBeenCalledWith('/tmp/out.json', '{"status":"ok"}');
    });

    it('14. executes search_files with dir and query', async () => {
      await executeAgentTool('search_files', { dir: './src', query: 'useChatStore' });
      expect(ipc.searchFiles).toHaveBeenCalledWith('./src', 'useChatStore');
    });

    it('15. executes run_shell with safe commands', async () => {
      await executeAgentTool('run_shell', { command: 'git status', cwd: './' });
      expect(ipc.runShellCommand).toHaveBeenCalledWith('git status', './');
    });

    it('16. refuses run_shell command containing "rm -rf /"', async () => {
      await expect(executeAgentTool('run_shell', { command: 'rm -rf /' })).rejects.toThrow(
        /Refused: Destructive command detected/i
      );
      expect(ipc.runShellCommand).not.toHaveBeenCalled();
    });

    it('17. refuses run_shell command containing fork bomb', async () => {
      await expect(executeAgentTool('run_shell', { command: ':(){ :|:& };:' })).rejects.toThrow(
        /Refused: Destructive command detected/i
      );
    });

    it('18. refuses run_shell command containing "mkfs"', async () => {
      await expect(executeAgentTool('run_shell', { command: 'mkfs.ext4 /dev/sda1' })).rejects.toThrow(
        /Refused: Destructive command detected/i
      );
    });

    it('19. refuses run_shell command containing "dd if=/dev/zero of=/dev/sda"', async () => {
      await expect(executeAgentTool('run_shell', { command: 'dd if=/dev/zero of=/dev/sda' })).rejects.toThrow(
        /Refused: Destructive command detected/i
      );
    });

    it('20. refuses run_shell command containing "chmod -R 777 /"', async () => {
      await expect(executeAgentTool('run_shell', { command: 'chmod -R 777 /' })).rejects.toThrow(
        /Refused: Destructive command detected/i
      );
    });
  });

  describe('Desktop OS & Media Tools (10 tests)', () => {
    it('21. executes open_target with URL or file path', async () => {
      await executeAgentTool('open_target', { target: 'https://tauri.app' });
      expect(ipc.openTarget).toHaveBeenCalledWith('https://tauri.app');
    });

    it('22. executes play_spotify with search track query', async () => {
      await executeAgentTool('play_spotify', { query: 'Daft Punk' });
      expect(ipc.playSpotify).toHaveBeenCalledWith('Daft Punk');
    });

    it('23. executes set_system_volume with numeric level', async () => {
      await executeAgentTool('set_system_volume', { level: 75 });
      expect(ipc.setSystemVolume).toHaveBeenCalledWith(75);
    });

    it('24. executes media_control with action', async () => {
      await executeAgentTool('media_control', { action: 'next' });
      expect(ipc.mediaControl).toHaveBeenCalledWith('next');
    });

    it('25. executes lock_screen', async () => {
      await executeAgentTool('lock_screen', {});
      expect(ipc.lockScreen).toHaveBeenCalled();
    });

    it('26. executes get_system_status', async () => {
      const res = await executeAgentTool('get_system_status', {});
      expect(ipc.getSystemStatus).toHaveBeenCalled();
      expect(res.battery_level).toBe(95);
    });

    it('27. executes send_notification with title and message', async () => {
      await executeAgentTool('send_notification', { title: 'Alert', message: 'Task complete' });
      expect(ipc.sendSystemNotification).toHaveBeenCalledWith('Alert', 'Task complete');
    });

    it('28. executes list_running_apps', async () => {
      const apps = await executeAgentTool('list_running_apps', {});
      expect(ipc.listRunningApps).toHaveBeenCalled();
      expect(apps).toContain('Slack');
    });

    it('29. executes focus_app by application name', async () => {
      await executeAgentTool('focus_app', { name: 'Terminal' });
      expect(ipc.focusApp).toHaveBeenCalledWith('Terminal');
    });

    it('30. executes toggle_dark_mode', async () => {
      await executeAgentTool('toggle_dark_mode', {});
      expect(ipc.toggleDarkMode).toHaveBeenCalled();
    });
  });

  describe('Computer Control Fast-Path (UI Commands) (5 tests)', () => {
    it('31. executes ui_command key press simulation', async () => {
      await executeAgentTool('ui_command', { action: 'key', key: 'escape' });
      expect(ipc.simulateKeyPress).toHaveBeenCalledWith('escape');
    });

    it('32. executes ui_command key press with default key "enter"', async () => {
      await executeAgentTool('ui_command', { action: 'key' });
      expect(ipc.simulateKeyPress).toHaveBeenCalledWith('enter');
    });

    it('33. executes ui_command scroll with direction and amount', async () => {
      await executeAgentTool('ui_command', { action: 'scroll', direction: 'up', amount: 8 });
      expect(ipc.simulateScroll).toHaveBeenCalledWith('up', 8);
    });

    it('34. executes ui_command open_app', async () => {
      await executeAgentTool('ui_command', { action: 'open_app', app: 'Spotify' });
      expect(ipc.openApp).toHaveBeenCalledWith('Spotify');
    });

    it('35. throws error on unknown ui_command action', async () => {
      await expect(executeAgentTool('ui_command', { action: 'teleport' })).rejects.toThrow(
        /Unknown UI command action: teleport/i
      );
    });
  });

  describe('Vision GUI & Interactive Browser Tools (10 tests)', () => {
    it('36. dispatches gui_click with coordinates and button', async () => {
      await executeAgentTool('gui_click', { x: 500, y: 300, button: 'left' });
      expect(guiVisionTool.guiClick).toHaveBeenCalledWith({
        x: 500,
        y: 300,
        element: undefined,
        app: undefined,
        button: 'left',
        double: false,
      });
    });

    it('37. dispatches gui_type with text and pressEnter flag', async () => {
      await executeAgentTool('gui_type', { text: 'git push origin main', pressEnter: true });
      expect(guiVisionTool.guiType).toHaveBeenCalledWith({
        text: 'git push origin main',
        app: undefined,
        pressEnter: true,
      });
    });

    it('38. dispatches gui_key_combo with key array', async () => {
      await executeAgentTool('gui_key_combo', { keys: ['cmd', 'shift', 'p'] });
      expect(guiVisionTool.guiKeyCombo).toHaveBeenCalledWith({
        keys: ['cmd', 'shift', 'p'],
        app: undefined,
      });
    });

    it('39. dispatches gui_scroll with direction and amount', async () => {
      await executeAgentTool('gui_scroll', { direction: 'down', amount: 5 });
      expect(guiVisionTool.guiScroll).toHaveBeenCalledWith({
        direction: 'down',
        amount: 5,
        dx: undefined,
        dy: undefined,
      });
    });

    it('40. dispatches gui_drag with coordinate bounds', async () => {
      await executeAgentTool('gui_drag', { startX: 100, startY: 100, endX: 400, endY: 400 });
      expect(guiVisionTool.guiDrag).toHaveBeenCalledWith({
        startX: 100,
        startY: 100,
        endX: 400,
        endY: 400,
        app: undefined,
      });
    });

    it('41. dispatches gui_inspect_screen with target app instruction', async () => {
      await executeAgentTool('gui_inspect_screen', { app: 'Chrome', instruction: 'find search bar' });
      expect(guiVisionTool.guiInspectScreen).toHaveBeenCalledWith({
        app: 'Chrome',
        instruction: 'find search bar',
      });
    });

    it('42. dispatches browser_inspect for interactive web pages', async () => {
      await executeAgentTool('browser_inspect', { url: 'https://github.com' });
      expect(visualBrowserTool.inspectInteractivePage).toHaveBeenCalledWith('https://github.com', false);
    });

    it('43. dispatches browser_click with selector target', async () => {
      await executeAgentTool('browser_click', { url: 'https://github.com', target: '#submit-btn' });
      expect(visualBrowserTool.clickBrowserElement).toHaveBeenCalledWith('https://github.com', '#submit-btn');
    });

    it('44. dispatches browser_fill with selector target and value', async () => {
      await executeAgentTool('browser_fill', { url: 'https://github.com', target: '#search', value: 'rust' });
      expect(visualBrowserTool.fillBrowserField).toHaveBeenCalledWith('https://github.com', '#search', 'rust');
    });

    it('45. dispatches verify_page_state to validate expected content substring', async () => {
      const res = await executeAgentTool('verify_page_state', {
        expected: 'Dashboard',
        content: '<html><body>Welcome to your Dashboard</body></html>',
      });
      expect(res.matched).toBe(true);
    });
  });

  describe('Math, Finish & Error Fallbacks (5 tests)', () => {
    it('46. dispatches math_evaluate for exact arithmetic evaluation', async () => {
      const res = await executeAgentTool('math_evaluate', { expression: '50 * 4 + 2' });
      expect(res.value).toBe(202);
    });

    it('47. dispatches math_solve for single variable equations', async () => {
      const res = await executeAgentTool('math_solve', { equation: '4x - 8 = 12' });
      expect(res.roots).toEqual([5]);
    });

    it('48. dispatches math_solve for systems of linear equations', async () => {
      const res = await executeAgentTool('math_solve', { equations: ['x + y = 10', 'x - y = 2'] });
      expect(res.values.x).toBe(6);
      expect(res.values.y).toBe(4);
    });

    it('49. dispatches finish tool returning structured completion summary', async () => {
      const res = await executeAgentTool('finish', { summary: 'Plan successfully finalized' });
      expect(res).toEqual({
        status: 'completed',
        summary: 'Plan successfully finalized',
      });
    });

    it('50. throws descriptive error on unknown tool invocation', async () => {
      await expect(executeAgentTool('non_existent_tool_xyz', {})).rejects.toThrow(
        /Unknown tool: non_existent_tool_xyz/i
      );
    });
  });
});
