/**
 * Declared intended state change category for a planned GUI action.
 */
export type IntendedStateChange =
  | 'Navigate'
  | 'DataEntry'
  | 'FileOperation'
  | 'SystemChange'
  | 'Unknown';

/**
 * Evaluated risk tier for safety gating and approval requirements.
 */
export type RiskLevel = 'Low' | 'Medium' | 'High';

/**
 * Structured intent representation required for every proposed GUI action.
 * The model or planner cannot simply request a mouse event without explicitly declaring intent.
 */
export interface ActionIntent {
  /** Plain-language description of why this action is being taken. */
  naturalLanguageIntent: string;
  /** OS bundle identifier or executable ID of the target application (e.g., "com.apple.finder"). */
  targetAppBundleId: string;
  /** Description of the target UI element (e.g., "Submit button in active tab"). */
  targetElementDescription: string;
  /** Declared category of the expected state mutation. */
  intendedStateChange: IntendedStateChange;
}

/**
 * Event payload emitted when the emergency kill switch is tripped or reset.
 */
export interface EmergencyHaltEvent {
  timestamp: string;
  reason: string;
  halted: boolean;
}

/**
 * Active screen control overlay HUD state.
 */
export interface ControlOverlayState {
  isActive: boolean;
  targetAppName: string;
  targetAppBundleId: string;
  declaredIntent: string;
  currentStep: number;
  totalSteps: number;
  killSwitchTriggered: boolean;
  killSwitchReason: string | null;
}

/**
 * Request payload for the upfront human-in-the-loop approval gate.
 */
export interface GuiActionApprovalRequest {
  id: string;
  intent: ActionIntent;
  targetAppName?: string;
  riskLevel: RiskLevel;
  timestamp: string;
}

