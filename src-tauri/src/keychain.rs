use keyring::Entry;

const SERVICE_NAME: &str = "com.aeio.assistant";

pub fn get_api_key(target: &str) -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, target).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
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
        entry.get_password().is_ok()
    } else {
        false
    }
}
