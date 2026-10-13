use serde::{Deserialize, Serialize};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size};

/// Represents the runtime state of the floating Dynamic Island / Notch window.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotchWindowState {
    pub is_visible: bool,
    pub width: u32,
    pub height: u32,
    pub is_expanded: bool,
}

impl Default for NotchWindowState {
    fn default() -> Self {
        Self {
            is_visible: false,
            width: 380,
            height: 48,
            is_expanded: false,
        }
    }
}

static NOTCH_STATE: LazyLock<Mutex<NotchWindowState>> =
    LazyLock::new(|| Mutex::new(NotchWindowState::default()));

/// Shows the dedicated floating Notch window, anchoring it symmetrically to the top of the primary display.
pub fn show_notch_window(app: &AppHandle) -> Result<bool, String> {
    let mut state = NOTCH_STATE.lock().map_err(|e| e.to_string())?;
    state.is_visible = true;
    let width = state.width;
    let height = state.height;
    let cloned = state.clone();
    drop(state);

    if let Some(window) = app.get_webview_window("notch") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let screen_size = monitor.size();
            let x = if screen_size.width > width {
                (screen_size.width - width) / 2
            } else {
                0
            };
            let _ = window.set_position(Position::Physical(PhysicalPosition {
                x: x as i32,
                y: 0,
            }));
            let _ = window.set_size(Size::Physical(PhysicalSize {
                width,
                height,
            }));
        }

        let _ = window.set_always_on_top(true);
        let _ = window.show();
        let _ = window.set_focus();
    }

    let _ = app.emit("notch-state-changed", &cloned);
    Ok(true)
}

/// Hides the dedicated floating Notch window.
pub fn hide_notch_window(app: &AppHandle) -> Result<bool, String> {
    let mut state = NOTCH_STATE.lock().map_err(|e| e.to_string())?;
    state.is_visible = false;
    let cloned = state.clone();
    drop(state);

    if let Some(window) = app.get_webview_window("notch") {
        let _ = window.hide();
    }

    let _ = app.emit("notch-state-changed", &cloned);
    Ok(true)
}

/// Toggles the visibility of the dedicated floating Notch window.
pub fn toggle_notch_window(app: &AppHandle) -> Result<bool, String> {
    let is_currently_visible = {
        if let Some(window) = app.get_webview_window("notch") {
            window.is_visible().unwrap_or(false)
        } else {
            let state = NOTCH_STATE.lock().map_err(|e| e.to_string())?;
            state.is_visible
        }
    };

    if is_currently_visible {
        hide_notch_window(app)
    } else {
        show_notch_window(app)
    }
}

/// Dynamically adjusts the size and re-anchors the notch window horizontally.
pub fn resize_notch_window(app: &AppHandle, width: u32, height: u32) -> Result<bool, String> {
    let mut state = NOTCH_STATE.lock().map_err(|e| e.to_string())?;
    state.width = width;
    state.height = height;
    state.is_expanded = height > 60;
    let cloned = state.clone();
    drop(state);

    if let Some(window) = app.get_webview_window("notch") {
        if let Ok(Some(monitor)) = window.primary_monitor() {
            let screen_size = monitor.size();
            let x = if screen_size.width > width {
                (screen_size.width - width) / 2
            } else {
                0
            };
            let _ = window.set_position(Position::Physical(PhysicalPosition {
                x: x as i32,
                y: 0,
            }));
            let _ = window.set_size(Size::Physical(PhysicalSize {
                width,
                height,
            }));
        }
    }

    let _ = app.emit("notch-state-changed", &cloned);
    Ok(true)
}

/// Returns the current runtime state of the notch window.
pub fn get_notch_window_state() -> Result<NotchWindowState, String> {
    let state = NOTCH_STATE.lock().map_err(|e| e.to_string())?;
    Ok(state.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_notch_state_defaults() {
        let default_state = NotchWindowState::default();
        assert!(!default_state.is_visible);
        assert_eq!(default_state.width, 380);
        assert_eq!(default_state.height, 48);
        assert!(!default_state.is_expanded);
    }
}
