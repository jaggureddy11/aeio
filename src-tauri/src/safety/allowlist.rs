use std::sync::{OnceLock, RwLock};
use serde::{Deserialize, Serialize};

static CONFIG_CELL: OnceLock<RwLock<ComputerControlConfig>> = OnceLock::new();

fn get_cell() -> &'static RwLock<ComputerControlConfig> {
    CONFIG_CELL.get_or_init(|| RwLock::new(ComputerControlConfig::default()))
}

/// Hard-coded absolute blocklist of system applications and sensitive credential tools
/// that can NEVER be operated by Computer Control under any circumstance.
pub const HARD_BLOCKLIST_SYSTEM_AND_AUTH: &[&str] = &[
    // Apple System Settings & Preferences
    "com.apple.systempreferences",
    "com.apple.systemsettings",
    // Keychain & Credential Managers
    "com.apple.keychainaccess",
    "com.agilebits.onepassword",
    "com.agilebits.onepassword7",
    "com.1password",
    "com.bitwarden.desktop",
    "org.keepassxc.keepassxc",
    "com.dashlane.dashlane",
    "com.lastpass.lastpass",
    "com.enpass.enpass",
];

/// Hard-coded blocklist of terminal emulators, shells, and code editors with integrated
/// terminals. These can execute arbitrary commands and would bypass shell security controls.
pub const HARD_BLOCKLIST_TERMINALS_AND_EDITORS: &[&str] = &[
    // macOS Terminal Emulators
    "com.apple.terminal",
    "com.googlecode.iterm2",
    "iterm2",
    "iterm",
    "terminal",
    "terminal.app",
    "alacritty",
    "org.alacritty",
    "kitty",
    "net.kovidgoyal.kitty",
    "wezterm",
    "com.github.wez.wezterm",
    "ghostty",
    "com.mitchellh.ghostty",

    // Windows Terminals & Shells
    "windowsterminal",
    "microsoft.windowsterminal",
    "microsoft.windowsterminalpreview",
    "wt.exe",
    "wt",
    "powershell.exe",
    "powershell",
    "pwsh.exe",
    "pwsh",
    "cmd.exe",
    "cmd",

    // Linux Terminals
    "gnome-terminal",
    "org.gnome.terminal",
    "konsole",
    "org.kde.konsole",
    "xterm",
    "terminator",
    "tilix",
    "com.gexperts.tilix",
    "rxvt",
    "urxvt",
    "foot",

    // Code Editors / IDEs with Integrated Terminal Panels
    "com.microsoft.vscode",
    "com.microsoft.vscodeinsiders",
    "code",
    "code.exe",
    "vscodium",
    "com.vscodium",
    "com.visualstudio.code",
    "com.visualstudio.code.oss",
    "com.todesktop.230313mzl4w4u92", // Cursor
    "cursor",
    "cursor.exe",
    "com.cursor",
    "dev.zed.zed",
    "dev.zed.zed-preview",
    "zed",
    "zed.exe",
    // JetBrains IDEs
    "com.jetbrains.intellij",
    "com.jetbrains.intellij.ce",
    "com.jetbrains.pycharm",
    "com.jetbrains.pycharm.ce",
    "com.jetbrains.webstorm",
    "com.jetbrains.rider",
    "com.jetbrains.clion",
    "com.jetbrains.goland",
    "com.jetbrains.rubymine",
    "com.jetbrains.datagrip",
    "com.jetbrains.phpstorm",
    "com.jetbrains.rustrover",
    "com.jetbrains.fleet",
    "idea",
    "pycharm",
    "webstorm",
    "rider",
    "clion",
    "goland",
    "rubymine",
    "datagrip",
    "phpstorm",
    "rustrover",
    "fleet",
];

/// Combined hard blocklist for backwards compatibility and direct enumeration.
pub const HARD_BLOCKLIST: &[&str] = &[
    "com.apple.systempreferences",
    "com.apple.systemsettings",
    "com.apple.keychainaccess",
    "com.agilebits.onepassword",
    "com.agilebits.onepassword7",
    "com.1password",
    "com.bitwarden.desktop",
    "org.keepassxc.keepassxc",
    "com.dashlane.dashlane",
    "com.lastpass.lastpass",
    "com.enpass.enpass",
    "com.apple.terminal",
    "com.googlecode.iterm2",
    "com.microsoft.vscode",
    "dev.zed.zed",
];

