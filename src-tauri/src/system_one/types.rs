use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// A Choice question presents a set of discrete options and expects
/// a calibrated probability distribution over them, selecting the most likely.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChoiceQuestion {
    pub instructions: String,
    pub options: HashMap<String, Option<String>>,
    pub criteria: Option<HashMap<String, String>>,
}

/// The evaluated answer to a Choice question.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChoiceAnswer {
    pub choice: String,
    pub probabilities: HashMap<String, f64>,
    pub confidence: f64,
    pub rationale: Option<String>,
}

/// A Noul question produces a calibrated probability (0.0 to 1.0)
/// that a condition is affirmative (YES/true).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoulQuestion {
    pub instructions: String,
    pub criteria: Option<Vec<String>>,
}

/// The evaluated answer to a Noul question.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoulAnswer {
    /// Calibrated probability of YES (0.0 to 1.0)
    pub probability: f64,
    pub is_affirmative: bool,
    pub rationale: Option<String>,
}

/// A Score question evaluates a subject against ordered dimensional levels.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreQuestion {
    pub instructions: String,
    pub levels: HashMap<String, String>,
}

/// The evaluated answer to a Score question.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreAnswer {
    pub selected_level: String,
    pub numeric_score: f64,
    pub level_probabilities: HashMap<String, f64>,
    pub confidence: f64,
    pub rationale: Option<String>,
}

/// Tagged enum for all System One questions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SystemOneQuestion {
    #[serde(rename = "choice")]
    Choice(ChoiceQuestion),
    #[serde(rename = "noul")]
    Noul(NoulQuestion),
    #[serde(rename = "score")]
    Score(ScoreQuestion),
}

/// Tagged enum for all System One answers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SystemOneAnswer {
    #[serde(rename = "choice")]
    Choice(ChoiceAnswer),
    #[serde(rename = "noul")]
    Noul(NoulAnswer),
    #[serde(rename = "score")]
    Score(ScoreAnswer),
}

/// Generic request payload for batch System One evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemOneRequest {
    pub state: serde_json::Value,
    pub questions: HashMap<String, SystemOneQuestion>,
}

/// Generic response payload for batch System One evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemOneResponse {
    pub answers: HashMap<String, SystemOneAnswer>,
    pub evaluated_at: i64,
    pub engine: String,
    pub duration_ms: u64,
}

/// Specialized safety verdict for command execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandSafetyVerdict {
    pub command: String,
    pub is_destructive: bool,
    pub destructive_probability: f64,
    pub requires_approval: bool,
    pub risk_tier: String, // "low" | "medium" | "critical"
    pub rationale: String,
}

/// Task intent routing verdict.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskIntentVerdict {
    pub prompt: String,
    pub primary_intent: String, // "planning" | "code" | "search_retrieval" | "conversational"
    pub probabilities: HashMap<String, f64>,
    pub confidence: f64,
    pub suggested_system_prompt: Option<String>,
}

/// Re-ranked memory result with System One calibrated scoring.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RerankedMemoryResult {
    pub memory_id: String,
    pub content: String,
    pub category: String,
    pub original_score: f32,
    pub system_one_score: f64,
    pub final_score: f64,
    pub confidence: f64,
    pub rationale: String,
}
