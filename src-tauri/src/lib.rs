use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{Builder as GlobalShortcutBuilder, ShortcutState};

pub mod commands;
pub mod keychain;
pub mod memory;
pub mod observability;
pub mod safety;
pub mod system_one;
pub mod tools;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    let global_shortcut_plugin = GlobalShortcutBuilder::new()
        .with_shortcuts(["CmdOrCtrl+Shift+Space", "CmdOrCtrl+Shift+V", "CmdOrCtrl+Shift+O"])
        .expect("Failed to parse global shortcuts")
        .with_handler(|app, shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                let shortcut_str = shortcut.to_string();
                if shortcut_str.contains("Space") {
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
                } else if shortcut_str.contains("V") || shortcut_str.contains("KeyV") {
                    let _ = crate::tools::notch::toggle_notch_window(app);
                    let _ = app.emit("open-voice-hud", ());
                } else if shortcut_str.contains("O") || shortcut_str.contains("KeyO") {
                    let _ = app.emit("inspect-screen", ());
                }
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(global_shortcut_plugin)
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let memory_manager = memory::MemoryManager::new(&app_data_dir)?;
            app.manage(memory_manager);
            app.manage(observability::ErrorLogger::new());

            // Build Tray Menu items: Open Aeio, Settings, Quit
            let open_i = MenuItem::with_id(app, "open", "Open Aeio", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &settings_i, &quit_i])?;

            // Build Tray Icon (Event-driven OS callback with zero idle polling)
            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.center();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.center();
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.emit("open-settings", ());
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
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
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            #[cfg(target_os = "macos")]
            {
                tray_builder = tray_builder.icon_as_template(true);
            }

            let _tray = tray_builder.build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.center();
                let _ = window.show();
                let _ = window.set_focus();
            }

            // Register kill switch app handle and start native background listener
            crate::safety::register_kill_switch_app_handle(app.handle().clone());
            crate::safety::start_kill_switch_listener();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::ping,
            commands::add_memory,
            commands::list_memories,
            commands::update_memory,
            commands::delete_memory,
            commands::search_memories,
            commands::read_file,
            commands::write_file,
            commands::search_files,
            commands::read_clipboard,
            commands::write_clipboard,
            commands::check_destructive_command,
            commands::run_shell_command,
            commands::get_api_key,
            commands::set_api_key,
            commands::delete_api_key,
            commands::has_api_key,
            commands::save_chat_message,
            commands::load_chat_messages,
            commands::clear_chat_history,
            commands::export_memories,
            commands::list_workspaces,
            commands::create_workspace,
            commands::update_workspace,
            commands::archive_workspace,
            commands::set_active_workspace,
            commands::get_active_workspace,
            commands::open_target,
            commands::get_active_window,
            commands::record_error,
            commands::get_local_logs,
            commands::get_telemetry_logs,
            commands::clear_local_logs,
            commands::get_computer_control_settings,
            commands::set_computer_control_enabled,
            commands::add_to_computer_control_allowlist,
            commands::remove_from_computer_control_allowlist,
            commands::classify_action_intent,
            commands::get_kill_switch_state,
            commands::trigger_kill_switch,
            commands::reset_kill_switch,
            commands::show_control_overlay,
            commands::update_control_overlay,
            commands::hide_control_overlay,
            commands::get_control_overlay_state,
            commands::execute_computer_action,
            commands::capture_screen,
            commands::execute_computer_action_with_audit,
            commands::list_audit_receipts,
            commands::get_audit_receipt,
            commands::system_one_evaluate,
            commands::judge_command_risk,
            commands::classify_user_task,
            commands::rerank_memories,
            commands::capture_screen_data,
            commands::set_system_volume,
            commands::get_system_volume,
            commands::set_system_mute,
            commands::play_spotify,
            commands::media_control,
            commands::search_web_platform,
            commands::lock_screen,
            commands::inject_text_to_active_app,
            commands::capture_selected_text_from_active_app,
            commands::simulate_key_press,
            commands::simulate_scroll,
            commands::open_app,
            commands::get_system_status,
            commands::send_system_notification,
            commands::list_running_apps,
            commands::focus_app,
            commands::toggle_dark_mode,
            commands::speak_text,
            commands::stop_speaking,
            commands::play_system_earcon,
            commands::list_system_voices,
            commands::transcribe_audio_file,
            commands::transcribe_audio_buffer,
            commands::get_registered_hotkeys,
            commands::register_global_hotkey,
            commands::unregister_global_hotkey,
            commands::get_speech_engine_status,
            commands::spot_wake_word_in_audio,
            commands::show_notch_window,
            commands::hide_notch_window,
            commands::toggle_notch_window,
            commands::resize_notch_window,
            commands::get_notch_window_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


