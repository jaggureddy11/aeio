import { invoke } from '@tauri-apps/api/core';
import { ActionIntent, RiskLevel } from '../types/actionIntent';

export const HARD_BLOCKLIST_SYSTEM_AND_AUTH = [
  'com.apple.systempreferences',
  'com.apple.systemsettings',
  'com.apple.keychainaccess',
  'com.agilebits.onepassword',
  'com.agilebits.onepassword7',
  'com.1password',
  'com.bitwarden.desktop',
  'org.keepassxc.keepassxc',
  'com.dashlane.dashlane',
  'com.lastpass.lastpass',
  'com.enpass.enpass',
];

export const HARD_BLOCKLIST_TERMINALS_AND_EDITORS = [
  // macOS Terminal Emulators
  'com.apple.terminal',
  'com.googlecode.iterm2',
  'iterm2',
  'iterm',
  'terminal',
  'terminal.app',
  'alacritty',
  'org.alacritty',
  'kitty',
  'net.kovidgoyal.kitty',
  'wezterm',
  'com.github.wez.wezterm',
  'ghostty',
  'com.mitchellh.ghostty',

  // Windows Terminals & Shells
  'windowsterminal',
  'microsoft.windowsterminal',
  'microsoft.windowsterminalpreview',
  'wt.exe',
  'wt',
  'powershell.exe',
  'powershell',
  'pwsh.exe',
  'pwsh',
  'cmd.exe',
  'cmd',

  // Linux Terminals
  'gnome-terminal',
  'org.gnome.terminal',
  'konsole',
  'org.kde.konsole',
  'xterm',
  'terminator',
  'tilix',
  'com.gexperts.tilix',
  'rxvt',
  'urxvt',
  'foot',

  // Code Editors / IDEs with Integrated Terminal Panels
  'com.microsoft.vscode',
  'com.microsoft.vscodeinsiders',
  'code',
  'code.exe',
  'vscodium',
  'com.vscodium',
  'com.visualstudio.code',
  'com.visualstudio.code.oss',
  'com.todesktop.230313mzl4w4u92', // Cursor
  'cursor',
  'cursor.exe',
  'com.cursor',
  'dev.zed.zed',
  'dev.zed.zed-preview',
  'zed',
  'zed.exe',
  // JetBrains IDEs
  'com.jetbrains.intellij',
  'com.jetbrains.intellij.ce',
  'com.jetbrains.pycharm',
  'com.jetbrains.pycharm.ce',
  'com.jetbrains.webstorm',
  'com.jetbrains.rider',
  'com.jetbrains.clion',
  'com.jetbrains.goland',
  'com.jetbrains.rubymine',
  'com.jetbrains.datagrip',
  'com.jetbrains.phpstorm',
  'com.jetbrains.rustrover',
  'com.jetbrains.fleet',
  'idea',
  'pycharm',
  'webstorm',
  'rider',
  'clion',
  'goland',
  'rubymine',
  'datagrip',
  'phpstorm',
  'rustrover',
  'fleet',
];

export const HARD_BLOCKLIST = [
  ...HARD_BLOCKLIST_SYSTEM_AND_AUTH,
  ...HARD_BLOCKLIST_TERMINALS_AND_EDITORS,
];

export const KNOWN_BROWSERS = [
  'com.google.chrome',
  'com.google.chrome.canary',
  'com.apple.safari',
  'com.apple.safari.technologypreview',
  'org.mozilla.firefox',
  'org.mozilla.firefoxdeveloperedition',
  'com.brave.browser',
  'com.microsoft.edgemac',
  'company.thebrowser.browser', // Arc
  'com.operasoftware.opera',
  'com.vivaldi.vivaldi',
];

export interface ComputerControlConfig {
  enabled: boolean;
  allowlist: string[];
}

export type BundleValidationResult =
  | { type: 'Allowed' }
  | { type: 'RequiresBrowserWarning'; warning: string }
  | { type: 'Blocked'; reason: string };

/**
 * Checks whether an app bundle identifier belongs to a terminal, shell, or code editor with an integrated terminal.
 */
export function isTerminalOrEditor(bundleId: string): boolean {
  const clean = bundleId.trim().toLowerCase();
  if (!clean) return false;
  if (HARD_BLOCKLIST_TERMINALS_AND_EDITORS.includes(clean)) return true;

  const exactNames = [
    'terminal', 'terminal.app', 'iterm', 'iterm2', 'wt', 'wt.exe',
    'powershell', 'powershell.exe', 'pwsh', 'pwsh.exe', 'cmd', 'cmd.exe',
    'bash', 'zsh', 'sh', 'fish', 'nu',
    'code', 'code.exe', 'vscode', 'vs code', 'cursor', 'cursor.exe',
    'zed', 'zed.exe', 'idea', 'pycharm', 'webstorm', 'rider', 'clion', 'goland',
    'rubymine', 'datagrip', 'phpstorm', 'rustrover', 'fleet', 'sublime', 'sublime text',
  ];
  if (exactNames.includes(clean)) return true;

  const terminalEditorTokens = [
    'terminal',
    'iterm',
    'powershell',
    'pwsh',
    'cmd.exe',
    'konsole',
    'xterm',
    'alacritty',
    'wezterm',
    'kitty',
    'ghostty',
    'vscode',
    'jetbrains',
    'cursor',
    'dev.zed',
    'vscodium',
  ];
  return terminalEditorTokens.some((tok) => clean.includes(tok));
}

