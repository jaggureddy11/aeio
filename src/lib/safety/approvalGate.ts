import { ActionIntent, GuiActionApprovalRequest, RiskLevel } from '../types/actionIntent';
import { classifyActionRiskWithAllowlist } from './allowlist';
import { useSettingsStore } from '../../stores/settingsStore';

type ApprovalResolver = (approved: boolean) => void;

interface PendingApproval {
  request: GuiActionApprovalRequest;
  resolve: ApprovalResolver;
}

let pendingApproval: PendingApproval | null = null;
const listeners = new Set<(request: GuiActionApprovalRequest | null) => void>();

function notifyListeners() {
  const req = pendingApproval ? pendingApproval.request : null;
  listeners.forEach((listener) => {
    try {
      listener(req);
    } catch (err) {
      console.error('[ApprovalGate] Listener error:', err);
    }
  });
}

/**
 * Subscribes to changes in pending GUI action approval requests.
 */
export function subscribeToApprovalRequests(
  callback: (request: GuiActionApprovalRequest | null) => void
): () => void {
  listeners.add(callback);
  callback(pendingApproval ? pendingApproval.request : null);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Returns the currently active pending approval request, if any.
 */
export function getPendingApprovalRequest(): GuiActionApprovalRequest | null {
  return pendingApproval ? pendingApproval.request : null;
}

/**
 * Resolves the currently pending approval request.
 */
export function resolveApprovalRequest(approved: boolean): void {
  if (pendingApproval) {
    const resolver = pendingApproval.resolve;
    pendingApproval = null;
    notifyListeners();
    resolver(approved);
  }
}

/**
 * Evaluates whether a proposed action requires upfront human approval,
 * and if so, halts execution until approved or rejected.
 */
export async function requireActionApproval(
  intent: ActionIntent,
  options?: {
    targetAppName?: string;
    overrideRiskLevel?: RiskLevel;
  }
): Promise<{ approved: boolean; riskLevel: RiskLevel; reason?: string }> {
  const settings = useSettingsStore.getState();

  // If master toggle is OFF, refuse outright
  if (!settings.computerControlEnabled) {
    return {
      approved: false,
      riskLevel: 'High',
      reason: 'Computer Control master switch is disabled in Settings.',
    };
  }

  // Classify risk
  const riskLevel =
    options?.overrideRiskLevel ??
    classifyActionRiskWithAllowlist(
      intent,
      settings.computerControlAllowlist,
      settings.computerControlEnabled
    );

  // If already awaiting approval, reject new concurrent requests
  if (pendingApproval) {
    return {
      approved: false,
      riskLevel,
      reason: 'Another action approval is already pending.',
    };
  }

  // Low risk actions can proceed if allowlisted and non-destructive
  if (riskLevel === 'Low') {
    return { approved: true, riskLevel };
  }

  // Medium and High risk actions require upfront human approval modal
  return new Promise<{ approved: boolean; riskLevel: RiskLevel; reason?: string }>((resolve) => {
    const request: GuiActionApprovalRequest = {
      id: 'req-' + Math.random().toString(36).substring(2, 9),
      intent,
      targetAppName: options?.targetAppName || intent.targetAppBundleId,
      riskLevel,
      timestamp: new Date().toISOString(),
    };

    pendingApproval = {
      request,
      resolve: (approved: boolean) => {
        resolve({
          approved,
          riskLevel,
          reason: approved ? undefined : 'Action rejected by operator',
        });
      },
    };

    notifyListeners();
  });
}
