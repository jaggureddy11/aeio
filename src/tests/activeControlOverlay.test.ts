import { describe, it, expect, beforeEach } from 'vitest';
import {
  showControlOverlay,
  updateControlOverlay,
  hideControlOverlay,
  getControlOverlayState,
  resetLocalOverlayState,
} from '../lib/safety/overlay';
import {
  requireActionApproval,
  getPendingApprovalRequest,
  resolveApprovalRequest,
} from '../lib/safety/approvalGate';
import { useSettingsStore } from '../stores/settingsStore';
import { ActionIntent } from '../lib/types/actionIntent';

describe('Phase 4: Visible Active-Control Overlay HUD & Upfront Approval Gate', () => {
  beforeEach(() => {
    resetLocalOverlayState();
    resolveApprovalRequest(false); // clear any pending approval

    const store = useSettingsStore.getState();
    store.setComputerControlEnabled(true);
    // Setup clean allowlist with TextEdit
    const current = [...store.computerControlAllowlist];
    current.forEach((app) => store.removeFromComputerControlAllowlist(app));
    store.addToComputerControlAllowlist('com.apple.textedit');
    store.setKillSwitchTripped(false);
  });

  describe('Overlay HUD State Management', () => {
    it('initializes in an inactive state', async () => {
      const state = await getControlOverlayState();
      expect(state.isActive).toBe(false);
      expect(state.targetAppName).toBe('');
      expect(state.declaredIntent).toBe('');
    });

    it('activates overlay with target application, bundle ID, and declared intent', async () => {
      const shown = await showControlOverlay(
        'TextEdit',
        'com.apple.TextEdit',
        'Close MeetingNotes.txt window',
        1,
        2
      );

      expect(shown.isActive).toBe(true);
      expect(shown.targetAppName).toBe('TextEdit');
      expect(shown.targetAppBundleId).toBe('com.apple.TextEdit');
      expect(shown.declaredIntent).toBe('Close MeetingNotes.txt window');
      expect(shown.currentStep).toBe(1);
      expect(shown.totalSteps).toBe(2);
      expect(shown.killSwitchTriggered).toBe(false);
    });

    it('updates progress and intent dynamically across steps', async () => {
      await showControlOverlay('TextEdit', 'com.apple.TextEdit', 'Step 1: Focus', 1, 3);
      const updated = await updateControlOverlay({
        declaredIntent: 'Step 2: Click Save Button',
        currentStep: 2,
      });

      expect(updated.isActive).toBe(true);
      expect(updated.declaredIntent).toBe('Step 2: Click Save Button');
      expect(updated.currentStep).toBe(2);
      expect(updated.totalSteps).toBe(3);
    });

    it('hides overlay once automation sequence completes', async () => {
      await showControlOverlay('TextEdit', 'com.apple.TextEdit', 'Action', 1, 1);
      const hidden = await hideControlOverlay();
      expect(hidden.isActive).toBe(false);

      const current = await getControlOverlayState();
      expect(current.isActive).toBe(false);
    });
  });

  describe('Upfront Human Approval Gate (Pillar 1 Human-In-The-Loop)', () => {
    it('refuses actions outright if computer control master switch is disabled', async () => {
      useSettingsStore.getState().setComputerControlEnabled(false);

      const intent: ActionIntent = {
        naturalLanguageIntent: 'Click close button',
        targetAppBundleId: 'com.apple.textedit',
        targetElementDescription: 'window close button',
        intendedStateChange: 'FileOperation',
      };

      const result = await requireActionApproval(intent);
      expect(result.approved).toBe(false);
      expect(result.riskLevel).toBe('High');
      expect(result.reason).toContain('disabled');
    });

    it('automatically approves low-risk navigation actions on allowlisted applications without modal', async () => {
      const intent: ActionIntent = {
        naturalLanguageIntent: 'Inspect view layout',
        targetAppBundleId: 'com.apple.textedit',
        targetElementDescription: 'main scroll area',
        intendedStateChange: 'Navigate',
      };

      const result = await requireActionApproval(intent);
      expect(result.approved).toBe(true);
      expect(result.riskLevel).toBe('Low');
      expect(getPendingApprovalRequest()).toBeNull();
    });

    it('halts and requires human approval for medium-risk data entry actions', async () => {
      const intent: ActionIntent = {
        naturalLanguageIntent: 'Type summary text into document',
        targetAppBundleId: 'com.apple.textedit',
        targetElementDescription: 'document text body',
        intendedStateChange: 'DataEntry',
      };

      const approvalPromise = requireActionApproval(intent);

      // Verify approval modal request is active
      const pending = getPendingApprovalRequest();
      expect(pending).not.toBeNull();
      expect(pending?.intent.naturalLanguageIntent).toBe('Type summary text into document');
      expect(pending?.riskLevel).toBe('Medium');

      // Operator approves the action
      resolveApprovalRequest(true);

      const outcome = await approvalPromise;
      expect(outcome.approved).toBe(true);
      expect(outcome.riskLevel).toBe('Medium');
      expect(getPendingApprovalRequest()).toBeNull();
    });

    it('halts and requires human approval for high-risk destructive actions, supporting operator rejection', async () => {
      const intent: ActionIntent = {
        naturalLanguageIntent: 'Close active window without saving',
        targetAppBundleId: 'com.apple.textedit',
        targetElementDescription: 'red close button',
        intendedStateChange: 'FileOperation',
      };

      const approvalPromise = requireActionApproval(intent);

      // Verify approval request is mounted
      const pending = getPendingApprovalRequest();
      expect(pending).not.toBeNull();
      expect(pending?.riskLevel).toBe('High');

      // Operator rejects the action
      resolveApprovalRequest(false);

      const outcome = await approvalPromise;
      expect(outcome.approved).toBe(false);
      expect(outcome.riskLevel).toBe('High');
      expect(outcome.reason).toContain('rejected by operator');
      expect(getPendingApprovalRequest()).toBeNull();
    });
  });

  describe('Zustand Settings Store Integration', () => {
    it('synchronizes overlay actions through showOverlayAction and hideOverlayAction', async () => {
      const store = useSettingsStore.getState();

      const shown = await store.showOverlayAction(
        'TextEdit',
        'com.apple.TextEdit',
        'Close window',
        1,
        2
      );
      expect(shown.isActive).toBe(true);
      expect(useSettingsStore.getState().overlayState?.isActive).toBe(true);

      const updated = await store.updateOverlayAction({ currentStep: 2 });
      expect(updated.currentStep).toBe(2);
      expect(useSettingsStore.getState().overlayState?.currentStep).toBe(2);

      await store.hideOverlayAction();
      expect(useSettingsStore.getState().overlayState?.isActive).toBe(false);
    });

    it('immediately reflects kill-switch tripped status across the HUD state', async () => {
      const store = useSettingsStore.getState();
      await store.showOverlayAction('TextEdit', 'com.apple.TextEdit', 'Writing notes');

      // Operator triggers emergency stop
      store.setKillSwitchTripped(true, 'Escape held for >= 300ms');

      expect(useSettingsStore.getState().killSwitchTripped).toBe(true);
      expect(useSettingsStore.getState().killSwitchReason).toContain('Escape held');
    });
  });
});

