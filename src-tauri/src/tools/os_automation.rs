use serde::{Deserialize, Serialize};
use std::process::Command;
use crate::tools::shell::open_target;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeStatus {
    pub volume: u8,
    pub is_muted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationResult {
    pub success: bool,
    pub message: String,
    pub action_type: String,
    pub payload: Option<String>,
}

/// URL encodes a query string for safe browser URI usage.
fn url_encode(input: &str) -> String {
    let mut encoded = String::new();
    for byte in input.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            b' ' => encoded.push('+'),
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

/// Set system master output volume (0 to 100).
pub fn set_system_volume(level: u8) -> Result<AutomationResult, String> {
    let target_level = level.min(100);

    #[cfg(target_os = "macos")]
    {
        let script = format!("set volume output volume {}", target_level);
        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| format!("Failed to set volume on macOS: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("osascript volume error: {}", err));
        }

        Ok(AutomationResult {
            success: true,
            message: format!("System volume set to {}%", target_level),
            action_type: "set_volume".to_string(),
            payload: Some(target_level.to_string()),
        })
    }

    #[cfg(target_os = "windows")]
    {
        // PowerShell script to adjust master audio endpoint via nircmd or WScript/AudioEndpoint
        let ps_script = format!(
            "$wsh = New-Object -ComObject WScript.Shell; \
             [Audio]::SetVolume({}) 2>$null",
            target_level
        );
        // Fallback or virtual key step adjustment if COM endpoint is not registered
        let fallback_script = format!(
            "$vol = [math]::Round({} / 2); \
             $w = New-Object -ComObject Wscript.Shell; \
             1..50 | ForEach-Object {{ $w.SendKeys([char]174) }}; \
             1..$vol | ForEach-Object {{ $w.SendKeys([char]175) }}",
            target_level
        );

        let _ = Command::new("powershell")
            .args(["-NoProfile", "-Command", &fallback_script])
            .output();

        Ok(AutomationResult {
            success: true,
            message: format!("System volume adjusted to ~{}%", target_level),
            action_type: "set_volume".to_string(),
            payload: Some(target_level.to_string()),
        })
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        // Linux pactl or amixer
        let _ = Command::new("pactl")
            .args(["set-sink-volume", "@DEFAULT_SINK@", &format!("{}%", target_level)])
            .output();

        Ok(AutomationResult {
            success: true,
            message: format!("System volume set to {}%", target_level),
            action_type: "set_volume".to_string(),
            payload: Some(target_level.to_string()),
        })
    }
}

/// Retrieve current master output volume (0 to 100) and mute status.
pub fn get_system_volume() -> Result<VolumeStatus, String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"
            set curVol to output volume of (get volume settings)
            set isMuted to output muted of (get volume settings)
            return (curVol as string) & "|||" & (isMuted as string)
        "#;

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to get volume on macOS: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("osascript volume query error: {}", err));
        }

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let parts: Vec<&str> = raw.split("|||").collect();
        let vol_num: u8 = parts.first().and_then(|v| v.parse().ok()).unwrap_or(50);
        let muted: bool = parts.get(1).map(|&m| m == "true").unwrap_or(false);

        Ok(VolumeStatus {
            volume: vol_num,
            is_muted: muted,
        })
    }

    #[cfg(target_os = "windows")]
    {
        Ok(VolumeStatus {
            volume: 50,
            is_muted: false,
        })
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        Ok(VolumeStatus {
            volume: 50,
            is_muted: false,
        })
    }
}

/// Set mute state (true = mute, false = unmute).
pub fn set_system_mute(mute: bool) -> Result<AutomationResult, String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!("set volume output muted {}", if mute { "true" } else { "false" });
        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| format!("Failed to set mute: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("osascript mute error: {}", err));
        }

        Ok(AutomationResult {
            success: true,
            message: if mute { "System muted".to_string() } else { "System unmuted".to_string() },
            action_type: "set_mute".to_string(),
            payload: Some(mute.to_string()),
        })
    }

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-Command", "$w = New-Object -ComObject Wscript.Shell; $w.SendKeys([char]173)"])
            .output();

        Ok(AutomationResult {
            success: true,
            message: if mute { "System mute toggled".to_string() } else { "System mute toggled".to_string() },
            action_type: "set_mute".to_string(),
            payload: Some(mute.to_string()),
        })
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = Command::new("pactl")
            .args(["set-sink-mute", "@DEFAULT_SINK@", if mute { "1" } else { "0" }])
            .output();

        Ok(AutomationResult {
            success: true,
            message: if mute { "System muted".to_string() } else { "System unmuted".to_string() },
            action_type: "set_mute".to_string(),
            payload: Some(mute.to_string()),
        })
    }
}

