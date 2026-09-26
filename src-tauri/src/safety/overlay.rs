use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter, Manager};

/// State payload for the visible active-control overlay HUD.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ControlOverlayState {
    pub is_active: bool,
    pub target_app_name: String,
    pub target_app_bundle_id: String,
    pub declared_intent: String,
    pub current_step: u32,
    pub total_steps: u32,
    pub kill_switch_triggered: bool,
    pub kill_switch_reason: Option<String>,
}

impl Default for ControlOverlayState {
    fn default() -> Self {
        Self {
            is_active: false,
            target_app_name: String::new(),
            target_app_bundle_id: String::new(),
            declared_intent: String::new(),
            current_step: 0,
            total_steps: 0,
            kill_switch_triggered: false,
            kill_switch_reason: None,
        }
    }
}

static OVERLAY_STATE: LazyLock<Mutex<ControlOverlayState>> =
    LazyLock::new(|| Mutex::new(ControlOverlayState::default()));

/// Shows the active-control overlay with the specified target application and intent.
/// Also positions and displays the transparent, click-through, always-on-top overlay window if available.
pub fn show_overlay(
    app: Option<&AppHandle>,
    target_app_name: &str,
    target_app_bundle_id: &str,
    declared_intent: &str,
    current_step: u32,
    total_steps: u32,
) -> ControlOverlayState {
    let mut state = OVERLAY_STATE.lock().unwrap();
    state.is_active = true;
    state.target_app_name = target_app_name.to_string();
    state.target_app_bundle_id = target_app_bundle_id.to_string();
    state.declared_intent = declared_intent.to_string();
    state.current_step = current_step;
    state.total_steps = total_steps;

    let cloned = state.clone();
    drop(state);

    if let Some(app) = app {
        if let Some(window) = app.get_webview_window("overlay") {
            // Position at top center of primary display
            if let Ok(Some(monitor)) = window.primary_monitor() {
                let screen_size = monitor.size();
                let width = 1050;
                let x = if screen_size.width > width {
                    (screen_size.width - width) / 2
                } else {
                    0
                };
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: x as i32,
                    y: 0,
                }));
            }
            let _ = window.set_always_on_top(true);
            let _ = window.set_ignore_cursor_events(true);
            let _ = window.show();
        }
        let _ = app.emit("overlay-state-changed", &cloned);
    }

    cloned
}

/// Updates the active-control overlay's progress or declared intent.
pub fn update_overlay(
    app: Option<&AppHandle>,
    target_app_name: Option<String>,
    declared_intent: Option<String>,
    current_step: Option<u32>,
    total_steps: Option<u32>,
) -> ControlOverlayState {
    let mut state = OVERLAY_STATE.lock().unwrap();
    if let Some(name) = target_app_name {
        state.target_app_name = name;
    }
    if let Some(intent) = declared_intent {
        state.declared_intent = intent;
    }
    if let Some(step) = current_step {
        state.current_step = step;
    }
    if let Some(total) = total_steps {
        state.total_steps = total;
    }

    let cloned = state.clone();
    drop(state);

    if let Some(app) = app {
        let _ = app.emit("overlay-state-changed", &cloned);
    }

    cloned
}

/// Hides the active-control overlay and hides the dedicated window.
pub fn hide_overlay(app: Option<&AppHandle>) -> ControlOverlayState {
    let mut state = OVERLAY_STATE.lock().unwrap();
    state.is_active = false;

    let cloned = state.clone();
    drop(state);

    if let Some(app) = app {
        if let Some(window) = app.get_webview_window("overlay") {
            let _ = window.hide();
        }
        let _ = app.emit("overlay-state-changed", &cloned);
    }

    cloned
}

/// Returns the current active-control overlay state.
pub fn get_overlay_state() -> ControlOverlayState {
    OVERLAY_STATE.lock().unwrap().clone()
}

/// Notifies the overlay that the emergency kill switch has been tripped.
pub fn notify_kill_switch_on_overlay(app: Option<&AppHandle>, reason: &str) -> ControlOverlayState {
    let mut state = OVERLAY_STATE.lock().unwrap();
    state.kill_switch_triggered = true;
    state.kill_switch_reason = Some(reason.to_string());

    let cloned = state.clone();
    drop(state);

    if let Some(app) = app {
        let _ = app.emit("overlay-state-changed", &cloned);
    }

    cloned
}

/// Clears the kill switch status on the overlay state.
pub fn reset_kill_switch_on_overlay(app: Option<&AppHandle>) -> ControlOverlayState {
    let mut state = OVERLAY_STATE.lock().unwrap();
    state.kill_switch_triggered = false;
    state.kill_switch_reason = None;

    let cloned = state.clone();
    drop(state);

    if let Some(app) = app {
        let _ = app.emit("overlay-state-changed", &cloned);
    }

    cloned
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_overlay_state_lifecycle() {
        // Reset state
        hide_overlay(None);
        let initial = get_overlay_state();
        assert!(!initial.is_active);

        // Show overlay
        let shown = show_overlay(
            None,
            "TextEdit",
            "com.apple.TextEdit",
            "Close document window",
            1,
            2,
        );
        assert!(shown.is_active);
        assert_eq!(shown.target_app_name, "TextEdit");
        assert_eq!(shown.target_app_bundle_id, "com.apple.TextEdit");
        assert_eq!(shown.declared_intent, "Close document window");
        assert_eq!(shown.current_step, 1);
        assert_eq!(shown.total_steps, 2);
        assert!(!shown.kill_switch_triggered);

        // Update step
        let updated = update_overlay(None, None, Some("Click Save".to_string()), Some(2), None);
        assert_eq!(updated.current_step, 2);
        assert_eq!(updated.declared_intent, "Click Save");
        assert_eq!(updated.target_app_name, "TextEdit");

        // Notify kill switch
        let tripped = notify_kill_switch_on_overlay(None, "Escape key held for >= 300ms");
        assert!(tripped.kill_switch_triggered);
        assert_eq!(
            tripped.kill_switch_reason,
            Some("Escape key held for >= 300ms".to_string())
        );

        // Reset kill switch
        let reset = reset_kill_switch_on_overlay(None);
        assert!(!reset.kill_switch_triggered);
        assert_eq!(reset.kill_switch_reason, None);

        // Hide overlay
        let hidden = hide_overlay(None);
        assert!(!hidden.is_active);
    }
}
