use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;
use uuid::Uuid;
use chrono::Utc;
use super::models::{Memory, SavedChatMessage, SearchResult};

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
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                category TEXT NOT NULL,
                embedding BLOB,
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
                timestamp INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
            "#,
        )
        .map_err(|e| format!("Failed to initialize database schema: {}", e))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn add_memory(
        &self,
        content: &str,
        category: &str,
        embedding: Option<Vec<u8>>,
    ) -> Result<Memory, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp_millis();

        conn.execute(
            "INSERT INTO memories (id, content, category, embedding, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![&id, content, category, &embedding, now, now],
        )
        .map_err(|e| format!("Failed to insert memory: {}", e))?;

        Ok(Memory {
            id,
            content: content.to_string(),
            category: category.to_string(),
            embedding,
            created_at: now,
            updated_at: now,
        })
    }

    pub fn list_memories(&self, category_filter: Option<&str>) -> Result<Vec<Memory>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut query = "SELECT id, content, category, embedding, created_at, updated_at FROM memories".to_string();
        
        if category_filter.is_some() {
            query.push_str(" WHERE category = ?1");
        }
        query.push_str(" ORDER BY created_at DESC");

        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        
        fn map_row(row: &rusqlite::Row) -> rusqlite::Result<Memory> {
            Ok(Memory {
                id: row.get(0)?,
                content: row.get(1)?,
                category: row.get(2)?,
                embedding: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        }

        let memory_iter = if let Some(cat) = category_filter {
            stmt.query_map(params![cat], map_row)
                .map_err(|e| e.to_string())?
        } else {
            stmt.query_map([], map_row)
                .map_err(|e| e.to_string())?
        };

        let mut result = Vec::new();
        for mem in memory_iter {
            result.push(mem.map_err(|e| e.to_string())?);
        }

        Ok(result)
    }

    pub fn update_memory(&self, id: &str, content: &str, category: &str) -> Result<Memory, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().timestamp_millis();

        let rows_affected = conn
            .execute(
                "UPDATE memories SET content = ?1, category = ?2, updated_at = ?3 WHERE id = ?4",
                params![content, category, now, id],
            )
            .map_err(|e| format!("Failed to update memory: {}", e))?;

        if rows_affected == 0 {
            return Err(format!("Memory with id '{}' not found", id));
        }

        // Return updated memory
        let mut stmt = conn
            .prepare("SELECT id, content, category, embedding, created_at, updated_at FROM memories WHERE id = ?1")
            .map_err(|e| e.to_string())?;

        stmt.query_row(params![id], |row| {
            Ok(Memory {
                id: row.get(0)?,
                content: row.get(1)?,
                category: row.get(2)?,
                embedding: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
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
    pub fn search_memories(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>, String> {
        let memories = self.list_memories(None)?;
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

    // Chat Message Persistence (Tier 0: Chats survive app restarts)
    pub fn save_chat_message(&self, msg: &SavedChatMessage) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            r#"
            INSERT OR REPLACE INTO chat_messages (
                id, role, content, recalled_memories_json, proposed_memories_json, tool_executions_json, timestamp
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                &msg.id,
                &msg.role,
                &msg.content,
                &msg.recalled_memories_json,
                &msg.proposed_memories_json,
                &msg.tool_executions_json,
                msg.timestamp,
            ],
        )
        .map_err(|e| format!("Failed to save chat message: {}", e))?;

        Ok(())
    }

    pub fn load_chat_messages(&self, limit: usize) -> Result<Vec<SavedChatMessage>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, role, content, recalled_memories_json, proposed_memories_json, tool_executions_json, timestamp
                FROM chat_messages
                ORDER BY timestamp ASC
                LIMIT ?1
                "#,
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(SavedChatMessage {
                    id: row.get(0)?,
                    role: row.get(1)?,
                    content: row.get(2)?,
                    recalled_memories_json: row.get(3)?,
                    proposed_memories_json: row.get(4)?,
                    tool_executions_json: row.get(5)?,
                    timestamp: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut messages = Vec::new();
        for r in rows {
            messages.push(r.map_err(|e| e.to_string())?);
        }

        Ok(messages)
    }

    pub fn clear_chat_history(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM chat_messages", params![])
            .map_err(|e| format!("Failed to clear chat history: {}", e))?;
        Ok(())
    }

    // Export Memories (Non-negotiable Constraint: Plain JSON/Markdown Export)
    pub fn export_memories(&self, format: &str) -> Result<String, String> {
        let all = self.list_memories(None)?;

        if format.eq_ignore_ascii_case("json") {
            serde_json::to_string_pretty(&all).map_err(|e| e.to_string())
        } else {
            // Markdown export
            let mut md = String::from("# Aeio Stored Memories\n\n");
            md.push_str(&format!("*Exported at: {}*\n\n", Utc::now().to_rfc3339()));

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
