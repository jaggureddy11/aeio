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