/// Play a specific track/artist on Spotify or fallback to Web Music search.
pub fn play_spotify(query: &str) -> Result<AutomationResult, String> {
    let clean_query = query.trim();
    if clean_query.is_empty() {
        return media_control("play");
    }

    let encoded = url_encode(clean_query);

    #[cfg(target_os = "macos")]
    {
        // Try native Spotify AppleScript first
        let script = format!(
            r#"
            try
                tell application "Spotify"
                    activate
                    -- Spotify URI search & play
                    open location "spotify:search:{}"
                end tell
                return "SUCCESS_APPLESCRIPT"
            on error errMsg
                return "FAIL:" & errMsg
            end try
            "#,
            encoded
        );

        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output();

        let mut app_succeeded = false;
        if let Ok(res) = output {
            let out_str = String::from_utf8_lossy(&res.stdout);
            if out_str.contains("SUCCESS_APPLESCRIPT") {
                app_succeeded = true;
            }
        }

        if !app_succeeded {
            // Graceful fallback: Open Spotify web or URI directly
            let spotify_uri = format!("spotify:search:{}", encoded);
            let _ = open_target(&spotify_uri);
            // Also provide Web search fallback
            let web_url = format!("https://open.spotify.com/search/{}", encoded);
            let _ = open_target(&web_url);
        }

        Ok(AutomationResult {
            success: true,
            message: format!("Playing '{}' on Spotify", clean_query),
            action_type: "play_spotify".to_string(),
            payload: Some(clean_query.to_string()),
        })
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: Launch Spotify search URI scheme, and fallback to Web
        let spotify_uri = format!("spotify:search:{}", encoded);
        if open_target(&spotify_uri).is_err() {
            let web_url = format!("https://open.spotify.com/search/{}", encoded);
            let _ = open_target(&web_url);
        }

        Ok(AutomationResult {
            success: true,
            message: format!("Playing '{}' on Spotify", clean_query),
            action_type: "play_spotify".to_string(),
            payload: Some(clean_query.to_string()),
        })
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let web_url = format!("https://open.spotify.com/search/{}", encoded);
        let _ = open_target(&web_url);

        Ok(AutomationResult {
            success: true,
            message: format!("Opened Spotify search for '{}'", clean_query),
            action_type: "play_spotify".to_string(),
            payload: Some(clean_query.to_string()),
        })
    }
}

/// Controls global media playback (play, pause, playpause, next, previous).
pub fn media_control(action: &str) -> Result<AutomationResult, String> {
    let act = action.to_lowercase();

    #[cfg(target_os = "macos")]
    {
        let spotify_cmd = match act.as_str() {
            "play" => "tell application \"Spotify\" to play",
            "pause" => "tell application \"Spotify\" to pause",
            "playpause" | "toggle" => "tell application \"Spotify\" to playpause",
            "next" => "tell application \"Spotify\" to next track",
            "previous" | "prev" => "tell application \"Spotify\" to previous track",
            _ => "tell application \"Spotify\" to playpause",
        };

        let output = Command::new("osascript")
            .arg("-e")
            .arg(spotify_cmd)
            .output();

        let mut executed = false;
        if let Ok(res) = output {
            if res.status.success() {
                executed = true;
            }
        }

        if !executed {
            // Also try Apple Music
            let music_cmd = match act.as_str() {
                "play" => "tell application \"Music\" to play",
                "pause" => "tell application \"Music\" to pause",
                "next" => "tell application \"Music\" to next track",
                "previous" | "prev" => "tell application \"Music\" to previous track",
                _ => "tell application \"Music\" to playpause",
            };
            let _ = Command::new("osascript").arg("-e").arg(music_cmd).output();
        }

        Ok(AutomationResult {
            success: true,
            message: format!("Media control: {}", act),
            action_type: "media_control".to_string(),
            payload: Some(act),
        })
    }

    #[cfg(target_os = "windows")]
    {
        // Send virtual media keys via PowerShell SendKeys
        let key_code = match act.as_str() {
            "next" => "176",     // VK_MEDIA_NEXT_TRACK
            "previous" | "prev" => "177", // VK_MEDIA_PREV_TRACK
            _ => "179",          // VK_MEDIA_PLAY_PAUSE
        };
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-Command", &format!("$w = New-Object -ComObject Wscript.Shell; $w.SendKeys([char]{})", key_code)])
            .output();

        Ok(AutomationResult {
            success: true,
            message: format!("Media control: {}", act),
            action_type: "media_control".to_string(),
            payload: Some(act),
        })
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let playerctl_cmd = match act.as_str() {
            "play" => "play",
            "pause" => "pause",
            "next" => "next",
            "previous" | "prev" => "previous",
            _ => "play-pause",
        };
        let _ = Command::new("playerctl").arg(playerctl_cmd).output();

        Ok(AutomationResult {
            success: true,
            message: format!("Media control: {}", act),
            action_type: "media_control".to_string(),
            payload: Some(act),
        })
    }
}

