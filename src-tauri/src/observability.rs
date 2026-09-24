use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;
use chrono::Utc;
use serde::{Deserialize, Serialize};

const MAX_LOG_SIZE_BYTES: u64 = 2 * 1024 * 1024; // 2MB
const THIRTY_DAYS_SEC: i64 = 30 * 24 * 3600;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TelemetryPayload {
    pub anonymous_id: String,
    pub timestamp: String,
    pub app_version: String,
    pub os: String,
    pub arch: String,
    pub error_type: String,
    pub error_message: String,
    pub sanitized_stack: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_name: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct TelemetryIdentity {
    anonymous_id: String,
    created_at_epoch_sec: i64,
}

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

    pub fn id_path(&self) -> PathBuf {
        self.log_dir.join("telemetry_id.json")
    }

    pub fn outbound_log_path(&self) -> PathBuf {
        self.log_dir.join("telemetry_outbound.log")
    }

    fn ensure_dir(&self) -> std::io::Result<()> {
        if !self.log_dir.exists() {
            fs::create_dir_all(&self.log_dir)?;
        }
        Ok(())
    }

    /// Fetches the anonymous UUID or rotates it if older than 30 days
    pub fn get_or_rotate_anonymous_id(&self) -> String {
        self.get_or_rotate_anonymous_id_at(Utc::now().timestamp())
    }

    /// Testable helper for ID rotation with injected timestamp
    pub fn get_or_rotate_anonymous_id_at(&self, current_epoch_sec: i64) -> String {
        let id_file = self.id_path();

        if let Ok(content) = fs::read_to_string(&id_file) {
            if let Ok(ident) = serde_json::from_str::<TelemetryIdentity>(&content) {
                // Keep if within 30-day window and not created in the future
                if current_epoch_sec >= ident.created_at_epoch_sec
                    && (current_epoch_sec - ident.created_at_epoch_sec) < THIRTY_DAYS_SEC
                {
                    return ident.anonymous_id;
                }
            }
        }

        // Generate brand new anonymous UUIDv4 on first run or expiry
        let new_id = uuid::Uuid::new_v4().to_string();
        let identity = TelemetryIdentity {
            anonymous_id: new_id.clone(),
            created_at_epoch_sec: current_epoch_sec,
        };

        if let Ok(serialized) = serde_json::to_string_pretty(&identity) {
            let _ = self.ensure_dir();
            let _ = fs::write(&id_file, serialized);
        }

        new_id
    }

    /// Sanitizes model identifier: allows only alphanumeric, colon, dash, underscore, dot, and at most one org slash (e.g. org/model:tag)
    /// Strictly rejects paths, prompts, leading slashes, path traversal, keys, and file extensions.
    pub fn sanitize_model_name(name: Option<&str>) -> Option<String> {
        name.and_then(|raw| {
            let trimmed = raw.trim();
            if trimmed.is_empty() || trimmed.len() > 64 {
                return None;
            }
            // Must not start with / or \ or contain path traversal or user home directories
            if trimmed.starts_with('/')
                || trimmed.starts_with('\\')
                || trimmed.contains("..")
                || trimmed.contains("/Users/")
                || trimmed.contains("\\Users\\")
                || trimmed.contains("/home/")
            {
                return None;
            }
            // Standard models have at most one namespace slash (e.g. org/model)
            if trimmed.matches('/').count() > 1 || trimmed.contains('\\') {
                return None;
            }
            // Reject file extensions or key prefixes
            if trimmed.ends_with(".txt")
                || trimmed.ends_with(".rs")
                || trimmed.ends_with(".ts")
                || trimmed.ends_with(".json")
                || trimmed.starts_with("sk-")
            {
                return None;
            }
            if trimmed.chars().all(|c| {
                c.is_ascii_alphanumeric()
                    || c == ':'
                    || c == '-'
                    || c == '_'
                    || c == '.'
                    || c == '/'
            }) {
                Some(trimmed.to_string())
            } else {
                None
            }
        })
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
            let after_prefix = start_idx + 3;
            let end_idx = result[after_prefix..]
                .find(|c: char| !c.is_alphanumeric() && c != '-' && c != '_')
                .map(|rel| after_prefix + rel)
                .unwrap_or(result.len());

            if end_idx - start_idx >= 15 {
                result.replace_range(start_idx..end_idx, "<redacted_key>");
            } else {
                break;
            }
        }

        result
    }

    /// Records an error entry to the local log, and if opt_in is true, constructs
    /// and logs the strictly-typed, privacy-safe TelemetryPayload.
    pub fn record_error(
        &self,
        error_name: &str,
        message: &str,
        stack: Option<&str>,
        opt_in: bool,
        model_name: Option<&str>,
    ) -> Result<Option<TelemetryPayload>, String> {
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

        // 1. Always record sanitized message locally on disk
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

        // 2. If NOT opted-in, strictly return None and write zero outbound logs
        if !opt_in {
            return Ok(None);
        }

        // 3. Construct strictly-typed, approved TelemetryPayload
        let anonymous_id = self.get_or_rotate_anonymous_id();
        let payload = TelemetryPayload {
            anonymous_id,
            timestamp,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            error_type: error_name.to_string(),
            error_message: sanitized_msg,
            sanitized_stack,
            model_name: Self::sanitize_model_name(model_name),
        };

        // 4. Log to local outbound audit file for complete user transparency
        let outbound_file = self.outbound_log_path();
        if let Ok(json_repr) = serde_json::to_string_pretty(&payload) {
            let mut out_file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&outbound_file)
                .map_err(|e| format!("Failed to open outbound log: {}", e))?;
            let _ = writeln!(out_file, "{}\n----------------------------------------", json_repr);
        }

        Ok(Some(payload))
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

    /// Reads from the outbound telemetry log
    pub fn read_outbound_logs(&self) -> Result<String, String> {
        let file = self.outbound_log_path();
        if !file.exists() {
            return Ok("No outbound telemetry payloads logged.".to_string());
        }

        let mut f = fs::File::open(&file)
            .map_err(|e| format!("Failed to open outbound log file: {}", e))?;

        let mut content = String::new();
        f.read_to_string(&mut content)
            .map_err(|e| format!("Failed to read outbound log file: {}", e))?;

        Ok(content)
    }

    /// Clears both the local error log and the outbound telemetry log
    pub fn clear_logs(&self) -> Result<(), String> {
        let log_file = self.log_path();
        if log_file.exists() {
            let _ = fs::remove_file(&log_file);
        }
        let backup = self.backup_log_path();
        if backup.exists() {
            let _ = fs::remove_file(&backup);
        }
        let outbound = self.outbound_log_path();
        if outbound.exists() {
            let _ = fs::remove_file(&outbound);
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

        let res = logger.record_error(
            "SQLiteTestError",
            "Failed query at /Users/johndoe/db.sqlite",
            Some("stack line 1\nstack line 2"),
            false,
            None,
        ).unwrap();
        assert!(res.is_none());

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

        let log_file = logger.log_path();
        logger.ensure_dir().unwrap();
        {
            let mut f = fs::File::create(&log_file).unwrap();
            let chunk = vec![b'a'; 2 * 1024 * 1024 + 10];
            f.write_all(&chunk).unwrap();
        }

        logger.record_error("OverflowError", "New error", None, false, None).unwrap();

        assert!(logger.backup_log_path().exists());
        let new_content = logger.read_logs().unwrap();
        assert!(new_content.contains("OverflowError"));
        assert!(new_content.len() < 1000);

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_telemetry_schema_strictness() {
        let payload = TelemetryPayload {
            anonymous_id: "c1f7a08b-1111-2222-3333-444455556666".to_string(),
            timestamp: "2026-09-25T00:15:00Z".to_string(),
            app_version: "0.1.0".to_string(),
            os: "macos".to_string(),
            arch: "aarch64".to_string(),
            error_type: "OllamaConnectionError".to_string(),
            error_message: "Connection refused at 127.0.0.1:11434".to_string(),
            sanitized_stack: "at <redacted_path>/chunk.js:1:2".to_string(),
            model_name: Some("qwen2.5-coder:7b".to_string()),
        };

        let json_value = serde_json::to_value(&payload).unwrap();
        let map = json_value.as_object().unwrap();

        // Exact 9 approved fields, zero extra fields
        let expected_keys = [
            "anonymous_id",
            "app_version",
            "arch",
            "error_message",
            "error_type",
            "model_name",
            "os",
            "sanitized_stack",
            "timestamp",
        ];
        let mut actual_keys: Vec<&String> = map.keys().collect();
        actual_keys.sort();

        assert_eq!(actual_keys.len(), expected_keys.len());
        for (actual, expected) in actual_keys.iter().zip(expected_keys.iter()) {
            assert_eq!(*actual, expected);
        }
        assert_eq!(map.get("model_name").unwrap().as_str().unwrap(), "qwen2.5-coder:7b");
    }

    #[test]
    fn test_telemetry_30_day_id_rotation() {
        let test_dir = std::env::temp_dir().join(format!("aeio_id_rot_test_{}", uuid::Uuid::new_v4()));
        let logger = ErrorLogger::with_dir(test_dir.clone());

        let t0 = 1700000000;
        let id1 = logger.get_or_rotate_anonymous_id_at(t0);
        assert!(!id1.is_empty());

        // 10 days later: must remain identical
        let t1 = t0 + (10 * 24 * 3600);
        let id2 = logger.get_or_rotate_anonymous_id_at(t1);
        assert_eq!(id1, id2, "Anonymous ID must NOT rotate within 30 days");

        // 29 days later: must remain identical
        let t2 = t0 + (29 * 24 * 3600);
        let id3 = logger.get_or_rotate_anonymous_id_at(t2);
        assert_eq!(id1, id3, "Anonymous ID must NOT rotate before 30 full days");

        // 31 days later: MUST rotate to a new ID
        let t3 = t0 + (31 * 24 * 3600);
        let id4 = logger.get_or_rotate_anonymous_id_at(t3);
        assert_ne!(id1, id4, "Anonymous ID must rotate after 30 days");

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_telemetry_opt_in_strictly_gates_outbound() {
        let test_dir = std::env::temp_dir().join(format!("aeio_gate_test_{}", uuid::Uuid::new_v4()));
        let logger = ErrorLogger::with_dir(test_dir.clone());

        // When opt_in is false
        let res_off = logger.record_error(
            "LocalOnlyError",
            "Something failed locally",
            None,
            false,
            Some("qwen2.5-coder:7b"),
        ).unwrap();
        assert!(res_off.is_none());
        assert!(!logger.outbound_log_path().exists(), "Outbound log must not exist when opt_in is false");

        // When opt_in is true
        let res_on = logger.record_error(
            "OptInError",
            "Something failed for opted-in user",
            Some("stack trace line"),
            true,
            Some("qwen2.5-coder:7b"),
        ).unwrap();

        assert!(res_on.is_some());
        let payload = res_on.unwrap();
        assert_eq!(payload.error_type, "OptInError");
        assert_eq!(payload.model_name, Some("qwen2.5-coder:7b".to_string()));
        assert!(logger.outbound_log_path().exists(), "Outbound log must be written for opted-in errors");

        let outbound_content = logger.read_outbound_logs().unwrap();
        assert!(outbound_content.contains("OptInError"));
        assert!(outbound_content.contains("qwen2.5-coder:7b"));

        let _ = fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_telemetry_model_name_sanitization_blocks_prompts_and_paths() {
        // Valid model names
        assert_eq!(ErrorLogger::sanitize_model_name(Some("qwen2.5-coder:7b")), Some("qwen2.5-coder:7b".to_string()));
        assert_eq!(ErrorLogger::sanitize_model_name(Some("claude-3-5-sonnet-20241022")), Some("claude-3-5-sonnet-20241022".to_string()));
        assert_eq!(ErrorLogger::sanitize_model_name(Some("meta-llama/Llama-3-8b")), Some("meta-llama/Llama-3-8b".to_string()));

        // Invalid / prompt injection / path attempts into model_name
        assert_eq!(ErrorLogger::sanitize_model_name(Some("qwen with prompt text")), None);
        assert_eq!(ErrorLogger::sanitize_model_name(Some("/Users/apple/secret.txt")), None);
        assert_eq!(ErrorLogger::sanitize_model_name(Some("sk-ant-api03-abcdef")), None);
        assert_eq!(ErrorLogger::sanitize_model_name(Some("")), None);
        assert_eq!(ErrorLogger::sanitize_model_name(None), None);
    }

    #[test]
    fn test_manual_check_outbound_payload_inspection() {
        let test_dir = std::env::temp_dir().join(format!("aeio_manual_check_{}", uuid::Uuid::new_v4()));
        let logger = ErrorLogger::with_dir(test_dir.clone());

        // 1. Opt-in = false: verify strictly None returned and zero outbound log written
        let res_off = logger.record_error(
            "LocalError",
            "Error accessing /Users/apple/Desktop/file.txt with key sk-ant-api03-000000000000",
            Some("stack trace line 1"),
            false,
            Some("qwen2.5-coder:7b"),
        ).unwrap();
        assert!(res_off.is_none());
        assert!(!logger.outbound_log_path().exists());

        // 2. Opt-in = true: trigger real error with sensitive paths, prompts, and API key
        let res_on = logger.record_error(
            "ModelInferenceTimeout",
            "Failed inference reading context from /Users/apple/Desktop/PROJECTS/aeio/memories.db using key sk-proj-1234567890abcdef1234567890",
            Some("Error: Request timed out after 30000ms\n    at OllamaProvider.infer (/Users/apple/Desktop/PROJECTS/aeio/src/lib/providers/ollama.ts:42:13)"),
            true,
            Some("qwen2.5-coder:7b"),
        ).unwrap();

        assert!(res_on.is_some());
        let payload = res_on.unwrap();

        // Print formatted outbound payload to stdout for inspection
        let json_string = serde_json::to_string_pretty(&payload).unwrap();
        println!("\n=== OUTBOUND TELEMETRY PAYLOAD INSPECTION ===\n{}\n=============================================\n", json_string);

        // Strict schema validations
        assert_eq!(payload.error_type, "ModelInferenceTimeout");
        assert_eq!(payload.model_name, Some("qwen2.5-coder:7b".to_string()));
        assert!(!payload.error_message.contains("/Users/apple"));
        assert!(!payload.error_message.contains("sk-proj-"));
        assert!(payload.error_message.contains("<redacted_path>"));
        assert!(payload.error_message.contains("<redacted_key>"));
        assert!(!payload.sanitized_stack.contains("/Users/apple"));
        assert!(payload.sanitized_stack.contains("<redacted_path>"));

        // Verify JSON keys count
        let parsed: serde_json::Value = serde_json::from_str(&json_string).unwrap();
        let map = parsed.as_object().unwrap();
        assert_eq!(map.len(), 9);

        let _ = fs::remove_dir_all(&test_dir);
    }
}
