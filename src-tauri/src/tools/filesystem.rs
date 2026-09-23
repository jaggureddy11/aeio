use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMatch {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
}

pub fn read_file(path_str: &str) -> Result<String, String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err(format!("File does not exist: {}", path_str));
    }

    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        return Err(format!("Path is a directory, not a file: {}", path_str));
    }

    const MAX_READ_BYTES: u64 = 1_048_576; // 1 MB safe limit
    if metadata.len() > MAX_READ_BYTES {
        return Err(format!(
            "File size ({} bytes) exceeds 1MB limit for inline read",
            metadata.len()
        ));
    }

    fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))
}

pub fn search_files(dir_str: &str, query: &str) -> Result<Vec<FileMatch>, String> {
    let dir = Path::new(dir_str);
    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", dir_str));
    }
    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", dir_str));
    }

    let mut matches = Vec::new();
    let query_lower = query.to_lowercase();

    fn walk_dir(
        current: &Path,
        query_lower: &str,
        matches: &mut Vec<FileMatch>,
        depth: usize,
    ) {
        if depth > 4 || matches.len() >= 50 {
            return;
        }

        if let Ok(entries) = fs::read_dir(current) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                // Skip hidden folders
                if file_name.starts_with('.') {
                    continue;
                }

                let is_dir = path.is_dir();
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                let name_matches = file_name.to_lowercase().contains(query_lower);

                if query_lower.is_empty() || name_matches {
                    matches.push(FileMatch {
                        name: file_name,
                        path: path.to_string_lossy().to_string(),
                        is_dir,
                        size_bytes: size,
                    });
                }

                if is_dir {
                    walk_dir(&path, query_lower, matches, depth + 1);
                }
            }
        }
    }

    walk_dir(dir, &query_lower, &mut matches, 0);
    Ok(matches)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_file_nonexistent() {
        let res = read_file("/tmp/aeio_definitely_nonexistent_file_12345.txt");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("File does not exist"));
    }

    #[test]
    fn test_read_file_directory_rejected() {
        let res = read_file("/tmp");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Path is a directory"));
    }

    #[test]
    fn test_search_files_nonexistent_dir() {
        let res = search_files("/tmp/aeio_nonexistent_dir_98765", "test");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Directory does not exist"));
    }
}
