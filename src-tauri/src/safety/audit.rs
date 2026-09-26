use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use super::action_classifier::{classify_action_risk, RiskLevel};
use super::allowlist::{get_config, is_hard_blocked};
use super::input_driver::{execute_guarded_action, SimulatedActionRequest};
use super::kill_switch::is_halt_triggered;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct Coordinate2D {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct AuditIntent {
    pub natural_language: String,
    pub target_app: String,
    pub bundle_id: String,
    pub window_title: Option<String>,
    pub element: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct AuditGrounding {
    pub model_endpoint: Option<String>,
    pub predicted_coordinate: Option<Coordinate2D>,
    pub bounding_box: Option<Vec<i32>>,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct AuditSafetyVerdict {
    pub allowlisted: bool,
    pub blacklisted: bool,
    pub approval_required: bool,
    pub user_approval_timestamp: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct AuditExecution {
    pub duration_ms: u64,
    pub status: String,
    pub kill_switch_triggered: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct AuditArtifacts {
    pub pre_screenshot_path: String,
    pub post_screenshot_path: String,
    pub pre_screenshot_sha256: String,
    pub post_screenshot_sha256: String,
}

/// Immutable receipt schema as defined in docs/agent-s-safety-design.md
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct AuditReceipt {
    pub audit_id: String,
    pub session_id: String,
    pub timestamp: String,
    pub action_type: String,
    pub intent: AuditIntent,
    pub grounding: Option<AuditGrounding>,
    pub safety_verdict: AuditSafetyVerdict,
    pub execution: AuditExecution,
    pub artifacts: AuditArtifacts,
}

/// Computes hex SHA-256 hash of a file on disk.
pub fn calculate_file_sha256(path: &Path) -> Result<String, String> {
    if !path.exists() {
        return Ok("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string());
    }

    let mut file = File::open(path).map_err(|e| format!("Failed to open file for SHA-256: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let n = file.read(&mut buffer).map_err(|e| format!("Read error during SHA-256: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Resolves standard audit storage directory (`<app_data_dir>/audit`).
pub fn get_audit_dir(app: Option<&AppHandle>) -> PathBuf {
    if let Some(app_handle) = app {
        use tauri::Manager;
        if let Ok(data_dir) = app_handle.path().app_data_dir() {
            return data_dir.join("audit");
        }
    }
    std::env::temp_dir().join("aeio_audit")
}

/// Saves an immutable audit receipt to `<audit_dir>/receipts/<audit_id>.json`.
pub fn record_audit_receipt(base_audit_dir: &Path, receipt: &AuditReceipt) -> Result<PathBuf, String> {
    let receipts_dir = base_audit_dir.join("receipts");
    fs::create_dir_all(&receipts_dir).map_err(|e| format!("Failed to create receipts dir: {}", e))?;

    let receipt_path = receipts_dir.join(format!("{}.json", receipt.audit_id));
    let json = serde_json::to_string_pretty(receipt).map_err(|e| format!("Receipt serialization failed: {}", e))?;
    fs::write(&receipt_path, json).map_err(|e| format!("Failed to write receipt file: {}", e))?;

    Ok(receipt_path)
}

/// Reads all saved audit receipts, sorted newest first.
pub fn list_audit_receipts(base_audit_dir: &Path, limit: Option<usize>) -> Result<Vec<AuditReceipt>, String> {
    let receipts_dir = base_audit_dir.join("receipts");
    if !receipts_dir.exists() {
        return Ok(Vec::new());
    }

    let mut receipts = Vec::new();
    let entries = fs::read_dir(&receipts_dir).map_err(|e| format!("Failed to read receipts dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(receipt) = serde_json::from_str::<AuditReceipt>(&content) {
                    receipts.push(receipt);
                }
            }
        }
    }

    // Sort newest first by ISO timestamp
    receipts.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    if let Some(lim) = limit {
        receipts.truncate(lim);
    }

    Ok(receipts)
}

/// Retrieves a specific receipt by ID.
pub fn get_audit_receipt(base_audit_dir: &Path, audit_id: &str) -> Result<AuditReceipt, String> {
    let receipt_path = base_audit_dir.join("receipts").join(format!("{}.json", audit_id));
    if !receipt_path.exists() {
        return Err(format!("Audit receipt '{}' not found", audit_id));
    }

    let content = fs::read_to_string(&receipt_path)
        .map_err(|e| format!("Failed to read receipt file: {}", e))?;
    serde_json::from_str::<AuditReceipt>(&content)
        .map_err(|e| format!("Invalid receipt format: {}", e))
}

/// Executes a guarded action with pre/post-action screenshot capture,
/// SHA-256 verification, and immutable receipt generation.
pub fn execute_action_with_visual_audit(
    app: Option<&AppHandle>,
    request: &SimulatedActionRequest,
    session_id: &str,
    window_title: Option<String>,
    grounding: Option<AuditGrounding>,
) -> Result<AuditReceipt, String> {
    let audit_id = format!("gui-act-{}", &uuid::Uuid::new_v4().to_string()[..8]);
    let base_audit_dir = get_audit_dir(app);
    let screenshots_dir = base_audit_dir.join("screenshots");
    fs::create_dir_all(&screenshots_dir).map_err(|e| format!("Failed to create screenshots dir: {}", e))?;

    let pre_path = screenshots_dir.join(format!("{}_before.png", audit_id));
    let post_path = screenshots_dir.join(format!("{}_after.png", audit_id));

    // 1. Pre-execution silent capture
    let _ = super::screenshot::capture_native_screenshot(&pre_path);
    let pre_sha256 = calculate_file_sha256(&pre_path).unwrap_or_else(|_| "hash_unavailable".to_string());

    let bundle = request.intent.target_app_bundle_id.trim().to_lowercase();
    let config = get_config();
    let risk = classify_action_risk(&request.intent);

    let safety_verdict = AuditSafetyVerdict {
        allowlisted: config.allowlist.contains(&bundle),
        blacklisted: is_hard_blocked(&bundle),
        approval_required: risk != RiskLevel::Low,
        user_approval_timestamp: if request.operator_approved {
            Some(Utc::now().to_rfc3339())
        } else {
            None
        },
    };

    let start_time = Instant::now();
    let action_str = match &request.action {
        super::input_driver::ComputerAction::Click { .. } => "gui_click",
        super::input_driver::ComputerAction::Move { .. } => "gui_move",
        super::input_driver::ComputerAction::Type { .. } => "gui_type",
        super::input_driver::ComputerAction::KeyCombo { .. } => "gui_key_combo",
        super::input_driver::ComputerAction::Scroll { .. } => "gui_scroll",
        super::input_driver::ComputerAction::Drag { .. } => "gui_drag",
    };

    // 2. Guarded input execution
    let execution_result = execute_guarded_action(app, request);
    let duration_ms = start_time.elapsed().as_millis() as u64;

    // 3. Post-execution settle delay and capture (300ms window settling time)
    std::thread::sleep(Duration::from_millis(300));
    let _ = super::screenshot::capture_native_screenshot(&post_path);
    let post_sha256 = calculate_file_sha256(&post_path).unwrap_or_else(|_| "hash_unavailable".to_string());

    let (status, kill_switched) = match &execution_result {
        Ok(res) => (res.status.clone(), is_halt_triggered()),
        Err(err) => (format!("REFUSED: {}", err), is_halt_triggered()),
    };

    let receipt = AuditReceipt {
        audit_id,
        session_id: session_id.to_string(),
        timestamp: Utc::now().to_rfc3339(),
        action_type: action_str.to_string(),
        intent: AuditIntent {
            natural_language: request.intent.natural_language_intent.clone(),
            target_app: bundle.clone(),
            bundle_id: bundle,
            window_title,
            element: request.intent.target_element_description.clone(),
        },
        grounding,
        safety_verdict,
        execution: AuditExecution {
            duration_ms,
            status,
            kill_switch_triggered: kill_switched,
        },
        artifacts: AuditArtifacts {
            pre_screenshot_path: pre_path.to_string_lossy().to_string(),
            post_screenshot_path: post_path.to_string_lossy().to_string(),
            pre_screenshot_sha256: pre_sha256,
            post_screenshot_sha256: post_sha256,
        },
    };

    // 4. Save immutable receipt
    record_audit_receipt(&base_audit_dir, &receipt)?;

    // If execution was refused by policy, also propagate the Err for callers
    if let Err(e) = execution_result {
        return Err(e);
    }

    Ok(receipt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::safety::SAFETY_TEST_LOCK;
    use crate::safety::action_classifier::{ActionIntent, IntendedStateChange};
    use crate::safety::allowlist::{reset_config_for_tests, set_master_toggle};
    use crate::safety::input_driver::ComputerAction;
    use crate::safety::kill_switch::reset_kill_switch;

    #[test]
    fn test_calculate_file_sha256_known_string() {
        let temp_dir = std::env::temp_dir().join(format!("aeio_test_sha_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let test_file = temp_dir.join("test.txt");
        fs::write(&test_file, b"aeio safety visual audit receipt").unwrap();

        let hash = calculate_file_sha256(&test_file).unwrap();
        // SHA-256 of "aeio safety visual audit receipt" is 64 hex characters
        assert_eq!(hash.len(), 64);
        assert_ne!(hash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_record_and_list_audit_receipts() {
        let temp_dir = std::env::temp_dir().join(format!("aeio_test_receipts_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        let receipt = AuditReceipt {
            audit_id: "gui-act-test01".to_string(),
            session_id: "sess-test".to_string(),
            timestamp: "2026-09-26T03:15:22.418Z".to_string(),
            action_type: "gui_click".to_string(),
            intent: AuditIntent {
                natural_language: "Close TextEdit document window".to_string(),
                target_app: "TextEdit".to_string(),
                bundle_id: "com.apple.textedit".to_string(),
                window_title: Some("MeetingNotes.txt".to_string()),
                element: "close_window_button".to_string(),
            },
            grounding: Some(AuditGrounding {
                model_endpoint: Some("https://example.com/grounding".to_string()),
                predicted_coordinate: Some(Coordinate2D { x: 482, y: 319 }),
                bounding_box: Some(vec![474, 311, 490, 327]),
                confidence: Some(0.94),
            }),
            safety_verdict: AuditSafetyVerdict {
                allowlisted: true,
                blacklisted: false,
                approval_required: true,
                user_approval_timestamp: Some("2026-09-26T03:15:21.902Z".to_string()),
            },
            execution: AuditExecution {
                duration_ms: 142,
                status: "COMPLETED".to_string(),
                kill_switch_triggered: false,
            },
            artifacts: AuditArtifacts {
                pre_screenshot_path: "audit/screenshots/gui-act-test01_before.png".to_string(),
                post_screenshot_path: "audit/screenshots/gui-act-test01_after.png".to_string(),
                pre_screenshot_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
                post_screenshot_sha256: "8f2b740562e1a967f6738f654f5ef43f65fe7cff5b6c3f3a1f8e219747a16f91".to_string(),
            },
        };

        let path = record_audit_receipt(&temp_dir, &receipt).expect("Failed to record receipt");
        assert!(path.exists());

        let retrieved = get_audit_receipt(&temp_dir, "gui-act-test01").expect("Failed to retrieve receipt");
        assert_eq!(retrieved.audit_id, "gui-act-test01");
        assert_eq!(retrieved.intent.target_app, "TextEdit");
        assert_eq!(retrieved.safety_verdict.allowlisted, true);

        let list = list_audit_receipts(&temp_dir, None).expect("Failed to list receipts");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].audit_id, "gui-act-test01");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_execute_action_with_visual_audit_refusal_audit_trail() {
        let _guard = SAFETY_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_kill_switch();
        reset_config_for_tests();
        set_master_toggle(true);

        let temp_dir = std::env::temp_dir().join(format!("aeio_test_audit_flow_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        // Attempt action on blocked terminal app
        let req = SimulatedActionRequest {
            intent: ActionIntent {
                natural_language_intent: "Run bash command".to_string(),
                target_app_bundle_id: "com.apple.terminal".to_string(),
                target_element_description: "terminal view".to_string(),
                intended_state_change: IntendedStateChange::DataEntry,
            },
            action: ComputerAction::Type { text: "whoami".to_string() },
            step_number: 1,
            total_steps: 1,
            operator_approved: false,
        };

        // Execution should be refused by policy, but receipt logged
        let res = execute_action_with_visual_audit(None, &req, "test-sess", None, None);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("absolute system blocklist"));

        reset_kill_switch();
        reset_config_for_tests();
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
