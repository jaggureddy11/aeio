use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub is_destructive: bool,
}

pub fn is_destructive_command(command: &str) -> bool {
    let lower = command.trim().to_lowercase();
    let destructive_patterns = [
        "rm ", "rm\t", "rmdir", "del ", "del\t", "format ", "dd ",
        "mkfs", "chmod -r", "chown -r", "> /dev/", "wipefs", "shred ",
        ":(){ :|:& };:", "drop database", "drop table", "truncate table"
    ];

    destructive_patterns.iter().any(|&p| lower.contains(p))
}

pub fn run_shell_command(command: &str, cwd: Option<&str>) -> Result<ShellOutput, String> {
    let is_destructive = is_destructive_command(command);

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", command]);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.args(["-c", command]);
        c
    };

    if let Some(dir) = cwd {
        if !dir.trim().is_empty() {
            cmd.current_dir(dir);
        }
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code().unwrap_or(-1);

    Ok(ShellOutput {
        stdout,
        stderr,
        exit_code,
        is_destructive,
    })
}

pub fn open_target(target: &str) -> Result<String, String> {
    let target = target.trim();
    if target.is_empty() {
        return Err("Target path or URL cannot be empty".to_string());
    }

    #[cfg(target_os = "macos")]
    let mut cmd = Command::new("open");

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", target]);
        c
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut cmd = Command::new("xdg-open");

    #[cfg(not(target_os = "windows"))]
    cmd.arg(target);

    cmd.spawn()
        .map_err(|e| format!("Failed to open target '{}': {}", target, e))?;

    Ok(format!("Opened {}", target))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_destructive_command_detection() {
        assert!(is_destructive_command("rm -rf /tmp/test"));
        assert!(is_destructive_command("del /f important.txt"));
        assert!(is_destructive_command("format C:"));
        assert!(is_destructive_command("dd if=/dev/zero of=/dev/sda"));
        assert!(is_destructive_command("DROP TABLE users;"));
        assert!(is_destructive_command("TRUNCATE TABLE logs;"));

        // Safe non-destructive commands
        assert!(!is_destructive_command("git status"));
        assert!(!is_destructive_command("ls -la"));
        assert!(!is_destructive_command("echo 'hello world'"));
        assert!(!is_destructive_command("pwd"));
        assert!(!is_destructive_command("cat package.json"));
    }

    #[test]
    fn test_shell_command_execution() {
        let res = run_shell_command("echo 'aeio_test_ok'", None);
        assert!(res.is_ok());
        let output = res.unwrap();
        assert_eq!(output.exit_code, 0);
        assert!(output.stdout.contains("aeio_test_ok"));
        assert!(!output.is_destructive);
    }
}
