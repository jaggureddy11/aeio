import { describe, it, expect } from 'vitest';
import { cleanDirective, matchUiCommand } from '../lib/agent/uiCommands';

describe('Production UI Commands Engine (50 Deterministic Test Cases)', () => {
  const cases: Array<{
    input: string;
    expectedKind: string | null;
    expectedKeyOrApp?: string;
    desc: string;
  }> = [
    // --- 1. Keyboard Navigation (15 tests) ---
    { input: 'press enter', expectedKind: 'key', expectedKeyOrApp: 'enter', desc: 'press enter' },
    { input: 'hit return key', expectedKind: 'key', expectedKeyOrApp: 'enter', desc: 'hit return' },
    { input: 'hit escape', expectedKind: 'key', expectedKeyOrApp: 'escape', desc: 'hit escape' },
    { input: 'press esc', expectedKind: 'key', expectedKeyOrApp: 'escape', desc: 'press esc' },
    { input: 'press tab', expectedKind: 'key', expectedKeyOrApp: 'tab', desc: 'press tab' },
    { input: 'hit space', expectedKind: 'key', expectedKeyOrApp: 'space', desc: 'hit space' },
    { input: 'press backspace', expectedKind: 'key', expectedKeyOrApp: 'backspace', desc: 'press backspace' },
    { input: 'hit delete key', expectedKind: 'key', expectedKeyOrApp: 'delete', desc: 'hit delete' },
    { input: 'press home', expectedKind: 'key', expectedKeyOrApp: 'home', desc: 'press home' },
    { input: 'hit end', expectedKind: 'key', expectedKeyOrApp: 'end', desc: 'hit end' },
    { input: 'press page up', expectedKind: 'key', expectedKeyOrApp: 'pageup', desc: 'press page up' },
    { input: 'press page down', expectedKind: 'key', expectedKeyOrApp: 'pagedown', desc: 'press page down' },
    { input: 'press up', expectedKind: 'key', expectedKeyOrApp: 'up', desc: 'press arrow up' },
    { input: 'press down', expectedKind: 'key', expectedKeyOrApp: 'down', desc: 'press arrow down' },
    { input: 'press left', expectedKind: 'key', expectedKeyOrApp: 'left', desc: 'press arrow left' },

    // --- 2. Browser Navigation & Politeness Stripping (10 tests) ---
    { input: 'Hey Aeio, please press enter', expectedKind: 'key', expectedKeyOrApp: 'enter', desc: 'polite hey aeio press enter' },
    { input: 'Could you please press escape key?', expectedKind: 'key', expectedKeyOrApp: 'escape', desc: 'polite escape' },
    { input: 'go back', expectedKind: 'key', expectedKeyOrApp: 'alt+left', desc: 'browser navigate back' },
    { input: 'go back a page', expectedKind: 'key', expectedKeyOrApp: 'alt+left', desc: 'browser back a page' },
    { input: 'go forward', expectedKind: 'key', expectedKeyOrApp: 'alt+right', desc: 'browser forward' },
    { input: 'reload page', expectedKind: 'key', expectedKeyOrApp: 'f5', desc: 'reload current page' },
    { input: 'refresh this page', expectedKind: 'key', expectedKeyOrApp: 'f5', desc: 'refresh page' },
    { input: 'reload the page', expectedKind: 'key', expectedKeyOrApp: 'f5', desc: 'reload the page' },
    { input: 'press right', expectedKind: 'key', expectedKeyOrApp: 'right', desc: 'press arrow right' },
    { input: 'Jarvis, hit the space key', expectedKind: 'key', expectedKeyOrApp: 'space', desc: 'jarvis prefix space' },

    // --- 3. Scrolling Commands (10 tests) ---
    { input: 'scroll down', expectedKind: 'scroll', desc: 'scroll down default' },
    { input: 'scroll up', expectedKind: 'scroll', desc: 'scroll up default' },
    { input: 'scroll down a bit', expectedKind: 'scroll', desc: 'scroll down small' },
    { input: 'scroll down a little', expectedKind: 'scroll', desc: 'scroll down subtle' },
    { input: 'scroll up a lot', expectedKind: 'scroll', desc: 'scroll up large' },
    { input: 'scroll down on this page', expectedKind: 'scroll', desc: 'scroll down on page' },
    { input: 'scroll left', expectedKind: 'scroll', desc: 'scroll left' },
    { input: 'scroll right', expectedKind: 'scroll', desc: 'scroll right' },
    { input: 'scroll down more', expectedKind: 'scroll', desc: 'scroll down more' },
    { input: 'scroll up again', expectedKind: 'scroll', desc: 'scroll up again' },

    // --- 4. Text Ingestion & Application Launching (10 tests) ---
    { input: 'type "hello world"', expectedKind: 'type', desc: 'type quoted text' },
    { input: 'type "git status"', expectedKind: 'type', desc: 'type command in quotes' },
    { input: 'type "aeio desktop"', expectedKind: 'type', desc: 'type search phrase' },
    { input: 'open Chrome', expectedKind: 'open_app', expectedKeyOrApp: 'Chrome', desc: 'open Chrome app' },
    { input: 'launch Spotify', expectedKind: 'open_app', expectedKeyOrApp: 'Spotify', desc: 'launch Spotify app' },
    { input: 'start Slack application', expectedKind: 'open_app', expectedKeyOrApp: 'Slack', desc: 'start Slack application' },
    { input: 'open Terminal program', expectedKind: 'open_app', expectedKeyOrApp: 'Terminal', desc: 'open Terminal program' },
    { input: 'launch VS Code', expectedKind: 'open_app', expectedKeyOrApp: 'VS Code', desc: 'launch VS Code editor' },
    { input: 'open Discord app', expectedKind: 'open_app', expectedKeyOrApp: 'Discord', desc: 'open Discord app' },
    { input: 'launch Calculator', expectedKind: 'open_app', expectedKeyOrApp: 'Calculator', desc: 'launch Calculator' },

    // --- 5. Non-UI Command Fallbacks (5 tests) ---
    { input: 'What is quantum computing?', expectedKind: null, desc: 'general query fallback' },
    { input: 'Write a python script to parse CSV files', expectedKind: null, desc: 'coding prompt fallback' },
    { input: 'How is the weather in Sydney?', expectedKind: null, desc: 'conversational query fallback' },
    { input: 'Explain the difference between TCP and UDP', expectedKind: null, desc: 'technical question fallback' },
    { input: 'Create a plan to organize my documents', expectedKind: null, desc: 'planning task fallback' },
  ];

  for (let i = 0; i < cases.length; i++) {
    const { input, expectedKind, expectedKeyOrApp, desc } = cases[i];
    it(`UI Case ${i + 1}/50: matches "${desc}" correctly`, () => {
      const match = matchUiCommand(input);
      if (expectedKind === null) {
        expect(match).toBeNull();
      } else {
        expect(match).not.toBeNull();
        expect(match?.kind).toBe(expectedKind);
        if (expectedKeyOrApp && match?.keys) {
          expect(match.keys).toBe(expectedKeyOrApp);
        }
        if (expectedKeyOrApp && match?.appName) {
          expect(match.appName).toBe(expectedKeyOrApp);
        }
      }
    });
  }

  it('cleanDirective strips polite variations cleanly', () => {
    expect(cleanDirective('Hey Jaggu, please press enter')).toBe('press enter');
    expect(cleanDirective('Could you kindly open Slack app?')).toBe('open Slack app');
  });
});
