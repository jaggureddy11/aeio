pub mod action_classifier;
pub mod allowlist;
pub mod kill_switch;
pub mod overlay;
pub mod screenshot;
pub mod input_driver;
pub mod audit;

pub use action_classifier::*;
pub use allowlist::*;
pub use kill_switch::*;
pub use overlay::*;
pub use screenshot::*;
pub use input_driver::*;
pub use audit::*;

#[cfg(test)]
pub static SAFETY_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());



