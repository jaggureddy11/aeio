import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProactiveHeartbeatDaemon,
  globalProactiveHeartbeat,
} from '../lib/agent/proactiveHeartbeat';
import { globalProactiveCopilot } from '../lib/agent/proactiveCopilot';
import * as ipc from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  getSystemStatus: vi.fn(),
}));

describe('ProactiveHeartbeatDaemon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalProactiveCopilot.dismissNudge();
    globalProactiveHeartbeat.stop();
  });

  it('manages start and stop lifecycle cleanly', () => {
    const daemon = new ProactiveHeartbeatDaemon();
    daemon.start(5000);
    daemon.stop();
    expect(daemon.getStatus()).toBeNull();
  });

  it('triggers a low battery alert when battery is below threshold and discharging', () => {
    const daemon = new ProactiveHeartbeatDaemon();
    daemon.setThresholds({ criticalBatteryPercent: 20 });

    daemon.evaluateHealth(
      {
        os_name: 'macos',
        battery_level: 15,
        is_charging: false,
        disk_available_gb: 50,
        disk_percent_used: 50,
        memory_available_mb: 8192,
      },
      false
    );

    const nudge = globalProactiveCopilot.getCurrentNudge();
    expect(nudge).not.toBeNull();
    expect(nudge?.category).toBe('system');
    expect(nudge?.title).toContain('Battery Low (15%)');
    expect(nudge?.suggestedPrompt).toContain('battery');
  });

  it('suppresses low battery alert if device is currently plugged into charger', () => {
    const daemon = new ProactiveHeartbeatDaemon();

    daemon.evaluateHealth(
      {
        os_name: 'macos',
        battery_level: 12,
        is_charging: true, // Plugged in
        disk_available_gb: 50,
        disk_percent_used: 50,
        memory_available_mb: 8192,
      },
      false
    );

    const nudge = globalProactiveCopilot.getCurrentNudge();
    expect(nudge).toBeNull();
  });

  it('triggers a low disk space alert when available disk is below threshold', () => {
    const daemon = new ProactiveHeartbeatDaemon();
    daemon.setThresholds({ lowDiskAvailableGb: 10 });

    daemon.evaluateHealth(
      {
        os_name: 'macos',
        battery_level: 80,
        is_charging: true,
        disk_available_gb: 7.5,
        disk_percent_used: 93,
        memory_available_mb: 8192,
      },
      false
    );

    const nudge = globalProactiveCopilot.getCurrentNudge();
    expect(nudge).not.toBeNull();
    expect(nudge?.category).toBe('system');
    expect(nudge?.title).toContain('Low Disk Space');
    expect(nudge?.detail).toContain('Root storage is 93% full');
  });

  it('respects cooldown and prevents alert spam on consecutive ticks', () => {
    const daemon = new ProactiveHeartbeatDaemon();
    daemon.setThresholds({ criticalBatteryPercent: 20, cooldownMs: 60000 });

    // First trigger
    daemon.evaluateHealth(
      {
        os_name: 'macos',
        battery_level: 10,
        is_charging: false,
        disk_available_gb: 50,
        disk_percent_used: 50,
        memory_available_mb: 8192,
      },
      false
    );

    const firstNudge = globalProactiveCopilot.getCurrentNudge();
    expect(firstNudge).not.toBeNull();

    // Dismiss first nudge
    globalProactiveCopilot.dismissNudge();
    expect(globalProactiveCopilot.getCurrentNudge()).toBeNull();

    // Second trigger immediately after -> should be suppressed by cooldown
    daemon.evaluateHealth(
      {
        os_name: 'macos',
        battery_level: 10,
        is_charging: false,
        disk_available_gb: 50,
        disk_percent_used: 50,
        memory_available_mb: 8192,
      },
      false
    );

    expect(globalProactiveCopilot.getCurrentNudge()).toBeNull();
  });

  it('forces visual alert and all-clear health report when checkNow is invoked manually', async () => {
    vi.mocked(ipc.getSystemStatus).mockResolvedValue({
      os_name: 'macos',
      battery_level: 95,
      is_charging: true,
      disk_available_gb: 120,
      disk_percent_used: 45,
      memory_available_mb: 8192,
    });

    const status = await globalProactiveHeartbeat.checkNow(true);
    expect(status).not.toBeNull();
    expect(status?.battery_level).toBe(95);

    const nudge = globalProactiveCopilot.getCurrentNudge();
    expect(nudge).not.toBeNull();
    expect(nudge?.title).toContain('System Health: Optimal');
    expect(nudge?.detail).toContain('120 GB free');
  });
});
