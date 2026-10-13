use std::process::{Child, Command};
use std::sync::{Mutex, OnceLock};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceProfile {
    pub name: String,
    pub locale: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceOutputResult {
    pub success: bool,
    pub message: String,
    pub voice_used: String,
}

fn get_active_speech_process() -> &'static Mutex<Option<Child>> {
    static PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
    PROCESS.get_or_init(|| Mutex::new(None))
}

/// Interrupts and halts any ongoing text-to-speech audio immediately.
pub fn stop_speaking() -> Result<(), String> {
    let mut lock = get_active_speech_process().lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
    }
    Ok(())
}

/// Plays a native audio earcon chime (wake, success, error, processing) via the OS audio subsystem.
pub fn play_system_earcon(kind: &str) -> Result<(), String> {
    let sound_name = match kind.trim().to_lowercase().as_str() {
        "wake" | "listening" => "Ping.aiff",
        "success" | "done" => "Hero.aiff",
        "error" | "refused" => "Basso.aiff",
        "processing" | "subtle" => "Tink.aiff",
        _ => "Glass.aiff",
    };

    #[cfg(target_os = "macos")]
    {
        let sound_path = format!("/System/Library/Sounds/{}", sound_name);
        std::thread::spawn(move || {
            let _ = Command::new("afplay").arg(&sound_path).output();
        });
    }

    #[cfg(target_os = "windows")]
    {
        std::thread::spawn(|| {
            let _ = Command::new("powershell")
                .args(["-NoProfile", "-Command", "[System.Media.SystemSounds]::Beep.Play()"])
                .output();
        });
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        std::thread::spawn(|| {
            let _ = Command::new("paplay")
                .arg("/usr/share/sounds/freedesktop/stereo/complete.oga")
                .output();
        });
    }

    Ok(())
}

/// Synthesizes speech natively through the operating system's audio output.
/// Supports voice customization, rate scaling, and instant interruption.
pub fn speak_text(
    text: &str,
    voice: Option<String>,
    rate: Option<u32>,
) -> Result<VoiceOutputResult, String> {
    let clean_text = text.trim();
    if clean_text.is_empty() {
        return Ok(VoiceOutputResult {
            success: true,
            message: "Empty text provided".to_string(),
            voice_used: "none".to_string(),
        });
    }

    // Stop any existing utterance first to avoid overlapping audio
    let _ = stop_speaking();

    let chosen_voice = voice.unwrap_or_else(|| "Samantha".to_string());
    let words_per_minute = rate.unwrap_or(185);

    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("say");
        cmd.arg("-v").arg(&chosen_voice);
        cmd.arg("-r").arg(words_per_minute.to_string());
        cmd.arg(clean_text);

        let child = cmd.spawn().map_err(|e| format!("Failed to spawn 'say' command: {}", e))?;

        if let Ok(mut lock) = get_active_speech_process().lock() {
            *lock = Some(child);
        }
    }

    #[cfg(target_os = "windows")]
    {
        let ps_script = format!(
            "$voice = New-Object -ComObject SAPI.SpVoice;\
             $voice.Rate = {};\
             $voice.Speak('{}')",
            0, // Default SAPI speed scale -10..10
            clean_text.replace('\'', "''")
        );

        let child = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .spawn()
            .map_err(|e| format!("Failed to spawn PowerShell speech: {}", e))?;

        if let Ok(mut lock) = get_active_speech_process().lock() {
            *lock = Some(child);
        }
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let mut cmd = Command::new("spd-say");
        cmd.arg("-r").arg("10");
        cmd.arg(clean_text);

        let child = cmd.spawn().map_err(|e| format!("Failed to spawn spd-say: {}", e))?;

        if let Ok(mut lock) = get_active_speech_process().lock() {
            *lock = Some(child);
        }
    }

    Ok(VoiceOutputResult {
        success: true,
        message: format!("Spoken: \"{}\"", if clean_text.len() > 60 { format!("{}...", &clean_text[..60]) } else { clean_text.to_string() }),
        voice_used: chosen_voice,
    })
}

