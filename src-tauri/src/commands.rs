use tauri::State;
use crate::memory::{Memory, MemoryManager, SavedChatMessage, SearchResult, Workspace};
use crate::tools::{self, FileMatch, ShellOutput};

#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}

// Workspace Commands (Tier 4: Project-scoped workspaces)
#[tauri::command]
pub fn list_workspaces(
    state: State<MemoryManager>,
    include_archived: Option<bool>,
) -> Result<Vec<Workspace>, String> {
    state.db().list_workspaces(include_archived.unwrap_or(false))
}

#[tauri::command]
pub fn create_workspace(
    state: State<MemoryManager>,
    name: String,
    icon: Option<String>,
    description: Option<String>,
) -> Result<Workspace, String> {
    state.db().create_workspace(&name, icon.as_deref(), description.as_deref())
}

#[tauri::command]
pub fn update_workspace(
    state: State<MemoryManager>,
    id: String,
    name: String,
    icon: Option<String>,
    description: Option<String>,
) -> Result<Workspace, String> {
    state.db().update_workspace(&id, &name, icon.as_deref(), description.as_deref())
}

#[tauri::command]
pub fn archive_workspace(
    state: State<MemoryManager>,
    id: String,
    archived: bool,
) -> Result<(), String> {
    state.db().archive_workspace(&id, archived)
}

#[tauri::command]
pub fn set_active_workspace(
    state: State<MemoryManager>,
    id: String,
) -> Result<(), String> {
    state.db().set_active_workspace(&id)
}

#[tauri::command]
pub fn get_active_workspace(
    state: State<MemoryManager>,
) -> Result<Workspace, String> {
    state.db().get_active_workspace()
}

// Memory Commands
#[tauri::command]
pub fn add_memory(
    state: State<MemoryManager>,
    content: String,
    category: String,
    workspace_id: Option<String>,
) -> Result<Memory, String> {
    state.db().add_memory(&content, &category, workspace_id.as_deref(), None)
}

#[tauri::command]
pub fn list_memories(
    state: State<MemoryManager>,
    category: Option<String>,
    workspace_id: Option<String>,
) -> Result<Vec<Memory>, String> {
    state.db().list_memories(category.as_deref(), workspace_id.as_deref())
}

#[tauri::command]
pub fn update_memory(
    state: State<MemoryManager>,
    id: String,
    content: String,
    category: String,
    workspace_id: Option<String>,
) -> Result<Memory, String> {
    state.db().update_memory(&id, &content, &category, workspace_id.as_deref())
}

#[tauri::command]
pub fn delete_memory(state: State<MemoryManager>, id: String) -> Result<bool, String> {
    state.db().delete_memory(&id)
}

#[tauri::command]
pub fn search_memories(
    state: State<MemoryManager>,
    query: String,
    workspace_id: Option<String>,
    cross_workspace: Option<bool>,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    state.db().search_memories(
        &query,
        workspace_id.as_deref(),
        cross_workspace.unwrap_or(false),
        limit.unwrap_or(10),
    )
}

#[tauri::command]
pub fn export_memories(
    state: State<MemoryManager>,
    format: String,
    workspace_id: Option<String>,
) -> Result<String, String> {
    state.db().export_memories(&format, workspace_id.as_deref())
}

// Chat Persistence Commands (Tier 0 & Tier 4: Scoped to workspace)
#[tauri::command]
pub fn save_chat_message(
    state: State<MemoryManager>,
    message: SavedChatMessage,
) -> Result<(), String> {
    state.db().save_chat_message(&message)
}

