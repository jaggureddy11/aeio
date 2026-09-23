use tauri::State;
use crate::memory::{Memory, MemoryManager, SearchResult};

#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}

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
