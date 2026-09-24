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

        let conn = match Self::open_and_validate(&db_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!(
                    "[Aeio MemoryDb] Warning: Database at {:?} failed check ({}). Quarantining and recreating clean database...",
                    db_path, e
                );
                if db_path.exists() {
                    let quarantine_name = format!(
                        "aeio_memories.db.corrupted.{}",
                        Utc::now().timestamp_millis()
                    );
                    let quarantine_path = dir.join(quarantine_name);
                    let _ = std::fs::rename(&db_path, &quarantine_path);
                }
                Self::open_and_validate(&db_path).map_err(|err| {
                    format!("Failed to create clean SQLite database after quarantine: {}", err)
                })?
            }
        };

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn open_and_validate(db_path: &Path) -> Result<Connection, String> {
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open SQLite connection: {}", e))?;

        // Performance Optimization Pragmas for sub-millisecond cold start & queries
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -64000;
            PRAGMA mmap_size = 268435456;
            PRAGMA temp_store = MEMORY;
            "#,
        )
        .map_err(|e| format!("Failed to set performance pragmas: {}", e))?;

        // Fast schema verification without blocking whole-table scanning
        let check_res: Result<i64, _> = conn.query_row("PRAGMA schema_version", [], |row| row.get(0));
        if check_res.is_err() {
            return Err("SQLite schema verification failed".to_string());
        }

        Self::setup_schema(&conn).map_err(|e| format!("Failed to initialize schema: {}", e))?;

        Ok(conn)
    }

    fn setup_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
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
        )?;

        // Safe migrations for preexisting databases
        let _ = conn.execute("ALTER TABLE memories ADD COLUMN workspace_id TEXT", []);
        let _ = conn.execute("ALTER TABLE chat_messages ADD COLUMN workspace_id TEXT", []);
        let _ = conn.execute("ALTER TABLE chat_messages ADD COLUMN provider_info_json TEXT", []);

        // Safe indices after columns are guaranteed to exist
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id)",
            [],
        );
        let _ = conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_workspace ON chat_messages(workspace_id)",
            [],
        );

        // Seed default workspace if none exists
        let now = Utc::now().timestamp_millis();

        let _ = conn.execute(
            r#"
            INSERT OR IGNORE INTO workspaces (id, name, icon, description, is_active, is_archived, created_at, updated_at)
            VALUES ('default', 'General', 'layers', 'Default workspace for general conversations and notes', 1, 0, ?1, ?2)
            "#,
            params![now, now],
        );
        let _ = conn.execute(
            "UPDATE memories SET workspace_id = 'default' WHERE workspace_id IS NULL",
            [],
        );

        // FTS5 Full-Text Search index for sub-millisecond keyword and phrase queries at scale
        let _ = conn.execute_batch(
            r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
                id UNINDEXED,
                content,
                category,
                tokenize = 'porter unicode61'
            );

            CREATE TRIGGER IF NOT EXISTS trg_memories_ai AFTER INSERT ON memories BEGIN
                INSERT INTO memories_fts(id, content, category) VALUES (new.id, new.content, new.category);
            END;

            CREATE TRIGGER IF NOT EXISTS trg_memories_ad AFTER DELETE ON memories BEGIN
                DELETE FROM memories_fts WHERE id = old.id;
            END;

            CREATE TRIGGER IF NOT EXISTS trg_memories_au AFTER UPDATE ON memories BEGIN
                DELETE FROM memories_fts WHERE id = old.id;
                INSERT INTO memories_fts(id, content, category) VALUES (new.id, new.content, new.category);
            END;
            "#,
        );

        // Backfill any memories that haven't been indexed into FTS5
        let _ = conn.execute(
            "INSERT INTO memories_fts(id, content, category) SELECT m.id, m.content, m.category FROM memories m WHERE m.id NOT IN (SELECT id FROM memories_fts)",
            [],
        );
        let _ = conn.execute(
            "UPDATE chat_messages SET workspace_id = 'default' WHERE workspace_id IS NULL",
            [],
        );

        Ok(())
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
        let default_icon = icon.unwrap_or("folder");

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

    /// Hybrid search: Exact phrase, token match, and vector cosine similarity relevance ranking
    /// Tier 4 Scoped Recall: Searches within workspace_id, or across all if cross_workspace is true.
    pub fn search_memories_hybrid(
        &self,
        query: &str,
        query_embedding: Option<&[f32]>,
        workspace_id: Option<&str>,
        cross_workspace: bool,
        limit: usize,
    ) -> Result<Vec<SearchResult>, String> {
        let trimmed_query = query.trim().to_lowercase();
        let query_tokens: Vec<&str> = trimmed_query.split_whitespace().collect();

        // Optimized Candidate Selection:
        // Use FTS5 inverted index to find matching candidate memories in sub-millisecond time,
        // falling back to indexed SQL candidate query if FTS returns no rows or fails.
        let memories = if query_embedding.is_none() && !query_tokens.is_empty() {
            let conn = self.conn.lock().map_err(|e| e.to_string())?;

            // Prepare FTS5 query with alphanumeric tokens
            let fts_terms: Vec<String> = query_tokens
                .iter()
                .map(|t| {
                    let cleaned: String = t.chars().filter(|c| c.is_alphanumeric()).collect();
                    if cleaned.is_empty() {
                        String::new()
                    } else {
                        format!("\"{}*\"", cleaned)
                    }
                })
                .filter(|s| !s.is_empty())
                .collect();

            let fts_query = fts_terms.join(" OR ");
            let mut fts_candidates = Vec::new();

            if !fts_query.is_empty() {
                let mut sql = String::from(
                    "SELECT m.id, m.content, m.category, m.embedding, m.workspace_id, m.created_at, m.updated_at \
                     FROM memories_fts f \
                     JOIN memories m ON f.id = m.id \
                     WHERE memories_fts MATCH ?"
                );
                let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();
                params_vec.push(rusqlite::types::Value::Text(fts_query));

                if !cross_workspace {
                    if let Some(ws) = workspace_id {
                        sql.push_str(" AND m.workspace_id = ?");
                        params_vec.push(rusqlite::types::Value::Text(ws.to_string()));
                    } else {
                        sql.push_str(" AND (m.workspace_id IS NULL OR m.workspace_id = 'default')");
                    }
                }

                sql.push_str(" ORDER BY bm25(memories_fts) ASC, m.created_at DESC LIMIT ?");
                params_vec.push(rusqlite::types::Value::Integer((limit * 10).max(100) as i64));

                if let Ok(mut stmt) = conn.prepare(&sql) {
                    if let Ok(iter) = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
                        Ok(Memory {
                            id: row.get(0)?,
                            content: row.get(1)?,
                            category: row.get(2)?,
                            embedding: row.get(3)?,
                            workspace_id: row.get(4)?,
                            created_at: row.get(5)?,
                            updated_at: row.get(6)?,
                        })
                    }) {
                        for m in iter.flatten() {
                            fts_candidates.push(m);
                        }
                    }
                }
            }

            if !fts_candidates.is_empty() {
                fts_candidates
            } else {
                // If FTS returned 0 candidates, fallback to LIKE candidates or empty
                let mut sql = String::from(
                    "SELECT id, content, category, embedding, workspace_id, created_at, updated_at FROM memories WHERE ",
                );
                let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

                if !cross_workspace {
                    if let Some(ws) = workspace_id {
                        sql.push_str("workspace_id = ? AND (");
                        params_vec.push(rusqlite::types::Value::Text(ws.to_string()));
                    } else {
                        sql.push_str("(workspace_id IS NULL OR workspace_id = 'default') AND (");
                    }
                } else {
                    sql.push_str("(");
                }

                let mut conditions = Vec::new();
                conditions.push("content LIKE ?");
                params_vec.push(rusqlite::types::Value::Text(format!("%{}%", trimmed_query)));

                for token in &query_tokens {
                    conditions.push("content LIKE ?");
                    params_vec.push(rusqlite::types::Value::Text(format!("%{}%", token)));
                    conditions.push("category LIKE ?");
                    params_vec.push(rusqlite::types::Value::Text(format!("%{}%", token)));
                }

                sql.push_str(&conditions.join(" OR "));
                sql.push_str(") ORDER BY created_at DESC LIMIT ?");
                params_vec.push(rusqlite::types::Value::Integer((limit * 10).max(100) as i64));

                let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
                let iter = stmt
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

                let mut candidates = Vec::new();
                for m in iter {
                    candidates.push(m.map_err(|e| e.to_string())?);
                }
                candidates
            }
        } else if trimmed_query.is_empty() && query_embedding.is_none() {
            // Empty query with limit: query directly with SQL LIMIT
            let conn = self.conn.lock().map_err(|e| e.to_string())?;
            let mut sql = String::from(
                "SELECT id, content, category, embedding, workspace_id, created_at, updated_at FROM memories",
            );
            let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

            if !cross_workspace {
                if let Some(ws) = workspace_id {
                    sql.push_str(" WHERE workspace_id = ?");
                    params_vec.push(rusqlite::types::Value::Text(ws.to_string()));
                } else {
                    sql.push_str(" WHERE (workspace_id IS NULL OR workspace_id = 'default')");
                }
            }

            sql.push_str(" ORDER BY created_at DESC LIMIT ?");
            params_vec.push(rusqlite::types::Value::Integer(limit as i64));

            let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
            let iter = stmt
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

            let mut candidates = Vec::new();
            for m in iter {
                candidates.push(m.map_err(|e| e.to_string())?);
            }
            candidates
        } else if cross_workspace {
            self.list_memories(None, None)?
        } else {
            self.list_memories(None, workspace_id)?
        };

        let mut scored_results: Vec<SearchResult> = Vec::new();

        for mem in memories {
            let content_lower = mem.content.to_lowercase();
            let mut score = 0.0f32;

            // 1. Exact phrase match gives highest boost
            if !trimmed_query.is_empty() && content_lower.contains(&trimmed_query) {
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

            if matched_tokens > 0 {
                let coverage = matched_tokens as f32 / query_tokens.len().max(1) as f32;
                score += coverage * 3.0;
            }

            // 3. Vector embedding cosine similarity boost (Tier 1: Semantic Recall)
            if let (Some(q_emb), Some(mem_emb_bytes)) = (query_embedding, &mem.embedding) {
                let mem_emb = bytes_to_floats(mem_emb_bytes);
                let sim = cosine_similarity(q_emb, &mem_emb);
                // Normalize cosine similarity from [-1.0, 1.0] to [0.0, 1.0] and scale by 10.0
                let sim_score = ((sim + 1.0) / 2.0) * 10.0;
                if sim_score > 0.0 {
                    score += sim_score;
                }
            }

            if score > 0.0 || (trimmed_query.is_empty() && query_embedding.is_none()) {
                scored_results.push(SearchResult {
                    memory: mem,
                    score: if score == 0.0 { 1.0 } else { score },
                });
            }
        }

        // Sort descending by relevance score
        scored_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        scored_results.truncate(limit);

        Ok(scored_results)
    }

    pub fn search_memories(
        &self,
        query: &str,
        workspace_id: Option<&str>,
        cross_workspace: bool,
        limit: usize,
    ) -> Result<Vec<SearchResult>, String> {
        self.search_memories_hybrid(query, None, workspace_id, cross_workspace, limit)
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

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut norm_a = 0.0f32;
    let mut norm_b = 0.0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        norm_a += x * x;
        norm_b += y * y;
    }
    if norm_a <= 0.0 || norm_b <= 0.0 {
        return 0.0;
    }
    (dot / (norm_a.sqrt() * norm_b.sqrt())).clamp(-1.0, 1.0)
}

