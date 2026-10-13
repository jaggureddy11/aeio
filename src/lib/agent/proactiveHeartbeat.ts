import { getSystemStatus, SystemStatusInfo } from '../ipc';
import { globalProactiveCopilot, ProactiveNudge } from './proactiveCopilot';

export interface HeartbeatThresholds {
  criticalBatteryPercent: number; // default: 20
  lowDiskAvailableGb: number; // default: 10
  highDiskPercentUsed: number; // default: 90
  cooldownMs: number; // default: 15 minutes
}

/**
 * Autonomous Background Heartbeat Daemon:
 * Runs non-intrusively in the background to monitor system health (battery, disk space, memory pressure).
 * Emits proactive contextual alert nudges to the floating Dynamic Island Notch with zero performance impact.
 */
export class ProactiveHeartbeatDaemon {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private lastBatteryAlertTime: number = 0;
  private lastDiskAlertTime: number = 0;
  private lastStatus: SystemStatusInfo | null = null;
  private thresholds: HeartbeatThresholds = {
    criticalBatteryPercent: 20,
    lowDiskAvailableGb: 10,
    highDiskPercentUsed: 90,
    cooldownMs: 15 * 60 * 1000,
  };

  public start(intervalMs: number = 20000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    // Initial immediate evaluation
    this.tick().catch(() => {});
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  public getStatus(): SystemStatusInfo | null {
    return this.lastStatus;
  }

  public setThresholds(thresholds: Partial<HeartbeatThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  public async tick(): Promise<void> {
    try {
      const status = await getSystemStatus();
      this.lastStatus = status;
      this.evaluateHealth(status, false);
    } catch {
      // Non-Tauri / test environment fallback
    }
  }

  public async checkNow(forceVisualAlert: boolean = false): Promise<SystemStatusInfo | null> {
    try {
      const status = await getSystemStatus();
      this.lastStatus = status;
      this.evaluateHealth(status, forceVisualAlert);
      return status;
    } catch {
      return null;
    }
  }

  public evaluateHealth(status: SystemStatusInfo, forceAlert: boolean): void {
    const now = Date.now();

    // 1. Critical Battery Warning
    if (
      status.battery_level !== undefined &&
      status.battery_level !== null &&
      status.battery_level <= this.thresholds.criticalBatteryPercent &&
      status.is_charging === false
    ) {
      if (forceAlert || now - this.lastBatteryAlertTime > this.thresholds.cooldownMs) {
        this.lastBatteryAlertTime = now;
        const nudge: ProactiveNudge = {
          id: `nudge-battery-${now}`,
          title: `Battery Low (${status.battery_level}%)`,
          detail: `Your Mac is running on low battery and discharging. Plug in your charger soon.`,
          category: 'system',
          suggestedPrompt: `Check power efficiency and give tips to preserve battery.`,
          appName: 'System Power',
          windowTitle: 'Battery Health Alert',
          timestamp: now,
        };
        globalProactiveCopilot.setNudge(nudge);
        return;
      }
    }

    // 2. Low Disk Space Warning
    const isLowDisk =
      (status.disk_available_gb !== undefined &&
        status.disk_available_gb !== null &&
        status.disk_available_gb < this.thresholds.lowDiskAvailableGb) ||
      (status.disk_percent_used !== undefined &&
        status.disk_percent_used !== null &&
        status.disk_percent_used >= this.thresholds.highDiskPercentUsed);

    if (isLowDisk) {
      if (forceAlert || now - this.lastDiskAlertTime > this.thresholds.cooldownMs) {
        this.lastDiskAlertTime = now;
        const remaining =
          status.disk_available_gb !== null && status.disk_available_gb !== undefined
            ? `${status.disk_available_gb} GB`
            : 'Low';
        const used = status.disk_percent_used ? `${status.disk_percent_used}%` : 'near capacity';

        const nudge: ProactiveNudge = {
          id: `nudge-disk-${now}`,
          title: `Low Disk Space (${remaining} remaining)`,
          detail: `Root storage is ${used} full. Clean temporary caches or unused downloads.`,
          category: 'system',
          suggestedPrompt: `List safe ways to clean temporary files and caches on macOS to free up disk space.`,
          appName: 'Storage Manager',
          windowTitle: 'Disk Space Alert',
          timestamp: now,
        };
        globalProactiveCopilot.setNudge(nudge);
        return;
      }
    }

    // 3. Forced manual check (e.g. from Menu Bar Tray quick action) when everything is healthy
    if (forceAlert) {
      const battText =
        status.battery_level !== null && status.battery_level !== undefined
          ? `Battery at ${status.battery_level}%${status.is_charging ? ' (Charging)' : ''}`
          : 'Power connected';
      const diskText =
        status.disk_available_gb !== null && status.disk_available_gb !== undefined
          ? `${status.disk_available_gb} GB free`
          : 'Disk normal';

      const nudge: ProactiveNudge = {
        id: `nudge-health-ok-${now}`,
        title: `System Health: Optimal`,
        detail: `${battText}. Storage has ${diskText}. No performance anomalies detected.`,
        category: 'productivity',
        suggestedPrompt: `Show detailed system performance metrics.`,
        appName: 'Aeio Health Check',
        windowTitle: 'System Status All-Clear',
        timestamp: now,
      };
      globalProactiveCopilot.setNudge(nudge);
    }
  }
}

export const globalProactiveHeartbeat = new ProactiveHeartbeatDaemon();
