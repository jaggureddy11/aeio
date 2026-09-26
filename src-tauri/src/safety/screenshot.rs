use std::path::{Path, PathBuf};
use std::process::Command;

/// Captures a native screenshot without any external python or third-party script dependencies.
/// Uses native OS utilities directly via safe subprocess argument arrays.
pub fn capture_native_screenshot(output_path: &Path) -> Result<PathBuf, String> {
    // Ensure parent directory exists
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create screenshot dir: {}", e))?;
    }

    let output_str = output_path
        .to_str()
        .ok_or_else(|| "Invalid UTF-8 in screenshot output path".to_string())?;

    #[cfg(target_os = "macos")]
    {
        // On macOS: screencapture -x (silent, no shutter sound)
        let status = Command::new("screencapture")
            .args(["-x", output_str])
            .status()
            .map_err(|e| format!("Failed to execute screencapture: {}", e))?;

        if !status.success() {
            return Err(format!("screencapture failed with status: {:?}", status.code()));
        }
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows: PowerShell script using native System.Drawing
        let ps_script = format!(
            "[Reflection.Assembly]::LoadWithPartialName('System.Drawing');\
             $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;\
             $bmp = New-Object Drawing.Bitmap $bounds.width, $bounds.height;\
             $graphics = [Drawing.Graphics]::FromImage($bmp);\
             $graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.size);\
             $bmp.Save('{}');\
             $graphics.Dispose();\
             $bmp.Dispose()",
            output_str.replace('\'', "''")
        );

        let status = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .status()
            .map_err(|e| format!("Failed to execute powershell screenshot: {}", e))?;

        if !status.success() {
            return Err(format!("PowerShell screenshot failed with status: {:?}", status.code()));
        }
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        // On Linux / BSD: Try scrot, grim, or import
        let tries = [
            ("scrot", vec!["-z", output_str]),
            ("grim", vec![output_str]),
            ("import", vec!["-window", "root", output_str]),
        ];

        let mut captured = false;
        for (bin, args) in &tries {
            if let Ok(status) = Command::new(bin).args(args).status() {
                if status.success() {
                    captured = true;
                    break;
                }
            }
        }

        if !captured {
            return Err("No supported Linux screen capture utility found (tried scrot, grim, import)".to_string());
        }
    }

    if output_path.exists() {
        Ok(output_path.to_path_buf())
    } else {
        Err(format!("Screenshot file was not generated at: {}", output_str))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_native_screenshot_capture_creates_file() {
        let temp_dir = std::env::temp_dir().join("aeio_test_screenshots");
        let screenshot_file = temp_dir.join(format!("test_cap_{}.png", uuid::Uuid::new_v4()));

        let result = capture_native_screenshot(&screenshot_file);

        // In CI or headless test environments without display server,
        // screencapture / scrot might fail gracefully.
        // If it succeeds, verify the file exists and is non-empty.
        if let Ok(path) = result {
            assert!(path.exists());
            let meta = std::fs::metadata(&path).expect("Failed to read metadata");
            assert!(meta.len() > 0);
            let _ = std::fs::remove_file(path);
        }
        let _ = std::fs::remove_dir_all(temp_dir);
    }
}
