use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveWindowInfo {
    pub app_name: String,
    pub title: String,
}

pub fn get_active_window() -> Result<ActiveWindowInfo, String> {
    #[cfg(target_os = "macos")]
    {
        // Query System Events for the frontmost application process and front window title
        let script = r#"
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
                set frontAppName to name of frontApp
                set winTitle to ""
                try
                    tell frontApp
                        set winTitle to name of front window
                    end tell
                end try
                return frontAppName & "|||" & winTitle
            end tell
        "#;

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to execute osascript: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("osascript error: {}", err));
        }

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let parts: Vec<&str> = raw.split("|||").collect();
        let app_name = parts.first().unwrap_or(&"Unknown").trim().to_string();
        let title = parts.get(1).unwrap_or(&"").trim().to_string();

        Ok(ActiveWindowInfo {
            app_name: if app_name.is_empty() { "Unknown".to_string() } else { app_name.clone() },
            title: if title.is_empty() { app_name } else { title },
        })
    }

    #[cfg(target_os = "windows")]
    {
        // PowerShell query for foreground window process name and window title
        let script = r#"
            Add-Type @"
                using System;
                using System.Runtime.InteropServices;
                using System.Text;
                public class WinUtil {
                    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
                    [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
                    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
                }
"@
            $hwnd = [WinUtil]::GetForegroundWindow()
            $sb = New-Object System.Text.StringBuilder 256
            [void][WinUtil]::GetWindowText($hwnd, $sb, $sb.Capacity)
            $pid = 0
            [void][WinUtil]::GetWindowThreadProcessId($hwnd, [ref]$pid)
            $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
            $appName = if ($p) { $p.ProcessName } else { "Unknown" }
            "$appName|||$($sb.ToString())"
        "#;

        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output()
            .map_err(|e| format!("Failed to run powershell: {}", e))?;

        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let parts: Vec<&str> = raw.split("|||").collect();
        let app_name = parts.first().unwrap_or(&"Unknown").trim().to_string();
        let title = parts.get(1).unwrap_or(&"").trim().to_string();

        Ok(ActiveWindowInfo {
            app_name: if app_name.is_empty() { "Unknown".to_string() } else { app_name.clone() },
            title: if title.is_empty() { app_name } else { title },
        })
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(ActiveWindowInfo {
            app_name: "Desktop".to_string(),
            title: "Active Workspace".to_string(),
        })
    }
}
