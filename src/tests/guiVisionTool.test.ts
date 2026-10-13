import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  groundElementOnScreen,
  guiClick,
  guiType,
  guiKeyCombo,
  guiScroll,
  guiDrag,
  guiInspectScreen,
} from '../lib/agent/tools/guiVisionTool';
import { useSettingsStore } from '../stores/settingsStore';

// Mock ipc module
vi.mock('../lib/ipc', () => ({
  captureScreenData: vi.fn().mockResolvedValue({
    filePath: '/tmp/test_screen.png',
    base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    width: 1920,
    height: 1080,
  }),
  focusApp: vi.fn().mockResolvedValue({
    success: true,
    message: 'Focused application',
    action_type: 'focus_app',
  }),
  getApiKey: vi.fn().mockResolvedValue('test-key'),
}));

// Mock inputDriver module
vi.mock('../lib/safety/inputDriver', () => ({
  executeGuardedStep: vi.fn().mockImplementation(async (req) => ({
    status: 'SUCCESS',
    message: `Executed ${req.action.actionType}`,
    targetAppBundleId: req.intent.targetAppBundleId,
    completedStep: req.stepNumber,
  })),
}));

describe('Vision-Driven Desktop GUI Control (guiVisionTool)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      computerControlEnabled: true,
      computerControlAllowlist: ['com.apple.finder', 'com.tinyspeck.slackmacgap'],
      groundingEndpointUrl: '',
    });
  });

  describe('Visual Element Grounding (groundElementOnScreen)', () => {
    it('grounds search bar elements toward top of screen by spatial heuristic', async () => {
      const mockScreen = {
        filePath: '/tmp/test.png',
        base64: 'data:...',
        width: 1920,
        height: 1080,
      };

      const result = await groundElementOnScreen('click on the search bar', mockScreen);
      expect(result.coordinate.y).toBeLessThan(mockScreen.height / 2);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('grounds send/submit buttons toward bottom of screen', async () => {
      const mockScreen = {
        filePath: '/tmp/test.png',
        base64: 'data:...',
        width: 1920,
        height: 1080,
      };

      const result = await groundElementOnScreen('click send button', mockScreen);
      expect(result.coordinate.y).toBeGreaterThan(mockScreen.height / 2);
    });

    it('grounds sidebar items toward left of screen', async () => {
      const mockScreen = {
        filePath: '/tmp/test.png',
        base64: 'data:...',
        width: 1920,
        height: 1080,
      };

      const result = await groundElementOnScreen('sidebar channels list', mockScreen);
      expect(result.coordinate.x).toBeLessThan(mockScreen.width / 2);
    });
  });

  describe('GUI Action Dispatching', () => {
    it('executes direct coordinate click at (x, y)', async () => {
      const res = await guiClick({ x: 500, y: 300, app: 'com.apple.finder' });
      expect(res.success).toBe(true);
      expect(res.coordinate).toEqual({ x: 500, y: 300 });
    });

    it('grounds visual element description and executes click', async () => {
      const res = await guiClick({ element: 'Search bar', app: 'com.tinyspeck.slackmacgap' });
      expect(res.success).toBe(true);
      expect(res.coordinate).toBeDefined();
      expect(res.coordinate?.y).toBeLessThan(1080 / 2);
    });

    it('types text into focused GUI field with optional Enter submission', async () => {
      const res = await guiType({ text: 'Hello World', pressEnter: true });
      expect(res.success).toBe(true);
      expect(res.message).toContain('Typed 11 characters');
    });

    it('executes keyboard shortcut combinations', async () => {
      const res = await guiKeyCombo({ keys: ['cmd', 'c'] });
      expect(res.success).toBe(true);
      expect(res.message).toContain('Pressed cmd+c');
    });

    it('executes directional scrolling with calibrated steps', async () => {
      const res = await guiScroll({ direction: 'down', amount: 8 });
      expect(res.success).toBe(true);
      expect(res.message).toContain('Scrolled dx=0, dy=8');
    });

    it('executes drag from start to end coordinates', async () => {
      const res = await guiDrag({ startX: 100, startY: 100, endX: 400, endY: 400 });
      expect(res.success).toBe(true);
      expect(res.message).toContain('Dragged from (100, 100) to (400, 400)');
    });

    it('captures full desktop screen frame via guiInspectScreen', async () => {
      const res = await guiInspectScreen({ instruction: 'Check what apps are visible' });
      expect(res.success).toBe(true);
      expect(res.width).toBe(1920);
      expect(res.height).toBe(1080);
      expect(res.base64).toContain('data:image/png;base64');
    });
  });
});