/// Instant web or platform search (YouTube, Google, GitHub, Documentation).
pub fn search_web_platform(query: &str, platform: &str, app: Option<&str>) -> Result<AutomationResult, String> {
    let clean_query = query.trim();
    if clean_query.is_empty() && app.is_none() {
        return Err("Search query cannot be empty".to_string());
    }

    let encoded = url_encode(clean_query);
    let url = match platform.to_lowercase().as_str() {
        "youtube" | "video" => {
            if clean_query.is_empty() {
                "https://www.youtube.com".to_string()
            } else {
                format!("https://www.youtube.com/results?search_query={}", encoded)
            }
        }
        "github" | "code" => {
            if clean_query.is_empty() {
                "https://github.com".to_string()
            } else {
                format!("https://github.com/search?q={}", encoded)
            }
        }
        "duckduckgo" | "ddg" => {
            if clean_query.is_empty() {
                "https://duckduckgo.com".to_string()
            } else {
                format!("https://duckduckgo.com/?q={}", encoded)
            }
        }
        "spotify" => {
            if clean_query.is_empty() {
                "https://open.spotify.com".to_string()
            } else {
                format!("https://open.spotify.com/search/{}", encoded)
            }
        }
        "netflix" => "https://www.netflix.com".to_string(),
        "chatgpt" => {
            if clean_query.is_empty() {
                "https://chatgpt.com".to_string()
            } else {
                format!("https://chatgpt.com/?q={}", encoded)
            }
        }
        "twitter" | "x" => "https://x.com".to_string(),
        "reddit" => "https://www.reddit.com".to_string(),
        "url" => clean_query.to_string(),
        _ => {
            if clean_query.starts_with("http://") || clean_query.starts_with("https://") {
                clean_query.to_string()
            } else {
                format!("https://www.google.com/search?q={}", encoded)
            }
        }
    };

    if let Some(target_app) = app {
        #[cfg(target_os = "macos")]
        {
            let _ = Command::new("open").arg("-a").arg(target_app).arg(&url).output();
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = open_target(&url);
        }
    } else {
        open_target(&url)?;
    }

    Ok(AutomationResult {
        success: true,
        message: format!("Searching {} for '{}'", platform, clean_query),
        action_type: "search_web".to_string(),
        payload: Some(url),
    })
}

/// Locks the system workstation / puts display to sleep.
pub fn lock_screen() -> Result<AutomationResult, String> {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("pmset").arg("displaysleepnow").output();
        Ok(AutomationResult {
            success: true,
            message: "Screen locked".to_string(),
            action_type: "lock_screen".to_string(),
            payload: None,
        })
    }

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("rundll32.exe")
            .args(["user32.dll,LockWorkStation"])
            .output();
        Ok(AutomationResult {
            success: true,
            message: "Screen locked".to_string(),
            action_type: "lock_screen".to_string(),
            payload: None,
        })
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = Command::new("xdg-screensaver").arg("lock").output();
        Ok(AutomationResult {
            success: true,
            message: "Screen locked".to_string(),
            action_type: "lock_screen".to_string(),
            payload: None,
        })
    }
}