pub fn bytes_to_floats(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

pub fn floats_to_bytes(floats: &[f32]) -> Vec<u8> {
    floats
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect()
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
            .create_workspace("Research", Some("cpu"), Some("Deep research workspace"))
            .expect("Failed to create workspace");
        assert_eq!(ws.name, "Research");
        assert_eq!(ws.icon, Some("cpu".to_string()));

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

    #[test]
    fn test_corrupted_database_recovery() {
        let test_dir = std::env::temp_dir().join(format!("aeio_corrupt_test_{}", Uuid::new_v4()));
        let _ = fs::create_dir_all(&test_dir);
        let db_file = test_dir.join("aeio_memories.db");

        // Write corrupt garbage data into database file
        fs::write(&db_file, b"NOT_A_VALID_SQLITE_FILE_CORRUPTED_HEADER_DATA_1234567890")
            .expect("Failed to write corrupt test file");

        // MemoryDb::init must detect corruption, quarantine it, and recover cleanly
        let db = MemoryDb::init(&test_dir).expect("MemoryDb failed to recover from corrupted file");

        // Assert that the general workspace was seeded and functional
        let active = db.get_active_workspace().expect("Failed to get active workspace after recovery");
        assert_eq!(active.id, "default");
        assert_eq!(active.name, "General");

        // Assert that a quarantined file was preserved
        let entries: Vec<_> = fs::read_dir(&test_dir)
            .expect("Failed to read dir")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();

        assert!(
            entries.iter().any(|name| name.starts_with("aeio_memories.db.corrupted.")),
            "Expected quarantined corrupted file in test dir, found: {:?}",
            entries
        );

        // Clean up test directory
        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_memory_crud_complete() {
        let test_dir = std::env::temp_dir().join(format!("aeio_crud_test_{}", Uuid::new_v4()));
        let db = MemoryDb::init(&test_dir).expect("Failed to initialize test db");

        // 1. Create
        let mem = db
            .add_memory("Prefers concise terminal commands", "preference", Some("default"), None)
            .expect("Failed to create memory");
        assert_eq!(mem.content, "Prefers concise terminal commands");
        assert_eq!(mem.category, "preference");

        // 2. Read / List with category filter
        let prefs = db.list_memories(Some("preference"), Some("default")).expect("Failed to list");
        assert_eq!(prefs.len(), 1);
        assert_eq!(prefs[0].id, mem.id);

        let facts = db.list_memories(Some("fact"), Some("default")).expect("Failed to list");
        assert_eq!(facts.len(), 0);

        // 3. Update
        let updated = db
            .update_memory(&mem.id, "Prefers concise shell & CLI commands", "preference", Some("default"))
            .expect("Failed to update memory");
        assert_eq!(updated.content, "Prefers concise shell & CLI commands");

        // 4. Delete
        let deleted = db.delete_memory(&mem.id).expect("Failed to delete memory");
        assert!(deleted);

        // 5. Verify absent
        let after_delete = db.list_memories(None, Some("default")).expect("Failed to list");
        assert_eq!(after_delete.len(), 0);

        // Clean up
        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_vector_search_relevance_ranking() {
        let test_dir = std::env::temp_dir().join(format!("aeio_vector_test_{}", Uuid::new_v4()));
        let db = MemoryDb::init(&test_dir).expect("Failed to initialize test db");

        // Query vector points along X axis [1.0, 0.0]
        let query_vec: [f32; 2] = [1.0, 0.0];

        // Memory A: highly aligned vector [0.98, 0.05]
        let emb_a = floats_to_bytes(&[0.98, 0.05]);
        let mem_a = db
            .add_memory("Kubernetes cluster configuration", "project", Some("default"), Some(emb_a))
            .expect("Failed to add memory A");

        // Memory B: orthogonal vector [0.0, 1.0]
        let emb_b = floats_to_bytes(&[0.0, 1.0]);
        let mem_b = db
            .add_memory("Favorite coffee brew temperature", "preference", Some("default"), Some(emb_b))
            .expect("Failed to add memory B");

        // Search with query embedding
        let results = db
            .search_memories_hybrid("", Some(&query_vec), Some("default"), false, 10)
            .expect("Failed to search hybrid");

        assert_eq!(results.len(), 2);
        // Memory A must rank FIRST with higher relevance score than Memory B
        assert_eq!(results[0].memory.id, mem_a.id);
        assert_eq!(results[1].memory.id, mem_b.id);
        assert!(results[0].score > results[1].score);

        // Clean up
        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_workspace_isolation_backend() {
        let test_dir = std::env::temp_dir().join(format!("aeio_iso_test_{}", Uuid::new_v4()));
        let db = MemoryDb::init(&test_dir).expect("Failed to initialize test db");

        // Create Workspace A & Workspace B
        let ws_a = db.create_workspace("Work", None, None).expect("Failed to create ws A");
        let ws_b = db.create_workspace("Personal", None, None).expect("Failed to create ws B");

        // Add secret memory to Workspace A
        let mem_a = db
            .add_memory("Confidential Q4 financial report credentials", "project", Some(&ws_a.id), None)
            .expect("Failed to add mem A");

        // Add memory to Workspace B
        let mem_b = db
            .add_memory("Weekend hiking equipment packing list", "fact", Some(&ws_b.id), None)
            .expect("Failed to add mem B");

        // 1. Scoped search in Workspace B MUST NOT contain Workspace A memory
        let search_in_b = db
            .search_memories("financial credentials", Some(&ws_b.id), false, 10)
            .expect("Failed to search ws B");
        assert!(
            search_in_b.iter().all(|r| r.memory.id != mem_a.id),
            "Workspace A memory leaked into Workspace B search!"
        );

        // 2. Scoped search in Workspace A finds it
        let search_in_a = db
            .search_memories("financial credentials", Some(&ws_a.id), false, 10)
            .expect("Failed to search ws A");
        assert_eq!(search_in_a.len(), 1);
        assert_eq!(search_in_a[0].memory.id, mem_a.id);

        // 3. Cross-workspace search explicitly enabled surfaces both
        let cross_results = db
            .search_memories("equipment report", None, true, 10)
            .expect("Failed cross-workspace search");
        let found_ids: Vec<_> = cross_results.iter().map(|r| &r.memory.id).collect();
        assert!(found_ids.contains(&&mem_a.id));
        assert!(found_ids.contains(&&mem_b.id));

        // Clean up
        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_synthetic_5000_memories_search_benchmark() {
        use std::time::Instant;

        let test_dir = std::env::temp_dir().join(format!("aeio_bench_5000_{}", Uuid::new_v4()));
        let db = MemoryDb::init(&test_dir).expect("Failed to initialize test db");

        println!("\n--- Populating 5,000 synthetic memories ---");
        let start_insert = Instant::now();

        // Use transaction for fast bulk insertion
        {
            let mut conn = db.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            let categories = ["fact", "preference", "project", "person"];
            let sample_topics = [
                "PostgreSQL database connection pooling and timeout configurations",
                "Frontend typography scale using Inter and hairline borders",
                "AWS S3 bucket policy for cold-storage backups",
                "User preferred dark obsidian theme with terracotta accents",
                "Rust async runtime Tokio multi-threading concurrency patterns",
                "Docker container memory limit and CPU quota adjustments",
                "Kubernetes pod security standards and network isolation rules",
                "Qwen3-Coder local inference hyperparameter calibration",
                "TailwindCSS vs Vanilla CSS design tokens architectural review",
                "Personal contact: Alex Rivera senior devops engineer",
            ];

            let dummy_embedding = floats_to_bytes(&[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);

            for i in 0..5000 {
                let id = format!("mem_bench_{}", i);
                let topic = sample_topics[i % sample_topics.len()];
                let content = format!("[Entry #{}] {} with detail tag #{}", i, topic, i % 100);
                let cat = categories[i % categories.len()];
                let now = Utc::now().timestamp_millis();

                tx.execute(
                    "INSERT INTO memories (id, content, category, embedding, workspace_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'default', ?5, ?6)",
                    params![id, content, cat, dummy_embedding, now, now],
                ).unwrap();
            }
            tx.commit().unwrap();
        }

        let insert_elapsed = start_insert.elapsed();
        println!("5,000 memories inserted in {:.2?}", insert_elapsed);

        // Benchmark queries
        let test_queries = [
            "PostgreSQL database",
            "Qwen3-Coder local inference",
            "Alex Rivera senior devops",
            "hairline borders obsidian",
            "nonexistent random query term xyz123",
        ];

        let mut total_duration = std::time::Duration::ZERO;

        for query in &test_queries {
            let start_query = Instant::now();
            let results = db.search_memories(query, Some("default"), false, 10).expect("Search failed");
            let elapsed = start_query.elapsed();
            total_duration += elapsed;
            println!("Search for '{}' -> {} results in {:.2?}", query, results.len(), elapsed);
            if !query.contains("nonexistent") {
                assert!(!results.is_empty(), "Expected results for query: {}", query);
            }
        }

        let avg_duration = total_duration / test_queries.len() as u32;
        println!("Average search latency across 5,000 memories: {:.2?}", avg_duration);

        // Clean up
        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_export_memories_json_and_markdown_verification() {
        let test_dir = std::env::temp_dir().join(format!("aeio_export_test_{}", Uuid::new_v4()));
        let db = MemoryDb::init(&test_dir).expect("Failed to initialize test db");

        // Seed diverse test memories across all 4 core categories
        db.add_memory("Server runs Ubuntu 24.04 LTS on port 8080", "fact", Some("default"), None).unwrap();
        db.add_memory("Prefers concise responses with dark obsidian theme", "preference", Some("default"), None).unwrap();
        db.add_memory("Aeio desktop AI assistant production hardening track", "project", Some("default"), None).unwrap();
        db.add_memory("Sarah Chen lead database architect", "person", Some("default"), None).unwrap();

        // 1. Export JSON
        let json_output = db.export_memories("json", None).expect("JSON export failed");
        assert!(!json_output.is_empty());
        let parsed_json: serde_json::Value = serde_json::from_str(&json_output).expect("Invalid JSON export");
        let arr = parsed_json.as_array().expect("JSON root is not array");
        assert_eq!(arr.len(), 4);

        // 2. Export Markdown
        let md_output = db.export_memories("markdown", None).expect("Markdown export failed");
        assert!(md_output.contains("# Aeio Stored Memories"));
        assert!(md_output.contains("## Facts"));
        assert!(md_output.contains("- Server runs Ubuntu 24.04 LTS on port 8080"));
        assert!(md_output.contains("## Preferences"));
        assert!(md_output.contains("- Prefers concise responses with dark obsidian theme"));
        assert!(md_output.contains("## Projects"));
        assert!(md_output.contains("- Aeio desktop AI assistant production hardening track"));
        assert!(md_output.contains("## People / Contacts"));
        assert!(md_output.contains("- Sarah Chen lead database architect"));

        // Write verification files to disk to confirm physical file generation
        let json_path = test_dir.join("aeio-memories-export.json");
        let md_path = test_dir.join("aeio-memories-export.md");
        fs::write(&json_path, &json_output).expect("Failed to write json");
        fs::write(&md_path, &md_output).expect("Failed to write md");

        assert!(json_path.exists());
        assert!(md_path.exists());

        // Verify content from disk
        let disk_json = fs::read_to_string(&json_path).unwrap();
        let disk_md = fs::read_to_string(&md_path).unwrap();
        assert_eq!(disk_json, json_output);
        assert_eq!(disk_md, md_output);

        // Clean up
        let _ = fs::remove_dir_all(test_dir);
    }
}

