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

