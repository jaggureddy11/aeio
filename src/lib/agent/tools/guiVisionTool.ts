import { captureScreenData, focusApp, ScreenData } from '../../ipc';
import { executeGuardedStep, ActionResult } from '../../safety/inputDriver';
import { resolveGroundingTarget } from '../../safety/groundingClient';
import { useSettingsStore } from '../../../stores/settingsStore';
import { ActionIntent } from '../../types/actionIntent';

export interface GuiClickOptions {
  x?: number;
  y?: number;
  element?: string;
  app?: string;
  button?: 'left' | 'right' | 'middle';
  double?: boolean;
}

export interface GuiTypeOptions {
  text: string;
  app?: string;
  pressEnter?: boolean;
}

export interface GuiKeyComboOptions {
  keys: string[];
  app?: string;
}

export interface GuiScrollOptions {
  dx?: number;
  dy?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export interface GuiDragOptions {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  app?: string;
}

export interface GuiInspectOptions {
  instruction?: string;
  app?: string;
}

export interface GuiToolResult {
  success: boolean;
  message: string;
  coordinate?: { x: number; y: number };
  boundingBox?: [number, number, number, number];
  filePath?: string;
  targetApp?: string;
  raw?: ActionResult | any;
}

/**
 * Grounds a natural language UI element description onto screen coordinates.
 * Supports Bring-Your-Own Grounding endpoint (UI-TARS / Qwen2-VL) or heuristic fallback.
 */
export async function groundElementOnScreen(
  instruction: string,
  screen: ScreenData,
  targetApp?: string
): Promise<{ coordinate: { x: number; y: number }; boundingBox?: [number, number, number, number]; confidence: number }> {
  const settings = useSettingsStore.getState();
  const endpoint = settings.groundingEndpointUrl?.trim();

  if (endpoint) {
    try {
      const result = await resolveGroundingTarget(endpoint, {
        image: screen.base64,
        instruction,
        targetAppName: targetApp,
        screenWidth: screen.width,
        screenHeight: screen.height,
      });
      return {
        coordinate: result.coordinate,
        boundingBox: result.boundingBox,
        confidence: result.confidence,
      };
    } catch (err: any) {
      console.warn('[GuiVision] Dedicated grounding endpoint failed, attempting fallback:', err.message);
    }
  }

  // Fallback: If no dedicated model endpoint is configured or available,
  // evaluate basic heuristic spatial targets (e.g. center, search bar area, corners)
  const lower = instruction.toLowerCase();
  let x = Math.round(screen.width / 2);
  let y = Math.round(screen.height / 2);

  if (lower.includes('search') || lower.includes('top') || lower.includes('url')) {
    y = Math.round(screen.height * 0.12);
  } else if (lower.includes('bottom') || lower.includes('input') || lower.includes('send')) {
    y = Math.round(screen.height * 0.88);
  } else if (lower.includes('left') || lower.includes('sidebar')) {
    x = Math.round(screen.width * 0.15);
  } else if (lower.includes('right')) {
    x = Math.round(screen.width * 0.85);
  }

  return {
    coordinate: { x, y },
    confidence: 0.75,
  };
}

/**
 * Focuses an application window if specified.
 */
async function ensureAppFocus(app?: string): Promise<void> {
  if (app && app.trim().length > 0) {
    try {
      await focusApp(app.trim());
      // Small pause to allow window management focus animation
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      console.debug(`[GuiVision] Could not focus app '${app}':`, err);
    }
  }
}

/**
 * Click on an on-screen element either by direct (x, y) coordinates
 * or by natural language visual description.
 */
export async function guiClick(options: GuiClickOptions): Promise<GuiToolResult> {
  await ensureAppFocus(options.app);

  let targetX = options.x;
  let targetY = options.y;
  let boundingBox: [number, number, number, number] | undefined;

  if (targetX === undefined || targetY === undefined) {
    if (!options.element) {
      throw new Error('gui_click requires either coordinates (x, y) or an element description.');
    }

    const screen = await captureScreenData();
    const grounded = await groundElementOnScreen(options.element, screen, options.app);
    targetX = grounded.coordinate.x;
    targetY = grounded.coordinate.y;
    boundingBox = grounded.boundingBox;
  }

  const bundleId = options.app || 'com.apple.finder';
  const intent: ActionIntent = {
    naturalLanguageIntent: `Click ${options.element || `at (${targetX}, ${targetY})`}`,
    targetAppBundleId: bundleId,
    targetElementDescription: options.element || `Coordinate (${targetX}, ${targetY})`,
    intendedStateChange: 'Navigate',
  };

  const actionRes = await executeGuardedStep({
    intent,
    action: {
      actionType: 'click',
      x: targetX,
      y: targetY,
      button: options.button || 'left',
      double: options.double || false,
    },
    stepNumber: 1,
    totalSteps: 1,
    targetAppName: options.app,
  });

  return {
    success: actionRes.status === 'SUCCESS',
    message: actionRes.status === 'SUCCESS' ? `Clicked at (${targetX}, ${targetY})` : actionRes.message,
    coordinate: { x: targetX, y: targetY },
    boundingBox,
    targetApp: options.app,
    raw: actionRes,
  };
}

/**
 * Types text into the active focused GUI element.
 */
export async function guiType(options: GuiTypeOptions): Promise<GuiToolResult> {
  await ensureAppFocus(options.app);

  const bundleId = options.app || 'com.apple.finder';
  const intent: ActionIntent = {
    naturalLanguageIntent: `Type text into focused element`,
    targetAppBundleId: bundleId,
    targetElementDescription: 'Active input field',
    intendedStateChange: 'DataEntry',
  };

  const actionRes = await executeGuardedStep({
    intent,
    action: {
      actionType: 'type',
      text: options.text,
    },
    stepNumber: 1,
    totalSteps: options.pressEnter ? 2 : 1,
    targetAppName: options.app,
  });

  if (options.pressEnter && actionRes.status === 'SUCCESS') {
    await executeGuardedStep({
      intent: {
        naturalLanguageIntent: 'Press Enter key',
        targetAppBundleId: bundleId,
        targetElementDescription: 'Active field submission',
        intendedStateChange: 'Navigate',
      },
      action: {
        actionType: 'keyCombo',
        keys: ['enter'],
      },
      stepNumber: 2,
      totalSteps: 2,
      targetAppName: options.app,
    });
  }

  return {
    success: actionRes.status === 'SUCCESS',
    message: actionRes.status === 'SUCCESS' ? `Typed ${options.text.length} characters` : actionRes.message,
    targetApp: options.app,
    raw: actionRes,
  };
}

/**
 * Executes a keyboard combination (e.g. Cmd+C, Enter, Esc).
 */
export async function guiKeyCombo(options: GuiKeyComboOptions): Promise<GuiToolResult> {
  await ensureAppFocus(options.app);

  const bundleId = options.app || 'com.apple.finder';
  const intent: ActionIntent = {
    naturalLanguageIntent: `Press key combo: ${options.keys.join('+')}`,
    targetAppBundleId: bundleId,
    targetElementDescription: 'Keyboard shortcut',
    intendedStateChange: 'Navigate',
  };

  const actionRes = await executeGuardedStep({
    intent,
    action: {
      actionType: 'keyCombo',
      keys: options.keys,
    },
    stepNumber: 1,
    totalSteps: 1,
    targetAppName: options.app,
  });

  return {
    success: actionRes.status === 'SUCCESS',
    message: actionRes.status === 'SUCCESS' ? `Pressed ${options.keys.join('+')}` : actionRes.message,
    targetApp: options.app,
    raw: actionRes,
  };
}

/**
 * Scrolls the active window.
 */
export async function guiScroll(options: GuiScrollOptions): Promise<GuiToolResult> {
  let dx = options.dx || 0;
  let dy = options.dy || 0;

  if (options.direction) {
    const steps = options.amount || 5;
    switch (options.direction) {
      case 'up':
        dy = -steps;
        break;
      case 'down':
        dy = steps;
        break;
      case 'left':
        dx = -steps;
        break;
      case 'right':
        dx = steps;
        break;
    }
  }

  const intent: ActionIntent = {
    naturalLanguageIntent: `Scroll (${dx}, ${dy})`,
    targetAppBundleId: 'com.apple.finder',
    targetElementDescription: 'Scrollable window view',
    intendedStateChange: 'Navigate',
  };

  const actionRes = await executeGuardedStep({
    intent,
    action: {
      actionType: 'scroll',
      dx,
      dy,
    },
    stepNumber: 1,
    totalSteps: 1,
  });

  return {
    success: actionRes.status === 'SUCCESS',
    message: actionRes.status === 'SUCCESS' ? `Scrolled dx=${dx}, dy=${dy}` : actionRes.message,
    raw: actionRes,
  };
}

/**
 * Drags from a start coordinate to an end coordinate.
 */
export async function guiDrag(options: GuiDragOptions): Promise<GuiToolResult> {
  await ensureAppFocus(options.app);

  const bundleId = options.app || 'com.apple.finder';
  const intent: ActionIntent = {
    naturalLanguageIntent: `Drag from (${options.startX}, ${options.startY}) to (${options.endX}, ${options.endY})`,
    targetAppBundleId: bundleId,
    targetElementDescription: 'Drag gesture',
    intendedStateChange: 'Navigate',
  };

  const actionRes = await executeGuardedStep({
    intent,
    action: {
      actionType: 'drag',
      startX: options.startX,
      startY: options.startY,
      endX: options.endX,
      endY: options.endY,
    },
    stepNumber: 1,
    totalSteps: 1,
    targetAppName: options.app,
  });

  return {
    success: actionRes.status === 'SUCCESS',
    message: actionRes.status === 'SUCCESS' ? `Dragged from (${options.startX}, ${options.startY}) to (${options.endX}, ${options.endY})` : actionRes.message,
    targetApp: options.app,
    raw: actionRes,
  };
}

/**
 * Captures screen frame and returns dimensions, file path, and visual analysis.
 */
export async function guiInspectScreen(options: GuiInspectOptions = {}): Promise<GuiToolResult & { width: number; height: number; base64: string }> {
  await ensureAppFocus(options.app);
  const screen = await captureScreenData();

  return {
    success: true,
    message: `Captured screen frame (${screen.width}x${screen.height}) at ${screen.filePath}`,
    width: screen.width,
    height: screen.height,
    filePath: screen.filePath,
    base64: screen.base64,
    targetApp: options.app,
  };
}
