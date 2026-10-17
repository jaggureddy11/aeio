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

    #[cfg(target_os = "windows")]
    {
        let manifest_path = Path::new("windows/comctl-v6.manifest");
        if manifest_path.exists() {
            println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
            println!("cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}", manifest_path.display());
        }
    }

    tauri_build::build()
}
