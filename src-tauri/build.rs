use std::path::Path;

fn main() {
    let model_path = Path::new("resources/models/all-MiniLM-L6-v2/model.safetensors");
    if model_path.exists() {
        let meta = std::fs::metadata(model_path).expect("Failed to read model.safetensors metadata");
        if meta.len() != 90868376 {
            panic!(
                "BUILD INTEGRITY ERROR: model.safetensors size mismatch! Expected 90868376 bytes, found {} bytes. Run ./scripts/fetch-models.sh to re-fetch clean weights.",
                meta.len()
            );
        }
    }
    tauri_build::build()
}
