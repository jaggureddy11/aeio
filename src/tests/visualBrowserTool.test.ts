import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractInteractiveElements,
  inspectInteractivePage,
  clickBrowserElement,
  fillBrowserField,
  verifyPageState,
} from '../lib/agent/tools/visualBrowserTool';
import { executeAgentTool } from '../lib/agent/toolRegistry';
import * as ipc from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  fetchUrl: vi.fn(),
  captureScreenData: vi.fn(),
  searchWebPlatform: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  searchFiles: vi.fn(),
  runShellCommand: vi.fn(),
  openTarget: vi.fn(),
  playSpotify: vi.fn(),
  setSystemVolume: vi.fn(),
  mediaControl: vi.fn(),
  searchMemories: vi.fn(),
  addMemory: vi.fn(),
  lockScreen: vi.fn(),
  simulateKeyPress: vi.fn(),
  simulateScroll: vi.fn(),
  openApp: vi.fn(),
  getSystemStatus: vi.fn(),
  sendSystemNotification: vi.fn(),
  listRunningApps: vi.fn(),
  focusApp: vi.fn(),
  toggleDarkMode: vi.fn(),
  captureScreen: vi.fn(),
}));

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Aeio Developer Portal</title></head>
<body>
  <h1>Welcome to Aeio</h1>
  <form id="login-form">
    <input type="text" id="username-field" placeholder="Username or Email" name="user" />
    <input type="password" name="password" placeholder="Password" />
    <input type="hidden" name="csrf" value="secret123" />
    <button type="submit" id="submit-btn">Sign In</button>
  </form>
  <div class="links">
    <a href="/docs/api">API Reference</a>
    <a href="https://github.com/apple/aeio">GitHub Repository</a>
    <a href="#section">Jump To Section</a>
  </div>
</body>
</html>
`;

describe('Autonomous Visual Browser Operator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractInteractiveElements', () => {
    it('extracts buttons, inputs, and links while ignoring hidden inputs and anchor hashes', () => {
      const elements = extractInteractiveElements(SAMPLE_HTML, 'https://example.com');

      expect(elements.length).toBeGreaterThan(0);

      // Buttons
      const button = elements.find((e) => e.tag === 'button');
      expect(button).toBeDefined();
      expect(button?.text).toBe('Sign In');
      expect(button?.selector).toBe('#submit-btn');

      // Inputs
      const usernameInput = elements.find((e) => e.tag === 'input' && e.name === 'user');
      expect(usernameInput).toBeDefined();
      expect(usernameInput?.text).toBe('Username or Email');
      expect(usernameInput?.selector).toBe('#username-field');

      // Hidden inputs ignored
      const hiddenInput = elements.find((e) => e.type === 'hidden');
      expect(hiddenInput).toBeUndefined();

      // Links (hash anchor #section ignored)
      const apiLink = elements.find((e) => e.tag === 'a' && e.href === '/docs/api');
      expect(apiLink).toBeDefined();
      expect(apiLink?.text).toBe('API Reference');

      const hashLink = elements.find((e) => e.href === '#section');
      expect(hashLink).toBeUndefined();
    });
  });

  describe('inspectInteractivePage', () => {
    it('fetches page HTML and returns structured visual snapshot', async () => {
      (ipc.fetchUrl as any).mockResolvedValueOnce(SAMPLE_HTML);
      (ipc.captureScreenData as any).mockResolvedValueOnce({ base64: 'mock-base64-data' });

      const snapshot = await inspectInteractivePage('https://example.com/portal', true);

      expect(snapshot.url).toBe('https://example.com/portal');
      expect(snapshot.title).toBe('Aeio Developer Portal');
      expect(snapshot.interactiveElements.length).toBe(5); // 1 button, 2 visible inputs, 2 links = 5
      expect(snapshot.screenshotBase64).toBe('mock-base64-data');
      expect(snapshot.summary).toContain('interactive elements');
    });
  });

  describe('clickBrowserElement', () => {
    it('clicks element by target index and resolves navigation URL', async () => {
      (ipc.fetchUrl as any).mockResolvedValueOnce(SAMPLE_HTML);

      // Elements: button is index 1, username is 2, password is 3, api link is 4
      const result = await clickBrowserElement('https://example.com', 4);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Clicked a');
      expect(result.navigatedUrl).toBe('https://example.com/docs/api');
    });

    it('clicks element by button text substring', async () => {
      (ipc.fetchUrl as any).mockResolvedValueOnce(SAMPLE_HTML);

      const result = await clickBrowserElement('https://example.com', 'Sign In');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Sign In');
    });

    it('returns error if target element not found', async () => {
      (ipc.fetchUrl as any).mockResolvedValueOnce(SAMPLE_HTML);

      const result = await clickBrowserElement('https://example.com', 'NonExistentButton');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('fillBrowserField', () => {
    it('fills input field by element index', async () => {
      (ipc.fetchUrl as any).mockResolvedValueOnce(SAMPLE_HTML);

      const result = await fillBrowserField('https://example.com', 2, 'admin_user');

      expect(result.success).toBe(true);
      expect(result.value).toBe('admin_user');
      expect(result.message).toContain('Filled input field');
    });

    it('fills input field by selector or placeholder text', async () => {
      (ipc.fetchUrl as any).mockResolvedValueOnce(SAMPLE_HTML);

      const result = await fillBrowserField('https://example.com', 'Password', 'supersecret');

      expect(result.success).toBe(true);
      expect(result.value).toBe('supersecret');
    });

    it('returns error if field not found', async () => {
      (ipc.fetchUrl as any).mockResolvedValueOnce(SAMPLE_HTML);

      const result = await fillBrowserField('https://example.com', 99, 'test');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('verifyPageState', () => {
    it('verifies expected content is present', () => {
      const res = verifyPageState('Developer Portal', SAMPLE_HTML);
      expect(res.verified).toBe(true);
      expect(res.observation).toContain('State verification passed');
    });

    it('detects when expected state indicator is missing', () => {
      const res = verifyPageState('Login Successful 200 OK', SAMPLE_HTML);
      expect(res.verified).toBe(false);
      expect(res.observation).toContain('State verification failed');
    });
  });

  describe('executeAgentTool integration', () => {
    it('routes browser_inspect, browser_click, browser_fill, verify_page_state', async () => {
      (ipc.fetchUrl as any).mockResolvedValue(SAMPLE_HTML);

      const inspectRes = await executeAgentTool('browser_inspect', { url: 'https://example.com' });
      expect(inspectRes.title).toBe('Aeio Developer Portal');

      const clickRes = await executeAgentTool('browser_click', { url: 'https://example.com', target: 'Sign In' });
      expect(clickRes.success).toBe(true);

      const fillRes = await executeAgentTool('browser_fill', { url: 'https://example.com', target: 2, value: 'test' });
      expect(fillRes.success).toBe(true);

      const verifyRes = await executeAgentTool('verify_page_state', { expected: 'Sign In', content: SAMPLE_HTML });
      expect(verifyRes.verified).toBe(true);
    });
  });
});
