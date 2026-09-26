use std::thread;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use enigo::{Axis, Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};

use super::action_classifier::{classify_action_risk, ActionIntent, RiskLevel};
use super::allowlist::{get_config, is_hard_blocked};
use super::kill_switch::is_halt_triggered;
use super::overlay::show_overlay;

fn default_left_button() -> String {
    "left".to_string()
}

/// Primitive discrete computer input action.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "actionType", rename_all = "camelCase")]
pub enum ComputerAction {
    Click {
        x: i32,
        y: i32,
        #[serde(default = "default_left_button")]
        button: String,
        #[serde(default)]
        double: bool,
    },
    Move {
        x: i32,
        y: i32,
    },
    Type {
        text: String,
    },
    KeyCombo {
        keys: Vec<String>,
    },
    Scroll {
        dx: i32,
        dy: i32,
    },
    Drag {
        start_x: i32,
        start_y: i32,
        end_x: i32,
        end_y: i32,
    },
}

/// Structured request to simulate a computer action with full intent and safety metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimulatedActionRequest {
    pub intent: ActionIntent,
    pub action: ComputerAction,
    pub step_number: u32,
    pub total_steps: u32,
    pub operator_approved: bool,
}

/// Result returned from executing a guarded action.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub status: String, // "SUCCESS", "ABORTED_BY_KILL_SWITCH", "REFUSED_SECURITY_POLICY"
    pub message: String,
    pub target_app_bundle_id: String,
    pub completed_step: u32,
}

fn parse_key(key_str: &str) -> Option<Key> {
    let lower = key_str.trim().to_lowercase();
    match lower.as_str() {
        "cmd" | "command" | "super" | "win" | "meta" => Some(Key::Meta),
        "ctrl" | "control" => Some(Key::Control),
        "alt" | "option" => Some(Key::Alt),
        "shift" => Some(Key::Shift),
        "enter" | "return" => Some(Key::Return),
        "esc" | "escape" => Some(Key::Escape),
        "backspace" => Some(Key::Backspace),
        "tab" => Some(Key::Tab),
        "space" => Some(Key::Space),
        "up" | "arrowup" => Some(Key::UpArrow),
        "down" | "arrowdown" => Some(Key::DownArrow),
        "left" | "arrowleft" => Some(Key::LeftArrow),
        "right" | "arrowright" => Some(Key::RightArrow),
        s if s.chars().count() == 1 => s.chars().next().map(Key::Unicode),
        _ => None,
    }
}

fn parse_mouse_button(btn: &str) -> Button {
    match btn.trim().to_lowercase().as_str() {
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => Button::Left,
    }
}

/// Validates policy requirements before executing any input.
pub fn validate_action_policy(
    request: &SimulatedActionRequest,
) -> Result<(), String> {
    // Check 1: Kill switch halt flag
    if is_halt_triggered() {
        return Err("Action refused: Emergency Kill Switch is currently tripped.".to_string());
    }

    let config = get_config();

    // Check 2: Master Switch
    if !config.enabled {
        return Err("Action refused: Computer Control master switch is disabled in Settings.".to_string());
    }

    let bundle = request.intent.target_app_bundle_id.trim().to_lowercase();

    // Check 3: Non-empty bundle ID
    if bundle.is_empty() {
        return Err("Action refused: Target application bundle identifier cannot be empty.".to_string());
    }

    // Check 4: Hard Blocklist (Non-overridable: Terminals, Passwords, Settings)
    if is_hard_blocked(&bundle) {
        return Err(format!(
            "Action refused by security policy: Target application '{}' is in the absolute system blocklist.",
            bundle
        ));
    }

    // Check 5: User Permitted Allowlist (Default empty)
    if !config.allowlist.contains(&bundle) {
        return Err(format!(
            "Action refused by security policy: Target application '{}' is not present in the user allowlist.",
            bundle
        ));
    }

    // Check 6: Risk Classification & Human Approval Gate
    let risk = classify_action_risk(&request.intent);
    if risk != RiskLevel::Low && !request.operator_approved {
        return Err(format!(
            "Action refused: Proposed action is classified as {:?} Risk ('{}') and requires upfront human operator approval.",
            risk,
            request.intent.natural_language_intent
        ));
    }

    Ok(())
}

