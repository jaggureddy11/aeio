import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'get_active_window_context') {
      return {
        app_name: 'Visual Studio Code',
        window_title: 'App.tsx - aeio',
        pid: 84920,
        bounds: { x: 0, y: 0, width: 1440, height: 900 },
      };
    }
    if (cmd === 'get_hardware_telemetry') {
      return {
        cpu_usage_percent: 22.4,
        memory_total_mb: 32768,
        memory_used_mb: 16384,
        memory_used_percent: 50.0,
        disk_total_gb: 1000.0,
        disk_available_gb: 450.0,
        top_processes: [
          { pid: 1084, name: 'Antigravity IDE', cpu_percent: 45.2, memory_mb: 1200.0 },
          { pid: 5001, name: 'Claude', cpu_percent: 18.5, memory_mb: 600.0 },
        ],
      };
    }
    if (cmd === 'get_global_shortcuts') {
      return [
        {
          shortcut: 'CmdOrCtrl+Shift+Space',
          action: 'toggle_main_window',
          description: 'Summon or hide the main Aeio assistant window',
        },
        {
          shortcut: 'CmdOrCtrl+Shift+V',
          action: 'toggle_voice_notch',
          description: 'Toggle Dynamic Island Notch and Voice HUD',
        },
        {
          shortcut: 'CmdOrCtrl+Shift+O',
          action: 'inspect_screen',
          description: 'Inspect active screen and capture visual context',
        },
      ];
    }
    if (cmd === 'set_system_volume') {
      const level = (args?.level as number) || 50;
      return {
        success: true,
        message: `Set volume to ${level}`,
        action_type: 'set_volume',
        payload: String(level),
      };
    }
    return null;
  }),
}));

import { matchInstantAction } from '../lib/systemOne/instantActions';
import { normalizeToolName } from '../lib/agent/plan';
import {
  getActiveWindowContext,
  getHardwareTelemetry,
  getGlobalShortcuts,
} from '../lib/ipc';
import { executeAgentTool, AVAILABLE_AGENT_TOOLS } from '../lib/agent/toolRegistry';

