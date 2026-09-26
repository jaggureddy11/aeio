use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// Global atomic emergency halt flag.
/// Checked before every single action in any computer control loop.
pub static EMERGENCY_HALT: AtomicBool = AtomicBool::new(false);

/// Minimum duration the Escape key must be held down to trigger emergency halt.
pub const KILL_KEY_HOLD_DURATION: Duration = Duration::from_millis(300);

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static LISTENER_SPAWNED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmergencyHaltEvent {
    pub timestamp: String,
    pub reason: String,
    pub halted: bool,
}

/// State machine for tracking Escape key hold duration.
#[derive(Debug, Default)]
pub struct KeyHoldTracker {
    press_start: Option<Instant>,
    triggered: bool,
}

impl KeyHoldTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Handles a key-down event. Returns true if already past threshold.
    pub fn handle_key_down(&mut self, now: Instant, threshold: Duration) -> bool {
        if self.triggered {
            return false;
        }

        match self.press_start {
            None => {
                self.press_start = Some(now);
                false
            }
            Some(start) => {
                if now.duration_since(start) >= threshold {
                    self.triggered = true;
                    true
                } else {
                    false
                }
            }
        }
    }

    /// Handles a key-up event. Resets tracking unless already triggered.
    pub fn handle_key_up(&mut self) {
        self.press_start = None;
        self.triggered = false;
    }

    /// Checks if the key is currently held past the threshold.
    pub fn check_elapsed(&mut self, now: Instant, threshold: Duration) -> bool {
        if self.triggered {
            return false;
        }

        if let Some(start) = self.press_start {
            if now.duration_since(start) >= threshold {
                self.triggered = true;
                return true;
            }
        }
        false
    }

    pub fn is_held(&self) -> bool {
        self.press_start.is_some()
    }
}

/// Triggers the emergency kill switch, setting the atomic flag and notifying listeners.
pub fn trigger_kill_switch(reason: &str) {
    EMERGENCY_HALT.store(true, Ordering::SeqCst);
    eprintln!("[KILL SWITCH ACTIVATED] {}", reason);

    if let Some(app) = APP_HANDLE.get() {
        let payload = EmergencyHaltEvent {
            timestamp: chrono::Utc::now().to_rfc3339(),
            reason: reason.to_string(),
            halted: true,
        };
        let _ = app.emit("computer-control-emergency-halt", payload);
    }

    crate::safety::overlay::notify_kill_switch_on_overlay(APP_HANDLE.get(), reason);
}

/// Manually resets the emergency kill switch.
pub fn reset_kill_switch() {
    EMERGENCY_HALT.store(false, Ordering::SeqCst);
    eprintln!("[KILL SWITCH RESET]");

    if let Some(app) = APP_HANDLE.get() {
        let payload = EmergencyHaltEvent {
            timestamp: chrono::Utc::now().to_rfc3339(),
            reason: "Kill switch manually reset by operator".to_string(),
            halted: false,
        };
        let _ = app.emit("computer-control-emergency-halt", payload);
    }

    crate::safety::overlay::reset_kill_switch_on_overlay(APP_HANDLE.get());
}

/// Returns whether the emergency halt is currently tripped.
pub fn is_halt_triggered() -> bool {
    EMERGENCY_HALT.load(Ordering::SeqCst)
}

/// Registers the Tauri AppHandle for event emission.
pub fn register_kill_switch_app_handle(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
}

/// Starts the native low-level key listener on a dedicated OS thread.
/// Runs independently of the Tauri main event loop.
pub fn start_kill_switch_listener() {
    if LISTENER_SPAWNED.swap(true, Ordering::SeqCst) {
        return; // Already started
    }

    let tracker = Arc::new(Mutex::new(KeyHoldTracker::new()));
    let tracker_ticker = Arc::clone(&tracker);

    // Dedicated high-resolution ticker thread to detect hold expiration even without key-repeat
    std::thread::Builder::new()
        .name("kill-switch-ticker".to_string())
        .spawn(move || {
            loop {
                std::thread::sleep(Duration::from_millis(25));
                let should_halt = {
                    let mut t = tracker_ticker.lock().unwrap();
                    t.check_elapsed(Instant::now(), KILL_KEY_HOLD_DURATION)
                };

                if should_halt {
                    trigger_kill_switch("Escape key held for >= 300ms");
                }
            }
        })
        .expect("Failed to spawn kill switch ticker thread");

    // Dedicated OS thread running native event hook
    std::thread::Builder::new()
        .name("kill-switch-listener".to_string())
        .spawn(move || {
            let callback = move |event: rdev::Event| {
                match event.event_type {
                    rdev::EventType::KeyPress(rdev::Key::Escape) => {
                        let mut t = tracker.lock().unwrap();
                        if !t.is_held() {
                            t.handle_key_down(Instant::now(), KILL_KEY_HOLD_DURATION);
                        }
                    }
                    rdev::EventType::KeyRelease(rdev::Key::Escape) => {
                        let mut t = tracker.lock().unwrap();
                        t.handle_key_up();
                    }
                    _ => {}
                }
            };

            if let Err(err) = rdev::listen(callback) {
                eprintln!("[KillSwitch] Native OS event listener returned error: {:?}", err);
            }
        })
        .expect("Failed to spawn kill switch listener thread");
}

