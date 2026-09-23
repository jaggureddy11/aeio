use tauri::Manager;
use tauri_plugin_global_shortcut::{Builder as GlobalShortcutBuilder, ShortcutState};

pub mod commands;
pub mod memory;
pub mod tools;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let global_shortcut_plugin = GlobalShortcutBuilder::new()
        .with_shortcut("CmdOrCtrl+Shift+Space")
        .expect("Failed to parse shortcut CmdOrCtrl+Shift+Space")
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if let Some(window) = app.get_webview_window("main") {
                    let is_visible = window.is_visible().unwrap_or(false);
                    if is_visible {
                        let _ = window.hide();
                    } else {
                        let _ = window.center();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(global_shortcut_plugin)
        .invoke_handler(tauri::generate_handler![greet, commands::ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

