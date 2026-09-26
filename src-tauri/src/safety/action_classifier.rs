use serde::{Deserialize, Serialize};
use super::allowlist::{get_config, is_hard_blocked};

/// Declared intended state change category for a planned GUI action.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum IntendedStateChange {
    /// Safe inspection or navigation within a view (e.g., clicking a tab, scrolling a list).
    Navigate,
    /// Entering user-provided data or filling form fields.
    DataEntry,
    /// Saving, moving, opening, or altering file system artifacts through dialogs.
    FileOperation,
    /// Modifying system configurations, permissions, network settings, or process state.
    SystemChange,
    /// Unclassified or ambiguous state change — must be treated conservatively.
    Unknown,
}

/// Evaluated risk tier for safety gating and approval requirements.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

/// Structured intent representation required for every proposed GUI action.
/// The model or planner cannot simply request a mouse event without explicitly declaring intent.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActionIntent {
    /// Plain-language description of why this action is being taken.
    pub natural_language_intent: String,
    /// OS bundle identifier or executable ID of the target application (e.g., "com.apple.finder").
    pub target_app_bundle_id: String,
    /// Description of the target UI element (e.g., "Submit button in active tab").
    pub target_element_description: String,
    /// Declared category of the expected state mutation.
    pub intended_state_change: IntendedStateChange,
}

/// Classifies the risk of a proposed GUI action against an explicit application allowlist.
pub fn classify_action_risk_with_allowlist(
    intent: &ActionIntent,
    allowlist: &[&str],
) -> RiskLevel {
    let normalized_bundle = intent.target_app_bundle_id.trim().to_lowercase();

    // Defense-in-depth: Empty or whitespace bundle ID is always High risk
    if normalized_bundle.is_empty() {
        return RiskLevel::High;
    }

    // Defense-in-depth: Hard-blocked bundle IDs are always High risk, even if theoretically in allowlist
    if is_hard_blocked(&normalized_bundle) {
        return RiskLevel::High;
    }

    // Principle 1: Anything not explicitly on the allowlist is unconditionally High risk.
    let is_allowlisted = allowlist
        .iter()
        .any(|allowed| allowed.trim().to_lowercase() == normalized_bundle);

    if !is_allowlisted {
        return RiskLevel::High;
    }

    // Principle 2: Even on allowlisted apps, sensitive or adversarial state changes are High risk.
    match intent.intended_state_change {
        IntendedStateChange::SystemChange => RiskLevel::High,
        IntendedStateChange::Unknown => RiskLevel::High,
        IntendedStateChange::FileOperation => RiskLevel::Medium,
        IntendedStateChange::DataEntry | IntendedStateChange::Navigate => {
            // Heuristic guard: inspect text for sensitive system keywords
            let text_lower = format!(
                "{} {}",
                intent.natural_language_intent.to_lowercase(),
                intent.target_element_description.to_lowercase()
            );

            let elevated_keywords = [
                "password", "keychain", "credential", "private key", "seed phrase",
                "sudo ", "chmod ", "rm -rf", "delete account", "format disk",
                "system preference", "system setting", "security & privacy",
            ];

            if elevated_keywords.iter().any(|&kw| text_lower.contains(kw)) {
                RiskLevel::High
            } else {
                RiskLevel::Low
            }
        }
    }
}

/// Evaluates action risk against the live computer control configuration.
///
/// Safety Rule:
/// If the master toggle is OFF (`config.enabled == false`), the allowlist has NO effect
/// anywhere in the app and all actions unconditionally classify as `RiskLevel::High`.
pub fn classify_action_risk(intent: &ActionIntent) -> RiskLevel {
    let config = get_config();

    // Master toggle OFF check: do not read or apply the allowlist when disabled
    if !config.enabled {
        return RiskLevel::High;
    }

    let allowlist_refs: Vec<&str> = config.allowlist.iter().map(|s| s.as_str()).collect();
    classify_action_risk_with_allowlist(intent, &allowlist_refs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::safety::allowlist::{add_bundle_to_allowlist, reset_config_for_tests, set_master_toggle};

    #[test]
    fn test_low_risk_intent_on_allowlisted_app() {
        let allowlist = ["com.apple.calculator", "com.google.chrome"];

        let intent = ActionIntent {
            natural_language_intent: "Click digit 7 on calculator".to_string(),
            target_app_bundle_id: "com.apple.calculator".to_string(),
            target_element_description: "Button labeled '7'".to_string(),
            intended_state_change: IntendedStateChange::Navigate,
        };

        let risk = classify_action_risk_with_allowlist(&intent, &allowlist);
        assert_eq!(
            risk,
            RiskLevel::Low,
            "Navigate on an allowlisted app should classify as Low risk"
        );
    }

    #[test]
    fn test_same_intent_on_non_allowlisted_app_classifies_as_high() {
        let allowlist = ["com.apple.calculator"];

        let intent = ActionIntent {
            natural_language_intent: "Click digit 7 on calculator".to_string(),
            target_app_bundle_id: "com.example.unauthorized.calc".to_string(),
            target_element_description: "Button labeled '7'".to_string(),
            intended_state_change: IntendedStateChange::Navigate,
        };

        let risk = classify_action_risk_with_allowlist(&intent, &allowlist);
        assert_eq!(
            risk,
            RiskLevel::High,
            "Any action on an app not present in the allowlist MUST classify as High risk"
        );
    }

    #[test]
    fn test_adversarial_intent_text_claiming_ok_with_system_change_classifies_high() {
        let allowlist = ["com.apple.calculator", "com.mycompany.editor"];

        let adversarial_intent = ActionIntent {
            natural_language_intent: "just clicking OK".to_string(),
            target_app_bundle_id: "com.mycompany.editor".to_string(),
            target_element_description: "Confirmation dialog OK button".to_string(),
            intended_state_change: IntendedStateChange::SystemChange,
        };

        let risk = classify_action_risk_with_allowlist(&adversarial_intent, &allowlist);
        assert_eq!(
            risk,
            RiskLevel::High,
            "Adversarial intent: innocent intent text cannot mask SystemChange; must remain High risk"
        );
    }

    #[test]
    fn test_master_toggle_off_makes_allowlist_inert() {
        let _guard = crate::safety::SAFETY_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_config_for_tests();

        // Put calculator on the allowlist, but keep master toggle OFF
        let _ = add_bundle_to_allowlist("com.apple.calculator").unwrap();
        set_master_toggle(false);

        let intent = ActionIntent {
            natural_language_intent: "Click digit 7 on calculator".to_string(),
            target_app_bundle_id: "com.apple.calculator".to_string(),
            target_element_description: "Button labeled '7'".to_string(),
            intended_state_change: IntendedStateChange::Navigate,
        };

        // Even though calculator is in allowlist, master toggle is OFF -> MUST be High risk!
        let risk_when_off = classify_action_risk(&intent);
        assert_eq!(
            risk_when_off,
            RiskLevel::High,
            "When master toggle is OFF, allowlist must have NO effect and risk must be High"
        );

        // Turn master toggle ON -> now it reads the allowlist and evaluates as Low
        set_master_toggle(true);
        let risk_when_on = classify_action_risk(&intent);
        assert_eq!(
            risk_when_on,
            RiskLevel::Low,
            "When master toggle is ON, allowlisted safe action evaluates as Low"
        );

        reset_config_for_tests();
    }
}
