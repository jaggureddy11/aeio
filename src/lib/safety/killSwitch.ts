import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { EmergencyHaltEvent } from '../types/actionIntent';

let isEmergencyHaltActive = false;

/**
 * Returns current in-memory emergency halt status.
 */
export function isHaltActive(): boolean {
  return isEmergencyHaltActive;
}

/**
 * Manually set local halt state (for mock tests or local sync).
 */
export function setLocalHaltActive(active: boolean): void {
  isEmergencyHaltActive = active;
}

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Fetches the kill switch state from the Rust backend.
 */
export async function getKillSwitchState(): Promise<boolean> {
  if (!isTauri()) {
    return isEmergencyHaltActive;
  }
  try {
    const state = await invoke<boolean>('get_kill_switch_state');
    isEmergencyHaltActive = state;
    return state;
  } catch (err) {
    console.error('Failed to get kill switch state:', err);
    return isEmergencyHaltActive;
  }
}

/**
 * Manually triggers the kill switch on the backend.
 */
export async function triggerKillSwitch(reason?: string): Promise<void> {
  isEmergencyHaltActive = true;
  if (!isTauri()) {
    return;
  }
  try {
    await invoke<void>('trigger_kill_switch', { reason });
  } catch (err) {
    console.error('Failed to trigger kill switch:', err);
  }
}

/**
 * Resets the kill switch on the backend.
 */
export async function resetKillSwitch(): Promise<void> {
  isEmergencyHaltActive = false;
  if (!isTauri()) {
    return;
  }
  try {
    await invoke<void>('reset_kill_switch');
  } catch (err) {
    console.error('Failed to reset kill switch:', err);
  }
}

/**
 * Subscribes to backend emergency halt events.
 */
export async function listenToKillSwitch(
  onHaltChange: (event: EmergencyHaltEvent) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }
  return listen<EmergencyHaltEvent>('computer-control-emergency-halt', (event) => {
    isEmergencyHaltActive = event.payload.halted;
    onHaltChange(event.payload);
  });
}

/**
 * Helper to run a multi-step action loop with the mandatory kill-switch check
 * executed before every single step.
 */
export async function runActionLoopWithKillSwitch<T>(
  steps: Array<(stepIndex: number) => Promise<T> | T>,
  onStepComplete?: (stepIndex: number, result: T) => void
): Promise<{ completedCount: number; results: T[]; error?: string }> {
  const results: T[] = [];

  for (let i = 0; i < steps.length; i++) {
    // Invariant: check kill switch before every single step
    if (isEmergencyHaltActive) {
      return {
        completedCount: results.length,
        results,
        error: `Emergency stop active: action loop aborted before step ${i + 1}`,
      };
    }

    try {
      const res = await steps[i](i + 1);
      results.push(res);
      onStepComplete?.(i + 1, res);
    } catch (err) {
      return {
        completedCount: results.length,
        results,
        error: `Action failed at step ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { completedCount: results.length, results };
}
