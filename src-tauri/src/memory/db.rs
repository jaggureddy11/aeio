use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;
use uuid::Uuid;
use chrono::Utc;
use super::models::{Memory, SavedChatMessage, SearchResult, Workspace};

pub struct MemoryDb {
    conn: Mutex<Connection>,
}

impl MemoryDb {
    pub fn init<P: AsRef<Path>>(data_dir: P) -> Result<Self, String> {
        let dir = data_dir.as_ref();
        if !dir.exists() {
            std::fs::create_dir_all(dir).map_err(|e| format!("Failed to create data dir: {}", e))?;
        }

        let db_path = dir.join("aeio_memories.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open SQLite database at {:?}: {}", db_path, e))?;

        // Initialize schema
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT,
                description TEXT,
                is_active INTEGER NOT NULL DEFAULT 0,
                is_archived INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_workspaces_active ON workspaces(is_active);
            CREATE INDEX IF NOT EXISTS idx_workspaces_archived ON workspaces(is_archived);

            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                category TEXT NOT NULL,
                embedding BLOB,
                workspace_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
            CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                recalled_memories_json TEXT,
                proposed_memories_json TEXT,
                tool_executions_json TEXT,
                provider_info_json TEXT,
                workspace_id TEXT,
                timestamp INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
            "#,
        )
        .map_err(|e| format!("Failed to initialize database schema: {}", e))?;

        // Safe migrations for preexisting databases
        let _ = conn.execute("ALTER TABLE memories ADD COLUMN workspace_id TEXT", []);
        let _ = conn.execute("ALTER TABLE chat_messages ADD COLUMN workspace_id TEXT", []);
        let _ = conn.execute("ALTER TABLE chat_messages ADD COLUMN provider_info_json TEXT", []);

        // Safe indices after columns are guaranteed to exist
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id)", []);
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_workspace ON chat_messages(workspace_id)", []);

        // Seed default workspace if none exists
        let now = Utc::now().timestamp_millis();

        let _ = conn.execute(
            r#"
            INSERT OR IGNORE INTO workspaces (id, name, icon, description, is_active, is_archived, created_at, updated_at)
            VALUES ('default', 'General', '🌐', 'Default workspace for general conversations and notes', 1, 0, ?1, ?2)
            "#,
            params![now, now],
        );
        let _ = conn.execute("UPDATE memories SET workspace_id = 'default' WHERE workspace_id IS NULL", []);
        let _ = conn.execute("UPDATE chat_messages SET workspace_id = 'default' WHERE workspace_id IS NULL", []);

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }


    // Workspace Management (Tier 4: Project-scoped workspaces & archiving)
    pub fn list_workspaces(&self, include_archived: bool) -> Result<Vec<Workspace>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut query = "SELECT id, name, icon, description, is_active, is_archived, created_at, updated_at FROM workspaces".to_string();
        if !include_archived {
            query.push_str(" WHERE is_archived = 0");
        }
        query.push_str(" ORDER BY created_at ASC");

        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let is_active_int: i32 = row.get(4)?;
                let is_archived_int: i32 = row.get(5)?;
                Ok(Workspace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    icon: row.get(2)?,
                    description: row.get(3)?,
                    is_active: is_active_int != 0,
                    is_archived: is_archived_int != 0,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        Ok(list)
    }

    pub fn create_workspace(
        &self,
        name: &str,
        icon: Option<&str>,
        description: Option<&str>,
    ) -> Result<Workspace, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp_millis();
        let default_icon = icon.unwrap_or("📁");

        conn.execute(
            r#"
            INSERT INTO workspaces (id, name, icon, description, is_active, is_archived, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6)
            "#,
            params![&id, name, default_icon, description, now, now],
        )
        .map_err(|e| format!("Failed to create workspace: {}", e))?;

        Ok(Workspace {
            id,
            name: name.to_string(),
            icon: Some(default_icon.to_string()),
            description: description.map(|s| s.to_string()),
            is_active: false,
            is_archived: false,
            created_at: now,
            updated_at: now,
        })
    }

    pub fn update_workspace(
        &self,
        id: &str,
        name: &str,
        icon: Option<&str>,
        description: Option<&str>,
    ) -> Result<Workspace, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().timestamp_millis();

        conn.execute(
            r#"
            UPDATE workspaces
            SET name = ?1, icon = ?2, description = ?3, updated_at = ?4
            WHERE id = ?5
            "#,
            params![name, icon, description, now, id],
        )
        .map_err(|e| format!("Failed to update workspace: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, name, icon, description, is_active, is_archived, created_at, updated_at FROM workspaces WHERE id = ?1")
            .map_err(|e| e.to_string())?;

        stmt.query_row(params![id], |row| {
            let is_active_int: i32 = row.get(4)?;
            let is_archived_int: i32 = row.get(5)?;
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                description: row.get(3)?,
                is_active: is_active_int != 0,
                is_archived: is_archived_int != 0,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("Workspace not found: {}", e))
    }

    pub fn archive_workspace(&self, id: &str, archived: bool) -> Result<(), String> {
        if id == "default" && archived {
            return Err("Cannot archive the default workspace".to_string());
        }

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().timestamp_millis();
        let archived_int = if archived { 1 } else { 0 };

        conn.execute(
            "UPDATE workspaces SET is_archived = ?1, updated_at = ?2 WHERE id = ?3",
            params![archived_int, now, id],
        )
        .map_err(|e| format!("Failed to archive workspace: {}", e))?;

        // If the archived workspace was active, fallback to default
        if archived {
            let mut stmt = conn
                .prepare("SELECT is_active FROM workspaces WHERE id = ?1")
                .map_err(|e| e.to_string())?;
            let was_active: i32 = stmt
                .query_row(params![id], |r| r.get(0))
                .unwrap_or(0);

            if was_active == 1 {
                conn.execute("UPDATE workspaces SET is_active = 0 WHERE id = ?1", params![id]).ok();
                conn.execute("UPDATE workspaces SET is_active = 1 WHERE id = 'default'", []).ok();
            }
        }

        Ok(())
    }

    pub fn set_active_workspace(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE workspaces SET is_active = 0", [])
            .map_err(|e| format!("Failed to clear active workspaces: {}", e))?;
        let updated = conn
            .execute("UPDATE workspaces SET is_active = 1 WHERE id = ?1 AND is_archived = 0", params![id])
            .map_err(|e| format!("Failed to set active workspace: {}", e))?;
        if updated == 0 {
            return Err(format!("Workspace '{}' not found or is archived", id));
        }
        Ok(())
    }

    pub fn get_active_workspace(&self) -> Result<Workspace, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, name, icon, description, is_active, is_archived, created_at, updated_at
                FROM workspaces
                WHERE is_active = 1 AND is_archived = 0
                LIMIT 1
                "#,
            )
            .map_err(|e| e.to_string())?;

        let res = stmt.query_row([], |row| {
            let is_active_int: i32 = row.get(4)?;
            let is_archived_int: i32 = row.get(5)?;
            Ok(Workspace {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                description: row.get(3)?,
                is_active: is_active_int != 0,
                is_archived: is_archived_int != 0,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        });

        match res {
            Ok(ws) => Ok(ws),
            Err(_) => {
                // Fallback to default
                let mut fallback_stmt = conn
                    .prepare("SELECT id, name, icon, description, is_active, is_archived, created_at, updated_at FROM workspaces WHERE id = 'default'")
                    .map_err(|e| e.to_string())?;
                fallback_stmt
                    .query_row([], |row| {
                        Ok(Workspace {
                            id: row.get(0)?,
                            name: row.get(1)?,
                            icon: row.get(2)?,
                            description: row.get(3)?,
                            is_active: true,
                            is_archived: false,
                            created_at: row.get(6)?,
                            updated_at: row.get(7)?,
                        })
                    })
                    .map_err(|e| format!("Default workspace missing: {}", e))
            }
        }
    }

    // Memory Management (Tier 1 & Tier 4 Scoped Recall)
    pub fn add_memory(
        &self,
        content: &str,
        category: &str,
        workspace_id: Option<&str>,
        embedding: Option<Vec<u8>>,
    ) -> Result<Memory, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp_millis();
        let ws_id = workspace_id.unwrap_or("default");

        conn.execute(
            "INSERT INTO memories (id, content, category, embedding, workspace_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![&id, content, category, &embedding, ws_id, now, now],
        )
        .map_err(|e| format!("Failed to insert memory: {}", e))?;

        Ok(Memory {
            id,
            content: content.to_string(),
            category: category.to_string(),
            embedding,
            workspace_id: Some(ws_id.to_string()),
            created_at: now,
            updated_at: now,
        })
    }

    pub fn list_memories(
        &self,
        category_filter: Option<&str>,
        workspace_id: Option<&str>,
    ) -> Result<Vec<Memory>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut query = "SELECT id, content, category, embedding, workspace_id, created_at, updated_at FROM memories WHERE 1=1".to_string();
        let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(cat) = category_filter {
            query.push_str(" AND category = ?");
            params_vec.push(rusqlite::types::Value::Text(cat.to_string()));
        }

        if let Some(ws) = workspace_id {
            query.push_str(" AND workspace_id = ?");
            params_vec.push(rusqlite::types::Value::Text(ws.to_string()));
        }

        query.push_str(" ORDER BY created_at DESC");

        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        
        let memory_iter = stmt
            .query_map(rusqlite::params_from_iter(params_vec), |row| {
                Ok(Memory {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    category: row.get(2)?,
                    embedding: row.get(3)?,
                    workspace_id: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for mem in memory_iter {
            result.push(mem.map_err(|e| e.to_string())?);
        }

        Ok(result)
    }

    pub fn update_memory(
        &self,
        id: &str,
        content: &str,
        category: &str,
        workspace_id: Option<&str>,
    ) -> Result<Memory, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().timestamp_millis();

        let rows_affected = if let Some(ws) = workspace_id {
            conn.execute(
                "UPDATE memories SET content = ?1, category = ?2, workspace_id = ?3, updated_at = ?4 WHERE id = ?5",
                params![content, category, ws, now, id],
            )
        } else {
            conn.execute(
                "UPDATE memories SET content = ?1, category = ?2, updated_at = ?3 WHERE id = ?4",
                params![content, category, now, id],
            )
        }
        .map_err(|e| format!("Failed to update memory: {}", e))?;

        if rows_affected == 0 {
            return Err(format!("Memory with id '{}' not found", id));
        }

        let mut stmt = conn
            .prepare("SELECT id, content, category, embedding, workspace_id, created_at, updated_at FROM memories WHERE id = ?1")
            .map_err(|e| e.to_string())?;

        stmt.query_row(params![id], |row| {
            Ok(Memory {
                id: row.get(0)?,
                content: row.get(1)?,
                category: row.get(2)?,
                embedding: row.get(3)?,
                workspace_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("Failed to fetch updated memory: {}", e))
    }

    pub fn delete_memory(&self, id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let rows_affected = conn
            .execute("DELETE FROM memories WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete memory: {}", e))?;

        Ok(rows_affected > 0)
    }

    /// Hybrid search: Exact match, word boundary, and keyword relevance ranking
    /// Tier 4 Scoped Recall: Searches within workspace_id, or across all if cross_workspace is true.
    pub fn search_memories(
        &self,
        query: &str,
        workspace_id: Option<&str>,
        cross_workspace: bool,
        limit: usize,
    ) -> Result<Vec<SearchResult>, String> {
        let memories = if cross_workspace {
            self.list_memories(None, None)?
        } else {
            self.list_memories(None, workspace_id)?
        };

        let trimmed_query = query.trim().to_lowercase();

        if trimmed_query.is_empty() {
            return Ok(memories
                .into_iter()
                .take(limit)
                .map(|m| SearchResult { memory: m, score: 1.0 })
                .collect());
        }

        let query_tokens: Vec<&str> = trimmed_query.split_whitespace().collect();
        let mut scored_results: Vec<SearchResult> = Vec::new();

        for mem in memories {
            let content_lower = mem.content.to_lowercase();
            let mut score = 0.0f32;

            // 1. Exact phrase match gives highest boost
            if content_lower.contains(&trimmed_query) {
                score += 10.0;
            }

            // 2. Token matches
            let mut matched_tokens = 0;
            for token in &query_tokens {
                if content_lower.contains(token) {
                    matched_tokens += 1;
                    score += 2.0;
                }
            }

            // Category match bonus
            if query_tokens.iter().any(|&t| mem.category.to_lowercase().contains(t)) {
                score += 1.5;
            }

            if score > 0.0 {
                // Normalize by token coverage
                let coverage = matched_tokens as f32 / query_tokens.len().max(1) as f32;
                score += coverage * 3.0;

                scored_results.push(SearchResult {
                    memory: mem,
                    score,
                });
            }
        }

        // Sort descending by score
        scored_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        scored_results.truncate(limit);

        Ok(scored_results)
    }

    // Chat Message Persistence (Tier 0 & Tier 4: Scoped to workspace)
    pub fn save_chat_message(&self, msg: &SavedChatMessage) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let ws_id = msg.workspace_id.as_deref().unwrap_or("default");

        conn.execute(
            r#"
            INSERT OR REPLACE INTO chat_messages (
                id, role, content, recalled_memories_json, proposed_memories_json, tool_executions_json, provider_info_json, workspace_id, timestamp
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                &msg.id,
                &msg.role,
                &msg.content,
                &msg.recalled_memories_json,
                &msg.proposed_memories_json,
                &msg.tool_executions_json,
                &msg.provider_info_json,
                ws_id,
                msg.timestamp,
            ],
        )
        .map_err(|e| format!("Failed to save chat message: {}", e))?;

        Ok(())
    }

    pub fn load_chat_messages(
        &self,
        workspace_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<SavedChatMessage>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let ws_id = workspace_id.unwrap_or("default");

        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, role, content, recalled_memories_json, proposed_memories_json, tool_executions_json, provider_info_json, workspace_id, timestamp
                FROM chat_messages
                WHERE workspace_id = ?1
                ORDER BY timestamp ASC
                LIMIT ?2
                "#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![ws_id, limit as i64], |row| {
                Ok(SavedChatMessage {
                    id: row.get(0)?,
                    role: row.get(1)?,
                    content: row.get(2)?,
                    recalled_memories_json: row.get(3)?,
                    proposed_memories_json: row.get(4)?,
                    tool_executions_json: row.get(5)?,
                    provider_info_json: row.get(6)?,
                    workspace_id: row.get(7)?,
                    timestamp: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut messages = Vec::new();
        for r in rows {
            messages.push(r.map_err(|e| e.to_string())?);
        }

        Ok(messages)
    }

    pub fn clear_chat_history(&self, workspace_id: Option<&str>) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if let Some(ws) = workspace_id {
            conn.execute("DELETE FROM chat_messages WHERE workspace_id = ?1", params![ws])
                .map_err(|e| format!("Failed to clear chat history for workspace '{}': {}", ws, e))?;
        } else {
            conn.execute("DELETE FROM chat_messages", params![])
                .map_err(|e| format!("Failed to clear all chat history: {}", e))?;
        }
        Ok(())
    }

    // Export Memories (Non-negotiable Constraint: Plain JSON/Markdown Export, optional workspace filter)
    pub fn export_memories(&self, format: &str, workspace_id: Option<&str>) -> Result<String, String> {
        let all = self.list_memories(None, workspace_id)?;

        if format.eq_ignore_ascii_case("json") {
            serde_json::to_string_pretty(&all).map_err(|e| e.to_string())
        } else {
            // Markdown export
            let mut md = String::from("# Aeio Stored Memories\n\n");
            md.push_str(&format!("*Exported at: {}*\n", Utc::now().to_rfc3339()));
            if let Some(ws) = workspace_id {
                md.push_str(&format!("*Workspace Scope: {}*\n\n", ws));
            } else {
                md.push_str("*Workspace Scope: All Workspaces*\n\n");
            }

            let categories = ["fact", "preference", "project", "person"];
            for cat in categories {
                let cat_memories: Vec<&Memory> = all.iter().filter(|m| m.category == cat).collect();
                if !cat_memories.is_empty() {
                    let title = match cat {
                        "fact" => "Facts",
                        "preference" => "Preferences",
                        "project" => "Projects",
                        "person" => "People / Contacts",
                        _ => cat,
                    };
                    md.push_str(&format!("## {}\n\n", title));
                    for m in cat_memories {
                        md.push_str(&format!("- {}\n", m.content));
                    }
                    md.push('\n');
                }
            }

            Ok(md)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_memory_database_workflow() {
        let test_dir = std::env::temp_dir().join(format!("aeio_test_{}", Uuid::new_v4()));
        let db = MemoryDb::init(&test_dir).expect("Failed to initialize test db");

        // 1. Verify default workspace
        let active_ws = db.get_active_workspace().expect("Failed to get active workspace");
        assert_eq!(active_ws.id, "default");
        assert_eq!(active_ws.name, "General");

        // 2. Create custom workspace
        let ws = db
            .create_workspace("Research", Some("🔬"), Some("Deep research workspace"))
            .expect("Failed to create workspace");
        assert_eq!(ws.name, "Research");
        assert_eq!(ws.icon, Some("🔬".to_string()));

        // 3. Add memory to custom workspace
        let mem = db
            .add_memory("Primary researcher is Dr. Alice", "person", Some(&ws.id), None)
            .expect("Failed to add memory");
        assert_eq!(mem.category, "person");
        assert_eq!(mem.workspace_id, Some(ws.id.clone()));

        // 4. Search memory in workspace
        let results = db
            .search_memories("Alice", Some(&ws.id), false, 5)
            .expect("Failed to search memories");
        assert!(!results.is_empty());
        assert_eq!(results[0].memory.id, mem.id);

        // 5. Test JSON & Markdown export
        let json_export = db
            .export_memories("json", Some(&ws.id))
            .expect("Failed to export json");
        assert!(json_export.contains("Dr. Alice"));

        let md_export = db
            .export_memories("markdown", Some(&ws.id))
            .expect("Failed to export md");
        assert!(md_export.contains("Dr. Alice"));

        // 6. Test chat persistence
        let chat_msg = SavedChatMessage {
            id: "msg-123".to_string(),
            role: "user".to_string(),
            content: "Who is leading the research?".to_string(),
            recalled_memories_json: None,
            proposed_memories_json: None,
            tool_executions_json: None,
            provider_info_json: None,
            workspace_id: Some(ws.id.clone()),
            timestamp: 123456789,
        };
        db.save_chat_message(&chat_msg)
            .expect("Failed to save chat message");
        let loaded = db
            .load_chat_messages(Some(&ws.id), 10)
            .expect("Failed to load chat messages");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "msg-123");

        // Clean up test directory
        let _ = fs::remove_dir_all(test_dir);
    }
}

