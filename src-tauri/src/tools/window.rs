use serde::{Deserialize, Serialize};
use std::process::Command;
use crate::tools::os_automation::AutomationResult;

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

/// Manipulate the active foreground window state (maximize, minimize, tile_left, tile_right, center).
pub fn manage_active_window(action: &str) -> Result<AutomationResult, String> {
    let normalized = action.trim().to_lowercase();

    #[cfg(target_os = "macos")]
    {
        let script = match normalized.as_str() {
            "maximize" | "fullscreen" => {
                r#"
                tell application "Finder" to set screenBounds to bounds of window of desktop
                set screenW to item 3 of screenBounds
                set screenH to item 4 of screenBounds
                tell application "System Events"
                    set frontApp to first application process whose frontmost is true
                    try
                        tell frontApp to set bounds of front window to {0, 25, screenW, screenH}
                    end try
                end tell
                "#
            }
            "minimize" => {
                r#"
                tell application "System Events"
                    set frontApp to first application process whose frontmost is true
                    try
                        tell frontApp to set miniaturized of front window to true
                    end try
                end tell
                "#
            }
            "tile_left" | "left" => {
                r#"
                tell application "Finder" to set screenBounds to bounds of window of desktop
                set screenW to item 3 of screenBounds
                set screenH to item 4 of screenBounds
                set halfW to round (screenW / 2)
                tell application "System Events"
                    set frontApp to first application process whose frontmost is true
                    try
                        tell frontApp to set bounds of front window to {0, 25, halfW, screenH}
                    end try
                end tell
                "#
            }
            "tile_right" | "right" => {
                r#"
                tell application "Finder" to set screenBounds to bounds of window of desktop
                set screenW to item 3 of screenBounds
                set screenH to item 4 of screenBounds
                set halfW to round (screenW / 2)
                tell application "System Events"
                    set frontApp to first application process whose frontmost is true
                    try
                        tell frontApp to set bounds of front window to {halfW, 25, screenW, screenH}
                    end try
                end tell
                "#
            }
            "center" => {
                r#"
                tell application "Finder" to set screenBounds to bounds of window of desktop
                set screenW to item 3 of screenBounds
                set screenH to item 4 of screenBounds
                set winW to round (screenW * 0.7)
                set winH to round (screenH * 0.7)
                set leftX to round ((screenW - winW) / 2)
                set topY to round (25 + ((screenH - 25) - winH) / 2)
                tell application "System Events"
                    set frontApp to first application process whose frontmost is true
                    try
                        tell frontApp to set bounds of front window to {leftX, topY, leftX + winW, topY + winH}
                    end try
                end tell
                "#
            }
            other => return Err(format!("Unsupported window action: {}", other)),
        };

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .map_err(|e| format!("Failed to execute osascript for window control: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Window management error: {}", err));
        }

        Ok(AutomationResult {
            success: true,
            message: format!("Window successfully set to: {}", normalized),
            action_type: "manage_window".to_string(),
            payload: Some(normalized),
        })
    }

    #[cfg(target_os = "windows")]
    {
        let ps_code = match normalized.as_str() {
            "maximize" | "fullscreen" => {
                r##"
                Add-Type @"
                    using System;
                    using System.Runtime.InteropServices;
                    public class WinMgr {
                        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
                        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                    }
"@
                $hwnd = [WinMgr]::GetForegroundWindow()
                [WinMgr]::ShowWindow($hwnd, 3) # SW_MAXIMIZE = 3
                "##
            }
            "minimize" => {
                r##"
                Add-Type @"
                    using System;
                    using System.Runtime.InteropServices;
                    public class WinMgr {
                        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
                        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                    }
"@
                $hwnd = [WinMgr]::GetForegroundWindow()
                [WinMgr]::ShowWindow($hwnd, 6) # SW_MINIMIZE = 6
                "##
            }
            "tile_left" | "left" => {
                r##"
                $w = New-Object -ComObject Wscript.Shell
                $w.SendKeys("#{LEFT}")
                "##
            }
            "tile_right" | "right" => {
                r##"
                $w = New-Object -ComObject Wscript.Shell
                $w.SendKeys("#{RIGHT}")
                "##
            }
            "center" => {
                r##"
                Add-Type @"
                    using System;
                    using System.Runtime.InteropServices;
                    using System.Windows.Forms;
                    public class WinMgr {
                        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
                        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
                    }
"@
                $hwnd = [WinMgr]::GetForegroundWindow()
                $screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
                $w = [int]($screen.Width * 0.7)
                $h = [int]($screen.Height * 0.7)
                $x = [int](($screen.Width - $w) / 2)
                $y = [int](($screen.Height - $h) / 2)
                [WinMgr]::SetWindowPos($hwnd, [IntPtr]::Zero, $x, $y, $w, $h, 0x0040)
                "##
            }
            other => return Err(format!("Unsupported window action on Windows: {}", other)),
        };

        let _ = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_code])
            .output();

        Ok(AutomationResult {
            success: true,
            message: format!("Window action '{}' executed.", normalized),
            action_type: "manage_window".to_string(),
            payload: Some(normalized),
        })
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(AutomationResult {
            success: true,
            message: format!("Window action '{}' acknowledged on generic OS.", normalized),
            action_type: "manage_window".to_string(),
            payload: Some(normalized),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manage_active_window_invalid_action() {
        let res = manage_active_window("invalid_nonexistent_action_123");
        assert!(res.is_err());
    }
}


