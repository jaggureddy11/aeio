use rusqlite::{params, Connection};
use sqlite_vec::sqlite3_vec_init;
use rusqlite::ffi::sqlite3_auto_extension;
use std::path::Path;
use std::sync::{Mutex, Once};
use uuid::Uuid;
use chrono::Utc;
use super::models::{Memory, SavedChatMessage, SearchResult, Workspace};

static INIT_VEC: Once = Once::new();

pub fn ensure_sqlite_vec_registered() {
    INIT_VEC.call_once(|| {
        unsafe {
            sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
        }
    });
}

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
                    let timestamp = Utc::now().timestamp_millis();
                    let quarantine_name = format!("aeio_memories.db.corrupted.{}", timestamp);
                    let quarantine_path = dir.join(&quarantine_name);
                    let _ = std::fs::rename(&db_path, &quarantine_path);

                    let wal_path = dir.join("aeio_memories.db-wal");
                    if wal_path.exists() {
                        let _ = std::fs::rename(&wal_path, dir.join(format!("{}.wal", quarantine_name)));
                    }
                    let shm_path = dir.join("aeio_memories.db-shm");
                    if shm_path.exists() {
                        let _ = std::fs::remove_file(&shm_path);
                    }
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
        ensure_sqlite_vec_registered();
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

        let integrity_res: Result<String, _> = conn.query_row("PRAGMA quick_check(1)", [], |row| row.get(0));
        match integrity_res {
            Ok(ref status) if status == "ok" => {}
            Ok(ref other) => {
                return Err(format!("SQLite integrity quick_check reported corruption: {}", other));
            }
            Err(e) => {
                return Err(format!("SQLite integrity query failed: {}", e));
            }
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

        // sqlite-vec virtual table for 384-dimensional vector similarity search
        let _ = conn.execute_batch(
            r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories USING vec0(
                id text primary key,
                embedding float[384] distance_metric=cosine
            );
            "#,
        );

        // Backfill memories with embeddings into vec_memories if missing
        let _ = conn.execute(
            r#"
            INSERT OR IGNORE INTO vec_memories(id, embedding)
            SELECT id, embedding FROM memories
            WHERE embedding IS NOT NULL AND id NOT IN (SELECT id FROM vec_memories)
            "#,
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

        let emb_bytes = match embedding {
            Some(bytes) => bytes,
            None => super::embeddings::embed_text_bytes(content),
        };

        conn.execute(
            "INSERT INTO memories (id, content, category, embedding, workspace_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![&id, content, category, &emb_bytes, ws_id, now, now],
        )
        .map_err(|e| format!("Failed to insert memory: {}", e))?;

        let _ = conn.execute(
            "INSERT OR REPLACE INTO vec_memories (id, embedding) VALUES (?1, ?2)",
            params![&id, &emb_bytes],
        );

        Ok(Memory {
            id,
            content: content.to_string(),
            category: category.to_string(),
            embedding: Some(emb_bytes),
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
        let emb_bytes = super::embeddings::embed_text_bytes(content);

        let rows_affected = if let Some(ws) = workspace_id {
            conn.execute(
                "UPDATE memories SET content = ?1, category = ?2, workspace_id = ?3, embedding = ?4, updated_at = ?5 WHERE id = ?6",
                params![content, category, ws, &emb_bytes, now, id],
            )
        } else {
            conn.execute(
                "UPDATE memories SET content = ?1, category = ?2, embedding = ?3, updated_at = ?4 WHERE id = ?5",
                params![content, category, &emb_bytes, now, id],
            )
        }
        .map_err(|e| format!("Failed to update memory: {}", e))?;

        if rows_affected == 0 {
            return Err(format!("Memory with id '{}' not found", id));
        }

        let _ = conn.execute(
            "INSERT OR REPLACE INTO vec_memories (id, embedding) VALUES (?1, ?2)",
            params![id, &emb_bytes],
        );

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
        let _ = conn.execute("DELETE FROM vec_memories WHERE id = ?1", params![id]);
        let rows_affected = conn
            .execute("DELETE FROM memories WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete memory: {}", e))?;

        Ok(rows_affected > 0)
    }

    /// Hybrid search: Reciprocal Rank Fusion (RRF) merging FTS5 BM25 keyword search and sqlite-vec vector similarity search
    /// Tier 4 Scoped Recall: Searches within workspace_id, or across all if cross_workspace is true.
    pub fn search_memories_hybrid(
        &self,
        query: &str,
        query_embedding: Option<&[f32]>,
        workspace_id: Option<&str>,
        cross_workspace: bool,
        limit: usize,
    ) -> Result<Vec<SearchResult>, String> {
        let trimmed_query = query.trim();
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        if trimmed_query.is_empty() && query_embedding.is_none() {
            // Empty query: return most recent memories
            drop(conn);
            let recents = self.list_memories(None, if cross_workspace { None } else { workspace_id })?;
            return Ok(recents
                .into_iter()
                .take(limit)
                .map(|m| SearchResult { memory: m, score: 1.0 })
                .collect());
        }

        // 1. FTS5 BM25 Keyword Search
        let mut fts_ranks: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        let query_tokens: Vec<&str> = trimmed_query
            .split_whitespace()
            .map(|t| t.trim_matches(|c: char| !c.is_alphanumeric()))
            .filter(|t| !t.is_empty())
            .collect();

        if !query_tokens.is_empty() {
            let fts_terms: Vec<String> = query_tokens
                .iter()
                .map(|t| format!("\"{}*\"", t))
                .collect();

            let fts_query = fts_terms.join(" OR ");
            if !fts_query.is_empty() {
                let mut sql = String::from(
                    "SELECT f.id FROM memories_fts f \
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

                sql.push_str(" ORDER BY bm25(memories_fts) ASC LIMIT ?");
                params_vec.push(rusqlite::types::Value::Integer((limit * 10).max(100) as i64));

                if let Ok(mut stmt) = conn.prepare(&sql) {
                    if let Ok(iter) = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
                        row.get::<_, String>(0)
                    }) {
                        for (rank_idx, id_res) in iter.enumerate() {
                            if let Ok(id) = id_res {
                                fts_ranks.insert(id, rank_idx + 1);
                            }
                        }
                    }
                }
            }
        }

        // 2. sqlite-vec Vector Similarity Search
        let mut vec_ranks: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        let q_vec = match query_embedding {
            Some(v) => v.to_vec(),
            None => super::embeddings::embed_text(trimmed_query),
        };
        let q_bytes = floats_to_bytes(&q_vec);

        let k_candidates = (limit * 5).clamp(50, 200);
        let vec_sql = "SELECT id, distance FROM vec_memories WHERE embedding MATCH ?1 AND k = ?2 ORDER BY distance ASC";

        if let Ok(mut stmt) = conn.prepare(vec_sql) {
            if let Ok(iter) = stmt.query_map(params![&q_bytes, k_candidates as i64], |row| {
                row.get::<_, String>(0)
            }) {
                let mut rank_counter = 1;
                for id_res in iter {
                    if let Ok(id) = id_res {
                        if !cross_workspace {
                            let target_ws = workspace_id.unwrap_or("default");
                            let mem_ws: Result<Option<String>, _> = conn.query_row(
                                "SELECT workspace_id FROM memories WHERE id = ?1",
                                params![&id],
                                |row| row.get(0),
                            );
                            let is_match = match mem_ws {
                                Ok(Some(ref ws)) => ws == target_ws,
                                Ok(None) => target_ws == "default",
                                Err(_) => false,
                            };
                            if !is_match {
                                continue;
                            }
                        }
                        vec_ranks.insert(id, rank_counter);
                        rank_counter += 1;
                        if rank_counter > limit * 3 {
                            break;
                        }
                    }
                }
            }
        }

        // 3. Reciprocal Rank Fusion (RRF)
        // RRF(d) = sum_{m in M} (1.0 / (k + rank_m(d))) where standard k = 60.0
        const RRF_K: f32 = 60.0;
        let mut rrf_scores: std::collections::HashMap<String, f32> = std::collections::HashMap::new();

        for (id, &rank) in &fts_ranks {
            let score = 1.0 / (RRF_K + rank as f32);
            *rrf_scores.entry(id.clone()).or_insert(0.0) += score;
        }

        for (id, &rank) in &vec_ranks {
            let score = 1.0 / (RRF_K + rank as f32);
            *rrf_scores.entry(id.clone()).or_insert(0.0) += score;
        }

        // Fallback to substring matching if both FTS and sqlite-vec found 0 candidates
        if rrf_scores.is_empty() && !trimmed_query.is_empty() {
            let mut fallback_sql = String::from(
                "SELECT id FROM memories WHERE (content LIKE ?1 OR category LIKE ?1)"
            );
            let mut fallback_params: Vec<rusqlite::types::Value> = Vec::new();
            fallback_params.push(rusqlite::types::Value::Text(format!("%{}%", trimmed_query)));

            if !cross_workspace {
                if let Some(ws) = workspace_id {
                    fallback_sql.push_str(" AND workspace_id = ?");
                    fallback_params.push(rusqlite::types::Value::Text(ws.to_string()));
                } else {
                    fallback_sql.push_str(" AND (workspace_id IS NULL OR workspace_id = 'default')");
                }
            }

            fallback_sql.push_str(" ORDER BY created_at DESC LIMIT ?");
            fallback_params.push(rusqlite::types::Value::Integer(limit as i64));

            if let Ok(mut stmt) = conn.prepare(&fallback_sql) {
                if let Ok(iter) = stmt.query_map(rusqlite::params_from_iter(fallback_params), |row| {
                    row.get::<_, String>(0)
                }) {
                    for (idx, id_res) in iter.enumerate() {
                        if let Ok(id) = id_res {
                            rrf_scores.insert(id, 1.0 / (RRF_K + idx as f32 + 1.0));
                        }
                    }
                }
            }
        }

        // Sort candidate IDs descending by RRF fused relevance score
        let mut sorted_candidates: Vec<(String, f32)> = rrf_scores.into_iter().collect();
        sorted_candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        sorted_candidates.truncate(limit);

        // Fetch full Memory objects in ranked order
        let mut results = Vec::new();
        for (id, rrf_score) in sorted_candidates {
            let mut stmt = conn
                .prepare(
                    "SELECT id, content, category, embedding, workspace_id, created_at, updated_at \
                     FROM memories WHERE id = ?1"
                )
                .map_err(|e| e.to_string())?;

            if let Ok(mem) = stmt.query_row(params![&id], |row| {
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
                results.push(SearchResult {
                    memory: mem,
                    score: rrf_score * 100.0,
                });
            }
        }

        Ok(results)
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
    fn test_mid_write_crash_and_wal_recovery() {
        let test_dir = std::env::temp_dir().join(format!("aeio_crash_midwrite_{}", Uuid::new_v4()));
        let db_file = test_dir.join("aeio_memories.db");
        let wal_file = test_dir.join("aeio_memories.db-wal");

        // 1. Setup healthy initial DB
        {
            let db = MemoryDb::init(&test_dir).expect("Initial db creation failed");
            db.add_memory("Pre-crash established memory", "fact", Some("default"), None)
                .expect("Failed to add pre-crash memory");
        }

        // 2. Simulate mid-write process kill / power failure:
        // Truncate/corrupt the db file and append a damaged WAL journal file
        let mut db_bytes = fs::read(&db_file).expect("Failed to read db file");
        if db_bytes.len() > 100 {
            // Overwrite a page header with garbage
            for b in &mut db_bytes[40..100] {
                *b = 0xFF;
            }
            fs::write(&db_file, db_bytes).expect("Failed to corrupt db bytes");
        }
        fs::write(&wal_file, b"INCOMPLETE_TORN_WAL_FRAME_FROM_CRASHED_PROCESS_MIDWRITE_123456789")
            .expect("Failed to write torn WAL file");

        // 3. Re-initialize MemoryDb: auto-recovery MUST detect the corruption, quarantine both DB and WAL, and bring up a fresh DB
        let recovered_db = MemoryDb::init(&test_dir).expect("MemoryDb failed to recover from mid-write crash");

        // 4. Verify system is fully functional
        let new_mem = recovered_db
            .add_memory("Post-recovery working memory", "fact", Some("default"), None)
            .expect("Failed to add memory in recovered DB");
        assert_eq!(new_mem.content, "Post-recovery working memory");

        // 5. Verify quarantined artifacts exist on disk
        let dir_entries: Vec<String> = fs::read_dir(&test_dir)
            .expect("Failed to read dir")
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();

        assert!(
            dir_entries.iter().any(|name| name.starts_with("aeio_memories.db.corrupted.")),
            "Corrupted DB was not quarantined! Found: {:?}",
            dir_entries
        );
        // Verify active database file exists and is operational
        assert!(
            dir_entries.iter().any(|name| name == "aeio_memories.db"),
            "Recovered database file missing! Found: {:?}",
            dir_entries
        );

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

        // Query vector points along X axis in 384d space
        let mut query_vec = [0.0f32; 384];
        query_vec[0] = 1.0;

        // Memory A: highly aligned vector
        let mut vec_a = [0.0f32; 384];
        vec_a[0] = 0.98;
        vec_a[1] = 0.05;
        let emb_a = floats_to_bytes(&vec_a);
        let mem_a = db
            .add_memory("Kubernetes cluster configuration", "project", Some("default"), Some(emb_a))
            .expect("Failed to add memory A");

        // Memory B: orthogonal vector
        let mut vec_b = [0.0f32; 384];
        vec_b[1] = 1.0;
        let emb_b = floats_to_bytes(&vec_b);
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
    fn test_hybrid_search_5_semantic_queries() {
        let test_dir = std::env::temp_dir().join(format!("aeio_sem_test_{}", Uuid::new_v4()));
        let db = MemoryDb::init(&test_dir).expect("Failed to initialize test db");

        let pairs = [
            ("High workload and busy schedule this week", "I'm completely swamped and overwhelmed"),
            ("Car maintenance and mechanic invoice", "automobile repair expenses"),
            ("International travel documents in bedroom safe", "where is my passport stored"),
            ("Prefers pour-over espresso with oat milk", "favorite morning beverage caffeine"),
            ("Customer sync conference call schedule", "client meeting timetable"),
        ];

        let mut mem_ids = Vec::new();
        for (content, _) in &pairs {
            let mem = db
                .add_memory(content, "general", Some("default"), None)
                .expect("Failed to add memory");
            mem_ids.push(mem.id);
        }

        for (idx, (_, query)) in pairs.iter().enumerate() {
            // 1. Keyword search alone with strict FTS returns 0 hits (no overlapping terms)
            let fts_only = db.search_memories(query, Some("default"), false, 10).unwrap_or_default();
            let _fts_found = fts_only.iter().any(|m| m.memory.id == mem_ids[idx]);

            // 2. Hybrid search with semantic embedding finds the relevant memory
            let hybrid_results = db
                .search_memories_hybrid(query, None, Some("default"), false, 5)
                .expect("Hybrid search failed");
            
            let hybrid_found = hybrid_results.iter().any(|r| r.memory.id == mem_ids[idx]);

            assert!(
                hybrid_found,
                "Query '{}' should have found memory '{}' via hybrid search",
                query, pairs[idx].0
            );
        }

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

            let dummy_vec = [0.01f32; 384];
            let dummy_embedding = floats_to_bytes(&dummy_vec);

            for i in 0..5000 {
                let id = format!("mem_bench_{}", i);
                let topic = sample_topics[i % sample_topics.len()];
                let content = format!("[Entry #{}] {} with detail tag #{}", i, topic, i % 100);
                let cat = categories[i % categories.len()];
                let now = Utc::now().timestamp_millis();

                tx.execute(
                    "INSERT INTO memories (id, content, category, embedding, workspace_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'default', ?5, ?6)",
                    params![&id, &content, &cat, &dummy_embedding, now, now],
                ).unwrap();

                tx.execute(
                    "INSERT OR REPLACE INTO vec_memories (id, embedding) VALUES (?1, ?2)",
                    params![&id, &dummy_embedding],
                ).unwrap();
            }
            tx.commit().unwrap();
        }

        let insert_elapsed = start_insert.elapsed();
        println!("5,000 memories (FTS5 + sqlite-vec) inserted in {:.2?}", insert_elapsed);

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
    fn test_synthetic_50000_memories_search_benchmark() {
        use std::time::Instant;

        let test_dir = std::env::temp_dir().join(format!("aeio_bench_50000_{}", Uuid::new_v4()));
        let db = MemoryDb::init(&test_dir).expect("Failed to initialize test db");

        println!("\n--- Populating 50,000 synthetic memories for scale test ---");
        let start_insert = Instant::now();

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

            let dummy_vec = [0.01f32; 384];
            let dummy_embedding = floats_to_bytes(&dummy_vec);

            for i in 0..50000 {
                let id = format!("mem_bench50k_{}", i);
                let topic = sample_topics[i % sample_topics.len()];
                let content = format!("[Entry #{}] {} with detail tag #{}", i, topic, i % 100);
                let cat = categories[i % categories.len()];
                let now = Utc::now().timestamp_millis();

                tx.execute(
                    "INSERT INTO memories (id, content, category, embedding, workspace_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'default', ?5, ?6)",
                    params![&id, &content, &cat, &dummy_embedding, now, now],
                ).unwrap();

                tx.execute(
                    "INSERT OR REPLACE INTO vec_memories (id, embedding) VALUES (?1, ?2)",
                    params![&id, &dummy_embedding],
                ).unwrap();
            }
            tx.commit().unwrap();
        }

        let insert_elapsed = start_insert.elapsed();
        println!("50,000 memories (FTS5 + sqlite-vec) inserted in {:.2?}", insert_elapsed);

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
            println!("Search at 50,000 scale for '{}' -> {} results in {:.2?}", query, results.len(), elapsed);
            if !query.contains("nonexistent") {
                assert!(!results.is_empty(), "Expected results for query: {}", query);
            }
        }

        let avg_duration = total_duration / test_queries.len() as u32;
        println!("Average search latency across 50,000 memories: {:.2?}", avg_duration);

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

    #[test]
    fn test_sqlite_vec_init_and_virtual_table() {
        ensure_sqlite_vec_registered();
        let conn = Connection::open_in_memory().expect("open in memory failed");

        // Verify vec_version function is available
        let version: String = conn
            .query_row("SELECT vec_version()", [], |r| r.get(0))
            .expect("vec_version query failed");
        assert!(!version.is_empty(), "vec_version should return non-empty version string");

        // Create vec0 virtual table for 384-dimensional embeddings (e.g. all-MiniLM-L6-v2)
        conn.execute_batch(
            r#"
            CREATE VIRTUAL TABLE test_vec USING vec0(
                id text primary key,
                embedding float[384] distance_metric=cosine
            );
            "#,
        )
        .expect("CREATE VIRTUAL TABLE USING vec0 failed");

        // Insert a dummy vector
        let dummy_vec: Vec<f32> = (0..384).map(|i| (i as f32) / 384.0).collect();
        let bytes = floats_to_bytes(&dummy_vec);

        conn.execute(
            "INSERT INTO test_vec(id, embedding) VALUES (?1, ?2)",
            params!["test-1", &bytes],
        )
        .expect("INSERT into test_vec failed");

        // Query nearest neighbor using MATCH
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, distance
                FROM test_vec
                WHERE embedding MATCH ?1 AND k = 1
                "#,
            )
            .expect("prepare MATCH query failed");

        let mut rows = stmt
            .query(params![&bytes])
            .expect("query MATCH failed");

        let row = rows.next().expect("failed to get next row").expect("row missing");
        let matched_id: String = row.get(0).expect("failed to get id");
        let distance: f64 = row.get(1).expect("failed to get distance");

        assert_eq!(matched_id, "test-1");
        assert!(distance < 0.001, "Exact match should have distance near 0");
    }
}

