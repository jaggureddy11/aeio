import { describe, it, expect, beforeEach } from 'vitest';
import {
  isHaltActive,
  setLocalHaltActive,
  triggerKillSwitch,
  resetKillSwitch,
  runActionLoopWithKillSwitch,
} from '../lib/safety/killSwitch';

describe('Phase 3: Native Kill Switch & Immediate Action Loop Abort', () => {
  beforeEach(() => {
    // Reset local halt state before each test
    setLocalHaltActive(false);
  });

  describe('Emergency Halt Atomic Flag State', () => {
    it('defaults to inactive', () => {
      expect(isHaltActive()).toBe(false);
    });

    it('sets emergency halt active when triggered', async () => {
      expect(isHaltActive()).toBe(false);
      await triggerKillSwitch('Manual test trigger');
      expect(isHaltActive()).toBe(true);
    });

    it('clears emergency halt state when reset', async () => {
      await triggerKillSwitch('Manual test trigger');
      expect(isHaltActive()).toBe(true);

      await resetKillSwitch();
      expect(isHaltActive()).toBe(false);
    });
  });

  describe('Mock Action Loop Interruption (Phase 3 Core Safety Invariant)', () => {
    it('halts a 10-step action loop after step 2, ensuring step 3 never runs', async () => {
      const executedSteps: number[] = [];

      // Create a 10-step mock action loop
      const steps = Array.from({ length: 10 }, (_, idx) => {
        const stepNum = idx + 1;
        return async () => {
          executedSteps.push(stepNum);

          // Simulate triggering the kill switch after step 2 completes
          if (stepNum === 2) {
            await triggerKillSwitch('Escape held for >= 300ms after step 2');
          }

          return `Step ${stepNum} finished`;
        };
      });

      const outcome = await runActionLoopWithKillSwitch(steps);

      // Verify immediate halt:
      // 1. Loop halted before step 4 (specifically step 3 never executed)
      expect(executedSteps).toEqual([1, 2]);
      expect(outcome.completedCount).toBe(2);
      expect(executedSteps).not.toContain(3);
      expect(executedSteps).not.toContain(4);

      // 2. The flag is verified set
      expect(isHaltActive()).toBe(true);

      // 3. Error explains abortion before step 3
      expect(outcome.error).toBeDefined();
      expect(outcome.error).toContain('aborted before step 3');

      // 4. No subsequent steps execute
      expect(executedSteps.length).toBe(2);
    });

    it('prevents step 1 from executing if kill switch is pre-tripped', async () => {
      await triggerKillSwitch('Tripped prior to execution');
      expect(isHaltActive()).toBe(true);

      let stepOneRan = false;
      const steps = [
        async () => {
          stepOneRan = true;
          return 'Result 1';
        },
        async () => 'Result 2',
      ];

      const outcome = await runActionLoopWithKillSwitch(steps);

      expect(stepOneRan).toBe(false);
      expect(outcome.completedCount).toBe(0);
      expect(outcome.error).toContain('aborted before step 1');
    });

    it('runs all steps to completion when kill switch is never triggered', async () => {
      const executedSteps: number[] = [];
      const steps = Array.from({ length: 5 }, (_, idx) => {
        const stepNum = idx + 1;
        return async () => {
          executedSteps.push(stepNum);
          return stepNum;
        };
      });

      const outcome = await runActionLoopWithKillSwitch(steps);

      expect(outcome.completedCount).toBe(5);
      expect(executedSteps).toEqual([1, 2, 3, 4, 5]);
      expect(outcome.error).toBeUndefined();
    });
  });
});