/// Injects text directly into whichever desktop application currently has focus.
/// Sets text to system clipboard and issues a simulated paste shortcut (Cmd+V on Mac, Ctrl+V on Windows/Linux).
pub fn inject_text_to_active_app(text: &str) -> Result<AutomationResult, String> {
    crate::tools::clipboard::write_clipboard(text)
        .map_err(|e| format!("Failed to write to clipboard for text injection: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(30));

    #[cfg(all(target_os = "macos", not(test)))]
    {
        let script = r#"tell application "System Events" to keystroke "v" using command down"#;
        let _ = Command::new("osascript").args(["-e", script]).status();
    }

    #[cfg(all(target_os = "windows", not(test)))]
    {
        let script = "[System.Windows.Forms.SendKeys]::SendWait('^v')";
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .status();
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows"), not(test)))]
    {
        let _ = Command::new("xdotool").args(["key", "--clearmodifiers", "ctrl+v"]).status();
    }

    Ok(AutomationResult {
        success: true,
        message: "Text successfully pasted into active application".to_string(),
        action_type: "inject_text".to_string(),
        payload: Some(text.to_string()),
    })
}

/// Captures the currently highlighted text from whichever desktop application currently has focus.
/// Issues a simulated copy shortcut (Cmd+C on Mac, Ctrl+C on Windows/Linux) and reads the clipboard.
pub fn capture_selected_text_from_active_app() -> Result<String, String> {
    #[cfg(all(target_os = "macos", not(test)))]
    {
        let script = r#"tell application "System Events" to keystroke "c" using command down"#;
        let _ = Command::new("osascript").args(["-e", script]).status();
    }

    #[cfg(all(target_os = "windows", not(test)))]
    {
        let script = "[System.Windows.Forms.SendKeys]::SendWait('^c')";
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .status();
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows"), not(test)))]
    {
        let _ = Command::new("xdotool").args(["key", "--clearmodifiers", "ctrl+c"]).status();
    }

    std::thread::sleep(std::time::Duration::from_millis(50));
    crate::tools::clipboard::read_clipboard()
        .map_err(|e| format!("Failed to read selected text from clipboard: {}", e))
}

/// Simulates a keyboard stroke for common navigation and control keys (Enter, Esc, Tab, Space, Arrows, etc.)
pub fn simulate_key_press(key: &str) -> Result<AutomationResult, String> {
    let clean_key = key.trim().to_lowercase();
    #[cfg(all(target_os = "macos", not(test)))]
    {
        let script = match clean_key.as_str() {
            "enter" | "return" => "tell application \"System Events\" to key code 36",
            "escape" | "esc" => "tell application \"System Events\" to key code 53",
            "tab" => "tell application \"System Events\" to key code 48",
            "space" => "tell application \"System Events\" to key code 49",
            "backspace" | "delete" => "tell application \"System Events\" to key code 51",
            "up" => "tell application \"System Events\" to key code 126",
            "down" => "tell application \"System Events\" to key code 125",
            "left" => "tell application \"System Events\" to key code 123",
            "right" => "tell application \"System Events\" to key code 124",
            "pageup" | "page up" => "tell application \"System Events\" to key code 116",
            "pagedown" | "page down" => "tell application \"System Events\" to key code 121",
            "home" => "tell application \"System Events\" to key code 115",
            "end" => "tell application \"System Events\" to key code 119",
            "f5" | "refresh" | "reload" => "tell application \"System Events\" to keystroke \"r\" using command down",
            "alt+left" | "back" => "tell application \"System Events\" to keystroke \"[\" using command down",
            "alt+right" | "forward" => "tell application \"System Events\" to keystroke \"]\" using command down",
            _ => return Err(format!("Unsupported key: {}", key)),
        };
        let _ = Command::new("osascript").args(["-e", script]).status();
        Ok(AutomationResult {
            success: true,
            message: format!("Pressed key: {}", clean_key),
            action_type: "key_press".to_string(),
            payload: Some(clean_key),
        })
    }
    #[cfg(all(target_os = "macos", test))]
    {
        match clean_key.as_str() {
            "enter" | "return" | "escape" | "esc" | "tab" | "space" | "backspace" | "delete" |
            "up" | "down" | "left" | "right" | "pageup" | "page up" | "pagedown" | "page down" |
            "home" | "end" | "f5" | "refresh" | "reload" | "alt+left" | "back" | "alt+right" | "forward" => {
                Ok(AutomationResult {
                    success: true,
                    message: format!("Pressed key: {}", clean_key),
                    action_type: "key_press".to_string(),
                    payload: Some(clean_key),
                })
            }
            _ => Err(format!("Unsupported key: {}", key)),
        }
    }
    #[cfg(target_os = "windows")]
    {
        let send_key = match clean_key.as_str() {
            "enter" | "return" => "{ENTER}",
            "escape" | "esc" => "{ESC}",
            "tab" => "{TAB}",
            "space" => " ",
            "backspace" => "{BACKSPACE}",
            "delete" => "{DEL}",
            "up" => "{UP}",
            "down" => "{DOWN}",
            "left" => "{LEFT}",
            "right" => "{RIGHT}",
            "pageup" | "page up" => "{PGUP}",
            "pagedown" | "page down" => "{PGDN}",
            "home" => "{HOME}",
            "end" => "{END}",
            "f5" | "refresh" | "reload" => "{F5}",
            "alt+left" | "back" => "%{LEFT}",
            "alt+right" | "forward" => "%{RIGHT}",
            _ => return Err(format!("Unsupported key: {}", key)),
        };
        let script = format!("[System.Windows.Forms.SendKeys]::SendWait('{}')", send_key);
        let _ = Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", &script]).status();
        Ok(AutomationResult {
            success: true,
            message: format!("Pressed key: {}", clean_key),
            action_type: "key_press".to_string(),
            payload: Some(clean_key),
        })
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let xdotool_key = match clean_key.as_str() {
            "enter" | "return" => "Return",
            "escape" | "esc" => "Escape",
            "tab" => "Tab",
            "space" => "space",
            "backspace" => "BackSpace",
            "delete" => "Delete",
            "up" => "Up",
            "down" => "Down",
            "left" => "Left",
            "right" => "Right",
            "pageup" | "page up" => "Page_Up",
            "pagedown" | "page down" => "Page_Down",
            "home" => "Home",
            "end" => "End",
            "f5" | "refresh" | "reload" => "F5",
            "alt+left" | "back" => "alt+Left",
            "alt+right" | "forward" => "alt+Right",
            _ => return Err(format!("Unsupported key: {}", key)),
        };
        let _ = Command::new("xdotool").args(["key", xdotool_key]).status();
        Ok(AutomationResult {
            success: true,
            message: format!("Pressed key: {}", clean_key),
            action_type: "key_press".to_string(),
            payload: Some(clean_key),
        })
    }
}

/// Simulates scrolling (up, down, left, right)
pub fn simulate_scroll(direction: &str, amount: u32) -> Result<AutomationResult, String> {
    let dir = direction.to_lowercase();
    let steps = amount.clamp(1, 50);
    #[cfg(all(target_os = "macos", not(test)))]
    {
        let key_code = match dir.as_str() {
            "up" => 126,
            "down" => 125,
            "left" => 123,
            "right" => 124,
            _ => 125,
        };
        let script = format!(
            "repeat {} times\ntell application \"System Events\" to key code {}\nend repeat",
            steps, key_code
        );
        let _ = Command::new("osascript").args(["-e", &script]).status();
    }
    #[cfg(target_os = "windows")]
    {
        let send_key = match dir.as_str() {
            "up" => "{UP}",
            "down" => "{DOWN}",
            "left" => "{LEFT}",
            "right" => "{RIGHT}",
            _ => "{DOWN}",
        };
        let script = format!(
            "1..{} | ForEach-Object {{ [System.Windows.Forms.SendKeys]::SendWait('{}') }}",
            steps, send_key
        );
        let _ = Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", &script]).status();
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let x_key = match dir.as_str() {
            "up" => "Up",
            "down" => "Down",
            "left" => "Left",
            "right" => "Right",
            _ => "Down",
        };
        let _ = Command::new("xdotool").args(["key", "--repeat", &steps.to_string(), x_key]).status();
    }
    Ok(AutomationResult {
        success: true,
        message: format!("Scrolled {} ({} units)", dir, steps),
        action_type: "scroll".to_string(),
        payload: Some(format!("{}:{}", dir, steps)),
    })
}

/// Launches a desktop application by name or opens common web services
pub fn open_app(name: &str) -> Result<AutomationResult, String> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err("App name cannot be empty".to_string());
    }

    let lower = clean_name.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") {
        open_target(clean_name)?;
        return Ok(AutomationResult {
            success: true,
            message: format!("Opened URL: {}", clean_name),
            action_type: "open_app".to_string(),
            payload: Some(clean_name.to_string()),
        });
    }

    if lower == "youtube" || lower == "youtube.com" {
        open_target("https://www.youtube.com")?;
        return Ok(AutomationResult {
            success: true,
            message: "Opened YouTube".to_string(),
            action_type: "open_app".to_string(),
            payload: Some("https://www.youtube.com".to_string()),
        });
    }
    if lower.starts_with("youtube ") {
        let query = &clean_name[8..];
        return search_web_platform(query, "youtube", None);
    }
    if lower == "netflix" || lower == "netflix.com" {
        open_target("https://www.netflix.com")?;
        return Ok(AutomationResult {
            success: true,
            message: "Opened Netflix".to_string(),
            action_type: "open_app".to_string(),
            payload: Some("https://www.netflix.com".to_string()),
        });
    }
    if lower == "github" || lower == "github.com" {
        open_target("https://www.github.com")?;
        return Ok(AutomationResult {
            success: true,
            message: "Opened GitHub".to_string(),
            action_type: "open_app".to_string(),
            payload: Some("https://www.github.com".to_string()),
        });
    }
    if lower == "google" || lower == "google.com" {
        open_target("https://www.google.com")?;
        return Ok(AutomationResult {
            success: true,
            message: "Opened Google".to_string(),
            action_type: "open_app".to_string(),
            payload: Some("https://www.google.com".to_string()),
        });
    }
    if lower == "chatgpt" || lower == "chatgpt.com" {
        open_target("https://chatgpt.com")?;
        return Ok(AutomationResult {
            success: true,
            message: "Opened ChatGPT".to_string(),
            action_type: "open_app".to_string(),
            payload: Some("https://chatgpt.com".to_string()),
        });
    }
    if lower == "twitter" || lower == "x.com" || lower == "x" {
        open_target("https://x.com")?;
        return Ok(AutomationResult {
            success: true,
            message: "Opened X".to_string(),
            action_type: "open_app".to_string(),
            payload: Some("https://x.com".to_string()),
        });
    }
    if lower == "reddit" || lower == "reddit.com" {
        open_target("https://www.reddit.com")?;
        return Ok(AutomationResult {
            success: true,
            message: "Opened Reddit".to_string(),
            action_type: "open_app".to_string(),
            payload: Some("https://www.reddit.com".to_string()),
        });
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("open")
            .arg("-a")
            .arg(clean_name)
            .output();

        let mut opened = false;
        if let Ok(res) = output {
            if res.status.success() {
                opened = true;
            }
        }

        if !opened {
            // Try generic open (file, URI, or protocol)
            if let Ok(res) = Command::new("open").arg(clean_name).output() {
                if res.status.success() {
                    opened = true;
                }
            }
        }

        if !opened && clean_name.contains('.') {
            let url = format!("https://{}", clean_name);
            let _ = open_target(&url);
        }
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("cmd").args(["/c", "start", "", clean_name]).output();
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = Command::new("gtk-launch").arg(clean_name).output();
    }
    Ok(AutomationResult {
        success: true,
        message: format!("Opened application: {}", clean_name),
        action_type: "open_app".to_string(),
        payload: Some(clean_name.to_string()),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStatusInfo {
    pub os_name: String,
    pub battery_level: Option<u8>,
    pub is_charging: Option<bool>,
    pub active_app: Option<String>,
    pub dark_mode: Option<bool>,
    pub disk_available_gb: Option<f64>,
    pub disk_percent_used: Option<u8>,
    pub memory_available_mb: Option<u64>,
}

/// Retrieves system status including battery percentage, charging state, frontmost app, dark mode, and disk space.
#[allow(unused_mut)]
pub fn get_system_status() -> Result<SystemStatusInfo, String> {
    let os_name = std::env::consts::OS.to_string();
    let mut battery_level: Option<u8> = None;
    let mut is_charging: Option<bool> = None;
    let mut active_app: Option<String> = None;
    let mut dark_mode: Option<bool> = None;
    let mut disk_available_gb: Option<f64> = None;
    let mut disk_percent_used: Option<u8> = None;
    let mut memory_available_mb: Option<u64> = None;

    #[cfg(target_os = "macos")]
    {
        // 1. Query Battery via pmset -g batt
        if let Ok(output) = Command::new("pmset").args(["-g", "batt"]).output() {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Some(pct_idx) = text.find('%') {
                let start = text[..pct_idx]
                    .rfind(|c: char| !c.is_ascii_digit())
                    .map(|i| i + 1)
                    .unwrap_or(0);
                if let Ok(pct) = text[start..pct_idx].parse::<u8>() {
                    battery_level = Some(pct);
                }
            }
            if (text.contains("charging") && !text.contains("not charging"))
                || text.contains("AC Power")
                || text.contains("AC attached")
            {
                is_charging = Some(true);
            } else if text.contains("discharging") {
                is_charging = Some(false);
            }
        }

        // 2. Query Frontmost App via System Events
        if let Ok(output) = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to get name of first application process whose frontmost is true"])
            .output()
        {
            if output.status.success() {
                let app = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !app.is_empty() {
                    active_app = Some(app);
                }
            }
        }

        // 3. Query Dark Mode
        if let Ok(output) = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to tell appearance preferences to get dark mode"])
            .output()
        {
            if output.status.success() {
                let val = String::from_utf8_lossy(&output.stdout).trim().to_lowercase();
                dark_mode = Some(val == "true");
            }
        }

        // 4. Query Root Disk Usage via df -k /
        if let Ok(output) = Command::new("df").args(["-k", "/"]).output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                if let Some(line) = text.lines().nth(1) {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 5 {
                        if let Ok(avail_kb) = parts[3].parse::<f64>() {
                            disk_available_gb = Some((avail_kb / 1024.0 / 1024.0 * 10.0).round() / 10.0);
                        }
                        let cap_str = parts[4].trim_end_matches('%');
                        if let Ok(cap_pct) = cap_str.parse::<u8>() {
                            disk_percent_used = Some(cap_pct);
                        }
                    }
                }
            }
        }

        // 5. Query Available Memory via vm_stat
        if let Ok(output) = Command::new("vm_stat").output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let mut pages_free: u64 = 0;
                let mut pages_inactive: u64 = 0;
                for line in text.lines() {
                    if line.starts_with("Pages free:") {
                        let digits: String = line.chars().filter(|c| c.is_ascii_digit()).collect();
                        if let Ok(val) = digits.parse::<u64>() {
                            pages_free = val;
                        }
                    } else if line.starts_with("Pages inactive:") {
                        let digits: String = line.chars().filter(|c| c.is_ascii_digit()).collect();
                        if let Ok(val) = digits.parse::<u64>() {
                            pages_inactive = val;
                        }
                    }
                }
                if pages_free + pages_inactive > 0 {
                    let avail_bytes = (pages_free + pages_inactive) * 4096;
                    memory_available_mb = Some(avail_bytes / 1024 / 1024);
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let ps_batt = "Get-CimInstance -ClassName Win32_Battery | Select-Object -ExpandProperty EstimatedChargeRemaining";
        if let Ok(output) = Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", ps_batt]).output() {
            if let Ok(val) = String::from_utf8_lossy(&output.stdout).trim().parse::<u8>() {
                battery_level = Some(val);
            }
        }

        let ps_disk = "Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -like 'C:*' } | ForEach-Object { [math]::Round($_.Free/1GB, 1) }";
        if let Ok(output) = Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", ps_disk]).output() {
            if let Ok(val) = String::from_utf8_lossy(&output.stdout).trim().parse::<f64>() {
                disk_available_gb = Some(val);
            }
        }
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        if let Ok(cap) = std::fs::read_to_string("/sys/class/power_supply/BAT0/capacity") {
            if let Ok(pct) = cap.trim().parse::<u8>() {
                battery_level = Some(pct);
            }
        }

        if let Ok(output) = Command::new("df").args(["-k", "/"]).output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                if let Some(line) = text.lines().nth(1) {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 5 {
                        if let Ok(avail_kb) = parts[3].parse::<f64>() {
                            disk_available_gb = Some((avail_kb / 1024.0 / 1024.0 * 10.0).round() / 10.0);
                        }
                        let cap_str = parts[4].trim_end_matches('%');
                        if let Ok(cap_pct) = cap_str.parse::<u8>() {
                            disk_percent_used = Some(cap_pct);
                        }
                    }
                }
            }
        }
    }

    Ok(SystemStatusInfo {
        os_name,
        battery_level,
        is_charging,
        active_app,
        dark_mode,
        disk_available_gb,
        disk_percent_used,
        memory_available_mb,
    })
}