/// Executes a native computer action in-process with defense-in-depth safety checks.
pub fn execute_guarded_action(
    app: Option<&AppHandle>,
    request: &SimulatedActionRequest,
) -> Result<ActionResult, String> {
    // Defense-in-depth policy evaluation
    validate_action_policy(request)?;

    let bundle = request.intent.target_app_bundle_id.trim().to_lowercase();

    // Update active overlay HUD before input simulation
    show_overlay(
        app,
        &bundle,
        &bundle,
        &request.intent.natural_language_intent,
        request.step_number,
        request.total_steps,
    );

    // Final pre-input verification of kill switch
    if is_halt_triggered() {
        return Ok(ActionResult {
            status: "ABORTED_BY_KILL_SWITCH".to_string(),
            message: "Action aborted: Emergency Kill Switch tripped immediately before input injection.".to_string(),
            target_app_bundle_id: bundle,
            completed_step: request.step_number.saturating_sub(1),
        });
    }

    // Initialize in-process enigo driver (cross-platform, zero python subprocesses)
    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to initialize native input simulator: {:?}", e))?;

    match &request.action {
        ComputerAction::Click { x, y, button, double } => {
            let btn = parse_mouse_button(button);
            enigo
                .move_mouse(*x, *y, Coordinate::Abs)
                .map_err(|e| format!("Mouse move failed: {:?}", e))?;

            thread::sleep(Duration::from_millis(20));
            if is_halt_triggered() {
                return Ok(ActionResult {
                    status: "ABORTED_BY_KILL_SWITCH".to_string(),
                    message: "Action aborted: Kill Switch tripped before click injection.".to_string(),
                    target_app_bundle_id: bundle,
                    completed_step: request.step_number.saturating_sub(1),
                });
            }

            enigo
                .button(btn, Direction::Click)
                .map_err(|e| format!("Mouse click failed: {:?}", e))?;

            if *double {
                thread::sleep(Duration::from_millis(40));
                if !is_halt_triggered() {
                    let _ = enigo.button(btn, Direction::Click);
                }
            }
        }
        ComputerAction::Move { x, y } => {
            enigo
                .move_mouse(*x, *y, Coordinate::Abs)
                .map_err(|e| format!("Mouse move failed: {:?}", e))?;
        }
        ComputerAction::Type { text } => {
            if is_halt_triggered() {
                return Ok(ActionResult {
                    status: "ABORTED_BY_KILL_SWITCH".to_string(),
                    message: "Action aborted: Kill Switch tripped before typing.".to_string(),
                    target_app_bundle_id: bundle,
                    completed_step: request.step_number.saturating_sub(1),
                });
            }

            enigo
                .text(text)
                .map_err(|e| format!("Text typing failed: {:?}", e))?;
        }
        ComputerAction::KeyCombo { keys } => {
            let parsed_keys: Vec<Key> = keys.iter().filter_map(|k| parse_key(k)).collect();
            if parsed_keys.is_empty() {
                return Err("No recognizable keys in key combo request.".to_string());
            }

            // Check kill switch
            if is_halt_triggered() {
                return Ok(ActionResult {
                    status: "ABORTED_BY_KILL_SWITCH".to_string(),
                    message: "Action aborted: Kill Switch tripped before key combo.".to_string(),
                    target_app_bundle_id: bundle,
                    completed_step: request.step_number.saturating_sub(1),
                });
            }

            // Press all modifiers down
            for key in &parsed_keys[..parsed_keys.len() - 1] {
                let _ = enigo.key(*key, Direction::Press);
            }

            // Click the final key
            if let Some(final_key) = parsed_keys.last() {
                let _ = enigo.key(*final_key, Direction::Click);
            }

            // Release all modifiers in reverse
            for key in parsed_keys[..parsed_keys.len() - 1].iter().rev() {
                let _ = enigo.key(*key, Direction::Release);
            }
        }
        ComputerAction::Scroll { dx, dy } => {
            if *dy != 0 {
                let _ = enigo.scroll(*dy, Axis::Vertical);
            }
            if *dx != 0 {
                let _ = enigo.scroll(*dx, Axis::Horizontal);
            }
        }
        ComputerAction::Drag { start_x, start_y, end_x, end_y } => {
            enigo
                .move_mouse(*start_x, *start_y, Coordinate::Abs)
                .map_err(|e| format!("Drag start move failed: {:?}", e))?;

            thread::sleep(Duration::from_millis(20));
            if is_halt_triggered() {
                return Ok(ActionResult {
                    status: "ABORTED_BY_KILL_SWITCH".to_string(),
                    message: "Action aborted: Kill Switch tripped during drag initiation.".to_string(),
                    target_app_bundle_id: bundle,
                    completed_step: request.step_number.saturating_sub(1),
                });
            }

            let _ = enigo.button(Button::Left, Direction::Press);
            thread::sleep(Duration::from_millis(30));

            let _ = enigo.move_mouse(*end_x, *end_y, Coordinate::Abs);
            thread::sleep(Duration::from_millis(30));

            let _ = enigo.button(Button::Left, Direction::Release);
        }
    }

    // Post-execution halt verification
    if is_halt_triggered() {
        return Ok(ActionResult {
            status: "ABORTED_BY_KILL_SWITCH".to_string(),
            message: "Action executed, but emergency halt tripped during step completion.".to_string(),
            target_app_bundle_id: bundle,
            completed_step: request.step_number,
        });
    }

    Ok(ActionResult {
        status: "SUCCESS".to_string(),
        message: format!("Successfully executed action for step {}", request.step_number),
        target_app_bundle_id: bundle,
        completed_step: request.step_number,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::safety::action_classifier::IntendedStateChange;
    use crate::safety::allowlist::{add_bundle_to_allowlist, reset_config_for_tests, set_master_toggle};
    use crate::safety::kill_switch::{reset_kill_switch, trigger_kill_switch};
    use crate::safety::SAFETY_TEST_LOCK;

    #[test]
    fn test_action_policy_refuses_when_master_toggle_is_off() {
        let _guard = SAFETY_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_kill_switch();
        reset_config_for_tests();
        set_master_toggle(false);

        let req = SimulatedActionRequest {
            intent: ActionIntent {
                natural_language_intent: "Click text box".to_string(),
                target_app_bundle_id: "com.apple.textedit".to_string(),
                target_element_description: "edit field".to_string(),
                intended_state_change: IntendedStateChange::Navigate,
            },
            action: ComputerAction::Click { x: 100, y: 100, button: "left".to_string(), double: false },
            step_number: 1,
            total_steps: 1,
            operator_approved: false,
        };

        let result = validate_action_policy(&req);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("master switch is disabled"));

        reset_config_for_tests();
        reset_kill_switch();
    }

    #[test]
    fn test_action_policy_refuses_non_allowlisted_application() {
        let _guard = SAFETY_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_kill_switch();
        reset_config_for_tests();
        set_master_toggle(true);

        let req = SimulatedActionRequest {
            intent: ActionIntent {
                natural_language_intent: "Click window".to_string(),
                target_app_bundle_id: "com.random.unapprovedapp".to_string(),
                target_element_description: "window area".to_string(),
                intended_state_change: IntendedStateChange::Navigate,
            },
            action: ComputerAction::Move { x: 50, y: 50 },
            step_number: 1,
            total_steps: 1,
            operator_approved: false,
        };

        let result = validate_action_policy(&req);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not present in the user allowlist"));

        reset_config_for_tests();
        reset_kill_switch();
    }

    #[test]
    fn test_action_policy_refuses_hard_blocked_terminals_and_passwords() {
        let _guard = SAFETY_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_kill_switch();
        reset_config_for_tests();
        set_master_toggle(true);

        for blocked in &["com.apple.Terminal", "com.1password", "iTerm2", "com.microsoft.VSCode"] {
            let req = SimulatedActionRequest {
                intent: ActionIntent {
                    natural_language_intent: "Type command".to_string(),
                    target_app_bundle_id: blocked.to_string(),
                    target_element_description: "terminal input".to_string(),
                    intended_state_change: IntendedStateChange::DataEntry,
                },
                action: ComputerAction::Type { text: "ls".to_string() },
                step_number: 1,
                total_steps: 1,
                operator_approved: true, // Even if claimed approved, hard blocklist rejects!
            };

            let result = validate_action_policy(&req);
            assert!(result.is_err());
            assert!(result.unwrap_err().contains("absolute system blocklist"));
        }

        reset_config_for_tests();
        reset_kill_switch();
    }

    #[test]
    fn test_action_policy_refuses_high_risk_without_operator_approval() {
        let _guard = SAFETY_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_kill_switch();
        reset_config_for_tests();
        set_master_toggle(true);
        let _ = add_bundle_to_allowlist("com.apple.textedit");

        let req = SimulatedActionRequest {
            intent: ActionIntent {
                natural_language_intent: "Close document without saving".to_string(),
                target_app_bundle_id: "com.apple.textedit".to_string(),
                target_element_description: "window close button".to_string(),
                intended_state_change: IntendedStateChange::FileOperation,
            },
            action: ComputerAction::Click { x: 10, y: 10, button: "left".to_string(), double: false },
            step_number: 1,
            total_steps: 1,
            operator_approved: false, // High / Medium risk requires approval!
        };

        let result = validate_action_policy(&req);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("requires upfront human operator approval"));

        reset_config_for_tests();
        reset_kill_switch();
    }

    #[test]
    fn test_kill_switch_aborts_action_execution_immediately() {
        let _guard = SAFETY_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_kill_switch();
        reset_config_for_tests();
        set_master_toggle(true);
        let _ = add_bundle_to_allowlist("com.apple.textedit");

        // Trip kill switch
        trigger_kill_switch("Physical Escape key held for >= 300ms");

        let req = SimulatedActionRequest {
            intent: ActionIntent {
                natural_language_intent: "Inspect document view".to_string(),
                target_app_bundle_id: "com.apple.textedit".to_string(),
                target_element_description: "editor view".to_string(),
                intended_state_change: IntendedStateChange::Navigate,
            },
            action: ComputerAction::Move { x: 100, y: 100 },
            step_number: 1,
            total_steps: 1,
            operator_approved: true,
        };

        let result = validate_action_policy(&req);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Emergency Kill Switch is currently tripped"));

        reset_kill_switch();
        reset_config_for_tests();
    }
}