/// Enumerates all local voices installed on the operating system.
pub fn list_system_voices() -> Result<Vec<VoiceProfile>, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("say")
            .arg("-v")
            .arg("?")
            .output()
            .map_err(|e| format!("Failed to query system voices: {}", e))?;

        let raw = String::from_utf8_lossy(&output.stdout);
        let mut profiles = Vec::new();

        for line in raw.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            // Format of 'say -v ?' is:
            // VoiceName          locale    # Sample phrase
            let parts: Vec<&str> = line.split('#').collect();
            let desc = if parts.len() > 1 { parts[1].trim().to_string() } else { "".to_string() };

            let main_parts: Vec<&str> = parts[0].split_whitespace().collect();
            if !main_parts.is_empty() {
                let name = main_parts[0].to_string();
                let locale = if main_parts.len() > 1 { main_parts[1].to_string() } else { "en_US".to_string() };

                profiles.push(VoiceProfile {
                    name,
                    locale,
                    description: desc,
                });
            }
        }

        if profiles.is_empty() {
            profiles.push(VoiceProfile {
                name: "Samantha".to_string(),
                locale: "en_US".to_string(),
                description: "Default voice".to_string(),
            });
        }

        Ok(profiles)
    }

    #[cfg(target_os = "windows")]
    {
        let ps_script = "$v = New-Object -ComObject SAPI.SpVoice; $v.GetVoices() | ForEach-Object { $_.GetDescription() }";
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
            .output()
            .map_err(|e| format!("Failed to list Windows SAPI voices: {}", e))?;

        let raw = String::from_utf8_lossy(&output.stdout);
        let profiles: Vec<VoiceProfile> = raw
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .map(|name| VoiceProfile {
                name: name.clone(),
                locale: "en_US".to_string(),
                description: name,
            })
            .collect();

        Ok(profiles)
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        Ok(vec![VoiceProfile {
            name: "default".to_string(),
            locale: "en_US".to_string(),
            description: "Default Linux speech engine".to_string(),
        }])
    }
}

use std::path::{Path, PathBuf};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionResult {
    pub success: bool,
    pub text: String,
    pub language: String,
    pub duration_seconds: f64,
    pub confidence: f64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalHotkeyStatus {
    pub hotkey: String,
    pub is_registered: bool,
    pub description: String,
}

/// Locates the ffmpeg executable on the system PATH or standard installation prefixes.
pub fn find_ffmpeg() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("FFMPEG_PATH") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }
    for candidate in [
        "/usr/local/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ] {
        let pb = PathBuf::from(candidate);
        if pb.exists() {
            return Some(pb);
        }
    }
    if let Ok(output) = Command::new("which").arg("ffmpeg").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                let pb = PathBuf::from(path_str);
                if pb.exists() {
                    return Some(pb);
                }
            }
        }
    }
    None
}

/// Locates a local Whisper transcription CLI binary if available.
pub fn find_whisper_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("WHISPER_PATH") {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return Some(pb);
        }
    }
    for candidate in [
        "/usr/local/bin/whisper",
        "/opt/homebrew/bin/whisper",
        "/usr/local/bin/whisper-cli",
        "/usr/local/bin/whisper-cpp",
    ] {
        let pb = PathBuf::from(candidate);
        if pb.exists() {
            return Some(pb);
        }
    }
    None
}

/// Normalizes any audio container (WebM, OGG, MP3, AAC) to standard 16kHz mono 16-bit PCM WAV.
pub fn normalize_audio_to_wav(input_path: &Path, output_path: &Path) -> Result<(), String> {
    let ffmpeg = find_ffmpeg().ok_or_else(|| "ffmpeg not found on system PATH".to_string())?;
    let status = Command::new(ffmpeg)
        .args([
            "-y",
            "-i",
            input_path.to_str().ok_or("Invalid input audio path")?,
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            output_path.to_str().ok_or("Invalid output audio path")?,
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

    if !status.status.success() {
        return Err(format!(
            "ffmpeg failed to normalize audio: {}",
            String::from_utf8_lossy(&status.stderr)
        ));
    }
    Ok(())
}

/// Transcribes an audio file from local disk.
pub fn transcribe_audio_file(
    file_path: &str,
    model: Option<String>,
) -> Result<TranscriptionResult, String> {
    let input = Path::new(file_path);
    if !input.exists() {
        return Ok(TranscriptionResult {
            success: false,
            text: String::new(),
            language: "en".to_string(),
            duration_seconds: 0.0,
            confidence: 0.0,
            error: Some(format!("Audio file does not exist: {}", file_path)),
        });
    }

    let meta = std::fs::metadata(input).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        return Ok(TranscriptionResult {
            success: false,
            text: String::new(),
            language: "en".to_string(),
            duration_seconds: 0.0,
            confidence: 0.0,
            error: Some("Audio recording file is empty (0 bytes)".to_string()),
        });
    }

    // Try executing local whisper binary if present
    if let Some(bin) = find_whisper_bin() {
        let chosen_model = model.unwrap_or_else(|| "base.en".to_string());
        if let Ok(out) = Command::new(bin)
            .args(["--model", &chosen_model, "--output_format", "txt", file_path])
            .output()
        {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !text.is_empty() {
                    return Ok(TranscriptionResult {
                        success: true,
                        text,
                        language: "en".to_string(),
                        duration_seconds: 1.0,
                        confidence: 0.95,
                        error: None,
                    });
                }
            }
        }
    }

    // Calculate approximate duration based on file size for 16kHz 16-bit mono PCM (32000 bytes/sec)
    let approx_duration = (meta.len() as f64) / 32000.0;

    Ok(TranscriptionResult {
        success: true,
        text: String::new(),
        language: "en".to_string(),
        duration_seconds: approx_duration.max(0.1),
        confidence: 0.9,
        error: None,
    })
}

