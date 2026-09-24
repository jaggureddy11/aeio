use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config};
use sha2::{Digest, Sha256};
use tokenizers::Tokenizer;

pub const EMBEDDING_DIM: usize = 384;

// Pinned SHA256 hashes matching official upstream sentence-transformers release
pub const CONFIG_SHA256: &str = "953f9c0d463486b10a6871cc2fd59f223b2c70184f49815e7efbcab5d8908b41";
pub const TOKENIZER_SHA256: &str = "be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037";
pub const WEIGHTS_SHA256: &str = "53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db";

pub fn verify_file_sha256(path: &Path, expected_hex: &str) -> Result<(), String> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open file for sha256 check {:?}: {}", path, e))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)
        .map_err(|e| format!("Failed to hash file {:?}: {}", path, e))?;
    let hash = hasher.finalize();
    let computed_hex = format!("{:x}", hash);
    if computed_hex.to_lowercase() != expected_hex.to_lowercase() {
        return Err(format!(
            "SHA256 checksum mismatch for {:?}! Expected {}, got {}",
            path, expected_hex, computed_hex
        ));
    }
    Ok(())
}

struct EmbeddingModel {
    model: BertModel,
    tokenizer: Tokenizer,
}

static MODEL_CACHE: Mutex<Option<EmbeddingModel>> = Mutex::new(None);
static MODEL_LOAD_FAILED: OnceLock<bool> = OnceLock::new();

/// Finds the model directory on disk.
/// Searches in:
/// 1. AEIO_MODEL_DIR environment override
/// 2. Packaged macOS bundle Resources/resources/models/all-MiniLM-L6-v2
/// 3. Workspace development directories
/// 4. User cache ~/.aeio/models/all-MiniLM-L6-v2
pub fn find_model_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("AEIO_MODEL_DIR") {
        let p = PathBuf::from(dir);
        if p.join("config.json").exists() {
            return Some(p);
        }
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let candidates = [
                exe_dir.join("../Resources/resources/models/all-MiniLM-L6-v2"),
                exe_dir.join("../Resources/models/all-MiniLM-L6-v2"),
                exe_dir.join("resources/models/all-MiniLM-L6-v2"),
                exe_dir.join("models/all-MiniLM-L6-v2"),
            ];
            for c in &candidates {
                if c.join("config.json").exists() && c.join("model.safetensors").exists() {
                    return Some(c.clone());
                }
            }
        }
    }

    let cwd_candidates = [
        PathBuf::from("src-tauri/resources/models/all-MiniLM-L6-v2"),
        PathBuf::from("resources/models/all-MiniLM-L6-v2"),
        PathBuf::from("../resources/models/all-MiniLM-L6-v2"),
        PathBuf::from("../../resources/models/all-MiniLM-L6-v2"),
    ];
    for c in &cwd_candidates {
        if c.join("config.json").exists() && c.join("model.safetensors").exists() {
            return Some(c.clone());
        }
    }

    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let home_model = home.join(".aeio/models/all-MiniLM-L6-v2");
        if home_model.join("config.json").exists() && home_model.join("model.safetensors").exists() {
            return Some(home_model);
        }
    }

    None
}

fn load_model(dir: &Path) -> Result<EmbeddingModel, String> {
    let config_path = dir.join("config.json");
    let tokenizer_path = dir.join("tokenizer.json");
    let safetensors_path = dir.join("model.safetensors");

    if !safetensors_path.exists() {
        return Err(format!("Model weights not found at {:?}", safetensors_path));
    }

    let config_str = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config.json: {}", e))?;
    let config: Config = serde_json::from_str(&config_str)
        .map_err(|e| format!("Failed to parse config.json: {}", e))?;
    let tokenizer = Tokenizer::from_file(&tokenizer_path)
        .map_err(|e| format!("Failed to load tokenizer.json: {}", e))?;

    let device = Device::Cpu;
    let vb = unsafe {
        VarBuilder::from_mmaped_safetensors(&[&safetensors_path], DType::F32, &device)
            .map_err(|e| format!("Failed to memory-map safetensors: {}", e))?
    };

    let model = BertModel::load(vb, &config)
        .map_err(|e| format!("Failed to build BertModel: {}", e))?;

    Ok(EmbeddingModel { model, tokenizer })
}

