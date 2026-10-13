import { getActiveWindow, ActiveWindowInfo } from '../ipc';

export type NudgeCategory = 'error' | 'code' | 'git' | 'docs' | 'writing' | 'productivity' | 'system';

export interface ProactiveNudge {
  id: string;
  title: string;
  detail: string;
  category: NudgeCategory;
  suggestedPrompt: string;
  appName: string;
  windowTitle: string;
  timestamp: number;
}

/**
 * Analyzes active window context and produces a contextual proactive suggestion.
 */
export function analyzeWindowContextForNudge(info: ActiveWindowInfo): ProactiveNudge | null {
  if (!info || !info.app_name) return null;

  const app = info.app_name.toLowerCase();
  const title = (info.title || '').toLowerCase();

  // 1. Terminal / Build Failure Detection
  if (
    app.includes('terminal') ||
    app.includes('iterm') ||
    app.includes('warp') ||
    app.includes('alacritty') ||
    app.includes('hyper')
  ) {
    if (
      title.includes('error') ||
      title.includes('failed') ||
      title.includes('err!') ||
      title.includes('fatal') ||
      title.includes('panic') ||
      title.includes('exit 1') ||
      title.includes('traceback')
    ) {
      return {
        id: `nudge-term-error-${Date.now()}`,
        title: 'Build or Command Error Detected',
        detail: `Terminal error in "${info.title}"`,
        category: 'error',
        suggestedPrompt: `Analyze the recent build error in my active terminal and provide the fix.`,
        appName: info.app_name,
        windowTitle: info.title,
        timestamp: Date.now(),
      };
    }

    if (title.includes('git') || title.includes('commit') || title.includes('merge')) {
      return {
        id: `nudge-term-git-${Date.now()}`,
        title: 'Git Repository Active',
        detail: `Review staged changes or draft commit message`,
        category: 'git',
        suggestedPrompt: `Check git status in this repository and generate a concise commit message.`,
        appName: info.app_name,
        windowTitle: info.title,
        timestamp: Date.now(),
      };
    }
  }

  // 2. Code Editors (VS Code, Cursor, Xcode, Zed, Sublime)
  if (
    app.includes('code') ||
    app.includes('cursor') ||
    app.includes('xcode') ||
    app.includes('zed') ||
    app.includes('sublime') ||
    app.includes('intellij') ||
    app.includes('pycharm')
  ) {
    if (title.includes('.test.') || title.includes('_test.') || title.includes('spec.')) {
      return {
        id: `nudge-test-${Date.now()}`,
        title: 'Testing File Open',
        detail: `Run test suite or generate additional edge-case tests`,
        category: 'code',
        suggestedPrompt: `Review test cases in my active editor and suggest edge cases or run the suite.`,
        appName: info.app_name,
        windowTitle: info.title,
        timestamp: Date.now(),
      };
    }

    if (title.includes('error') || title.includes('debug') || title.includes('issue')) {
      return {
        id: `nudge-debug-${Date.now()}`,
        title: 'Debugging Active File',
        detail: `Inspect function logic and diagnose exceptions`,
        category: 'error',
        suggestedPrompt: `Inspect the current function or file in my active editor and debug potential bugs.`,
        appName: info.app_name,
        windowTitle: info.title,
        timestamp: Date.now(),
      };
    }

    if (title.includes('conflict') || title.includes('rebase')) {
      return {
        id: `nudge-conflict-${Date.now()}`,
        title: 'Git Merge Conflict Detected',
        detail: `Resolve conflicting chunks and verify integrity`,
        category: 'git',
        suggestedPrompt: `Analyze the git merge conflict markers in my active file and resolve them cleanly.`,
        appName: info.app_name,
        windowTitle: info.title,
        timestamp: Date.now(),
      };
    }
  }

  // 3. Web Browsers (Safari, Chrome, Arc, Brave, Firefox, Edge)
  if (
    app.includes('safari') ||
    app.includes('chrome') ||
    app.includes('arc') ||
    app.includes('brave') ||
    app.includes('firefox') ||
    app.includes('edge')
  ) {
    if (title.includes('pull request') || title.includes('/pull/') || title.includes('pr #')) {
      return {
        id: `nudge-gh-pr-${Date.now()}`,
        title: 'GitHub Pull Request Open',
        detail: `Summarize PR changes and list key review notes`,
        category: 'git',
        suggestedPrompt: `Summarize the active pull request in my browser and highlight key architectural changes.`,
        appName: info.app_name,
        windowTitle: info.title,
        timestamp: Date.now(),
      };
    }

    if (title.includes('issues') || title.includes('/issues/')) {
      return {
        id: `nudge-gh-issue-${Date.now()}`,
        title: 'GitHub Issue Open',
        detail: `Draft reproduction steps or propose an implementation plan`,
        category: 'code',
        suggestedPrompt: `Read the GitHub issue in my browser and generate a phased implementation plan.`,
        appName: info.app_name,
        windowTitle: info.title,
        timestamp: Date.now(),
      };
    }

    if (
      title.includes('documentation') ||
      title.includes('docs') ||
      title.includes('api reference') ||
      title.includes('stackoverflow')
    ) {
      return {
        id: `nudge-docs-${Date.now()}`,
        title: 'Technical Documentation Open',
        detail: `Extract code snippets and synthesize usage example`,
        category: 'docs',
        suggestedPrompt: `Summarize the documentation page open in my browser with runnable code examples.`,
        appName: info.app_name,
        windowTitle: info.title,
        timestamp: Date.now(),
      };
    }
  }

  // 4. Communication & Drafting (Slack, Mail, Notes, Discord)
  if (
    app.includes('slack') ||
    app.includes('mail') ||
    app.includes('notes') ||
    app.includes('discord') ||
    app.includes('notion')
  ) {
    return {
      id: `nudge-writing-${Date.now()}`,
      title: 'Drafting Content in ' + info.app_name,
      detail: `Polish tone, clarify structure, or reformat to bullet points`,
      category: 'writing',
      suggestedPrompt: `Help polish my draft in ${info.app_name} with clear and concise phrasing.`,
      appName: info.app_name,
      windowTitle: info.title,
      timestamp: Date.now(),
    };
  }

  return null;
}

class ProactiveCopilotManager {
  private activeNudge: ProactiveNudge | null = null;
  private listeners: ((nudge: ProactiveNudge | null) => void)[] = [];
  private lastCheckedTitle: string = '';
  private timer: any = null;
  private isRunning: boolean = false;

  public start(intervalMs: number = 4000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.checkContext();
    this.timer = setInterval(() => this.checkContext(), intervalMs);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async checkContext(): Promise<void> {
    try {
      const info = await getActiveWindow();
      if (!info || !info.title || info.title === this.lastCheckedTitle) {
        return;
      }
      this.lastCheckedTitle = info.title;

      const nudge = analyzeWindowContextForNudge(info);
      this.setNudge(nudge);
    } catch {
      // In non-Tauri or permission blocked environments, gracefully skip
    }
  }

  public setNudge(nudge: ProactiveNudge | null): void {
    this.activeNudge = nudge;
    this.listeners.forEach((fn) => fn(nudge));
  }

  public getActiveNudge(): ProactiveNudge | null {
    return this.activeNudge;
  }

  public getCurrentNudge(): ProactiveNudge | null {
    return this.activeNudge;
  }

  public dismissNudge(): void {
    this.setNudge(null);
  }

  public subscribe(fn: (nudge: ProactiveNudge | null) => void): () => void {
    this.listeners.push(fn);
    fn(this.activeNudge);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
}

export const globalProactiveCopilot = new ProactiveCopilotManager();
