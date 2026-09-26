import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeActionWithVisualAudit,
  listAuditReceipts,
  getAuditReceipt,
  resetMockAuditLog,
} from '../lib/safety/auditLog';
import { SimulatedActionRequest } from '../lib/safety/inputDriver';

describe('Phase 6: Full Visual Audit Trail & Immutable Receipts', () => {
  beforeEach(() => {
    resetMockAuditLog();
  });

  it('records an immutable receipt with before and after screenshot paths and SHA-256 hashes', async () => {
    const request: SimulatedActionRequest = {
      intent: {
        naturalLanguageIntent: 'Close TextEdit document window',
        targetAppBundleId: 'com.apple.textedit',
        targetElementDescription: 'close_window_button',
        intendedStateChange: 'FileOperation',
      },
      action: { actionType: 'click', x: 214, y: 164 },
      stepNumber: 1,
      totalSteps: 1,
      operatorApproved: true,
    };

    const receipt = await executeActionWithVisualAudit(
      request,
      'sess-2026-09-26-01',
      'MeetingNotes.txt',
      {
        model_endpoint: 'https://custom-uitars.endpoints.huggingface.cloud',
        predicted_coordinate: { x: 214, y: 164 },
        bounding_box: [208, 158, 220, 170],
        confidence: 0.96,
      }
    );

    // Verify Audit ID format
    expect(receipt.audit_id).toMatch(/^gui-act-/);
    expect(receipt.session_id).toBe('sess-2026-09-26-01');
    expect(receipt.action_type).toBe('click');

    // Verify Intent metadata
    expect(receipt.intent.natural_language).toBe('Close TextEdit document window');
    expect(receipt.intent.target_app).toBe('com.apple.textedit');
    expect(receipt.intent.window_title).toBe('MeetingNotes.txt');
    expect(receipt.intent.element).toBe('close_window_button');

    // Verify Grounding metadata
    expect(receipt.grounding?.predicted_coordinate).toEqual({ x: 214, y: 164 });
    expect(receipt.grounding?.bounding_box).toEqual([208, 158, 220, 170]);
    expect(receipt.grounding?.confidence).toBe(0.96);

    // Verify Safety Verdict
    expect(receipt.safety_verdict.allowlisted).toBe(true);
    expect(receipt.safety_verdict.blacklisted).toBe(false);
    expect(receipt.safety_verdict.user_approval_timestamp).toBeDefined();

    // Verify Visual Artifacts
    expect(receipt.artifacts.pre_screenshot_path).toContain(receipt.audit_id);
    expect(receipt.artifacts.pre_screenshot_path).toContain('_before.png');
    expect(receipt.artifacts.post_screenshot_path).toContain(receipt.audit_id);
    expect(receipt.artifacts.post_screenshot_path).toContain('_after.png');
    expect(receipt.artifacts.pre_screenshot_sha256).toBeDefined();
    expect(receipt.artifacts.post_screenshot_sha256).toBeDefined();

    // Verify Execution metrics
    expect(receipt.execution.status).toBe('COMPLETED');
    expect(receipt.execution.kill_switch_triggered).toBe(false);
    expect(receipt.execution.duration_ms).toBeGreaterThan(0);
  });

  it('lists audit receipts and allows retrieval by audit ID', async () => {
    const request1: SimulatedActionRequest = {
      intent: {
        naturalLanguageIntent: 'Click menu item',
        targetAppBundleId: 'com.apple.textedit',
        targetElementDescription: 'File menu',
        intendedStateChange: 'Navigate',
      },
      action: { actionType: 'click', x: 50, y: 10 },
      stepNumber: 1,
      totalSteps: 2,
      operatorApproved: true,
    };

    const request2: SimulatedActionRequest = {
      intent: {
        naturalLanguageIntent: 'Click Save As',
        targetAppBundleId: 'com.apple.textedit',
        targetElementDescription: 'Save item',
        intendedStateChange: 'FileOperation',
      },
      action: { actionType: 'click', x: 50, y: 80 },
      stepNumber: 2,
      totalSteps: 2,
      operatorApproved: true,
    };

    const r1 = await executeActionWithVisualAudit(request1, 'session-abc');
    const r2 = await executeActionWithVisualAudit(request2, 'session-abc');

    const all = await listAuditReceipts();
    expect(all.length).toBe(2);
    expect(all[0].audit_id).toBe(r2.audit_id); // Newest first

    const fetched = await getAuditReceipt(r1.audit_id);
    expect(fetched).not.toBeNull();
    expect(fetched?.audit_id).toBe(r1.audit_id);
    expect(fetched?.intent.natural_language).toBe('Click menu item');
  });
});
