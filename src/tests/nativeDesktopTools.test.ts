import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'manage_active_window') {
      const action = (args?.action as string) || 'maximize';
      return {
        success: true,
        message: `Window action '${action}' simulated in test.`,
        action_type: 'manage_window',
        payload: action,
      };
    }
    if (cmd === 'search_local_files') {
      const query = (args?.query as string) || '';
      return [
        {
          path: `/mock/workspace/${query || 'package.json'}`,
          name: query || 'package.json',
          is_dir: false,
        },
      ];
    }
    if (cmd === 'get_power_status') {
      return {
        percentage: 100,
        is_charging: true,
        power_source: 'AC Power',
        time_remaining_minutes: null,
      };
    }
    return null;
  }),
}));

import { matchInstantAction } from '../lib/systemOne/instantActions';
import { normalizeToolName } from '../lib/agent/plan';
import { manageActiveWindow, searchLocalFiles, getPowerStatus } from '../lib/ipc';
import { executeAgentTool, AVAILABLE_AGENT_TOOLS } from '../lib/agent/toolRegistry';

describe('Native Desktop Tools Expansion (Window Management, Local File Search & Battery)', () => {
  describe('Instant Action Regex Matching (< 1ms dispatch)', () => {
    it('matches window maximize commands', () => {
      const match1 = matchInstantAction('maximize window');
      expect(match1).not.toBeNull();
      expect(match1?.toolName).toBe('manage_window');
      expect(match1?.args.action).toBe('maximize');

      const match2 = matchInstantAction('fullscreen');
      expect(match2).not.toBeNull();
      expect(match2?.toolName).toBe('manage_window');
      expect(match2?.args.action).toBe('maximize');
    });

    it('matches window minimize commands', () => {
      const match = matchInstantAction('minimize window');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('manage_window');
      expect(match?.args.action).toBe('minimize');
    });

    it('matches window tile left and tile right commands', () => {
      const left = matchInstantAction('tile window left');
      expect(left).not.toBeNull();
      expect(left?.toolName).toBe('manage_window');
      expect(left?.args.action).toBe('tile_left');

      const right = matchInstantAction('snap window right');
      expect(right).not.toBeNull();
      expect(right?.toolName).toBe('manage_window');
      expect(right?.args.action).toBe('tile_right');

      const tileLeftDirect = matchInstantAction('tile left');
      expect(tileLeftDirect).not.toBeNull();
      expect(tileLeftDirect?.args.action).toBe('tile_left');
    });

    it('matches window center commands', () => {
      const match = matchInstantAction('center window');
      expect(match).not.toBeNull();
      expect(match?.toolName).toBe('manage_window');
      expect(match?.args.action).toBe('center');
    });

    it('matches local file search via native indexer', () => {
      const match1 = matchInstantAction('find file package.json');
      expect(match1).not.toBeNull();
      expect(match1?.toolName).toBe('search_local_files');
      expect(match1?.args.query).toBe('package.json');

      const match2 = matchInstantAction('locate file main.rs');
      expect(match2).not.toBeNull();
      expect(match2?.toolName).toBe('search_local_files');
      expect(match2?.args.query).toBe('main.rs');

      const match3 = matchInstantAction('search local files for index.html');
      expect(match3).not.toBeNull();
      expect(match3?.toolName).toBe('search_local_files');
      expect(match3?.args.query).toBe('index.html');
    });

    it('matches power and battery query commands', () => {
      const match1 = matchInstantAction('check battery');
      expect(match1).not.toBeNull();
      expect(match1?.toolName).toBe('get_power_status');

      const match2 = matchInstantAction('battery percentage');
      expect(match2).not.toBeNull();
      expect(match2?.toolName).toBe('get_power_status');

      const match3 = matchInstantAction('what is my battery level');
      expect(match3).not.toBeNull();
      expect(match3?.toolName).toBe('get_power_status');

      const match4 = matchInstantAction('battery status');
      expect(match4).not.toBeNull();
      expect(match4?.toolName).toBe('get_power_status');
    });
  });

  describe('Tool Normalization', () => {
    it('normalizes window, file search, and battery alias names correctly', () => {
      expect(normalizeToolName('tile_window')).toBe('manage_window');
      expect(normalizeToolName('maximize_window')).toBe('manage_window');
      expect(normalizeToolName('spotlight_search')).toBe('search_local_files');
      expect(normalizeToolName('find_file')).toBe('search_local_files');
      expect(normalizeToolName('power_status')).toBe('get_power_status');
      expect(normalizeToolName('battery_status')).toBe('get_power_status');
    });
  });

  describe('Agent Tool Registry Definitions', () => {
    it('exposes manage_window, search_local_files, and get_power_status in AVAILABLE_AGENT_TOOLS', () => {
      const toolNames = AVAILABLE_AGENT_TOOLS.map((t) => t.name);
      expect(toolNames).toContain('manage_window');
      expect(toolNames).toContain('search_local_files');
      expect(toolNames).toContain('get_power_status');
    });
  });

  describe('IPC Bridge & Tool Execution', () => {
    it('executes manageActiveWindow through IPC bridge', async () => {
      const res = await manageActiveWindow('maximize');
      expect(res).toBeDefined();
      expect(res.success).toBe(true);
    });

    it('executes searchLocalFiles through IPC bridge', async () => {
      const res = await searchLocalFiles('package.json', 5);
      expect(Array.isArray(res)).toBe(true);
    });

    it('executes getPowerStatus through IPC bridge', async () => {
      const res = await getPowerStatus();
      expect(res).toBeDefined();
      expect(typeof res.percentage).toBe('number');
      expect(res.percentage).toBeGreaterThanOrEqual(0);
      expect(res.percentage).toBeLessThanOrEqual(100);
      expect(typeof res.is_charging).toBe('boolean');
      expect(typeof res.power_source).toBe('string');
    });

    it('executes agent tools via executeAgentTool dispatcher', async () => {
      const winRes = await executeAgentTool('manage_window', { action: 'tile_left' });
      expect(winRes).toBeDefined();

      const searchRes = await executeAgentTool('search_local_files', { query: 'package.json', limit: 3 });
      expect(Array.isArray(searchRes)).toBe(true);

      const powerRes = await executeAgentTool('get_power_status', {});
      expect(powerRes).toBeDefined();
      expect(typeof powerRes.percentage).toBe('number');
    });
  });
});
