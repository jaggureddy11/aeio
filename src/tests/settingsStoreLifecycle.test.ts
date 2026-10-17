import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../stores/settingsStore';

vi.mock('../lib/ipc', () => ({
  registerGlobalHotkey: vi.fn().mockResolvedValue(true),
  unregisterGlobalHotkey: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/safety/allowlist', () => ({
  validateBundleForAllowlist: vi.fn((bundleId: string) => {
    if (!bundleId || !bundleId.includes('.')) {
      return { type: 'Blocked', reason: 'Invalid bundle ID format' };
    }
    const isBrowser = ['com.google.chrome', 'com.apple.safari', 'org.mozilla.firefox'].includes(bundleId.toLowerCase());
    if (isBrowser) {
      return { type: 'RequiresBrowserWarning', warning: 'Web browsers grant broad web automation' };
    }
    return { type: 'Allowed' };
  }),
  setComputerControlEnabledIpc: vi.fn().mockResolvedValue(true),
  addToAllowlistIpc: vi.fn().mockResolvedValue(true),
  removeFromAllowlistIpc: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/safety/overlay', () => ({
  showControlOverlay: vi.fn().mockResolvedValue({
    isActive: true,
    targetAppName: 'Code',
    targetAppBundleId: 'com.microsoft.vscode',
    declaredIntent: 'Edit file',
    currentStep: 1,
    totalSteps: 3,
    killSwitchTriggered: false,
    killSwitchReason: null,
  }),
  hideControlOverlay: vi.fn().mockResolvedValue({
    isActive: false,
    targetAppName: '',
    targetAppBundleId: '',
    declaredIntent: '',
    currentStep: 0,
    totalSteps: 0,
    killSwitchTriggered: false,
    killSwitchReason: null,
  }),
  updateControlOverlay: vi.fn().mockResolvedValue({
    isActive: true,
    targetAppName: 'Code',
    targetAppBundleId: 'com.microsoft.vscode',
    declaredIntent: 'Edit file',
    currentStep: 2,
    totalSteps: 3,
    killSwitchTriggered: false,
    killSwitchReason: null,
  }),
}));

vi.mock('../lib/safety/killSwitch', () => ({
  resetKillSwitch: vi.fn().mockResolvedValue(undefined),
}));

let mockStorage: Record<string, string> = {};