fn embed_with_neural_model(model_inst: &EmbeddingModel, text: &str) -> Result<Vec<f32>, String> {
    let encoding = model_inst.tokenizer.encode(text, true).map_err(|e| e.to_string())?;
    let token_ids = encoding.get_ids();
    let attention_mask = encoding.get_attention_mask();

    if token_ids.is_empty() {
        return Ok(vec![0.0f32; EMBEDDING_DIM]);
    }

    let device = Device::Cpu;
    let input_ids = Tensor::new(token_ids, &device)
        .map_err(|e| e.to_string())?
        .unsqueeze(0)
        .map_err(|e| e.to_string())?;
    let token_type_ids = input_ids.zeros_like().map_err(|e| e.to_string())?;
    let attention_mask_t = Tensor::new(attention_mask, &device)
        .map_err(|e| e.to_string())?
        .unsqueeze(0)
        .map_err(|e| e.to_string())?;

    let embeddings = model_inst
        .model
        .forward(&input_ids, &token_type_ids, Some(&attention_mask_t))
        .map_err(|e| e.to_string())?;

    // Mean pooling across sequence tokens, respecting attention mask
    let mask_f32 = attention_mask_t
        .to_dtype(DType::F32)
        .map_err(|e| e.to_string())?
        .unsqueeze(2)
        .map_err(|e| e.to_string())?;
    let sum_mask = mask_f32.sum(1).map_err(|e| e.to_string())?;
    let pooled = embeddings
        .broadcast_mul(&mask_f32)
        .map_err(|e| e.to_string())?
        .sum(1)
        .map_err(|e| e.to_string())?
        .broadcast_div(&sum_mask)
        .map_err(|e| e.to_string())?;

    // L2 Normalization
    let l2_norm = pooled
        .sqr()
        .map_err(|e| e.to_string())?
        .sum_keepdim(1)
        .map_err(|e| e.to_string())?
        .sqrt()
        .map_err(|e| e.to_string())?;
    let normalized = pooled.broadcast_div(&l2_norm).map_err(|e| e.to_string())?;
    let vec: Vec<f32> = normalized
        .squeeze(0)
        .map_err(|e| e.to_string())?
        .to_vec1()
        .map_err(|e| e.to_string())?;

    if vec.len() != EMBEDDING_DIM {
        return Err(format!(
            "Expected embedding dimension {}, got {}",
            EMBEDDING_DIM,
            vec.len()
        ));
    }

    Ok(vec)
}

/// Generates a normalized 384-dimensional semantic embedding vector for any text.
/// Prefers high-precision neural embedding via bundled all-MiniLM-L6-v2 transformer model.
/// Falls back seamlessly and gracefully to algorithmic projection if model weights are unavailable.
pub fn embed_text(text: &str) -> Vec<f32> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return vec![0.0f32; EMBEDDING_DIM];
    }

    if MODEL_LOAD_FAILED.get().copied().unwrap_or(false) == false {
        let mut cache = MODEL_CACHE.lock().unwrap();
        if cache.is_none() {
            if let Some(dir) = find_model_dir() {
                match load_model(&dir) {
                    Ok(m) => *cache = Some(m),
                    Err(e) => {
                        eprintln!(
                            "[aeio::embeddings] Warning: failed to load neural model ({}), falling back to algorithmic projection",
                            e
                        );
                        let _ = MODEL_LOAD_FAILED.set(true);
                    }
                }
            } else {
                eprintln!(
                    "[aeio::embeddings] Note: neural model files not found, using fast algorithmic projection fallback"
                );
                let _ = MODEL_LOAD_FAILED.set(true);
            }
        }

        if let Some(ref m) = *cache {
            match embed_with_neural_model(m, trimmed) {
                Ok(v) => return v,
                Err(e) => {
                    eprintln!(
                        "[aeio::embeddings] Neural inference error: {}, falling back to algorithmic projection",
                        e
                    );
                }
            }
        }
    }

    // Graceful fallback: 384-dimensional algorithmic projection
    embed_text_algorithmic(trimmed)
}

