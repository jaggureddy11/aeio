import { describe, it, expect, beforeEach } from 'vitest';
import {
  executeComputerAction,
  executeGuardedStep,
  SimulatedActionRequest,
} from '../lib/safety/inputDriver';
import {
  resolveApprovalRequest,
  getPendingApprovalRequest,
} from '../lib/safety/approvalGate';
import { useSettingsStore } from '../stores/settingsStore';
import { ActionIntent } from '../lib/types/actionIntent';

describe('Phase 5: Native Input Driver & Guarded Execution (TypeScript Layer)', () => {
  beforeEach(() => {
    resolveApprovalRequest(false);
    const store = useSettingsStore.getState();
    store.setComputerControlEnabled(true);
    const current = [...store.computerControlAllowlist];
    current.forEach((app) => store.removeFromComputerControlAllowlist(app));
    store.addToComputerControlAllowlist('com.apple.textedit');
    store.setKillSwitchTripped(false);
  });

  it('refuses execution gracefully when outside Tauri runtime', async () => {
    const request: SimulatedActionRequest = {
      intent: {
        naturalLanguageIntent: 'Move cursor to document',
        targetAppBundleId: 'com.apple.textedit',
        targetElementDescription: 'main text view',
        intendedStateChange: 'Navigate',
      },
      action: { actionType: 'move', x: 200, y: 300 },
      stepNumber: 1,
      totalSteps: 1,
      operatorApproved: true,
    };

    const result = await executeComputerAction(request);
    expect(result.status).toBe('REFUSED_SECURITY_POLICY');
    expect(result.message).toContain('Tauri runtime environment');
  });

  it('blocks high-risk actions in executeGuardedStep until operator resolves approval', async () => {
    const highRiskIntent: ActionIntent = {
      naturalLanguageIntent: 'Close window without saving document',
      targetAppBundleId: 'com.apple.textedit',
      targetElementDescription: 'window close red button',
      intendedStateChange: 'FileOperation',
    };

    const stepPromise = executeGuardedStep({
      intent: highRiskIntent,
      action: { actionType: 'click', x: 14, y: 14 },
      stepNumber: 1,
      totalSteps: 1,
      targetAppName: 'TextEdit',
    });

    // Check that approval gate has a pending request
    const pending = getPendingApprovalRequest();
    expect(pending).not.toBeNull();
    expect(pending?.riskLevel).toBe('High');
    expect(pending?.intent.naturalLanguageIntent).toBe(
      'Close window without saving document'
    );

    // Operator rejects
    resolveApprovalRequest(false);

    const outcome = await stepPromise;
    expect(outcome.status).toBe('REFUSED_SECURITY_POLICY');
    expect(outcome.message).toContain('Action rejected by operator');
  });

  it('refuses executeGuardedStep immediately when computer control master switch is disabled', async () => {
    const store = useSettingsStore.getState();
    store.setComputerControlEnabled(false);

    const intent: ActionIntent = {
      naturalLanguageIntent: 'Click somewhere in editor',
      targetAppBundleId: 'com.apple.textedit',
      targetElementDescription: 'editor',
      intendedStateChange: 'Navigate',
    };

    const outcome = await executeGuardedStep({
      intent,
      action: { actionType: 'click', x: 100, y: 100 },
      stepNumber: 1,
      totalSteps: 1,
      targetAppName: 'TextEdit',
    });

    expect(outcome.status).toBe('REFUSED_SECURITY_POLICY');
    expect(outcome.message).toContain('master switch is disabled');
  });
});
