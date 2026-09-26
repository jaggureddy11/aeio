import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ControlOverlayState } from '../types/actionIntent';

const defaultOverlayState: ControlOverlayState = {
  isActive: false,
  targetAppName: '',
  targetAppBundleId: '',
  declaredIntent: '',
  currentStep: 0,
  totalSteps: 0,
  killSwitchTriggered: false,
  killSwitchReason: null,
};

let currentOverlayState: ControlOverlayState = { ...defaultOverlayState };
const listeners = new Set<(state: ControlOverlayState) => void>();

const notifyListeners = (state: ControlOverlayState) => {
  listeners.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {
      console.error('[OverlayState] Listener error:', e);
    }
  });
};

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Shows the active-control overlay HUD for a planned or running automation sequence.
 */
export async function showControlOverlay(
    targetAppName: string,
    targetAppBundleId: string,
    declaredIntent: string,
    currentStep: number = 1,
    totalSteps: number = 1
): Promise<ControlOverlayState> {
  currentOverlayState = {
    ...currentOverlayState,
    isActive: true,
    targetAppName,
    targetAppBundleId,
    declaredIntent,
    currentStep,
    totalSteps,
  };
  notifyListeners(currentOverlayState);

  if (!isTauri()) {
    return currentOverlayState;
  }

  try {
    const res = await invoke<ControlOverlayState>('show_control_overlay', {
      targetAppName,
      targetAppBundleId,
      declaredIntent,
      currentStep,
      totalSteps,
    });
    currentOverlayState = res;
    notifyListeners(res);
    return res;
  } catch (err) {
    console.error('Failed to show control overlay:', err);
    return currentOverlayState;
  }
}

/**
 * Updates step counter or declared intent on the active-control overlay HUD.
 */
export async function updateControlOverlay(updates: {
  targetAppName?: string;
  declaredIntent?: string;
  currentStep?: number;
  totalSteps?: number;
}): Promise<ControlOverlayState> {
  currentOverlayState = {
    ...currentOverlayState,
    targetAppName: updates.targetAppName ?? currentOverlayState.targetAppName,
    declaredIntent: updates.declaredIntent ?? currentOverlayState.declaredIntent,
    currentStep: updates.currentStep ?? currentOverlayState.currentStep,
    totalSteps: updates.totalSteps ?? currentOverlayState.totalSteps,
  };
  notifyListeners(currentOverlayState);

  if (!isTauri()) {
    return currentOverlayState;
  }

  try {
    const res = await invoke<ControlOverlayState>('update_control_overlay', updates);
    currentOverlayState = res;
    notifyListeners(res);
    return res;
  } catch (err) {
    console.error('Failed to update control overlay:', err);
    return currentOverlayState;
  }
}

/**
 * Hides the active-control overlay HUD once execution completes or is aborted.
 */
export async function hideControlOverlay(): Promise<ControlOverlayState> {
  currentOverlayState = {
    ...currentOverlayState,
    isActive: false,
  };
  notifyListeners(currentOverlayState);

  if (!isTauri()) {
    return currentOverlayState;
  }

  try {
    const res = await invoke<ControlOverlayState>('hide_control_overlay');
    currentOverlayState = res;
    notifyListeners(res);
    return res;
  } catch (err) {
    console.error('Failed to hide control overlay:', err);
    return currentOverlayState;
  }
}

/**
 * Fetches the current active-control overlay state.
 */
export async function getControlOverlayState(): Promise<ControlOverlayState> {
  if (!isTauri()) {
    return currentOverlayState;
  }

  try {
    const res = await invoke<ControlOverlayState>('get_control_overlay_state');
    currentOverlayState = res;
    return res;
  } catch (err) {
    console.error('Failed to get control overlay state:', err);
    return currentOverlayState;
  }
}

/**
 * Subscribes to real-time overlay state change events.
 */
export async function listenToOverlayState(
  callback: (state: ControlOverlayState) => void
): Promise<UnlistenFn> {
  listeners.add(callback);
  // Emit current state immediately to the new listener
  callback(currentOverlayState);

  let unlistenTauri: UnlistenFn = () => {};
  if (isTauri()) {
    try {
      unlistenTauri = await listen<ControlOverlayState>('overlay-state-changed', (event) => {
        currentOverlayState = event.payload;
        callback(event.payload);
      });
    } catch (e) {
      console.error('Failed to attach tauri overlay event listener:', e);
    }
  }

  return () => {
    listeners.delete(callback);
    unlistenTauri();
  };
}

/**
 * Reset local overlay state (useful for test suites).
 */
export function resetLocalOverlayState(): void {
  currentOverlayState = { ...defaultOverlayState };
  notifyListeners(currentOverlayState);
}