/**
 * Checks whether an app bundle identifier belongs to system settings or credential tools.
 */
export function isSystemOrCredential(bundleId: string): boolean {
  const clean = bundleId.trim().toLowerCase();
  if (!clean) return false;
  if (HARD_BLOCKLIST_SYSTEM_AND_AUTH.includes(clean)) return true;

  const criticalTokens = [
    'keychain', 'password', 'systempreferences', 'systemsettings',
    '1password', 'bitwarden', 'keepass', 'dashlane', 'lastpass', 'enpass',
  ];
  return criticalTokens.some((tok) => clean.includes(tok));
}

/**
 * Checks whether an app bundle identifier is hard-blocked.
 */
export function isHardBlocked(bundleId: string): boolean {
  const clean = bundleId.trim().toLowerCase();
  if (!clean) return true;
  return isSystemOrCredential(clean) || isTerminalOrEditor(clean);
}

/**
 * Checks whether an app bundle identifier is a known web browser.
 */
export function isBrowser(bundleId: string): boolean {
  const clean = bundleId.trim().toLowerCase();
  if (!clean) return false;
  if (KNOWN_BROWSERS.includes(clean)) return true;

  const browserTokens = ['browser', 'chrome', 'safari', 'firefox', 'brave', 'edge'];
  return browserTokens.some((tok) => clean.includes(tok));
}

/**
 * Validates a bundle identifier before adding to allowlist.
 */
export function validateBundleForAllowlist(bundleId: string): BundleValidationResult {
  const clean = bundleId.trim().toLowerCase();
  if (!clean) {
    return { type: 'Blocked', reason: 'Bundle identifier cannot be empty.' };
  }

  if (isTerminalOrEditor(clean)) {
    return {
      type: 'Blocked',
      reason: `Absolute blocklist rejection: '${clean}' is a terminal or code editor. Terminal and code-editor applications can execute arbitrary commands and cannot be automated.`,
    };
  }

  if (isSystemOrCredential(clean)) {
    return {
      type: 'Blocked',
      reason: `Absolute blocklist rejection: '${clean}' is a system setting or password manager and cannot be automated under any circumstance.`,
    };
  }

  if (isBrowser(clean)) {
    return {
      type: 'RequiresBrowserWarning',
      warning: `Adding web browser '${clean}' grants Computer Control access to arbitrary web pages and active authenticated sessions (such as banking or email).`,
    };
  }

  return { type: 'Allowed' };
}

// IPC Calls to Rust Backend
export async function getComputerControlSettings(): Promise<ComputerControlConfig> {
  return invoke<ComputerControlConfig>('get_computer_control_settings');
}

export async function setComputerControlEnabledIpc(enabled: boolean): Promise<void> {
  return invoke<void>('set_computer_control_enabled', { enabled });
}

export async function addToAllowlistIpc(bundleId: string): Promise<any> {
  return invoke<any>('add_to_computer_control_allowlist', { bundleId });
}

export async function removeFromAllowlistIpc(bundleId: string): Promise<void> {
  return invoke<void>('remove_from_computer_control_allowlist', { bundleId });
}

export async function classifyActionIntentIpc(intent: ActionIntent): Promise<RiskLevel> {
  return invoke<RiskLevel>('classify_action_intent', { intent });
}

/**
 * Classifies the risk of an ActionIntent against the allowlist and master toggle.
 */
export function classifyActionRiskWithAllowlist(
  intent: ActionIntent,
  allowlist: string[],
  masterEnabled: boolean = true
): RiskLevel {
  if (!masterEnabled) return 'High';
  const bundle = intent.targetAppBundleId.trim().toLowerCase();
  if (!bundle) return 'High';
  if (isHardBlocked(bundle)) return 'High';
  if (!allowlist.map((b) => b.trim().toLowerCase()).includes(bundle)) return 'High';

  if (intent.intendedStateChange === 'SystemChange' || intent.intendedStateChange === 'Unknown') {
    return 'High';
  }

  const intentLower = intent.naturalLanguageIntent.toLowerCase();
  const elementLower = intent.targetElementDescription.toLowerCase();
  const combined = `${intentLower} ${elementLower}`;

  const highRiskKeywords = [
    'delete', 'remove', 'trash', 'erase', 'destroy', 'wipe', 'drop',
    'terminate', 'kill', 'close', 'quit', 'exit', 'shutdown',
    'save', 'submit', 'send', 'authorize', 'pay', 'confirm', 'install',
    'overwrite', 'apply', 'execute', 'run', 'post', 'transfer', 'buy',
  ];

  if (highRiskKeywords.some((kw) => combined.includes(kw))) {
    return 'High';
  }

  if (intent.intendedStateChange === 'FileOperation') {
    return 'High';
  }

  if (intent.intendedStateChange === 'DataEntry') {
    return 'Medium';
  }

  if (intent.intendedStateChange === 'Navigate') {
    return 'Low';
  }

  return 'High';
}
