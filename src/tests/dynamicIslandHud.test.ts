import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getHardwareTelemetry,
  getPowerStatus,
  getActiveWindowContext,
  getSystemVolume,
  setSystemVolume,
  setSystemMute,
  mediaControl,
  lockScreen,
  manageActiveWindow,
  resizeNotchWindow,
} from '../lib/ipc';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('Dynamic Island / Notch Window HUD Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Real-Time Telemetry Retrieval', () => {
    it('fetches hardware telemetry metrics for HUD gauges', async () => {
      const mockTelemetry = {
        cpu_usage_percent: 42.5,
        memory_total_mb: 16384,
        memory_used_mb: 8192,
        memory_used_percent: 50.0,
        disk_total_gb: 512,
        disk_available_gb: 256,
        top_processes: [
          { pid: 1234, name: 'Code', cpu_percent: 15.2, memory_mb: 1024 },
        ],
      };
      (invoke as any).mockResolvedValueOnce(mockTelemetry);

      const res = await getHardwareTelemetry();
      expect(invoke).toHaveBeenCalledWith('get_hardware_telemetry');
      expect(res.cpu_usage_percent).toBe(42.5);
      expect(res.memory_used_percent).toBe(50.0);
    });

    it('fetches power and battery telemetry', async () => {
      const mockPower = {
        percentage: 88,
        is_charging: true,
        power_source: 'Battery Power',
        time_remaining_minutes: 240,
      };
      (invoke as any).mockResolvedValueOnce(mockPower);

      const res = await getPowerStatus();
      expect(invoke).toHaveBeenCalledWith('get_power_status');
      expect(res.percentage).toBe(88);
      expect(res.is_charging).toBe(true);
    });

    it('fetches active app and window context for island badge', async () => {
      const mockContext = {
        app_name: 'Visual Studio Code',
        window_title: 'aeio — instantActions.ts',
        pid: 4567,
        bounds: { x: 0, y: 25, width: 1440, height: 900 },
      };
      (invoke as any).mockResolvedValueOnce(mockContext);

      const res = await getActiveWindowContext();
      expect(invoke).toHaveBeenCalledWith('get_active_window_context');
      expect(res.app_name).toBe('Visual Studio Code');
      expect(res.bounds?.width).toBe(1440);
    });
  });

  describe('Media Controls in Dynamic Island HUD', () => {
    it('dispatches play_pause media action', async () => {
      (invoke as any).mockResolvedValueOnce({
        success: true,
        message: 'Media playback toggled',
        action_type: 'media_control',
      });

      const res = await mediaControl('play_pause');
      expect(invoke).toHaveBeenCalledWith('media_control', { action: 'play_pause' });
      expect(res.success).toBe(true);
    });

    it('dispatches next track media action', async () => {
      (invoke as any).mockResolvedValueOnce({
        success: true,
        message: 'Skipped to next track',
        action_type: 'media_control',
      });

      const res = await mediaControl('next');
      expect(invoke).toHaveBeenCalledWith('media_control', { action: 'next' });
      expect(res.success).toBe(true);
    });

    it('dispatches previous track media action', async () => {
      (invoke as any).mockResolvedValueOnce({
        success: true,
        message: 'Returned to previous track',
        action_type: 'media_control',
      });

      const res = await mediaControl('previous');
      expect(invoke).toHaveBeenCalledWith('media_control', { action: 'previous' });
      expect(res.success).toBe(true);
    });

    it('fetches system volume status', async () => {
      (invoke as any).mockResolvedValueOnce({
        volume: 65,
        is_muted: false,
      });

      const res = await getSystemVolume();
      expect(invoke).toHaveBeenCalledWith('get_system_volume');
      expect(res.volume).toBe(65);
      expect(res.is_muted).toBe(false);
    });

    it('toggles system mute state', async () => {
      (invoke as any).mockResolvedValueOnce({
        success: true,
        message: 'System volume muted',
        action_type: 'set_system_mute',
      });

      const res = await setSystemMute(true);
      expect(invoke).toHaveBeenCalledWith('set_system_mute', { mute: true });
      expect(res.success).toBe(true);
    });

    it('steps system volume level', async () => {
      (invoke as any).mockResolvedValueOnce({
        success: true,
        message: 'System volume set to 60%',
        action_type: 'set_system_volume',
      });

      const res = await setSystemVolume(60);
      expect(invoke).toHaveBeenCalledWith('set_system_volume', { level: 60 });
      expect(res.success).toBe(true);
    });
  });

  describe('Quick Actions and Resizing in Dynamic Island HUD', () => {
    it('locks screen from HUD action pill', async () => {
      (invoke as any).mockResolvedValueOnce({
        success: true,
        message: 'Screen locked',
        action_type: 'lock_screen',
      });

      const res = await lockScreen();
      expect(invoke).toHaveBeenCalledWith('lock_screen');
      expect(res.success).toBe(true);
    });

    it('tiles window from HUD action pill', async () => {
      (invoke as any).mockResolvedValueOnce({
        success: true,
        message: 'Active window tiled to left',
        action_type: 'manage_active_window',
      });

      const res = await manageActiveWindow('tile_left');
      expect(invoke).toHaveBeenCalledWith('manage_active_window', { action: 'tile_left' });
      expect(res.success).toBe(true);
    });

    it('resizes notch window to expanded HUD dimensions (460x220)', async () => {
      (invoke as any).mockResolvedValueOnce(true);

      const res = await resizeNotchWindow(460, 220);
      expect(invoke).toHaveBeenCalledWith('resize_notch_window', { width: 460, height: 220 });
      expect(res).toBe(true);
    });

    it('resizes notch window to collapsed pill dimensions (380x48)', async () => {
      (invoke as any).mockResolvedValueOnce(true);

      const res = await resizeNotchWindow(380, 48);
      expect(invoke).toHaveBeenCalledWith('resize_notch_window', { width: 380, height: 48 });
      expect(res).toBe(true);
    });
  });
});
