import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeWindowContextForNudge,
  globalProactiveCopilot,
  ProactiveNudge,
} from '../lib/agent/proactiveCopilot';
import * as ipc from '../lib/ipc';

vi.mock('../lib/ipc', () => ({
  getActiveWindow: vi.fn(),
}));

describe('Contextual Desktop Proactive Copilot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalProactiveCopilot.dismissNudge();
  });

  describe('analyzeWindowContextForNudge', () => {
    it('returns null for empty or missing window context', () => {
      expect(analyzeWindowContextForNudge(null as any)).toBeNull();
      expect(analyzeWindowContextForNudge({ app_name: '', title: '' } as any)).toBeNull();
    });

    it('detects terminal build or command errors', () => {
      const nudge = analyzeWindowContextForNudge({
        app_name: 'Terminal',
        title: 'cargo build failed: error[E0425]: cannot find value',
      } as any);

      expect(nudge).not.toBeNull();
      expect(nudge?.category).toBe('error');
      expect(nudge?.title).toContain('Build or Command Error');
      expect(nudge?.suggestedPrompt).toContain('build error');
    });

    it('detects terminal git active state', () => {
      const nudge = analyzeWindowContextForNudge({
        app_name: 'Warp',
        title: 'zsh - git commit in ~/projects/aeio',
      } as any);

      expect(nudge).not.toBeNull();
      expect(nudge?.category).toBe('git');
      expect(nudge?.title).toContain('Git Repository Active');
    });

    it('detects test files open in code editors', () => {
      const nudge = analyzeWindowContextForNudge({
        app_name: 'Code',
        title: 'proactiveCopilot.test.ts - aeio - Visual Studio Code',
      } as any);

      expect(nudge).not.toBeNull();
      expect(nudge?.category).toBe('code');
      expect(nudge?.title).toContain('Testing File Open');
    });

    it('detects git merge conflict in editor', () => {
      const nudge = analyzeWindowContextForNudge({
        app_name: 'Cursor',
        title: 'schema.prisma (merge conflict) - aeio',
      } as any);

      expect(nudge).not.toBeNull();
      expect(nudge?.category).toBe('git');
      expect(nudge?.title).toContain('Git Merge Conflict Detected');
    });

    it('detects GitHub PRs open in browser', () => {
      const nudge = analyzeWindowContextForNudge({
        app_name: 'Google Chrome',
        title: 'feat: proactive copilot · Pull Request #12 · apple/aeio',
      } as any);

      expect(nudge).not.toBeNull();
      expect(nudge?.category).toBe('git');
      expect(nudge?.title).toContain('GitHub Pull Request Open');
    });

    it('detects documentation pages open in browser', () => {
      const nudge = analyzeWindowContextForNudge({
        app_name: 'Arc',
        title: 'Tauri Documentation | Window Customization',
      } as any);

      expect(nudge).not.toBeNull();
      expect(nudge?.category).toBe('docs');
      expect(nudge?.title).toContain('Technical Documentation Open');
    });

    it('detects drafting in Slack, Notes, or Notion', () => {
      const nudge = analyzeWindowContextForNudge({
        app_name: 'Slack',
        title: '#announcements - Engineering',
      } as any);

      expect(nudge).not.toBeNull();
      expect(nudge?.category).toBe('writing');
      expect(nudge?.title).toContain('Drafting Content in Slack');
    });

    it('returns null for unhandled or routine background apps', () => {
      const nudge = analyzeWindowContextForNudge({
        app_name: 'Calculator',
        title: 'Calculator',
      } as any);

      expect(nudge).toBeNull();
    });
  });

  describe('globalProactiveCopilot Manager', () => {
    it('manages listeners and active nudge state', () => {
      let notifiedNudge: ProactiveNudge | null = null;
      const unsub = globalProactiveCopilot.subscribe((n) => {
        notifiedNudge = n;
      });

      const testNudge: ProactiveNudge = {
        id: 'test-1',
        title: 'Test Suggestion',
        detail: 'Details',
        category: 'code',
        suggestedPrompt: 'Do something',
        appName: 'TestApp',
        windowTitle: 'Test Window',
        timestamp: Date.now(),
      };

      globalProactiveCopilot.setNudge(testNudge);
      expect(globalProactiveCopilot.getActiveNudge()).toEqual(testNudge);
      expect(notifiedNudge).toEqual(testNudge);

      globalProactiveCopilot.dismissNudge();
      expect(globalProactiveCopilot.getActiveNudge()).toBeNull();
      expect(notifiedNudge).toBeNull();

      unsub();
    });

    it('checks active window context and triggers nudge on error', async () => {
      (ipc.getActiveWindow as any).mockResolvedValueOnce({
        app_name: 'iTerm2',
        title: 'npm test - 1 failed error',
      });

      await globalProactiveCopilot.checkContext();
      const nudge = globalProactiveCopilot.getActiveNudge();
      expect(nudge).not.toBeNull();
      expect(nudge?.category).toBe('error');
    });
  });
});
