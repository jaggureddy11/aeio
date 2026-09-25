import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parsePlanFromResponse,
  classifyPlanSafety,
  ExecutionPlan,
} from '../lib/agent/plan';
import { useChatStore } from '../stores/chatStore';
import * as ipc from '../lib/ipc';

describe('Phase 2 — Agentic Multi-Step Execution Mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ipc, 'saveChatMessage').mockResolvedValue();
    useChatStore.setState({
      messages: [],
      isLoading: false,
      activeRunningPlanMessageId: null,
      alwaysAllowedCommands: [],
    });
  });

  describe('Plan Parser and Safety Classifier', () => {
    it('correctly parses XML step format and strips <plan> from text', () => {
      const response = `Here is the plan:
<plan title="Setup workspace">
  <step number="1" tool="run_shell" description="Check git status">{"command": "git status"}</step>
  <step number="2" tool="run_shell" description="List directory">{"command": "ls -la"}</step>
</plan>
Let me know if you want to proceed.`;

      const { plan, cleanedText } = parsePlanFromResponse(response);
      expect(plan).not.toBeNull();
      expect(plan?.title).toBe('Setup workspace');
      expect(plan?.steps).toHaveLength(2);
      expect(plan?.steps[0].description).toBe('Check git status');
      expect(plan?.steps[0].args.command).toBe('git status');
      expect(plan?.steps[0].isDestructive).toBe(false);
      expect(plan?.hasDestructiveSteps).toBe(false);
      expect(cleanedText).not.toContain('<plan');
      expect(cleanedText).toContain('Here is the plan:');
    });

    it('correctly parses JSON steps format and identifies destructive steps', () => {
      const response = `<plan title="Cleanup cache">
{
  "title": "Cleanup cache",
  "steps": [
    { "step": 1, "description": "Check current directory", "tool": "run_shell", "args": { "command": "pwd" } },
    { "step": 2, "description": "Delete temporary directory", "tool": "run_shell", "args": { "command": "rm -rf ./tmp" } }
  ]
}
</plan>`;

      const { plan } = parsePlanFromResponse(response);
      expect(plan).not.toBeNull();
      expect(plan?.steps).toHaveLength(2);
      expect(plan?.steps[0].isDestructive).toBe(false);
      expect(plan?.steps[1].isDestructive).toBe(true);
      expect(plan?.hasDestructiveSteps).toBe(true);
      expect(plan?.status).toBe('pending_approval');
    });

    it('classifies fully-safe plan as running (no approval needed) and destructive plan as pending_approval', async () => {
      const safePlan: ExecutionPlan = {
        id: 'plan-safe',
        title: 'Safe inspection',
        status: 'running',
        hasDestructiveSteps: false,
        currentStepIndex: 0,
        steps: [
          {
            id: 's1',
            stepNumber: 1,
            description: 'Check status',
            toolName: 'run_shell',
            args: { command: 'git status' },
            isDestructive: false,
            status: 'pending',
          },
        ],
      };

      const classifiedSafe = await classifyPlanSafety(safePlan);
      expect(classifiedSafe.hasDestructiveSteps).toBe(false);
      expect(classifiedSafe.status).toBe('running');

      const destructivePlan: ExecutionPlan = {
        id: 'plan-destr',
        title: 'Destructive purge',
        status: 'running',
        hasDestructiveSteps: false,
        currentStepIndex: 0,
        steps: [
          {
            id: 's1',
            stepNumber: 1,
            description: 'Purge folder',
            toolName: 'run_shell',
            args: { command: 'rm -rf /tmp/scratch' },
            isDestructive: false,
            status: 'pending',
          },
        ],
      };

      const classifiedDestr = await classifyPlanSafety(destructivePlan);
      expect(classifiedDestr.hasDestructiveSteps).toBe(true);
      expect(classifiedDestr.status).toBe('pending_approval');
    });

    it('Adversarial Test: model self-declaration destructive="false" CANNOT bypass classifier on destructive command', async () => {
      // Model maliciously or mistakenly claims `rm -rf ~/Documents` is non-destructive
      const adversarialXml = `<plan title="Adversarial Model Plan">
  <step number="1" tool="run_shell_command" destructive="false" description="Harmlessly clean user files">{"command": "rm -rf ~/Documents"}</step>
</plan>`;

      const { plan } = parsePlanFromResponse(adversarialXml);
      expect(plan).not.toBeNull();
      expect(plan?.steps[0].isDestructive).toBe(true);
      expect(plan?.hasDestructiveSteps).toBe(true);
      expect(plan?.status).toBe('pending_approval');

      // Now pass through classifyPlanSafety with IPC check
      const checkIpcMock = vi.fn().mockResolvedValue(true);
      const reclassified = await classifyPlanSafety(plan!, checkIpcMock);

      expect(checkIpcMock).toHaveBeenCalledWith('rm -rf ~/Documents');
      expect(reclassified.steps[0].isDestructive).toBe(true);
      expect(reclassified.hasDestructiveSteps).toBe(true);
      expect(reclassified.status).toBe('pending_approval');

      // Also verify JSON format with explicit destructive: false
      const adversarialJson = `<plan title="Adversarial JSON Plan">
{
  "title": "Adversarial JSON Plan",
  "steps": [
    {
      "step": 1,
      "description": "Safe wipe",
      "tool": "run_shell",
      "destructive": false,
      "isDestructive": false,
      "args": { "command": "rm -rf ~/Documents" }
    }
  ]
}
</plan>`;

      const { plan: jsonPlan } = parsePlanFromResponse(adversarialJson);
      expect(jsonPlan).not.toBeNull();
      expect(jsonPlan?.steps[0].isDestructive).toBe(true);
      expect(jsonPlan?.hasDestructiveSteps).toBe(true);
      expect(jsonPlan?.status).toBe('pending_approval');
    });
  });

  describe('Autonomous Execution & Upfront Gating in ChatStore', () => {
    it('Requirement 2: a fully-safe plan executes without any approval prompt', async () => {
      const runShellSpy = vi.spyOn(ipc, 'runShellCommand').mockResolvedValue({
        stdout: 'On branch main\nnothing to commit',
        stderr: '',
        exit_code: 0,
        is_destructive: false,
      });

      const messageId = useChatStore.getState().addMessage({
        role: 'assistant',
        content: 'Executing your safe maintenance plan',
      });

      const safePlan: ExecutionPlan = {
        id: 'plan-auto-safe',
        title: 'Safe Maintenance',
        status: 'running',
        hasDestructiveSteps: false,
        currentStepIndex: 0,
        steps: [
          {
            id: 'step-1',
            stepNumber: 1,
            description: 'Check git branch status',
            toolName: 'run_shell',
            args: { command: 'git status' },
            isDestructive: false,
            status: 'pending',
          },
          {
            id: 'step-2',
            stepNumber: 2,
            description: 'List workspace contents',
            toolName: 'run_shell',
            args: { command: 'ls -la' },
            isDestructive: false,
            status: 'pending',
          },
        ],
      };

      useChatStore.getState().updateMessageContent(
        messageId,
        'Executing your safe maintenance plan',
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        safePlan
      );

      // Execute plan autonomously
      await useChatStore.getState().executePlan(messageId);

      const updatedMsg = useChatStore.getState().messages.find((m) => m.id === messageId);
      expect(updatedMsg?.plan).toBeDefined();
      expect(updatedMsg?.plan?.status).toBe('completed');
      expect(updatedMsg?.plan?.steps[0].status).toBe('completed');
      expect(updatedMsg?.plan?.steps[1].status).toBe('completed');
      expect(runShellSpy).toHaveBeenCalledTimes(2);

      // Requirement 5: Receipt audit logging to toolExecutions
      expect(updatedMsg?.toolExecutions).toHaveLength(2);
      expect(updatedMsg?.toolExecutions?.[0].status).toBe('completed');
      expect(updatedMsg?.toolExecutions?.[0].result.exit_code).toBe(0);
    });

    it('Requirement 3: a plan containing one destructive step blocks on a single upfront approval', async () => {
      const runShellSpy = vi.spyOn(ipc, 'runShellCommand').mockResolvedValue({
        stdout: 'deleted',
        stderr: '',
        exit_code: 0,
        is_destructive: true,
      });

      const messageId = useChatStore.getState().addMessage({
        role: 'assistant',
        content: 'I created a cleanup plan for you',
      });

      const destructivePlan: ExecutionPlan = {
        id: 'plan-needs-approval',
        title: 'Purge artifacts',
        status: 'pending_approval',
        hasDestructiveSteps: true,
        currentStepIndex: 0,
        steps: [
          {
            id: 'step-1',
            stepNumber: 1,
            description: 'Inspect dist',
            toolName: 'run_shell',
            args: { command: 'ls dist' },
            isDestructive: false,
            status: 'pending',
          },
          {
            id: 'step-2',
            stepNumber: 2,
            description: 'Remove dist folder',
            toolName: 'run_shell',
            args: { command: 'rm -rf dist' },
            isDestructive: true,
            status: 'pending',
          },
        ],
      };

      useChatStore.getState().updateMessageContent(
        messageId,
        'I created a cleanup plan for you',
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        destructivePlan
      );

      // Verify that prior to approval, nothing has executed
      const beforeApproval = useChatStore.getState().messages.find((m) => m.id === messageId);
      expect(beforeApproval?.plan?.status).toBe('pending_approval');
      expect(beforeApproval?.plan?.steps[0].status).toBe('pending');
      expect(beforeApproval?.plan?.steps[1].status).toBe('pending');
      expect(runShellSpy).not.toHaveBeenCalled();

      // User gives single upfront approval for entire plan
      await useChatStore.getState().approvePlan(messageId);

      const afterApproval = useChatStore.getState().messages.find((m) => m.id === messageId);
      expect(afterApproval?.plan?.status).toBe('completed');
      expect(afterApproval?.plan?.steps[0].status).toBe('completed');
      expect(afterApproval?.plan?.steps[1].status).toBe('completed');
      expect(runShellSpy).toHaveBeenCalledTimes(2);
    });

    it('Requirement 4: cancellation mid-execution actually stops remaining steps', async () => {
      let callCount = 0;
      vi.spyOn(ipc, 'runShellCommand').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Cancel mid-execution during step 1
          useChatStore.getState().cancelPlan(messageId);
        }
        return {
          stdout: 'step executed',
          stderr: '',
          exit_code: 0,
          is_destructive: false,
        };
      });

      const messageId = useChatStore.getState().addMessage({
        role: 'assistant',
        content: 'Starting 3-step build sequence',
      });

      const multiStepPlan: ExecutionPlan = {
        id: 'plan-cancellation',
        title: '3-Step Sequence',
        status: 'running',
        hasDestructiveSteps: false,
        currentStepIndex: 0,
        steps: [
          {
            id: 'step-1',
            stepNumber: 1,
            description: 'Step 1: Check deps',
            toolName: 'run_shell',
            args: { command: 'echo step1' },
            isDestructive: false,
            status: 'pending',
          },
          {
            id: 'step-2',
            stepNumber: 2,
            description: 'Step 2: Build',
            toolName: 'run_shell',
            args: { command: 'echo step2' },
            isDestructive: false,
            status: 'pending',
          },
          {
            id: 'step-3',
            stepNumber: 3,
            description: 'Step 3: Deploy',
            toolName: 'run_shell',
            args: { command: 'echo step3' },
            isDestructive: false,
            status: 'pending',
          },
        ],
      };

      useChatStore.getState().updateMessageContent(
        messageId,
        'Starting 3-step build sequence',
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        multiStepPlan
      );

      await useChatStore.getState().executePlan(messageId);

      const msgAfter = useChatStore.getState().messages.find((m) => m.id === messageId);
      expect(msgAfter?.plan?.status).toBe('cancelled');
      // Step 2 and 3 must be cancelled, not executed
      expect(msgAfter?.plan?.steps[1].status).toBe('cancelled');
      expect(msgAfter?.plan?.steps[2].status).toBe('cancelled');
      expect(callCount).toBe(1);
    });

    it('Requirement 6: failure partway through halts remaining steps and reports accurately', async () => {
      let callCount = 0;
      vi.spyOn(ipc, 'runShellCommand').mockImplementation(async (cmd) => {
        callCount++;
        if (cmd === 'failing-command') {
          return {
            stdout: '',
            stderr: 'fatal: error during build',
            exit_code: 1,
            is_destructive: false,
          };
        }
        return {
          stdout: 'ok',
          stderr: '',
          exit_code: 0,
          is_destructive: false,
        };
      });

      const messageId = useChatStore.getState().addMessage({
        role: 'assistant',
        content: 'Running build pipeline',
      });

      const failingPlan: ExecutionPlan = {
        id: 'plan-failure',
        title: 'Build Pipeline',
        status: 'running',
        hasDestructiveSteps: false,
        currentStepIndex: 0,
        steps: [
          {
            id: 'step-1',
            stepNumber: 1,
            description: 'Step 1: Check repo',
            toolName: 'run_shell',
            args: { command: 'echo ok' },
            isDestructive: false,
            status: 'pending',
          },
          {
            id: 'step-2',
            stepNumber: 2,
            description: 'Step 2: Failing build',
            toolName: 'run_shell',
            args: { command: 'failing-command' },
            isDestructive: false,
            status: 'pending',
          },
          {
            id: 'step-3',
            stepNumber: 3,
            description: 'Step 3: Subsequent step',
            toolName: 'run_shell',
            args: { command: 'echo never_run' },
            isDestructive: false,
            status: 'pending',
          },
        ],
      };

      useChatStore.getState().updateMessageContent(
        messageId,
        'Running build pipeline',
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        failingPlan
      );

      await useChatStore.getState().executePlan(messageId);

      const msgAfter = useChatStore.getState().messages.find((m) => m.id === messageId);
      expect(msgAfter?.plan?.status).toBe('failed');
      expect(msgAfter?.plan?.steps[0].status).toBe('completed');
      expect(msgAfter?.plan?.steps[1].status).toBe('failed');
      expect(msgAfter?.plan?.steps[2].status).toBe('cancelled');
      expect(msgAfter?.plan?.stoppedReason).toContain('failed');
      expect(callCount).toBe(2);
    });
  });
});
