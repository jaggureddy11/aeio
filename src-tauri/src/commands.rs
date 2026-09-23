use tauri::State;
use crate::memory::{Memory, MemoryManager, SavedChatMessage, SearchResult};
use crate::tools::{self, FileMatch, ShellOutput};

#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}

// Memory Commands
#[tauri::command]
pub fn add_memory(
    state: State<MemoryManager>,
    content: String,
    category: String,
) -> Result<Memory, String> {
    state.db().add_memory(&content, &category, None)
}

#[tauri::command]
pub fn list_memories(
    state: State<MemoryManager>,
    category: Option<String>,
) -> Result<Vec<Memory>, String> {
    state.db().list_memories(category.as_deref())
}

#[tauri::command]
pub fn update_memory(
    state: State<MemoryManager>,
    id: String,
    content: String,
    category: String,
) -> Result<Memory, String> {
    state.db().update_memory(&id, &content, &category)
}

#[tauri::command]
pub fn delete_memory(state: State<MemoryManager>, id: String) -> Result<bool, String> {
    state.db().delete_memory(&id)
}

#[tauri::command]
pub fn search_memories(
    state: State<MemoryManager>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SearchResult>, String> {
    state.db().search_memories(&query, limit.unwrap_or(10))
}

#[tauri::command]
pub fn export_memories(
    state: State<MemoryManager>,
    format: String,
) -> Result<String, String> {
    state.db().export_memories(&format)
}

// Chat Persistence Commands (Tier 0: Chats survive app restarts)
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
    limit: Option<usize>,
) -> Result<Vec<SavedChatMessage>, String> {
    state.db().load_chat_messages(limit.unwrap_or(100))
}

#[tauri::command]
pub fn clear_chat_history(state: State<MemoryManager>) -> Result<(), String> {
    state.db().clear_chat_history()
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
