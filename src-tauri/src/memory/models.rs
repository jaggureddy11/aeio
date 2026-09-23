use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub description: Option<String>,
    pub is_active: bool,
    pub is_archived: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkspaceInput {
    pub name: String,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateWorkspaceInput {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub content: String,
    pub category: String, // "fact" | "preference" | "project" | "person"
    pub embedding: Option<Vec<u8>>,
    pub workspace_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMemoryInput {
    pub content: String,
    pub category: String,
    pub workspace_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateMemoryInput {
    pub id: String,
    pub content: String,
    pub category: String,
    pub workspace_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub memory: Memory,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub recalled_memories_json: Option<String>,
    pub proposed_memories_json: Option<String>,
    pub tool_executions_json: Option<String>,
    pub provider_info_json: Option<String>,
    pub workspace_id: Option<String>,
    pub timestamp: i64,
}