/// Known web browser bundle identifiers requiring elevated user confirmation warnings.
pub const KNOWN_BROWSERS: &[&str] = &[
    "com.google.chrome",
    "com.google.chrome.canary",
    "com.apple.safari",
    "com.apple.safari.technologypreview",
    "org.mozilla.firefox",
    "org.mozilla.firefoxdeveloperedition",
    "com.brave.browser",
    "com.microsoft.edgemac",
    "company.thebrowser.browser", // Arc
    "com.operasoftware.opera",
    "com.vivaldi.vivaldi",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum BundleValidationResult {
    /// Safe to add directly.
    Allowed,
    /// Browser detected: requires explicit user confirmation warning before addition.
    RequiresBrowserWarning { warning: String },
    /// Blocked: rejected at state layer.
    Blocked { reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerControlConfig {
    /// Master safety switch. Defaults to false (OFF).
    pub enabled: bool,
    /// Set of user-approved application bundle identifiers.
    pub allowlist: Vec<String>,
}

impl Default for ComputerControlConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            allowlist: Vec::new(),
        }
    }
}

/// Checks whether a bundle identifier matches terminal emulators, shells, or editors with integrated terminals.
pub fn is_terminal_or_editor(bundle_id: &str) -> bool {
    let lower = bundle_id.trim().to_lowercase();
    if lower.is_empty() {
        return false;
    }

    if HARD_BLOCKLIST_TERMINALS_AND_EDITORS.iter().any(|&b| b == lower) {
        return true;
    }

    let exact_names = [
        "terminal", "terminal.app", "iterm", "iterm2", "wt", "wt.exe",
        "powershell", "powershell.exe", "pwsh", "pwsh.exe", "cmd", "cmd.exe",
        "bash", "zsh", "sh", "fish", "nu",
        "code", "code.exe", "vscode", "vs code", "cursor", "cursor.exe",
        "zed", "zed.exe", "idea", "pycharm", "webstorm", "rider", "clion", "goland",
        "rubymine", "datagrip", "phpstorm", "rustrover", "fleet", "sublime", "sublime text",
    ];
    if exact_names.iter().any(|&name| lower == name) {
        return true;
    }

    let terminal_editor_tokens = [
        "terminal",
        "iterm",
        "powershell",
        "pwsh",
        "cmd.exe",
        "konsole",
        "xterm",
        "alacritty",
        "wezterm",
        "kitty",
        "ghostty",
        "vscode",
        "jetbrains",
        "cursor",
        "dev.zed",
        "vscodium",
    ];
    terminal_editor_tokens.iter().any(|&tok| lower.contains(tok))
}

/// Checks whether a bundle identifier matches system settings or credential managers.
pub fn is_system_or_credential(bundle_id: &str) -> bool {
    let lower = bundle_id.trim().to_lowercase();
    if lower.is_empty() {
        return false;
    }

    if HARD_BLOCKLIST_SYSTEM_AND_AUTH.iter().any(|&b| b == lower) {
        return true;
    }

    let critical_tokens = [
        "keychain", "password", "systempreferences", "systemsettings",
        "1password", "bitwarden", "keepass", "dashlane", "lastpass", "enpass",
    ];
    critical_tokens.iter().any(|&tok| lower.contains(tok))
}

/// Checks whether a bundle identifier matches the hard-coded absolute blocklist.
pub fn is_hard_blocked(bundle_id: &str) -> bool {
    let lower = bundle_id.trim().to_lowercase();
    if lower.is_empty() {
        return true;
    }

    is_system_or_credential(&lower) || is_terminal_or_editor(&lower)
}

