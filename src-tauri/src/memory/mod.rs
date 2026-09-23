pub mod db;
pub mod models;

use std::path::Path;
use std::sync::Arc;
pub use db::MemoryDb;
pub use models::*;

#[derive(Clone)]
pub struct MemoryManager {
    db: Arc<MemoryDb>,
}

impl MemoryManager {
    pub fn new<P: AsRef<Path>>(data_dir: P) -> Result<Self, String> {
        let db = MemoryDb::init(data_dir)?;
        Ok(Self {
            db: Arc::new(db),
        })
    }

    pub fn db(&self) -> &MemoryDb {
        &self.db
    }
}