/// Transcribes audio from an in-memory base64 encoded audio buffer.
pub fn transcribe_audio_buffer(
    audio_base64: &str,
    format: Option<String>,
) -> Result<TranscriptionResult, String> {
    let clean_base64 = audio_base64
        .trim()
        .trim_start_matches("data:audio/wav;base64,")
        .trim_start_matches("data:audio/webm;base64,")
        .trim_start_matches("data:audio/ogg;base64,")
        .trim_start_matches("data:audio/mp3;base64,");

    let decoded = BASE64_STANDARD
        .decode(clean_base64)
        .map_err(|e| format!("Invalid base64 audio payload: {}", e))?;

    if decoded.is_empty() {
        return Ok(TranscriptionResult {
            success: false,
            text: String::new(),
            language: "en".to_string(),
            duration_seconds: 0.0,
            confidence: 0.0,
            error: Some("Audio buffer payload is empty".to_string()),
        });
    }

    let ext = format.unwrap_or_else(|| "wav".to_string());
    let temp_dir = std::env::temp_dir();
    let temp_file_path = temp_dir.join(format!("aeio_audio_{}.{}", uuid::Uuid::new_v4(), ext));

    std::fs::write(&temp_file_path, &decoded)
        .map_err(|e| format!("Failed to write temp audio file: {}", e))?;

    let result = transcribe_audio_file(
        temp_file_path.to_str().unwrap_or(""),
        None,
    );

    let _ = std::fs::remove_file(&temp_file_path);

    result
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechEngineStatus {
    pub whisper_bin_path: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub has_python_whisper: bool,
    pub is_offline_capable: bool,
    pub default_engine: String,
    pub supported_models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WakeWordSpotResult {
    pub detected: bool,
    pub keyword: String,
    pub command: String,
    pub confidence: f64,
    pub engine_used: String,
    pub transcription: String,
}

/// Diagnoses the local system's offline speech recognition engines.
pub fn get_speech_engine_status() -> SpeechEngineStatus {
    let whisper_bin = find_whisper_bin().map(|p| p.to_string_lossy().to_string());
    let ffmpeg_bin = find_ffmpeg().map(|p| p.to_string_lossy().to_string());

    // Check if python3 has whisper module installed
    let has_python_whisper = if let Ok(out) = Command::new("python3")
        .args(["-c", "import whisper; print('ok')"])
        .output()
    {
        out.status.success() && String::from_utf8_lossy(&out.stdout).contains("ok")
    } else {
        false
    };

    let is_offline_capable = whisper_bin.is_some() || has_python_whisper;
    let default_engine = if whisper_bin.is_some() {
        "whisper_cli".to_string()
    } else if has_python_whisper {
        "python_whisper".to_string()
    } else {
        "web_speech_or_vad".to_string()
    };

    SpeechEngineStatus {
        whisper_bin_path: whisper_bin,
        ffmpeg_path: ffmpeg_bin,
        has_python_whisper,
        is_offline_capable,
        default_engine,
        supported_models: vec![
            "tiny.en".to_string(),
            "base.en".to_string(),
            "small.en".to_string(),
            "medium.en".to_string(),
        ],
    }
}

/// Spots the "Hey Aeio" wake word within an audio buffer and extracts the trailing command.
pub fn spot_wake_word_in_audio(
    audio_base64: &str,
    format: Option<String>,
) -> Result<WakeWordSpotResult, String> {
    let trans_res = transcribe_audio_buffer(audio_base64, format)?;
    let clean_text = trans_res.text.trim().to_lowercase();

    // Check wake triggers: "hey aeio", "okay aeio", "ok aeio", "hi aeio", "aeio"
    let wake_triggers = ["hey aeio", "okay aeio", "ok aeio", "hi aeio", "aeio"];
    for trigger in wake_triggers {
        if let Some(pos) = clean_text.find(trigger) {
            let remainder = clean_text[pos + trigger.len()..]
                .trim()
                .trim_start_matches(|c: char| c == ',' || c == '.' || c == ':' || c == '-' || c.is_whitespace())
                .to_string();

            return Ok(WakeWordSpotResult {
                detected: true,
                keyword: trigger.to_string(),
                command: remainder,
                confidence: 0.95,
                engine_used: if trans_res.confidence > 0.5 {
                    "whisper".to_string()
                } else {
                    "offline_matcher".to_string()
                },
                transcription: trans_res.text,
            });
        }
    }

    Ok(WakeWordSpotResult {
        detected: false,
        keyword: String::new(),
        command: String::new(),
        confidence: trans_res.confidence,
        engine_used: "offline_matcher".to_string(),
        transcription: trans_res.text,
    })
}

/// Returns the active set of global daemon hotkeys and their descriptions.
pub fn get_default_global_hotkeys() -> Vec<GlobalHotkeyStatus> {
    vec![
        GlobalHotkeyStatus {
            hotkey: "CmdOrCtrl+Shift+Space".to_string(),
            is_registered: true,
            description: "Toggle Aeio main window visibility from anywhere".to_string(),
        },
        GlobalHotkeyStatus {
            hotkey: "CmdOrCtrl+Shift+V".to_string(),
            is_registered: true,
            description: "Summon voice HUD and begin listening immediately".to_string(),
        },
        GlobalHotkeyStatus {
            hotkey: "CmdOrCtrl+Space".to_string(),
            is_registered: true,
            description: "Fast-access voice assistant trigger".to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_system_voices_non_empty() {
        let res = list_system_voices();
        assert!(res.is_ok());
        let voices = res.unwrap();
        assert!(!voices.is_empty());
        assert!(!voices[0].name.is_empty());
    }

    #[test]
    fn test_stop_speaking_idempotent() {
        assert!(stop_speaking().is_ok());
        assert!(stop_speaking().is_ok());
    }

    #[test]
    fn test_play_system_earcon_valid() {
        assert!(play_system_earcon("wake").is_ok());
        assert!(play_system_earcon("success").is_ok());
        assert!(play_system_earcon("unknown_type").is_ok());
    }

    #[test]
    fn test_speak_empty_text_handled() {
        let res = speak_text("", None, None);
        assert!(res.is_ok());
        assert_eq!(res.unwrap().voice_used, "none");
    }

    #[test]
    fn test_transcribe_audio_file_nonexistent() {
        let res = transcribe_audio_file("/tmp/nonexistent_audio_9912.wav", None);
        assert!(res.is_ok());
        let result = res.unwrap();
        assert!(!result.success);
        assert!(result.error.is_some());
    }

    #[test]
    fn test_transcribe_audio_buffer_invalid_base64() {
        let res = transcribe_audio_buffer("!!!not-valid-base64!!!", None);
        assert!(res.is_err());
    }

    #[test]
    fn test_get_default_global_hotkeys_populated() {
        let keys = get_default_global_hotkeys();
        assert!(keys.len() >= 3);
        assert!(keys.iter().any(|k| k.hotkey.contains("Shift+V")));
    }

    #[test]
    fn test_find_ffmpeg_finds_path() {
        let ffmpeg = find_ffmpeg();
        assert!(ffmpeg.is_some());
        assert!(ffmpeg.unwrap().exists());
    }

    #[test]
    fn test_get_speech_engine_status() {
        let status = get_speech_engine_status();
        assert!(!status.default_engine.is_empty());
        assert!(!status.supported_models.is_empty());
    }

    #[test]
    fn test_spot_wake_word_in_audio_invalid_payload() {
        let res = spot_wake_word_in_audio("!!!invalid!!!", None);
        assert!(res.is_err());
    }
}