/// Checks whether a bundle identifier belongs to a web browser.
pub fn is_browser(bundle_id: &str) -> bool {
    let lower = bundle_id.trim().to_lowercase();
    if lower.is_empty() {
        return false;
    }

    if KNOWN_BROWSERS.iter().any(|&b| b == lower) {
        return true;
    }

    // Heuristic pattern match for third-party browsers
    let browser_tokens = ["browser", "chrome", "safari", "firefox", "brave", "edge"];
    browser_tokens.iter().any(|&tok| lower.contains(tok))
}

/// Validates an app bundle identifier before adding to the allowlist.
/// Rejection happens at this logic layer.
pub fn validate_bundle_for_allowlist(bundle_id: &str) -> Result<BundleValidationResult, String> {
    let cleaned = bundle_id.trim().to_lowercase();
    if cleaned.is_empty() {
        return Err("App bundle identifier cannot be empty".to_string());
    }

    if is_terminal_or_editor(&cleaned) {
        return Ok(BundleValidationResult::Blocked {
            reason: format!(
                "Absolute blocklist rejection: '{}' is a terminal or code editor. Terminal and code-editor applications can execute arbitrary commands and cannot be automated.",
                cleaned
            ),
        });
    }

    if is_system_or_credential(&cleaned) {
        return Ok(BundleValidationResult::Blocked {
            reason: format!(
                "Absolute blocklist rejection: '{}' is a system preference or credential manager and cannot be automated.",
                cleaned
            ),
        });
    }

    if is_browser(&cleaned) {
        return Ok(BundleValidationResult::RequiresBrowserWarning {
            warning: format!(
                "Adding web browser '{}' allows the agent to interact with arbitrary web pages and active authenticated sessions (such as banking or email).",
                cleaned
            ),
        });
    }

    Ok(BundleValidationResult::Allowed)
}

/// Gets the current computer control configuration.
pub fn get_config() -> ComputerControlConfig {
    get_cell().read().unwrap().clone()
}

/// Sets the master toggle for computer control.
pub fn set_master_toggle(enabled: bool) {
    let mut config = get_cell().write().unwrap();
    config.enabled = enabled;
}

/// Adds an app bundle identifier to the active allowlist.
/// Fails if the bundle ID is hard-blocked.
pub fn add_bundle_to_allowlist(bundle_id: &str) -> Result<BundleValidationResult, String> {
    let validation = validate_bundle_for_allowlist(bundle_id)?;

    match &validation {
        BundleValidationResult::Blocked { reason } => {
            return Err(reason.clone());
        }
        BundleValidationResult::Allowed | BundleValidationResult::RequiresBrowserWarning { .. } => {
            let mut config = get_cell().write().unwrap();
            let cleaned = bundle_id.trim().to_lowercase();
            if !config.allowlist.contains(&cleaned) {
                config.allowlist.push(cleaned);
            }
        }
    }

    Ok(validation)
}

/// Removes an app bundle identifier from the active allowlist.
pub fn remove_bundle_from_allowlist(bundle_id: &str) {
    let cleaned = bundle_id.trim().to_lowercase();
    let mut config = get_cell().write().unwrap();
    config.allowlist.retain(|b| b != &cleaned);
}