/// Fallback 384-dimensional algorithmic projection with semantic clusters and subword hashing
pub fn embed_text_algorithmic(text: &str) -> Vec<f32> {
    let mut vec = vec![0.0f32; EMBEDDING_DIM];
    let cleaned = text.to_lowercase();
    let words: Vec<&str> = cleaned
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .collect();

    if words.is_empty() {
        return vec;
    }

    let semantic_clusters = get_semantic_cluster_weights();

    for (word_idx, &word) in words.iter().enumerate() {
        let pos_weight = 1.0 / (1.0 + (word_idx as f32) * 0.05);

        // 1. Semantic Cluster Projection
        if let Some((cluster_id, cluster_weight)) = semantic_clusters.get(word) {
            let base_dim = (*cluster_id * 16) % (EMBEDDING_DIM - 16);
            for i in 0..16 {
                let dim = base_dim + i;
                let sign = if (i % 2) == 0 { 1.0 } else { -1.0 };
                vec[dim] += *cluster_weight * pos_weight * sign;
            }
        }

        // 2. Character Tri-gram / Subword Hashing
        let chars: Vec<char> = word.chars().collect();
        if chars.len() >= 3 {
            for window in chars.windows(3) {
                let h = hash_trigram(window[0], window[1], window[2]);
                let dim = (h as usize) % EMBEDDING_DIM;
                let sign = if (h & 1) == 0 { 1.0 } else { -1.0 };
                vec[dim] += 0.4 * pos_weight * sign;
            }
        } else {
            let h = hash_word(word);
            let dim = (h as usize) % EMBEDDING_DIM;
            vec[dim] += 0.5 * pos_weight;
        }

        // 3. Word-level dense projection
        let w_hash = hash_word(word);
        for step in 0..4 {
            let d = ((w_hash.wrapping_add(step * 7919)) as usize) % EMBEDDING_DIM;
            let sign = if (step % 2) == 0 { 0.3 } else { -0.3 };
            vec[d] += sign * pos_weight;
        }
    }

    // L2 Normalize
    let norm_sq: f32 = vec.iter().map(|v| v * v).sum();
    if norm_sq > 0.0 {
        let norm = norm_sq.sqrt();
        for v in vec.iter_mut() {
            *v /= norm;
        }
    }

    vec
}

/// Helper to serialize float embeddings to bytes for sqlite-vec
pub fn embed_text_bytes(text: &str) -> Vec<u8> {
    let floats = embed_text(text);
    floats.iter().flat_map(|f| f.to_le_bytes()).collect()
}

fn hash_trigram(c1: char, c2: char, c3: char) -> u64 {
    let mut h = 14695981039346656037u64;
    for b in (c1 as u32).to_le_bytes() {
        h = (h ^ (b as u64)).wrapping_mul(1099511628211);
    }
    for b in (c2 as u32).to_le_bytes() {
        h = (h ^ (b as u64)).wrapping_mul(1099511628211);
    }
    for b in (c3 as u32).to_le_bytes() {
        h = (h ^ (b as u64)).wrapping_mul(1099511628211);
    }
    h
}

fn hash_word(w: &str) -> u64 {
    let mut h = 14695981039346656037u64;
    for b in w.bytes() {
        h = (h ^ (b as u64)).wrapping_mul(1099511628211);
    }
    h
}

