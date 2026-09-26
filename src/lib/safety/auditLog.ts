import { SimulatedActionRequest } from './inputDriver';

export interface Coordinate2D {
  x: number;
  y: number;
}

export interface AuditIntent {
  natural_language: string;
  target_app: string;
  bundle_id: string;
  window_title?: string;
  element: string;
}

export interface AuditGrounding {
  model_endpoint?: string;
  predicted_coordinate?: Coordinate2D;
  bounding_box?: number[];
  confidence?: number;
}

export interface AuditSafetyVerdict {
  allowlisted: boolean;
  blacklisted: boolean;
  approval_required: boolean;
  user_approval_timestamp?: string;
}

export interface AuditExecution {
  duration_ms: number;
  status: string;
  kill_switch_triggered: boolean;
}

export interface AuditArtifacts {
  pre_screenshot_path: string;
  post_screenshot_path: string;
  pre_screenshot_sha256: string;
  post_screenshot_sha256: string;
}

export interface AuditReceipt {
  audit_id: string;
  session_id: string;
  timestamp: string;
  action_type: string;
  intent: AuditIntent;
  grounding?: AuditGrounding;
  safety_verdict: AuditSafetyVerdict;
  execution: AuditExecution;
  artifacts: AuditArtifacts;
}

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// In-memory test store fallback
let mockReceipts: AuditReceipt[] = [];

export function resetMockAuditLog(): void {
  mockReceipts = [];
}

/**
 * Executes a simulated action with full before/after screenshot capture,
 * SHA-256 verification, and immutable receipt generation.
 */
export async function executeActionWithVisualAudit(
  request: SimulatedActionRequest,
  sessionId: string,
  windowTitle?: string,
  grounding?: AuditGrounding
): Promise<AuditReceipt> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<AuditReceipt>('execute_computer_action_with_audit', {
      request,
      sessionId,
      windowTitle,
      grounding,
    });
  }

  // Fallback / mock implementation for unit testing outside Tauri runtime
  const auditId = 'gui-act-' + Math.random().toString(36).substring(2, 10);
  const timestamp = new Date().toISOString();
  const bundle = request.intent.targetAppBundleId;

  const receipt: AuditReceipt = {
    audit_id: auditId,
    session_id: sessionId,
    timestamp,
    action_type: request.action.actionType,
    intent: {
      natural_language: request.intent.naturalLanguageIntent,
      target_app: bundle,
      bundle_id: bundle,
      window_title: windowTitle,
      element: request.intent.targetElementDescription,
    },
    grounding,
    safety_verdict: {
      allowlisted: true,
      blacklisted: false,
      approval_required: !request.operatorApproved,
      user_approval_timestamp: request.operatorApproved ? timestamp : undefined,
    },
    execution: {
      duration_ms: 120,
      status: 'COMPLETED',
      kill_switch_triggered: false,
    },
    artifacts: {
      pre_screenshot_path: `audit/screenshots/${auditId}_before.png`,
      post_screenshot_path: `audit/screenshots/${auditId}_after.png`,
      pre_screenshot_sha256: 'mock-sha256-pre-' + auditId,
      post_screenshot_sha256: 'mock-sha256-post-' + auditId,
    },
  };

  mockReceipts.unshift(receipt);
  return receipt;
}

/**
 * Lists stored visual audit receipts, newest first.
 */
export async function listAuditReceipts(limit?: number): Promise<AuditReceipt[]> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<AuditReceipt[]>('list_audit_receipts', { limit });
  }

  if (limit) {
    return mockReceipts.slice(0, limit);
  }
  return [...mockReceipts];
}

/**
 * Fetches a single audit receipt by its unique ID.
 */
export async function getAuditReceipt(auditId: string): Promise<AuditReceipt | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<AuditReceipt>('get_audit_receipt', { auditId });
  }

  return mockReceipts.find((r) => r.audit_id === auditId) || null;
}