/// Resets the configuration back to default (off, empty allowlist).
pub fn reset_config_for_tests() {
    let mut config = get_cell().write().unwrap();
    config.enabled = false;
    config.allowlist.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hard_blocklist_rejection() {
        // System Settings
        assert!(is_hard_blocked("com.apple.systempreferences"));
        assert!(is_hard_blocked("com.apple.SystemSettings"));
        assert!(is_hard_blocked("org.apple.my_keychain_app"));

        // Password Managers
        assert!(is_hard_blocked("com.agilebits.onepassword"));
        assert!(is_hard_blocked("com.bitwarden.desktop"));
        assert!(is_hard_blocked("org.keepassxc.keepassxc"));

        // Validation rejects hard-blocked apps with an error
        let res = validate_bundle_for_allowlist("com.agilebits.onepassword").unwrap();
        match res {
            BundleValidationResult::Blocked { reason } => {
                assert!(reason.contains("Absolute blocklist rejection"));
            }
            _ => panic!("Expected hard blocklist rejection"),
        }

        // Attempting to add returns Err
        let add_res = add_bundle_to_allowlist("com.apple.keychainaccess");
        assert!(add_res.is_err());
    }

    #[test]
    fn test_terminal_and_editor_blocklist_rejection() {
        // macOS Terminals
        assert!(is_hard_blocked("com.apple.Terminal"));
        assert!(is_hard_blocked("Terminal.app"));
        assert!(is_hard_blocked("com.googlecode.iterm2"));
        assert!(is_hard_blocked("iTerm2"));
        assert!(is_hard_blocked("alacritty"));
        assert!(is_hard_blocked("kitty"));
        assert!(is_hard_blocked("ghostty"));

        // Windows Terminals & Shells
        assert!(is_hard_blocked("powershell.exe"));
        assert!(is_hard_blocked("powershell"));
        assert!(is_hard_blocked("pwsh.exe"));
        assert!(is_hard_blocked("cmd.exe"));
        assert!(is_hard_blocked("cmd"));
        assert!(is_hard_blocked("wt.exe"));
        assert!(is_hard_blocked("windowsterminal"));

        // Linux Terminals
        assert!(is_hard_blocked("gnome-terminal"));
        assert!(is_hard_blocked("konsole"));
        assert!(is_hard_blocked("xterm"));

        // Code Editors / IDEs with integrated terminals
        assert!(is_hard_blocked("com.microsoft.VSCode"));
        assert!(is_hard_blocked("vscode"));
        assert!(is_hard_blocked("Cursor"));
        assert!(is_hard_blocked("dev.zed.Zed"));
        assert!(is_hard_blocked("com.jetbrains.intellij"));
        assert!(is_hard_blocked("pycharm"));

        // Validation rejects Terminal.app with specific rationale distinct from generic blocklist message
        let res_term = validate_bundle_for_allowlist("Terminal.app").unwrap();
        match res_term {
            BundleValidationResult::Blocked { reason } => {
                assert!(reason.to_lowercase().contains("terminal and code-editor applications can execute arbitrary commands and cannot be automated"));
            }
            _ => panic!("Expected terminal rejection"),
        }

        // Validation rejects VS Code with specific rationale distinct from generic blocklist message
        let res_vscode = validate_bundle_for_allowlist("com.microsoft.VSCode").unwrap();
        match res_vscode {
            BundleValidationResult::Blocked { reason } => {
                assert!(reason.to_lowercase().contains("terminal and code-editor applications can execute arbitrary commands and cannot be automated"));
            }
            _ => panic!("Expected VS Code rejection"),
        }

        // Attempting to add returns Err
        assert!(add_bundle_to_allowlist("Terminal.app").is_err());
        assert!(add_bundle_to_allowlist("com.microsoft.VSCode").is_err());
    }

    #[test]
    fn test_browser_warning_detection() {
        assert!(is_browser("com.google.chrome"));
        assert!(is_browser("com.apple.safari"));
        assert!(is_browser("org.mozilla.firefox"));
        assert!(is_browser("company.thebrowser.browser")); // Arc

        let res = validate_bundle_for_allowlist("com.google.chrome").unwrap();
        match res {
            BundleValidationResult::RequiresBrowserWarning { warning } => {
                assert!(warning.contains("arbitrary web pages"));
            }
            _ => panic!("Expected browser warning"),
        }
    }

    #[test]
    fn test_safe_app_allowed() {
        let res = validate_bundle_for_allowlist("com.apple.calculator").unwrap();
        assert_eq!(res, BundleValidationResult::Allowed);

        let res2 = validate_bundle_for_allowlist("com.apple.TextEdit").unwrap();
        assert_eq!(res2, BundleValidationResult::Allowed);
    }

    #[test]
    fn test_allowlist_management() {
        let _guard = crate::safety::SAFETY_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_config_for_tests();

        assert_eq!(get_config().enabled, false);
        assert!(get_config().allowlist.is_empty());

        let _ = add_bundle_to_allowlist("com.apple.calculator").unwrap();
        assert_eq!(get_config().allowlist, vec!["com.apple.calculator".to_string()]);

        remove_bundle_from_allowlist("com.apple.calculator");
        assert!(get_config().allowlist.is_empty());
    }
}