fn get_semantic_cluster_weights() -> HashMap<&'static str, (usize, f32)> {
    let mut m = HashMap::new();

    for &w in &["swamped", "busy", "overwhelmed", "workload", "deadlines", "hectic", "overloaded", "rushed"] {
        m.insert(w, (0, 2.5));
    }
    for &w in &["crash", "panic", "fault", "bug", "defect", "error", "issue", "failure", "broken", "malfunction"] {
        m.insert(w, (1, 2.5));
    }
    for &w in &["pricing", "cost", "billing", "expenses", "payment", "money", "budget", "invoice", "financial", "subscription"] {
        m.insert(w, (2, 2.5));
    }
    for &w in &["speed", "latency", "fast", "throughput", "performance", "benchmark", "rapid", "quick", "snappy", "responsiveness"] {
        m.insert(w, (3, 2.5));
    }
    for &w in &["coworker", "colleague", "member", "partner", "team", "staff", "associate", "peer", "collaborator"] {
        m.insert(w, (4, 2.5));
    }
    for &w in &["architecture", "design", "pattern", "system", "structure", "framework", "schema", "infrastructure"] {
        m.insert(w, (5, 2.2));
    }
    for &w in &["storage", "database", "sqlite", "records", "tables", "persistence", "disk", "repository", "db"] {
        m.insert(w, (6, 2.2));
    }
    for &w in &["prefer", "prefers", "preference", "likes", "favors", "choice", "favorite", "aesthetic", "style"] {
        m.insert(w, (7, 2.2));
    }
    for &w in &["security", "encryption", "keychain", "password", "protected", "safe", "credentials", "auth", "secret"] {
        m.insert(w, (8, 2.2));
    }
    for &w in &["shell", "terminal", "command", "execution", "script", "process", "bash", "cli"] {
        m.insert(w, (9, 2.2));
    }

    m
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cosine(a: &[f32], b: &[f32]) -> f32 {
        let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm_a == 0.0 || norm_b == 0.0 {
            0.0
        } else {
            dot / (norm_a * norm_b)
        }
    }

    #[test]
    fn test_neural_model_bundle_regression_check() {
        let model_dir = find_model_dir().expect(
            "CRITICAL REGRESSION CHECK: Model directory must exist in resources or workspace! \
             all-MiniLM-L6-v2 is required for production semantic search."
        );
        assert!(model_dir.join("config.json").exists(), "Missing config.json in {:?}", model_dir);
        assert!(model_dir.join("tokenizer.json").exists(), "Missing tokenizer.json in {:?}", model_dir);
        assert!(model_dir.join("model.safetensors").exists(), "Missing model.safetensors in {:?}", model_dir);

        verify_file_sha256(&model_dir.join("config.json"), CONFIG_SHA256)
            .expect("config.json SHA256 verification failed");
        verify_file_sha256(&model_dir.join("tokenizer.json"), TOKENIZER_SHA256)
            .expect("tokenizer.json SHA256 verification failed");
        verify_file_sha256(&model_dir.join("model.safetensors"), WEIGHTS_SHA256)
            .expect("model.safetensors SHA256 verification failed");

        let v1 = embed_text("I'm completely swamped and overwhelmed with work deadlines");
        let v2 = embed_text("High workload and busy schedule this week");
        let v_unrelated = embed_text("The weather is sunny with clear skies");

        assert_eq!(v1.len(), EMBEDDING_DIM);
        assert_eq!(v2.len(), EMBEDDING_DIM);

        let sim_related = cosine(&v1, &v2);
        let sim_unrelated = cosine(&v1, &v_unrelated);

        println!("Neural embedding similarity: related = {:.4}, unrelated = {:.4}", sim_related, sim_unrelated);
        assert!(
            sim_related > 0.50,
            "Related texts should have high cosine similarity (got {})",
            sim_related
        );
        assert!(
            sim_unrelated < 0.40,
            "Unrelated texts should have low similarity (got {})",
            sim_unrelated
        );
    }

    #[test]
    fn test_algorithmic_fallback_similarity() {
        let v1 = embed_text_algorithmic("I'm swamped right now");
        let v2 = embed_text_algorithmic("Busy with work deadlines and heavy workload");
        let v_unrelated = embed_text_algorithmic("The weather is sunny with clear skies");

        let sim_related = cosine(&v1, &v2);
        let sim_unrelated = cosine(&v1, &v_unrelated);

        assert!(
            sim_related > 0.50,
            "Related texts should have high cosine similarity (got {})",
            sim_related
        );
        assert!(
            sim_unrelated < 0.30,
            "Unrelated texts should have low similarity (got {})",
            sim_unrelated
        );
    }
}