#[tauri::command]
pub fn load_chat_messages(
    state: State<MemoryManager>,
    workspace_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<SavedChatMessage>, String> {
    state.db().load_chat_messages(workspace_id.as_deref(), limit.unwrap_or(100))
}

#[tauri::command]
pub fn clear_chat_history(
    state: State<MemoryManager>,
    workspace_id: Option<String>,
) -> Result<(), String> {
    state.db().clear_chat_history(workspace_id.as_deref())
}

// Tool Commands
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    tools::read_file(&path)
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<String, String> {
    tools::write_file(&path, &content)
}

#[tauri::command]
pub fn search_files(dir: String, query: String) -> Result<Vec<FileMatch>, String> {
    tools::search_files(&dir, &query)
}

#[tauri::command]
pub fn read_clipboard() -> Result<String, String> {
    tools::read_clipboard()
}

#[tauri::command]
pub fn write_clipboard(text: String) -> Result<(), String> {
    tools::write_clipboard(&text)
}

#[tauri::command]
pub fn check_destructive_command(command: String) -> bool {
    tools::is_destructive_command(&command)
}

#[tauri::command]
pub fn run_shell_command(command: String, cwd: Option<String>) -> Result<ShellOutput, String> {
    tools::run_shell_command(&command, cwd.as_deref())
}

#[tauri::command]
pub fn open_target(target: String) -> Result<String, String> {
    tools::open_target(&target)
}

#[tauri::command]
pub fn get_active_window() -> Result<tools::ActiveWindowInfo, String> {
    tools::get_active_window()
}

// Secure Keychain Commands (Tier 0 & Tier 2: BYOK via OS Keychain)
#[tauri::command]
pub fn get_api_key(target: String) -> Result<String, String> {
    crate::keychain::get_api_key(&target)
}

#[tauri::command]
pub fn set_api_key(target: String, key: String) -> Result<(), String> {
    crate::keychain::set_api_key(&target, &key)
}

#[tauri::command]
pub fn delete_api_key(target: String) -> Result<bool, String> {
    crate::keychain::delete_api_key(&target)
}

#[tauri::command]
pub fn has_api_key(target: String) -> bool {
    crate::keychain::has_api_key(&target)
}

// Observability & Diagnostics Commands (Phase 4: Privacy-safe local error logging & opt-in telemetry)
#[tauri::command]
pub fn record_error(
    state: State<crate::observability::ErrorLogger>,
    error_name: String,
    message: String,
    stack: Option<String>,
    opt_in: bool,
    model_name: Option<String>,
) -> Result<Option<crate::observability::TelemetryPayload>, String> {
    state.record_error(&error_name, &message, stack.as_deref(), opt_in, model_name.as_deref())
}

#[tauri::command]
pub fn get_local_logs(
    state: State<crate::observability::ErrorLogger>,
) -> Result<String, String> {
    state.read_logs()
}

#[tauri::command]
pub fn get_telemetry_logs(
    state: State<crate::observability::ErrorLogger>,
) -> Result<String, String> {
    state.read_outbound_logs()
}

#[tauri::command]
pub fn clear_local_logs(
    state: State<crate::observability::ErrorLogger>,
) -> Result<(), String> {
    state.clear_logs()
}

// Computer Control Safety Commands (Phase 1-2: Allowlist & Risk Classification only)
#[tauri::command]
pub fn get_computer_control_settings() -> crate::safety::ComputerControlConfig {
    crate::safety::get_config()
}

#[tauri::command]
pub fn set_computer_control_enabled(enabled: bool) -> Result<(), String> {
    crate::safety::set_master_toggle(enabled);
    Ok(())
}

#[tauri::command]
pub fn add_to_computer_control_allowlist(
    bundle_id: String,
) -> Result<crate::safety::BundleValidationResult, String> {
    crate::safety::add_bundle_to_allowlist(&bundle_id)
}

#[tauri::command]
pub fn remove_from_computer_control_allowlist(bundle_id: String) -> Result<(), String> {
    crate::safety::remove_bundle_from_allowlist(&bundle_id);
    Ok(())
}

#[tauri::command]
pub fn classify_action_intent(
    intent: crate::safety::ActionIntent,
) -> Result<crate::safety::RiskLevel, String> {
    Ok(crate::safety::classify_action_risk(&intent))
}

// Kill Switch Commands (Phase 3: Emergency Stop)
#[tauri::command]
pub fn get_kill_switch_state() -> bool {
    crate::safety::is_halt_triggered()
}

#[tauri::command]
pub fn trigger_kill_switch(reason: Option<String>) -> Result<(), String> {
    crate::safety::trigger_kill_switch(&reason.unwrap_or_else(|| "Manual trigger from UI".to_string()));
    Ok(())
}

#[tauri::command]
pub fn reset_kill_switch() -> Result<(), String> {
    crate::safety::reset_kill_switch();
    Ok(())
}

// Active Overlay HUD Commands (Phase 4: Visible Active-Control HUD)
#[tauri::command]
pub fn show_control_overlay(
    app: tauri::AppHandle,
    target_app_name: String,
    target_app_bundle_id: String,
    declared_intent: String,
    current_step: u32,
    total_steps: u32,
) -> Result<crate::safety::ControlOverlayState, String> {
    Ok(crate::safety::show_overlay(
        Some(&app),
        &target_app_name,
        &target_app_bundle_id,
        &declared_intent,
        current_step,
        total_steps,
    ))
}

#[tauri::command]
pub fn update_control_overlay(
    app: tauri::AppHandle,
    target_app_name: Option<String>,
    declared_intent: Option<String>,
    current_step: Option<u32>,
    total_steps: Option<u32>,
) -> Result<crate::safety::ControlOverlayState, String> {
    Ok(crate::safety::update_overlay(
        Some(&app),
        target_app_name,
        declared_intent,
        current_step,
        total_steps,
    ))
}

#[tauri::command]
pub fn hide_control_overlay(
    app: tauri::AppHandle,
) -> Result<crate::safety::ControlOverlayState, String> {
    Ok(crate::safety::hide_overlay(Some(&app)))
}

#[tauri::command]
pub fn get_control_overlay_state() -> Result<crate::safety::ControlOverlayState, String> {
    Ok(crate::safety::get_overlay_state())
}

// Native Input Simulation Commands (Phase 5: In-process native driver via enigo)
#[tauri::command]
pub fn execute_computer_action(
    app: tauri::AppHandle,
    request: crate::safety::SimulatedActionRequest,
) -> Result<crate::safety::ActionResult, String> {
    crate::safety::execute_guarded_action(Some(&app), &request)
}

#[tauri::command]
pub fn capture_screen(output_path: String) -> Result<String, String> {
    crate::safety::capture_native_screenshot(std::path::Path::new(&output_path))
        .map(|p| p.to_string_lossy().to_string())
}

// Visual Audit Trail Commands (Phase 6: Full Visual Audit Trail & Immutable Receipts)
#[tauri::command]
pub fn execute_computer_action_with_audit(
    app: tauri::AppHandle,
    request: crate::safety::SimulatedActionRequest,
    session_id: String,
    window_title: Option<String>,
    grounding: Option<crate::safety::AuditGrounding>,
) -> Result<crate::safety::AuditReceipt, String> {
    crate::safety::execute_action_with_visual_audit(
        Some(&app),
        &request,
        &session_id,
        window_title,
        grounding,
    )
}

#[tauri::command]
pub fn list_audit_receipts(
    app: tauri::AppHandle,
    limit: Option<usize>,
) -> Result<Vec<crate::safety::AuditReceipt>, String> {
    let audit_dir = crate::safety::get_audit_dir(Some(&app));
    crate::safety::list_audit_receipts(&audit_dir, limit)
}

#[tauri::command]
pub fn get_audit_receipt(
    app: tauri::AppHandle,
    audit_id: String,
) -> Result<crate::safety::AuditReceipt, String> {
    let audit_dir = crate::safety::get_audit_dir(Some(&app));
    crate::safety::get_audit_receipt(&audit_dir, &audit_id)
}