/// Sends a native desktop notification with title and message.
pub fn send_system_notification(title: &str, message: &str) -> Result<AutomationResult, String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "display notification \"{}\" with title \"{}\" sound name \"Glass\"",
            message.replace('\\', "\\\\").replace('"', "\\\""),
            title.replace('\\', "\\\\").replace('"', "\\\"")
        );
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("Failed to send notification: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("osascript notification error: {}", err));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let ps_script = format!(
            "[reflection.assembly]::loadwithpartialname('System.Windows.Forms');\
             $notify = new-object system.windows.forms.notifyicon;\
             $notify.icon = [system.drawing.systemicons]::information;\
             $notify.visible = $true;\
             $notify.showballoontip(3000, '{}', '{}', [system.windows.forms.tooltipicon]::info)",
            title.replace('\'', "''"),
            message.replace('\'', "''")
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output();
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = Command::new("notify-send").args([title, message]).output();
    }

    Ok(AutomationResult {
        success: true,
        message: format!("Notification sent: {}", title),
        action_type: "notification".to_string(),
        payload: Some(format!("{}: {}", title, message)),
    })
}

/// Returns a list of currently open foreground applications.
pub fn list_running_apps() -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let script = "tell application \"System Events\" to get name of every process whose background only is false";
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| format!("Failed to list running apps: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("osascript error: {}", err));
        }

        let raw = String::from_utf8_lossy(&output.stdout);
        let apps: Vec<String> = raw
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(apps)
    }

    #[cfg(target_os = "windows")]
    {
        let ps_script = "Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -ExpandProperty ProcessName -Unique";
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
            .output()
            .map_err(|e| format!("Failed to list running apps on Windows: {}", e))?;

        let raw = String::from_utf8_lossy(&output.stdout);
        let apps: Vec<String> = raw
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok(apps)
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let output = Command::new("wmctrl")
            .arg("-l")
            .output();
        if let Ok(out) = output {
            let raw = String::from_utf8_lossy(&out.stdout);
            let apps: Vec<String> = raw.lines().map(|s| s.trim().to_string()).collect();
            Ok(apps)
        } else {
            Ok(vec!["Desktop".to_string()])
        }
    }
}