/// Executes an action loop, asserting that before EVERY single action
/// the atomic halt flag is checked. If EMERGENCY_HALT is set, the loop aborts immediately.
pub fn run_action_loop<F>(
    total_steps: usize,
    mut on_step: F,
) -> Result<usize, (usize, String)>
where
    F: FnMut(usize) -> Result<(), String>,
{
    let mut completed_steps = 0;

    for step in 1..=total_steps {
        // Strict safety invariant: verify emergency stop before EVERY action
        if is_halt_triggered() {
            return Err((
                completed_steps,
                format!("Emergency halt active: aborted before step {}", step),
            ));
        }

        // Execute action step
        if let Err(e) = on_step(step) {
            return Err((completed_steps, e));
        }

        completed_steps += 1;
    }

    Ok(completed_steps)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tracker_quick_tap_does_not_trigger() {
        let mut tracker = KeyHoldTracker::new();
        let start = Instant::now();

        // Key down at t=0
        assert!(!tracker.handle_key_down(start, Duration::from_millis(300)));
        assert!(tracker.is_held());

        // Quick check after 100ms
        let t100 = start + Duration::from_millis(100);
        assert!(!tracker.check_elapsed(t100, Duration::from_millis(300)));

        // Key released at 120ms
        tracker.handle_key_up();
        assert!(!tracker.is_held());

        // Check after 350ms - should not trigger because key was released
        let t350 = start + Duration::from_millis(350);
        assert!(!tracker.check_elapsed(t350, Duration::from_millis(300)));
    }

    #[test]
    fn test_tracker_deliberate_hold_triggers() {
        let mut tracker = KeyHoldTracker::new();
        let start = Instant::now();

        // Key down at t=0
        assert!(!tracker.handle_key_down(start, Duration::from_millis(300)));

        // Check at 290ms - not yet triggered
        let t290 = start + Duration::from_millis(290);
        assert!(!tracker.check_elapsed(t290, Duration::from_millis(300)));

        // Check at 305ms - triggers!
        let t305 = start + Duration::from_millis(305);
        assert!(tracker.check_elapsed(t305, Duration::from_millis(300)));

        // Subsequent check remains triggered and doesn't fire again
        let t400 = start + Duration::from_millis(400);
        assert!(!tracker.check_elapsed(t400, Duration::from_millis(300)));
    }

    use crate::safety::SAFETY_TEST_LOCK;

    #[test]
    fn test_atomic_flag_and_mock_action_loop_halts_immediately() {
        let _guard = SAFETY_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        reset_kill_switch();
        assert!(!is_halt_triggered());

        let mut executed_steps = Vec::new();

        let result = run_action_loop(10, |step| {
            executed_steps.push(step);

            // Trigger kill switch after step 2
            if step == 2 {
                trigger_kill_switch("Simulated held Escape key after step 2");
            }

            Ok(())
        });

        // Loop must halt before step 4 (specifically before step 3 even begins)
        assert!(result.is_err());
        let (completed, reason) = result.unwrap_err();

        // Completed exactly 2 steps
        assert_eq!(completed, 2);
        assert_eq!(executed_steps, vec![1, 2]);

        // Reason explicitly reports abort before step 3
        assert!(reason.contains("aborted before step 3"));

        // Global atomic flag is verified set
        assert!(is_halt_triggered());

        // Cleanup
        reset_kill_switch();
        assert!(!is_halt_triggered());
    }

    #[test]
    fn test_pre_tripped_kill_switch_prevents_step_one() {
        let _guard = SAFETY_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        trigger_kill_switch("Tripped prior to execution");
        assert!(is_halt_triggered());

        let mut ran = false;
        let result = run_action_loop(10, |_| {
            ran = true;
            Ok(())
        });

        assert!(result.is_err());
        let (completed, reason) = result.unwrap_err();
        assert_eq!(completed, 0);
        assert!(!ran);
        assert!(reason.contains("aborted before step 1"));

        reset_kill_switch();
    }
}
