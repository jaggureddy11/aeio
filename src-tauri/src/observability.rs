use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;
use chrono::Utc;

const MAX_LOG_SIZE_BYTES: u64 = 2 * 1024 * 1024; // 2MB

#[derive(Default)]
pub struct ErrorLogger {
    log_dir: PathBuf,
}

impl ErrorLogger {
    pub fn new() -> Self {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string());
        let log_dir = PathBuf::from(home).join(".aeio").join("logs");
        Self { log_dir }
    }

    #[cfg(test)]
    pub fn with_dir(dir: PathBuf) -> Self {
        Self { log_dir: dir }
    }

    pub fn log_path(&self) -> PathBuf {
        self.log_dir.join("errors.log")
    }

    pub fn backup_log_path(&self) -> PathBuf {
        self.log_dir.join("errors.log.1")
    }

    fn ensure_dir(&self) -> std::io::Result<()> {
        if !self.log_dir.exists() {
            fs::create_dir_all(&self.log_dir)?;
        }
        Ok(())
    }

    /// Sanitizes sensitive user paths, home directories, usernames, and potential keys
    pub fn sanitize(input: &str) -> String {
        let mut result = input.to_string();

        // 1. Redact active user home directory if present
        if let Ok(home) = std::env::var("HOME") {
            if !home.is_empty() && home != "/" {
                result = result.replace(&home, "<redacted_path>");
            }
        }
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            if !userprofile.is_empty() {
                result = result.replace(&userprofile, "<redacted_path>");
            }
        }

        // 2. Redact common home path prefixes: /Users/<name>/ and /home/<name>/
        for prefix in &["/Users/", "/home/"] {
            while let Some(start_idx) = result.find(prefix) {
                let after_prefix = start_idx + prefix.len();
                let end_idx = result[after_prefix..]
                    .find(|c| c == '/' || c == ' ' || c == ':' || c == '"' || c == '\'' || c == '\n')
                    .map(|rel| after_prefix + rel)
                    .unwrap_or(result.len());

                if end_idx > after_prefix {
                    result.replace_range(start_idx..end_idx, "<redacted_path>");
                } else {
                    break;
                }
            }
        }

        // 3. Redact Windows user prefixes: C:\Users\<name>\
        let win_prefix = "\\Users\\";
        while let Some(start_idx) = result.find(win_prefix) {
            let drive_start = if start_idx >= 2 && result.as_bytes()[start_idx - 1] == b':' {
                start_idx - 2
            } else {
                start_idx
            };

            let after_prefix = start_idx + win_prefix.len();
            let end_idx = result[after_prefix..]
                .find(|c| c == '\\' || c == ' ' || c == ':' || c == '"' || c == '\'' || c == '\n')
                .map(|rel| after_prefix + rel)
                .unwrap_or(result.len());

            if end_idx > after_prefix {
                result.replace_range(drive_start..end_idx, "<redacted_path>");
            } else {
                break;
            }
        }

        // 4. Redact Anthropic keys: sk-ant-...
        while let Some(start_idx) = result.find("sk-ant-") {
            let after_prefix = start_idx + 7;
            let end_idx = result[after_prefix..]
                .find(|c: char| !c.is_alphanumeric() && c != '-' && c != '_')
                .map(|rel| after_prefix + rel)
                .unwrap_or(result.len());

            result.replace_range(start_idx..end_idx, "<redacted_key>");
        }

        // 5. Redact OpenAI keys: sk-...
        while let Some(start_idx) = result.find("sk-") {
            // make sure it wasn't already redacted or something else
            let after_prefix = start_idx + 3;
            let end_idx = result[after_prefix..]
                .find(|c: char| !c.is_alphanumeric() && c != '-' && c != '_')
                .map(|rel| after_prefix + rel)
                .unwrap_or(result.len());

            if end_idx - start_idx >= 15 {
                result.replace_range(start_idx..end_idx, "<redacted_key>");
            } else {
                // not a long enough key token, skip to prevent infinite loop
                break;
            }
        }

        result
    }

    /// Records an error entry to the local log, with optional opt-in flag.
    pub fn record_error(
        &self,
        error_name: &str,
        message: &str,
        stack: Option<&str>,
        opt_in: bool,
    ) -> Result<(), String> {
        self.ensure_dir().map_err(|e| format!("Failed to create log directory: {}", e))?;

        let log_file = self.log_path();

        // Check if rotation needed
        if let Ok(metadata) = fs::metadata(&log_file) {
            if metadata.len() >= MAX_LOG_SIZE_BYTES {
                let backup = self.backup_log_path();
                let _ = fs::rename(&log_file, &backup);
            }
        }

        let sanitized_msg = Self::sanitize(message);
        let sanitized_stack = stack.map(Self::sanitize).unwrap_or_else(|| "N/A".to_string());
        let timestamp = Utc::now().to_rfc3339();

        let log_entry = format!(
            "[{timestamp}] [TYPE: {error_name}] [OPT_IN: {opt_in}]\nMessage: {sanitized_msg}\nStack:\n{sanitized_stack}\n----------------------------------------\n"
        );

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_file)
            .map_err(|e| format!("Failed to open error log: {}", e))?;

        file.write_all(log_entry.as_bytes())
            .map_err(|e| format!("Failed to write to error log: {}", e))?;

        Ok(())
    }

    /// Reads from the local error log
    pub fn read_logs(&self) -> Result<String, String> {
        let log_file = self.log_path();
        if !log_file.exists() {
            return Ok("No local error logs found.".to_string());
        }

        let mut file = fs::File::open(&log_file)
            .map_err(|e| format!("Failed to open log file: {}", e))?;

        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| format!("Failed to read log file: {}", e))?;

        Ok(content)
    }

    /// Clears the local error log
    pub fn clear_logs(&self) -> Result<(), String> {
        let log_file = self.log_path();
        if log_file.exists() {
            fs::remove_file(&log_file)
                .map_err(|e| format!("Failed to delete log file: {}", e))?;
        }
        let backup = self.backup_log_path();
        if backup.exists() {
            let _ = fs::remove_file(&backup);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitization_masks_paths_and_keys() {
        let raw = "Error at /Users/apple/Desktop/PROJECTS/aeio/src/main.rs with sk-ant-api03-abcdef123456789 and sk-proj-1234567890abcdef1234567890";
        let sanitized = ErrorLogger::sanitize(raw);
        assert!(!sanitized.contains("/Users/apple"));
        assert!(!sanitized.contains("sk-ant-"));
        assert!(!sanitized.contains("sk-proj-"));
        assert!(sanitized.contains("<redacted_path>"));
        assert!(sanitized.contains("<redacted_key>"));
    }

    #[test]
    fn test_log_writing_and_clearing() {
        let test_dir = std::env::temp_dir().join(format!("aeio_obs_test_{}", uuid::Uuid::new_v4()));
        let logger = ErrorLogger::with_dir(test_dir.clone());

        logger.record_error(
            "SQLiteTestError",
            "Failed query at /Users/johndoe/db.sqlite",
            Some("stack line 1\nstack line 2"),
            false,
        ).unwrap();

        let logs = logger.read_logs().unwrap();
        assert!(logs.contains("[TYPE: SQLiteTestError]"));
        assert!(logs.contains("[OPT_IN: false]"));
        assert!(!logs.contains("/Users/johndoe"));
        assert!(logs.contains("<redacted_path>/db.sqlite"));

        logger.clear_logs().unwrap();
        let cleared = logger.read_logs().unwrap();
        assert_eq!(cleared, "No local error logs found.");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_log_rotation_on_max_size() {
        let test_dir = std::env::temp_dir().join(format!("aeio_obs_test_{}", uuid::Uuid::new_v4()));
        let logger = ErrorLogger::with_dir(test_dir.clone());

        // Create a file just over 2MB
        let log_file = logger.log_path();
        logger.ensure_dir().unwrap();
        {
            let mut f = fs::File::create(&log_file).unwrap();
            let chunk = vec![b'a'; 2 * 1024 * 1024 + 10];
            f.write_all(&chunk).unwrap();
        }

        // Recording a new error should rotate
        logger.record_error("OverflowError", "New error", None, true).unwrap();

        assert!(logger.backup_log_path().exists());
        let new_content = logger.read_logs().unwrap();
        assert!(new_content.contains("OverflowError"));
        assert!(new_content.len() < 1000);

        let _ = fs::remove_dir_all(&test_dir);
    }
}
