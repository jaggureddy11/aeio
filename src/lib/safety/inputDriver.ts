import { ActionIntent } from '../types/actionIntent';
import { requireActionApproval } from './approvalGate';
const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export type ComputerAction =
  | { actionType: 'click'; x: number; y: number; button?: 'left' | 'right' | 'middle'; double?: boolean }
  | { actionType: 'move'; x: number; y: number }
  | { actionType: 'type'; text: string }
  | { actionType: 'keyCombo'; keys: string[] }
  | { actionType: 'scroll'; dx: number; dy: number }
  | { actionType: 'drag'; startX: number; startY: number; endX: number; endY: number };

export interface SimulatedActionRequest {
  intent: ActionIntent;
  action: ComputerAction;
  stepNumber: number;
  totalSteps: number;
  operatorApproved: boolean;
}

export interface ActionResult {
  status: 'SUCCESS' | 'ABORTED_BY_KILL_SWITCH' | 'REFUSED_SECURITY_POLICY';
  message: string;
  targetAppBundleId: string;
  completedStep: number;
}

/**
 * Directly invokes the Rust in-process native input simulator via Tauri IPC,
 * or forwards to the local dev server bridge when running in development.
 */
export async function executeComputerAction(
  request: SimulatedActionRequest
): Promise<ActionResult> {
  if (!isTauri()) {
    const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
    const isVitest = Boolean(g?.process?.env?.VITEST);
    if (!isVitest && typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      try {
        const resp = await fetch('/api/system-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'execute_computer_action', args: { request } }),
        });
        if (resp.ok) {
          return await resp.json();
        }
      } catch (err) {
        console.warn('[InputDriver] /api/system-action request failed:', err);
      }
    }
    return {
      status: 'REFUSED_SECURITY_POLICY',
      message: 'Native input driver requires Tauri runtime environment.',
      targetAppBundleId: request.intent.targetAppBundleId,
      completedStep: 0,
    };
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<ActionResult>('execute_computer_action', { request });
}

/**
 * Triggers native OS screen capture (screencapture on macOS, PowerShell on Windows, scrot on Linux).
 */
export async function captureScreen(outputPath: string): Promise<string> {
  if (!isTauri()) {
    const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
    const isVitest = Boolean(g?.process?.env?.VITEST);
    if (!isVitest && typeof window !== 'undefined' && typeof fetch !== 'undefined') {
      try {
        const resp = await fetch('/api/system-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'capture_screen', args: { outputPath } }),
        });
        if (resp.ok) {
          const data = await resp.json();
          return data.filePath || outputPath;
        }
      } catch {}
    }
    throw new Error('Screen capture requires Tauri runtime environment.');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<string>('capture_screen', { outputPath });
}

/**
 * High-level guarded action executor:
 * 1. Checks upfront approval requirement via approvalGate.
 * 2. If approved, delegates execution to in-process Rust driver with full safety telemetry.
 */
export async function executeGuardedStep(
  request: Omit<SimulatedActionRequest, 'operatorApproved'> & { targetAppName?: string }
): Promise<ActionResult> {
  const approval = await requireActionApproval(request.intent, {
    targetAppName: request.targetAppName,
  });

  if (!approval.approved) {
    return {
      status: 'REFUSED_SECURITY_POLICY',
      message: approval.reason || 'Action refused: human operator rejected approval.',
      targetAppBundleId: request.intent.targetAppBundleId,
      completedStep: Math.max(0, request.stepNumber - 1),
    };
  }

  return await executeComputerAction({
    ...request,
    operatorApproved: true,
  });
}