describe('Settings Store State Machine Benchmarks (50 Test Cases)', () => {
  beforeEach(() => {
    mockStorage = {};
    globalThis.localStorage = {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
      clear: () => {
        mockStorage = {};
      },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
      length: 0,
    };
    const state = useSettingsStore.getState();
    state.setActiveTab('chat');
    state.setActiveProvider('aeio-free');
    state.setTheme('system');
    state.setComputerControlEnabled(false);
    state.setKillSwitchTripped(false);
    state.setOverlayState(null);
  });

  describe('Tab & Navigation Management (5 tests)', () => {
    it('1. updates active tab to "memory"', () => {
      useSettingsStore.getState().setActiveTab('memory');
      expect(useSettingsStore.getState().activeTab).toBe('memory');
    });

    it('2. updates active tab to "settings"', () => {
      useSettingsStore.getState().setActiveTab('settings');
      expect(useSettingsStore.getState().activeTab).toBe('settings');
    });

    it('3. updates active tab back to "chat"', () => {
      useSettingsStore.getState().setActiveTab('settings');
      useSettingsStore.getState().setActiveTab('chat');
      expect(useSettingsStore.getState().activeTab).toBe('chat');
    });

    it('4. persists active tab in store state', () => {
      useSettingsStore.getState().setActiveTab('memory');
      expect(useSettingsStore.getState().activeTab).toBe('memory');
    });

    it('5. preserves activeTab across state updates of unrelated fields', () => {
      useSettingsStore.getState().setActiveTab('settings');
      useSettingsStore.getState().setTheme('dark');
      expect(useSettingsStore.getState().activeTab).toBe('settings');
    });
  });

  describe('Provider Selection & Model Configurations (10 tests)', () => {
    it('6. switches provider to "ollama"', () => {
      useSettingsStore.getState().setActiveProvider('ollama');
      expect(useSettingsStore.getState().activeProvider).toBe('ollama');
      expect(localStorage.getItem('aeio_active_provider')).toBe('ollama');
    });

    it('7. switches provider to "bedrock"', () => {
      useSettingsStore.getState().setActiveProvider('bedrock');
      expect(useSettingsStore.getState().activeProvider).toBe('bedrock');
    });

    it('8. switches provider to "aeio-free"', () => {
      useSettingsStore.getState().setActiveProvider('aeio-free');
      expect(useSettingsStore.getState().activeProvider).toBe('aeio-free');
    });

    it('9. switches provider to "claude"', () => {
      useSettingsStore.getState().setActiveProvider('claude');
      expect(useSettingsStore.getState().activeProvider).toBe('claude');
    });

    it('10. switches provider to "openai"', () => {
      useSettingsStore.getState().setActiveProvider('openai');
      expect(useSettingsStore.getState().activeProvider).toBe('openai');
    });

    it('11. switches provider to "gemini"', () => {
      useSettingsStore.getState().setActiveProvider('gemini');
      expect(useSettingsStore.getState().activeProvider).toBe('gemini');
    });

    it('12. updates ollamaModel in store state', () => {
      useSettingsStore.getState().setOllamaModel('qwen2.5:14b');
      expect(useSettingsStore.getState().ollamaModel).toBe('qwen2.5:14b');
    });

    it('13. updates bedrockRegion and saves to storage', () => {
      useSettingsStore.getState().setBedrockRegion('ap-southeast-2');
      expect(useSettingsStore.getState().bedrockRegion).toBe('ap-southeast-2');
      expect(localStorage.getItem('aeio_bedrock_region')).toBe('ap-southeast-2');
    });

    it('14. updates bedrockModel and saves to storage', () => {
      useSettingsStore.getState().setBedrockModel('anthropic.claude-3-haiku-20240307-v1:0');
      expect(useSettingsStore.getState().bedrockModel).toBe('anthropic.claude-3-haiku-20240307-v1:0');
      expect(localStorage.getItem('aeio_bedrock_model')).toBe('anthropic.claude-3-haiku-20240307-v1:0');
    });

    it('15. updates hostedProxyUrl and saves to storage', () => {
      useSettingsStore.getState().setHostedProxyUrl('https://custom-proxy.internal');
      expect(useSettingsStore.getState().hostedProxyUrl).toBe('https://custom-proxy.internal');
      expect(localStorage.getItem('aeio_hosted_proxy_url')).toBe('https://custom-proxy.internal');
    });
  });

  describe('Theme, Hotkeys & Proactive Copilot (10 tests)', () => {
    it('16. changes theme to "dark"', () => {
      useSettingsStore.getState().setTheme('dark');
      expect(useSettingsStore.getState().theme).toBe('dark');
      expect(localStorage.getItem('aeio_theme_mode')).toBe('dark');
    });

    it('17. changes theme to "light"', () => {
      useSettingsStore.getState().setTheme('light');
      expect(useSettingsStore.getState().theme).toBe('light');
      expect(localStorage.getItem('aeio_theme_mode')).toBe('light');
    });

    it('18. changes theme to "system"', () => {
      useSettingsStore.getState().setTheme('system');
      expect(useSettingsStore.getState().theme).toBe('system');
    });

    it('19. toggles activeWindowAwareness on and off', () => {
      useSettingsStore.getState().setActiveWindowAwareness(true);
      expect(useSettingsStore.getState().activeWindowAwareness).toBe(true);
      useSettingsStore.getState().setActiveWindowAwareness(false);
      expect(useSettingsStore.getState().activeWindowAwareness).toBe(false);
    });

    it('20. toggles ambientProactive on and off', () => {
      useSettingsStore.getState().setAmbientProactive(true);
      expect(useSettingsStore.getState().ambientProactive).toBe(true);
      useSettingsStore.getState().setAmbientProactive(false);
      expect(useSettingsStore.getState().ambientProactive).toBe(false);
    });

    it('21. sets onboarding completed flag', () => {
      useSettingsStore.getState().setHasCompletedOnboarding(true);
      expect(useSettingsStore.getState().hasCompletedOnboarding).toBe(true);
      expect(localStorage.getItem('aeio_first_run_completed')).toBe('true');
    });

    it('22. updates global hotkey setting', () => {
      useSettingsStore.getState().setHotkey('CommandOrControl+Shift+Space');
      expect(useSettingsStore.getState().hotkey).toBe('CommandOrControl+Shift+Space');
      expect(localStorage.getItem('aeio_global_hotkey')).toBe('CommandOrControl+Shift+Space');
    });

    it('23. updates telemetry opt-in preference', () => {
      useSettingsStore.getState().setTelemetryOptIn(false);
      expect(useSettingsStore.getState().telemetryOptIn).toBe(false);
      expect(localStorage.getItem('aeio_telemetry_opt_in')).toBe('false');
    });

    it('24. updates neverSendMemoriesToCloud privacy flag', () => {
      useSettingsStore.getState().setNeverSendMemoriesToCloud(true);
      expect(useSettingsStore.getState().neverSendMemoriesToCloud).toBe(true);
      expect(localStorage.getItem('aeio_never_send_memories_to_cloud')).toBe('true');
    });

    it('25. preserves anonymous installationId', () => {
      const id = useSettingsStore.getState().installationId;
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });
  });

  describe('Computer Control & Allowlist Safety (10 tests)', () => {
    it('26. toggles computer control master switch', () => {
      useSettingsStore.getState().setComputerControlEnabled(true);
      expect(useSettingsStore.getState().computerControlEnabled).toBe(true);
      useSettingsStore.getState().setComputerControlEnabled(false);
      expect(useSettingsStore.getState().computerControlEnabled).toBe(false);
    });

    it('27. adds valid bundle ID to allowlist', () => {
      const res = useSettingsStore.getState().addToComputerControlAllowlist('com.microsoft.VSCode');
      expect(res.success).toBe(true);
      expect(useSettingsStore.getState().computerControlAllowlist).toContain('com.microsoft.vscode');
    });

    it('28. rejects invalid bundle ID missing domain separator', () => {
      const res = useSettingsStore.getState().addToComputerControlAllowlist('InvalidBundleName');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid bundle ID format');
    });

    it('29. prevents duplicate bundle IDs from being added twice', () => {
      useSettingsStore.getState().addToComputerControlAllowlist('com.sublimetext.4');
      const countBefore = useSettingsStore.getState().computerControlAllowlist.length;
      useSettingsStore.getState().addToComputerControlAllowlist('com.sublimetext.4');
      const countAfter = useSettingsStore.getState().computerControlAllowlist.length;
      expect(countAfter).toBe(countBefore);
    });

    it('30. requires explicit confirmation for web browser bundle IDs', () => {
      const res = useSettingsStore.getState().addToComputerControlAllowlist('com.google.Chrome', false);
      expect(res.success).toBe(false);
      expect(res.requiresBrowserConfirm).toBe(true);
      expect(res.warning).toContain('Web browsers grant broad web automation');
    });

    it('31. allows web browser bundle IDs when confirmBrowser is true', () => {
      const res = useSettingsStore.getState().addToComputerControlAllowlist('com.google.Chrome', true);
      expect(res.success).toBe(true);
      expect(useSettingsStore.getState().computerControlAllowlist).toContain('com.google.chrome');
    });

    it('32. removes bundle ID from allowlist', () => {
      useSettingsStore.getState().addToComputerControlAllowlist('com.tinyspeck.slackmacgap');
      expect(useSettingsStore.getState().computerControlAllowlist).toContain('com.tinyspeck.slackmacgap');
      useSettingsStore.getState().removeFromComputerControlAllowlist('com.tinyspeck.slackmacgap');
      expect(useSettingsStore.getState().computerControlAllowlist).not.toContain('com.tinyspeck.slackmacgap');
    });

    it('33. arms and triggers kill switch with reason', () => {
      useSettingsStore.getState().setKillSwitchTripped(true, 'Cursor movement anomaly');
      expect(useSettingsStore.getState().killSwitchTripped).toBe(true);
      expect(useSettingsStore.getState().killSwitchReason).toBe('Cursor movement anomaly');
    });

    it('34. resets kill switch via resetKillSwitchAction', async () => {
      useSettingsStore.getState().setKillSwitchTripped(true, 'Emergency manual trip');
      await useSettingsStore.getState().resetKillSwitchAction();
      expect(useSettingsStore.getState().killSwitchTripped).toBe(false);
      expect(useSettingsStore.getState().killSwitchReason).toBeNull();
    });

    it('35. manages active control overlay lifecycle', async () => {
      const overlay = await useSettingsStore.getState().showOverlayAction(
        'VSCode',
        'com.microsoft.VSCode',
        'Refactoring engine',
        1,
        3
      );
      expect(overlay.isActive).toBe(true);
      await useSettingsStore.getState().hideOverlayAction();
      expect(useSettingsStore.getState().overlayState?.isActive).toBe(false);
    });
  });

  describe('MCP Servers & Grounding Config (15 tests)', () => {
    it('36. adds new stdio MCP server', () => {
      const server = useSettingsStore.getState().addMcpServer({
        name: 'PostgreSQL Server',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        enabled: true,
      });
      expect(server.id).toBeTruthy();
      expect(server.name).toBe('PostgreSQL Server');
      expect(useSettingsStore.getState().mcpServers.some((s) => s.id === server.id)).toBe(true);
    });

    it('37. adds MCP server with custom environment variables', () => {
      const server = useSettingsStore.getState().addMcpServer({
        name: 'Database Tools',
        command: 'docker',
        args: ['run', '-i', 'mcp/database'],
        env: { DB_HOST: 'localhost', DB_PORT: '5432' },
        enabled: false,
      });
      expect(server.args).toContain('mcp/database');
      expect(server.env?.DB_HOST).toBe('localhost');
    });

    it('38. updates existing MCP server properties', () => {
      const server = useSettingsStore.getState().addMcpServer({
        name: 'Dev Tools',
        command: 'node',
        args: ['./server.js'],
        enabled: true,
      });
      useSettingsStore.getState().updateMcpServer(server.id, { name: 'Enhanced Dev Tools', enabled: false });
      const updated = useSettingsStore.getState().mcpServers.find((s) => s.id === server.id);
      expect(updated?.name).toBe('Enhanced Dev Tools');
      expect(updated?.enabled).toBe(false);
    });

    it('39. removes MCP server by ID', () => {
      const server = useSettingsStore.getState().addMcpServer({
        name: 'Ephemeral MCP',
        command: 'test',
        args: [],
        enabled: true,
      });
      expect(useSettingsStore.getState().mcpServers.some((s) => s.id === server.id)).toBe(true);
      useSettingsStore.getState().removeMcpServer(server.id);
      expect(useSettingsStore.getState().mcpServers.some((s) => s.id === server.id)).toBe(false);
    });

    it('40. updates groundingEndpointUrl', () => {
      useSettingsStore.getState().setGroundingEndpointUrl('http://localhost:8000/ground');
      expect(useSettingsStore.getState().groundingEndpointUrl).toBe('http://localhost:8000/ground');
      expect(localStorage.getItem('aeio_grounding_endpoint_url')).toBe('http://localhost:8000/ground');
    });

    it('41. updates groundingModelType to "ui-tars"', () => {
      useSettingsStore.getState().setGroundingModelType('ui-tars');
      expect(useSettingsStore.getState().groundingModelType).toBe('ui-tars');
    });

    it('42. updates groundingModelType to "qwen2-vl"', () => {
      useSettingsStore.getState().setGroundingModelType('qwen2-vl');
      expect(useSettingsStore.getState().groundingModelType).toBe('qwen2-vl');
    });

    it('43. updates groundingModelType to "custom"', () => {
      useSettingsStore.getState().setGroundingModelType('custom');
      expect(useSettingsStore.getState().groundingModelType).toBe('custom');
    });

    it('44. preserves MCP server list in localStorage', () => {
      const initialCount = useSettingsStore.getState().mcpServers.length;
      useSettingsStore.getState().addMcpServer({
        name: 'Persisted Server',
        command: 'npx',
        args: ['-y', 'server'],
        enabled: true,
      });
      const stored = JSON.parse(localStorage.getItem('aeio_mcp_servers') || '[]');
      expect(stored.length).toBe(initialCount + 1);
    });

    it('45. handles updating non-existent MCP server without crashing', () => {
      expect(() => {
        useSettingsStore.getState().updateMcpServer('invalid-non-existent-id', { name: 'None' });
      }).not.toThrow();
    });

    it('46. handles removing non-existent MCP server without crashing', () => {
      expect(() => {
        useSettingsStore.getState().removeMcpServer('invalid-non-existent-id');
      }).not.toThrow();
    });

    it('47. updates overlay action with partial updates', async () => {
      await useSettingsStore.getState().showOverlayAction('Code', 'com.microsoft.VSCode', 'Initial Intent', 1, 4);
      const updated = await useSettingsStore.getState().updateOverlayAction({
        currentStep: 2,
        declaredIntent: 'Updated Intent',
      });
      expect(updated.currentStep).toBe(2);
    });

    it('48. retains activeProvider when switching tabs', () => {
      useSettingsStore.getState().setActiveProvider('bedrock');
      useSettingsStore.getState().setActiveTab('settings');
      useSettingsStore.getState().setActiveTab('chat');
      expect(useSettingsStore.getState().activeProvider).toBe('bedrock');
    });

    it('49. retains computer control allowlist entries when disabling master toggle', () => {
      useSettingsStore.getState().addToComputerControlAllowlist('com.apple.finder');
      useSettingsStore.getState().setComputerControlEnabled(false);
      expect(useSettingsStore.getState().computerControlAllowlist).toContain('com.apple.finder');
    });

    it('50. maintains state integrity under rapid concurrent property setters', () => {
      for (let i = 0; i < 50; i++) {
        useSettingsStore.getState().setBedrockRegion(i % 2 === 0 ? 'ap-southeast-2' : 'us-east-1');
        useSettingsStore.getState().setTheme(i % 2 === 0 ? 'dark' : 'light');
      }
      expect(['ap-southeast-2', 'us-east-1']).toContain(useSettingsStore.getState().bedrockRegion);
      expect(['dark', 'light']).toContain(useSettingsStore.getState().theme);
    });
  });
});
