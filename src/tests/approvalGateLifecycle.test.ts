import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  requireActionApproval,
  resolveApprovalRequest,
  getPendingApprovalRequest,
  subscribeToApprovalRequests,
} from '../lib/safety/approvalGate';
import { useSettingsStore } from '../stores/settingsStore';
import { ActionIntent } from '../lib/types/actionIntent';

describe('Human Approval Gate Safety State Machine (25 Test Cases)', () => {
  const dummyLowRiskIntent: ActionIntent = {
    targetAppBundleId: 'com.apple.finder',
    naturalLanguageIntent: 'Read current active finder folder',
    targetElementDescription: 'Finder window contents',
    intendedStateChange: 'Navigate',
  };

  const dummyHighRiskIntent: ActionIntent = {
    targetAppBundleId: 'com.apple.terminal',
    naturalLanguageIntent: 'Run system maintenance shell script',
    targetElementDescription: 'Terminal command prompt',
    intendedStateChange: 'SystemChange',
  };

  beforeEach(() => {
    // Ensure any leftover pending approval is cleared
    resolveApprovalRequest(false);
    useSettingsStore.setState({
      computerControlEnabled: true,
      computerControlAllowlist: ['com.apple.finder', 'com.apple.terminal'],
    });
  });

  describe('Master Switch Enforcement (5 tests)', () => {
    it('1. rejects all actions immediately when master computerControl switch is disabled', async () => {
      useSettingsStore.setState({ computerControlEnabled: false });
      const res = await requireActionApproval(dummyLowRiskIntent);
      expect(res.approved).toBe(false);
      expect(res.riskLevel).toBe('High');
      expect(res.reason).toContain('Computer Control master switch is disabled');
    });

    it('2. does not create pending approval request when master switch is disabled', async () => {
      useSettingsStore.setState({ computerControlEnabled: false });
      await requireActionApproval(dummyHighRiskIntent);
      expect(getPendingApprovalRequest()).toBeNull();
    });

    it('3. rejects even low-risk allowlisted actions when master switch is disabled', async () => {
      useSettingsStore.setState({ computerControlEnabled: false });
      const res = await requireActionApproval(dummyLowRiskIntent, { overrideRiskLevel: 'Low' });
      expect(res.approved).toBe(false);
    });

    it('4. allows action when master switch is re-enabled', async () => {
      useSettingsStore.setState({ computerControlEnabled: false });
      let res = await requireActionApproval(dummyLowRiskIntent, { overrideRiskLevel: 'Low' });
      expect(res.approved).toBe(false);

      useSettingsStore.setState({ computerControlEnabled: true });
      res = await requireActionApproval(dummyLowRiskIntent, { overrideRiskLevel: 'Low' });
      expect(res.approved).toBe(true);
    });

    it('5. maintains riskLevel in rejection response when master switch is disabled', async () => {
      useSettingsStore.setState({ computerControlEnabled: false });
      const res = await requireActionApproval(dummyLowRiskIntent);
      expect(res.riskLevel).toBeDefined();
    });
  });

  describe('Low-Risk Fast Path (5 tests)', () => {
    it('6. auto-approves low risk action without human intervention', async () => {
      const res = await requireActionApproval(dummyLowRiskIntent, { overrideRiskLevel: 'Low' });
      expect(res.approved).toBe(true);
      expect(res.riskLevel).toBe('Low');
    });

    it('7. leaves pendingApproval null after low-risk execution', async () => {
      await requireActionApproval(dummyLowRiskIntent, { overrideRiskLevel: 'Low' });
      expect(getPendingApprovalRequest()).toBeNull();
    });

    it('8. does not trigger subscriber callbacks with pending requests on low risk actions', async () => {
      const listener = vi.fn();
      const unsub = subscribeToApprovalRequests(listener);
      listener.mockClear();

      await requireActionApproval(dummyLowRiskIntent, { overrideRiskLevel: 'Low' });
      expect(listener).not.toHaveBeenCalled();
      unsub();
    });

    it('9. supports sequential low-risk actions without blockage', async () => {
      for (let i = 0; i < 5; i++) {
        const res = await requireActionApproval(dummyLowRiskIntent, { overrideRiskLevel: 'Low' });
        expect(res.approved).toBe(true);
      }
    });

    it('10. passes through targetAppName parameter on low-risk verification', async () => {
      const res = await requireActionApproval(dummyLowRiskIntent, {
        overrideRiskLevel: 'Low',
        targetAppName: 'Finder',
      });
      expect(res.approved).toBe(true);
    });
  });

  describe('High-Risk Human Approval Modal Workflow (10 tests)', () => {
    it('11. creates a pending approval request when high-risk action is evaluated', async () => {
      const promise = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      const pending = getPendingApprovalRequest();
      expect(pending).not.toBeNull();
      expect(pending?.riskLevel).toBe('High');
      expect(pending?.intent.intendedStateChange).toBe('SystemChange');

      resolveApprovalRequest(true);
      const res = await promise;
      expect(res.approved).toBe(true);
    });

    it('12. notifies active subscribers when high-risk approval is requested', async () => {
      const listener = vi.fn();
      const unsub = subscribeToApprovalRequests(listener);
      listener.mockClear();

      const promise = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: 'High' }));

      resolveApprovalRequest(true);
      await promise;
      unsub();
    });

    it('13. successfully approves action when operator resolves with true', async () => {
      const promise = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      resolveApprovalRequest(true);
      const res = await promise;
      expect(res.approved).toBe(true);
      expect(res.reason).toBeUndefined();
    });

    it('14. rejects action with reason when operator resolves with false', async () => {
      const promise = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      resolveApprovalRequest(false);
      const res = await promise;
      expect(res.approved).toBe(false);
      expect(res.reason).toContain('Action rejected by operator');
    });

    it('15. clears pending approval request once resolved', async () => {
      const promise = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      expect(getPendingApprovalRequest()).not.toBeNull();
      resolveApprovalRequest(true);
      await promise;
      expect(getPendingApprovalRequest()).toBeNull();
    });

    it('16. notifies subscribers with null when pending approval is resolved', async () => {
      const listener = vi.fn();
      const unsub = subscribeToApprovalRequests(listener);

      const promise = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      resolveApprovalRequest(true);
      await promise;

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall).toBeNull();
      unsub();
    });

    it('17. rejects second concurrent high-risk action while first is awaiting approval', async () => {
      const firstPromise = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      const secondRes = await requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });

      expect(secondRes.approved).toBe(false);
      expect(secondRes.reason).toContain('Another action approval is already pending');

      resolveApprovalRequest(true);
      await firstPromise;
    });

    it('18. assigns unique request ID to each approval request', async () => {
      const p1 = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      const id1 = getPendingApprovalRequest()?.id;
      resolveApprovalRequest(true);
      await p1;

      const p2 = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      const id2 = getPendingApprovalRequest()?.id;
      resolveApprovalRequest(true);
      await p2;

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it('19. attaches ISO timestamp to pending approval request', async () => {
      const p = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      const ts = getPendingApprovalRequest()?.timestamp;
      expect(ts).toBeTruthy();
      expect(new Date(ts!).getTime()).toBeGreaterThan(0);
      resolveApprovalRequest(true);
      await p;
    });

    it('20. defaults targetAppName to bundle ID if optional app name not provided', async () => {
      const p = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      expect(getPendingApprovalRequest()?.targetAppName).toBe('com.apple.terminal');
      resolveApprovalRequest(true);
      await p;
    });
  });

  describe('Subscription Lifecycle & Resiliency (5 tests)', () => {
    it('21. immediately provides current pending state upon subscription', () => {
      const listener = vi.fn();
      const unsub = subscribeToApprovalRequests(listener);
      expect(listener).toHaveBeenCalledWith(null);
      unsub();
    });

    it('22. unsubscribe removes callback from listener set', async () => {
      const listener = vi.fn();
      const unsub = subscribeToApprovalRequests(listener);
      unsub();
      listener.mockClear();

      const p = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      expect(listener).not.toHaveBeenCalled();
      resolveApprovalRequest(true);
      await p;
    });

    it('23. handles multiple concurrent subscribers receiving notifications', async () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      const u1 = subscribeToApprovalRequests(l1);
      const u2 = subscribeToApprovalRequests(l2);

      const p = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      expect(l1).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: 'High' }));
      expect(l2).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: 'High' }));

      resolveApprovalRequest(true);
      await p;
      u1();
      u2();
    });

    it('24. calling resolveApprovalRequest when no request is pending does not crash', () => {
      expect(() => resolveApprovalRequest(true)).not.toThrow();
      expect(() => resolveApprovalRequest(false)).not.toThrow();
    });

    it('25. subscriber exceptions do not break notification loop or reject approval promise', async () => {
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener crash');
      });
      const goodListener = vi.fn();

      const u1 = subscribeToApprovalRequests(badListener);
      const u2 = subscribeToApprovalRequests(goodListener);

      const p = requireActionApproval(dummyHighRiskIntent, { overrideRiskLevel: 'High' });
      expect(goodListener).toHaveBeenCalled();

      resolveApprovalRequest(true);
      const res = await p;
      expect(res.approved).toBe(true);
      u1();
      u2();
    });
  });
});
