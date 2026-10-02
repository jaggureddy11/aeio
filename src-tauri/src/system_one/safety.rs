use super::types::CommandSafetyVerdict;
use crate::tools::shell::is_destructive_command;

/// Evaluates a shell command with calibrated System One risk scoring.
pub fn judge_command_risk(command: &str) -> CommandSafetyVerdict {
    let raw = command.trim();
    let lower = raw.to_lowercase();

    // 1. Critical Hard Destructive Patterns
    let critical_patterns = [
        "rm -rf /", "rm -rf /*", "mkfs", "dd if=", ":(){ :|:& };:",
        "> /dev/sda", "drop database", "drop schema", "format c:",
        "chmod -r 777 /", "chown -r root /"
    ];

    for p in critical_patterns {
        if lower.contains(p) {
            return CommandSafetyVerdict {
                command: raw.to_string(),
                is_destructive: true,
                destructive_probability: 0.99,
                requires_approval: true,
                risk_tier: "critical".to_string(),
                rationale: format!("Command contains catastrophic pattern '{}' targeting root filesystem or device block", p),
            };
        }
    }

    // 2. High Risk / Standard Destructive Patterns
    let is_shell_destructive = is_destructive_command(raw);
    let elevated_destructive = [
        "rm -rf", "rm -r", "del /s", "drop table", "truncate table",
        "git reset --hard", "git clean -fd", "killall -9", "shutdown", "reboot"
    ];

    let contains_elevated = elevated_destructive.iter().any(|&p| lower.contains(p));

    if is_shell_destructive || contains_elevated {
        return CommandSafetyVerdict {
            command: raw.to_string(),
            is_destructive: true,
            destructive_probability: 0.90,
            requires_approval: true,
            risk_tier: "critical".to_string(),
            rationale: "Command performs irreversible deletion or process termination".to_string(),
        };
    }

    // 3. Medium Risk Modifications (File changes, git operations, package install)
    let medium_risk_keywords = [
        "mv ", "cp ", "chmod ", "chown ", "npm install", "cargo install",
        "pip install", "brew install", "git branch -d", "git push --force"
    ];

    for kw in medium_risk_keywords {
        if lower.contains(kw) {
            return CommandSafetyVerdict {
                command: raw.to_string(),
                is_destructive: false,
                destructive_probability: 0.35,
                requires_approval: lower.contains("--force"),
                risk_tier: "medium".to_string(),
                rationale: format!("Command mutates state or installs dependencies ('{}')", kw.trim()),
            };
        }
    }

    // 4. Safe Read-Only Commands
    CommandSafetyVerdict {
        command: raw.to_string(),
        is_destructive: false,
        destructive_probability: 0.05,
        requires_approval: false,
        risk_tier: "low".to_string(),
        rationale: "Command is non-destructive read-only inspection or navigation".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_critical_risk_commands() {
        let v = judge_command_risk("rm -rf /");
        assert!(v.is_destructive);
        assert_eq!(v.risk_tier, "critical");
        assert!(v.requires_approval);
        assert!(v.destructive_probability > 0.95);
    }

    #[test]
    fn test_read_only_commands() {
        let v = judge_command_risk("ls -la /Users/apple/Desktop");
        assert!(!v.is_destructive);
        assert_eq!(v.risk_tier, "low");
        assert!(!v.requires_approval);
        assert!(v.destructive_probability < 0.10);
    }

    #[test]
    fn test_medium_risk_commands() {
        let v = judge_command_risk("npm install lodash");
        assert!(!v.is_destructive);
        assert_eq!(v.risk_tier, "medium");
        assert_eq!(v.requires_approval, false);
    }
}
