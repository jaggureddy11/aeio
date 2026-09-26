use keyring::Entry;

const SERVICE_NAME: &str = "com.aeio.assistant";

fn get_env_fallback(target: &str) -> Option<String> {
    let keys = match target.to_lowercase().as_str() {
        "claude" | "anthropic" => vec!["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
        "openai" => vec!["OPENAI_API_KEY"],
        "gemini" | "google" => vec!["GEMINI_API_KEY", "GOOGLE_API_KEY"],
        "hf" | "huggingface" => vec!["HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"],
        "grounding" | "uitars" => vec!["GROUNDING_API_KEY", "HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"],
        _ => vec![],
    };
    for key in keys {
        if let Ok(val) = std::env::var(key) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

pub fn get_api_key(target: &str) -> Result<String, String> {
    if let Ok(entry) = Entry::new(SERVICE_NAME, target) {
        if let Ok(pass) = entry.get_password() {
            if !pass.trim().is_empty() {
                return Ok(pass);
            }
        }
    }
    if let Some(env_val) = get_env_fallback(target) {
        return Ok(env_val);
    }
    Err("No matching entry found in secure storage or environment".to_string())
}

pub fn set_api_key(target: &str, key: &str) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, target).map_err(|e| e.to_string())?;
    entry.set_password(key).map_err(|e| e.to_string())
}

pub fn delete_api_key(target: &str) -> Result<bool, String> {
    let entry = Entry::new(SERVICE_NAME, target).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

pub fn has_api_key(target: &str) -> bool {
    if let Ok(entry) = Entry::new(SERVICE_NAME, target) {
        if let Ok(pass) = entry.get_password() {
            if !pass.trim().is_empty() {
                return true;
            }
        }
    }
    get_env_fallback(target).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keychain_roundtrip() {
        let target = "test_target_aeio";
        let key = "test_secret_12345";
        let set_res = set_api_key(target, key);
        println!("set_res: {:?}", set_res);
        assert!(set_res.is_ok());
        let get_res = get_api_key(target);
        println!("get_res: {:?}", get_res);
        assert_eq!(get_res.unwrap(), key);
        let del_res = delete_api_key(target);
        println!("del_res: {:?}", del_res);
        assert!(del_res.unwrap());
    }
}