describe('Desktop Pillars Master Suite (Shortcuts, Window Context, Media & Telemetry)', () => {
  describe('Instant Action Regex Matching (<1ms)', () => {
    it('matches explicit volume percentage commands', () => {
      const match1 = matchInstantAction('set volume to 60%');
      expect(match1).not.toBeNull();
      expect(match1?.toolName).toBe('set_system_volume');
      expect(match1?.args.level).toBe(60);

      const match2 = matchInstantAction('volume 85');
      expect(match2).not.toBeNull();
      expect(match2?.toolName).toBe('set_system_volume');
      expect(match2?.args.level).toBe(85);

      const match3 = matchInstantAction('set volume 100%');
      expect(match3).not.toBeNull();
      expect(match3?.args.level).toBe(100);
    });

    it('matches active app and window context queries', () => {
      const match1 = matchInstantAction('what app am i using');
      expect(match1).not.toBeNull();
      expect(match1?.toolName).toBe('get_active_window_context');

      const match2 = matchInstantAction('active window');
      expect(match2).not.toBeNull();
      expect(match2?.toolName).toBe('get_active_window_context');

      const match3 = matchInstantAction('what is the current app');
      expect(match3).not.toBeNull();
      expect(match3?.toolName).toBe('get_active_window_context');

      const match4 = matchInstantAction('inspect active window');
      expect(match4).not.toBeNull();
      expect(match4?.toolName).toBe('get_active_window_context');
    });

    it('matches hardware telemetry and system performance queries', () => {
      const match1 = matchInstantAction('system status');
      expect(match1).not.toBeNull();
      expect(match1?.toolName).toBe('get_hardware_telemetry');

      const match2 = matchInstantAction('cpu usage');
      expect(match2).not.toBeNull();
      expect(match2?.toolName).toBe('get_hardware_telemetry');

      const match3 = matchInstantAction('ram usage');
      expect(match3).not.toBeNull();
      expect(match3?.toolName).toBe('get_hardware_telemetry');

      const match4 = matchInstantAction('system performance');
      expect(match4).not.toBeNull();
      expect(match4?.toolName).toBe('get_hardware_telemetry');

      const match5 = matchInstantAction('top processes');
      expect(match5).not.toBeNull();
      expect(match5?.toolName).toBe('get_hardware_telemetry');
    });

    it('matches global keyboard shortcuts queries', () => {
      const match1 = matchInstantAction('show keyboard shortcuts');
      expect(match1).not.toBeNull();
      expect(match1?.toolName).toBe('get_global_shortcuts');

      const match2 = matchInstantAction('hotkeys');
      expect(match2).not.toBeNull();
      expect(match2?.toolName).toBe('get_global_shortcuts');

      const match3 = matchInstantAction('what are the shortcuts');
      expect(match3).not.toBeNull();
      expect(match3?.toolName).toBe('get_global_shortcuts');
    });
  });

  describe('Tool Normalization in Planner', () => {
    it('normalizes window context aliases correctly', () => {
      expect(normalizeToolName('active_window')).toBe('get_active_window_context');
      expect(normalizeToolName('active_app')).toBe('get_active_window_context');
      expect(normalizeToolName('current_app')).toBe('get_active_window_context');
      expect(normalizeToolName('window_context')).toBe('get_active_window_context');
    });

    it('normalizes hardware telemetry aliases correctly', () => {
      expect(normalizeToolName('hardware_telemetry')).toBe('get_hardware_telemetry');
      expect(normalizeToolName('system_telemetry')).toBe('get_hardware_telemetry');
      expect(normalizeToolName('cpu_usage')).toBe('get_hardware_telemetry');
      expect(normalizeToolName('ram_usage')).toBe('get_hardware_telemetry');
      expect(normalizeToolName('top_processes')).toBe('get_hardware_telemetry');
    });

    it('normalizes global shortcuts aliases correctly', () => {
      expect(normalizeToolName('global_shortcuts')).toBe('get_global_shortcuts');
      expect(normalizeToolName('keyboard_shortcuts')).toBe('get_global_shortcuts');
      expect(normalizeToolName('hotkeys')).toBe('get_global_shortcuts');
    });
  });

  describe('Claude 3.5 Sonnet Tool Registry', () => {
    it('contains get_active_window_context, get_hardware_telemetry, and get_global_shortcuts', () => {
      const toolNames = AVAILABLE_AGENT_TOOLS.map((t) => t.name);
      expect(toolNames).toContain('get_active_window_context');
      expect(toolNames).toContain('get_hardware_telemetry');
      expect(toolNames).toContain('get_global_shortcuts');
    });
  });

  describe('IPC Bridge & Tool Execution Dispatcher', () => {
    it('retrieves active window context via getActiveWindowContext', async () => {
      const ctx = await getActiveWindowContext();
      expect(ctx).toBeDefined();
      expect(ctx.app_name).toBe('Visual Studio Code');
      expect(ctx.window_title).toBe('App.tsx - aeio');
      expect(ctx.pid).toBe(84920);
      expect(ctx.bounds).toBeDefined();
      expect(ctx.bounds?.width).toBe(1440);
    });

    it('retrieves hardware telemetry via getHardwareTelemetry', async () => {
      const telem = await getHardwareTelemetry();
      expect(telem).toBeDefined();
      expect(telem.cpu_usage_percent).toBeGreaterThan(0);
      expect(telem.memory_total_mb).toBe(32768);
      expect(telem.top_processes.length).toBeGreaterThan(0);
    });

    it('retrieves registered global shortcuts via getGlobalShortcuts', async () => {
      const shortcuts = await getGlobalShortcuts();
      expect(Array.isArray(shortcuts)).toBe(true);
      expect(shortcuts.length).toBe(3);
      expect(shortcuts[0].shortcut).toBe('CmdOrCtrl+Shift+Space');
    });

    it('dispatches tools through executeAgentTool', async () => {
      const winRes = await executeAgentTool('get_active_window_context', {});
      expect(winRes.app_name).toBe('Visual Studio Code');

      const telemRes = await executeAgentTool('get_hardware_telemetry', {});
      expect(telemRes.memory_total_mb).toBe(32768);

      const shortcutRes = await executeAgentTool('get_global_shortcuts', {});
      expect(shortcutRes.length).toBe(3);
    });
  });
});