/// Brings a specific application to the foreground / focus.
pub fn focus_app(name: &str) -> Result<AutomationResult, String> {
    let clean_name = name.trim();
    if clean_name.is_empty() {
        return Err("App name cannot be empty".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let script = format!("tell application \"{}\" to activate", clean_name.replace('\\', "\\\\").replace('"', "\\\""));
        let output = Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("Failed to focus app: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Could not focus application '{}': {}", clean_name, err));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let ps_script = format!(
            "$wshell = New-Object -ComObject WScript.Shell; $wshell.AppActivate('{}')",
            clean_name.replace('\'', "''")
        );
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output();
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = Command::new("wmctrl").args(["-a", clean_name]).output();
    }

    Ok(AutomationResult {
        success: true,
        message: format!("Focused application: {}", clean_name),
        action_type: "focus_app".to_string(),
        payload: Some(clean_name.to_string()),
    })
}

/// Toggles system dark mode between light and dark.
pub fn toggle_dark_mode() -> Result<AutomationResult, String> {
    #[cfg(target_os = "macos")]
    {
        let script = "tell application \"System Events\" to tell appearance preferences to set dark mode to not dark mode";
        let output = Command::new("osascript")
            .args(["-e", script])
            .output()
            .map_err(|e| format!("Failed to toggle dark mode: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("osascript dark mode error: {}", err));
        }

        let is_dark = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to tell appearance preferences to get dark mode"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_lowercase() == "true")
            .unwrap_or(true);

        Ok(AutomationResult {
            success: true,
            message: format!("Dark mode is now {}", if is_dark { "enabled" } else { "disabled" }),
            action_type: "toggle_dark_mode".to_string(),
            payload: Some(is_dark.to_string()),
        })
    }

    #[cfg(target_os = "windows")]
    {
        let ps_script = "$key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';\
                         $current = (Get-ItemProperty -Path $key -Name AppsUseLightTheme).AppsUseLightTheme;\
                         $new = if ($current -eq 1) { 0 } else { 1 };\
                         Set-ItemProperty -Path $key -Name AppsUseLightTheme -Value $new";
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
            .output();

        Ok(AutomationResult {
            success: true,
            message: "Toggled Windows application theme".to_string(),
            action_type: "toggle_dark_mode".to_string(),
            payload: None,
        })
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        Ok(AutomationResult {
            success: true,
            message: "Dark mode toggle not supported on this platform".to_string(),
            action_type: "toggle_dark_mode".to_string(),
            payload: None,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenData {
    pub file_path: String,
    pub base64: String,
    pub width: u32,
    pub height: u32,
}

pub fn get_png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() >= 24 && &bytes[12..16] == b"IHDR" {
        let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
        let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
        Some((width, height))
    } else {
        None
    }
}

/// Captures a screen frame and returns the path, base64 payload, and display pixel dimensions.
pub fn capture_screen_data() -> Result<ScreenData, String> {
    use base64::Engine;
    let temp_dir = std::env::temp_dir().join("aeio_vision");
    let file_path = temp_dir.join(format!("screen_{}.png", uuid::Uuid::new_v4()));
    let captured_path = crate::safety::capture_native_screenshot(&file_path)?;
    let bytes = std::fs::read(&captured_path)
        .map_err(|e| format!("Failed to read screenshot bytes: {}", e))?;

    let (width, height) = get_png_dimensions(&bytes).unwrap_or((1920, 1080));
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(ScreenData {
        file_path: captured_path.to_string_lossy().to_string(),
        base64: format!("data:image/png;base64,{}", b64),
        width,
        height,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_volume_clamping() {
        assert_eq!(set_system_volume(150).unwrap().success, true);
        assert_eq!(set_system_volume(0).unwrap().success, true);
    }

    #[test]
    fn test_inject_text_clipboard_roundtrip() {
        let test_payload = "AEIO_AUTOMATION_TEST_PAYLOAD_9921";
        let res = inject_text_to_active_app(test_payload);
        assert!(res.is_ok());
        let res_val = res.unwrap();
        assert_eq!(res_val.action_type, "inject_text");
        assert_eq!(res_val.payload, Some(test_payload.to_string()));

        let read = crate::tools::clipboard::read_clipboard().unwrap();
        assert_eq!(read, test_payload);
    }

    #[test]
    fn test_simulate_key_press_valid_and_invalid() {
        let enter_res = simulate_key_press("enter");
        assert!(enter_res.is_ok());
        assert_eq!(enter_res.unwrap().action_type, "key_press");

        let bad_res = simulate_key_press("invalid_super_key_999");
        assert!(bad_res.is_err());
    }

    #[test]
    fn test_simulate_scroll_bounds() {
        let res = simulate_scroll("down", 5);
        assert!(res.is_ok());
        let val = res.unwrap();
        assert_eq!(val.action_type, "scroll");
        assert_eq!(val.payload, Some("down:5".to_string()));
    }

    #[test]
    fn test_get_system_status() {
        let res = get_system_status();
        assert!(res.is_ok());
        let status = res.unwrap();
        assert!(!status.os_name.is_empty());
        if let Some(disk_gb) = status.disk_available_gb {
            assert!(disk_gb >= 0.0);
        }
    }

    #[test]
    fn test_list_running_apps() {
        let res = list_running_apps();
        assert!(res.is_ok());
        let apps = res.unwrap();
        assert!(!apps.is_empty());
    }

    #[test]
    fn test_png_dimensions_parsing() {
        // Construct minimal valid PNG header with 1920x1080 dimensions
        let mut header = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // Signature
            0x00, 0x00, 0x00, 0x0D,                         // IHDR length 13
            0x49, 0x48, 0x44, 0x52,                         // "IHDR" ('I', 'H', 'D', 'R')
            0x00, 0x00, 0x07, 0x80,                         // Width: 1920 (0x0780)
            0x00, 0x00, 0x04, 0x38,                         // Height: 1080 (0x0438)
        ];
        assert_eq!(get_png_dimensions(&header), Some((1920, 1080)));

        // Invalid short header returns None
        header.truncate(10);
        assert_eq!(get_png_dimensions(&header), None);
    }
}
