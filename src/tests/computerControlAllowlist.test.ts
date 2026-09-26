import { describe, it, expect, beforeEach } from 'vitest';
import {
  isHardBlocked,
  isBrowser,
  validateBundleForAllowlist,
} from '../lib/safety/allowlist';
import { useSettingsStore } from '../stores/settingsStore';

describe('Phase 2: Computer Control Allowlist & Security Boundaries', () => {
  beforeEach(() => {
    // Reset Zustand store state before each test
    const store = useSettingsStore.getState();
    store.setComputerControlEnabled(false);
    // Clear allowlist
    const current = [...store.computerControlAllowlist];
    current.forEach((app) => store.removeFromComputerControlAllowlist(app));
  });

  describe('Hard-coded Absolute Blocklist', () => {
    it('identifies all known system settings and password manager bundles as hard-blocked', () => {
      // System settings
      expect(isHardBlocked('com.apple.systempreferences')).toBe(true);
      expect(isHardBlocked('com.apple.SystemSettings')).toBe(true);
      expect(isHardBlocked('com.apple.keychainaccess')).toBe(true);

      // Password managers
      expect(isHardBlocked('com.agilebits.onepassword')).toBe(true);
      expect(isHardBlocked('com.1password')).toBe(true);
      expect(isHardBlocked('com.bitwarden.desktop')).toBe(true);
      expect(isHardBlocked('org.keepassxc.keepassxc')).toBe(true);
      expect(isHardBlocked('com.dashlane.dashlane')).toBe(true);
    });

    it('identifies terminal emulators, shells, and code editors with integrated terminals as hard-blocked', () => {
      // macOS Terminals
      expect(isHardBlocked('com.apple.Terminal')).toBe(true);
      expect(isHardBlocked('Terminal.app')).toBe(true);
      expect(isHardBlocked('com.googlecode.iterm2')).toBe(true);
      expect(isHardBlocked('iTerm2')).toBe(true);
      expect(isHardBlocked('alacritty')).toBe(true);
      expect(isHardBlocked('kitty')).toBe(true);
      expect(isHardBlocked('ghostty')).toBe(true);

      // Windows Terminals & Shells
      expect(isHardBlocked('powershell.exe')).toBe(true);
      expect(isHardBlocked('powershell')).toBe(true);
      expect(isHardBlocked('pwsh.exe')).toBe(true);
      expect(isHardBlocked('cmd.exe')).toBe(true);
      expect(isHardBlocked('cmd')).toBe(true);
      expect(isHardBlocked('wt.exe')).toBe(true);
      expect(isHardBlocked('windowsterminal')).toBe(true);

      // Linux Terminals
      expect(isHardBlocked('gnome-terminal')).toBe(true);
      expect(isHardBlocked('konsole')).toBe(true);
      expect(isHardBlocked('xterm')).toBe(true);

      // Code Editors / IDEs with integrated terminals
      expect(isHardBlocked('com.microsoft.VSCode')).toBe(true);
      expect(isHardBlocked('vscode')).toBe(true);
      expect(isHardBlocked('Cursor')).toBe(true);
      expect(isHardBlocked('dev.zed.Zed')).toBe(true);
      expect(isHardBlocked('com.jetbrains.intellij')).toBe(true);
      expect(isHardBlocked('pycharm')).toBe(true);
    });

    it('rejects adding a blocked app at the validation layer with clear rationale', () => {
      const result = validateBundleForAllowlist('com.agilebits.onepassword');
      expect(result.type).toBe('Blocked');
      if (result.type === 'Blocked') {
        expect(result.reason).toContain('Absolute blocklist rejection');
      }
    });

    it('rejects Terminal.app and VS Code at validation layer with distinct rationale explaining shell command risk', () => {
      // Terminal.app rejection
      const termResult = validateBundleForAllowlist('Terminal.app');
      expect(termResult.type).toBe('Blocked');
      if (termResult.type === 'Blocked') {
        expect(termResult.reason.toLowerCase()).toContain(
          'terminal and code-editor applications can execute arbitrary commands and cannot be automated'
        );
      }

      // VS Code rejection
      const vsCodeResult = validateBundleForAllowlist('com.microsoft.VSCode');
      expect(vsCodeResult.type).toBe('Blocked');
      if (vsCodeResult.type === 'Blocked') {
        expect(vsCodeResult.reason.toLowerCase()).toContain(
          'terminal and code-editor applications can execute arbitrary commands and cannot be automated'
        );
      }
    });

    it('rejects adding a blocked app at the store/state layer and does not modify the allowlist', () => {
      const store = useSettingsStore.getState();
      const res = store.addToComputerControlAllowlist('com.apple.systempreferences');

      expect(res.success).toBe(false);
      expect(res.error).toContain('Absolute blocklist rejection');
      expect(useSettingsStore.getState().computerControlAllowlist).not.toContain('com.apple.systempreferences');
      expect(useSettingsStore.getState().computerControlAllowlist.length).toBe(0);
    });

    it('rejects adding Terminal.app and VS Code at store/state layer and keeps allowlist empty', () => {
      const store = useSettingsStore.getState();

      const termRes = store.addToComputerControlAllowlist('Terminal.app');
      expect(termRes.success).toBe(false);
      expect(termRes.error?.toLowerCase()).toContain(
        'terminal and code-editor applications can execute arbitrary commands and cannot be automated'
      );
      expect(useSettingsStore.getState().computerControlAllowlist).not.toContain('Terminal.app');

      const vsCodeRes = store.addToComputerControlAllowlist('com.microsoft.VSCode');
      expect(vsCodeRes.success).toBe(false);
      expect(vsCodeRes.error?.toLowerCase()).toContain(
        'terminal and code-editor applications can execute arbitrary commands and cannot be automated'
      );
      expect(useSettingsStore.getState().computerControlAllowlist).not.toContain('com.microsoft.VSCode');
      expect(useSettingsStore.getState().computerControlAllowlist.length).toBe(0);
    });
  });

  describe('Web Browser Warning Gating', () => {
    it('identifies web browser bundles', () => {
      expect(isBrowser('com.google.chrome')).toBe(true);
      expect(isBrowser('com.apple.safari')).toBe(true);
      expect(isBrowser('org.mozilla.firefox')).toBe(true);
      expect(isBrowser('company.thebrowser.browser')).toBe(true); // Arc
    });

    it('requires explicit confirmation before adding a web browser to allowlist', () => {
      const store = useSettingsStore.getState();
      // First attempt without confirmBrowser flag
      const attempt1 = store.addToComputerControlAllowlist('com.google.chrome', false);
      expect(attempt1.success).toBe(false);
      expect(attempt1.requiresBrowserConfirm).toBe(true);
      expect(attempt1.warning).toContain('arbitrary web pages');
      // Must NOT be added to store yet
      expect(useSettingsStore.getState().computerControlAllowlist).not.toContain('com.google.chrome');

      // Second attempt with user confirmation
      const attempt2 = store.addToComputerControlAllowlist('com.google.chrome', true);
      expect(attempt2.success).toBe(true);
      expect(useSettingsStore.getState().computerControlAllowlist).toContain('com.google.chrome');
    });
  });

  describe('Master Safety Toggle & Inertia', () => {
    it('defaults to OFF', () => {
      expect(useSettingsStore.getState().computerControlEnabled).toBe(false);
    });

    it('allows safe non-browser apps to be added to allowlist', () => {
      const store = useSettingsStore.getState();
      const res = store.addToComputerControlAllowlist('com.apple.calculator');
      expect(res.success).toBe(true);
      expect(useSettingsStore.getState().computerControlAllowlist).toContain('com.apple.calculator');

      // Removal works cleanly
      store.removeFromComputerControlAllowlist('com.apple.calculator');
      expect(useSettingsStore.getState().computerControlAllowlist).not.toContain('com.apple.calculator');
    });

    it('toggles master switch state reliably', () => {
      const store = useSettingsStore.getState();
      expect(store.computerControlEnabled).toBe(false);

      store.setComputerControlEnabled(true);
      expect(useSettingsStore.getState().computerControlEnabled).toBe(true);

      store.setComputerControlEnabled(false);
      expect(useSettingsStore.getState().computerControlEnabled).toBe(false);
    });
  });
});
