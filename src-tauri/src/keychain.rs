use keyring::Entry;

const SERVICE_NAME: &str = "com.aeio.assistant";

fn get_aws_cli_credentials() -> Option<(String, String, Option<String>)> {
    let home = std::env::var("HOME").unwrap_or_default();
    let local_bin = if !home.is_empty() {
        format!("{}/.local/bin/aws", home)
    } else {
        "/Users/apple/.local/bin/aws".to_string()
    };
    let candidates = [
        "aws",
        local_bin.as_str(),
        "/usr/local/bin/aws",
        "/opt/homebrew/bin/aws",
    ];

    for bin in candidates {
        let output = std::process::Command::new(bin)
            .args(["configure", "export-credentials"])
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                if let Ok(text) = String::from_utf8(out.stdout) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                        let ak = val.get("AccessKeyId").and_then(|v| v.as_str());
                        let sk = val.get("SecretAccessKey").and_then(|v| v.as_str());
                        let token = val.get("SessionToken").and_then(|v| v.as_str()).map(|s| s.to_string());
                        if let (Some(ak_str), Some(sk_str)) = (ak, sk) {
                            if !ak_str.trim().is_empty() && !sk_str.trim().is_empty() {
                                return Some((ak_str.trim().to_string(), sk_str.trim().to_string(), token));
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

fn get_env_fallback(target: &str) -> Option<String> {
    let lower = target.to_lowercase();

    // 1. Bedrock full JSON credentials
    if lower == "bedrock" {
        if let (Ok(ak), Ok(sk)) = (std::env::var("AWS_ACCESS_KEY_ID"), std::env::var("AWS_SECRET_ACCESS_KEY")) {
            if !ak.trim().is_empty() && !sk.trim().is_empty() {
                let token = std::env::var("AWS_SESSION_TOKEN").ok();
                let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "ap-southeast-2".to_string());
                let json = serde_json::json!({
                    "accessKeyId": ak.trim(),
                    "secretAccessKey": sk.trim(),
                    "sessionToken": token.as_deref(),
                    "region": region.trim()
                });
                return Some(json.to_string());
            }
        }
        if let Some((ak, sk, token)) = get_aws_cli_credentials() {
            let json = serde_json::json!({
                "accessKeyId": ak,
                "secretAccessKey": sk,
                "sessionToken": token,
                "region": "ap-southeast-2"
            });
            return Some(json.to_string());
        }
        return None;
    }

    // 2. Individual Bedrock components
    if lower == "bedrock_access_key" {
        for key in ["AWS_ACCESS_KEY_ID", "AWS_ACCESS_KEY"] {
            if let Ok(val) = std::env::var(key) {
                let trimmed = val.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        if let Some((ak, _, _)) = get_aws_cli_credentials() {
            return Some(ak);
        }
    }

    if lower == "bedrock_secret_key" {
        for key in ["AWS_SECRET_ACCESS_KEY", "AWS_SECRET_KEY"] {
            if let Ok(val) = std::env::var(key) {
                let trimmed = val.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        if let Some((_, sk, _)) = get_aws_cli_credentials() {
            return Some(sk);
        }
    }

    if lower == "bedrock_session_token" {
        for key in ["AWS_SESSION_TOKEN", "AWS_SECURITY_TOKEN"] {
            if let Ok(val) = std::env::var(key) {
                let trimmed = val.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        if let Some((_, _, token)) = get_aws_cli_credentials() {
            return token;
        }
    }

    if lower == "bedrock_region" {
        for key in ["AWS_REGION", "AWS_DEFAULT_REGION"] {
            if let Ok(val) = std::env::var(key) {
                let trimmed = val.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
        return Some("ap-southeast-2".to_string());
    }

    // 3. Other third-party API providers
    let keys = match lower.as_str() {
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

    #[test]
    fn test_bedrock_resolution() {
        let res = get_api_key("bedrock");
        // Should resolve credentials if AWS is configured in the environment or CLI
        if let Ok(json_str) = res {
            assert!(json_str.contains("accessKeyId"));
            assert!(json_str.contains("secretAccessKey"));
            assert!(json_str.contains("region"));
        }
    }
}

