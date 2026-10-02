use std::collections::HashMap;
use std::time::Instant;
use chrono::Utc;
use super::types::*;

pub struct SystemOneEngine;

impl SystemOneEngine {
    pub fn new() -> Self {
        Self
    }

    /// Evaluates a bundle of typed questions against state in Rust.
    pub fn evaluate(&self, request: &SystemOneRequest) -> SystemOneResponse {
        let start = Instant::now();
        let evaluated_at = Utc::now().timestamp_millis();
        let mut answers = HashMap::new();

        let state_str = serde_json::to_string(&request.state).unwrap_or_default().to_lowercase();

        for (qid, question) in &request.questions {
            match question {
                SystemOneQuestion::Choice(q) => {
                    let ans = self.evaluate_choice(q, &state_str);
                    answers.insert(qid.clone(), SystemOneAnswer::Choice(ans));
                }
                SystemOneQuestion::Noul(q) => {
                    let ans = self.evaluate_noul(q, &state_str);
                    answers.insert(qid.clone(), SystemOneAnswer::Noul(ans));
                }
                SystemOneQuestion::Score(q) => {
                    let ans = self.evaluate_score(q, &state_str);
                    answers.insert(qid.clone(), SystemOneAnswer::Score(ans));
                }
            }
        }

        SystemOneResponse {
            answers,
            evaluated_at,
            engine: "system-one-rust-native".to_string(),
            duration_ms: start.elapsed().as_millis() as u64,
        }
    }

    fn evaluate_choice(&self, q: &ChoiceQuestion, state_str: &str) -> ChoiceAnswer {
        let instructions_lower = q.instructions.to_lowercase();
        let mut raw_scores: HashMap<String, f64> = HashMap::new();

        for (opt_key, opt_desc) in &q.options {
            let key_lower = opt_key.to_lowercase();
            let mut score = 1.0; // Laplace prior base

            // Direct key match in state or instructions
            if state_str.contains(&key_lower) {
                score += 4.0;
            }
            if instructions_lower.contains(&key_lower) {
                score += 1.5;
            }

            // Description match
            if let Some(desc) = opt_desc {
                let desc_lower = desc.to_lowercase();
                for word in desc_lower.split_whitespace() {
                    if word.len() > 3 && state_str.contains(word) {
                        score += 1.0;
                    }
                }
            }

            // Criteria match
            if let Some(criteria) = &q.criteria {
                if let Some(crit) = criteria.get(opt_key) {
                    let crit_lower = crit.to_lowercase();
                    for word in crit_lower.split_whitespace() {
                        if word.len() > 3 && state_str.contains(word) {
                            score += 1.2;
                        }
                    }
                }
            }

            raw_scores.insert(opt_key.clone(), score);
        }

        // Calibrate probabilities so sum is strictly 1.0
        let total_score: f64 = raw_scores.values().sum();
        let mut probabilities = HashMap::new();
        let mut best_choice = String::new();
        let mut highest_prob = -1.0;

        for (key, val) in raw_scores {
            let prob = if total_score > 0.0 {
                (val / total_score * 1000.0).round() / 1000.0
            } else {
                0.0
            };
            if prob > highest_prob {
                highest_prob = prob;
                best_choice = key.clone();
            }
            probabilities.insert(key, prob);
        }

        if best_choice.is_empty() {
            if let Some(first) = q.options.keys().next() {
                best_choice = first.clone();
            }
        }

        let confidence = (highest_prob.max(0.0).min(1.0) * 100.0).round() / 100.0;

        ChoiceAnswer {
            choice: best_choice.clone(),
            probabilities,
            confidence,
            rationale: Some(format!("Rust System One selected '{}' with {:.1}% confidence", best_choice, confidence * 100.0)),
        }
    }

    fn evaluate_noul(&self, q: &NoulQuestion, state_str: &str) -> NoulAnswer {
        let instructions_lower = q.instructions.to_lowercase();
        let mut positive_weight: f64 = 0.5; // Laplace prior base
        let mut negative_weight: f64 = 0.5;

        // Inspect affirmative and negative cues
        let affirmative_cues = ["yes", "true", "danger", "destructive", "delete", "destroy", "risk", "irreversible", "drop", "purge", "rm -rf"];
        let negative_cues = ["no", "false", "safe", "read", "inspect", "get", "list", "view", "dry-run"];

        for kw in affirmative_cues {
            if instructions_lower.contains(kw) || state_str.contains(kw) {
                positive_weight += 2.0;
            }
        }

        for kw in negative_cues {
            if instructions_lower.contains(kw) || state_str.contains(kw) {
                negative_weight += 1.5;
            }
        }

        if let Some(criteria) = &q.criteria {
            for crit in criteria {
                let crit_lower = crit.to_lowercase();
                for word in crit_lower.split_whitespace() {
                    if word.len() > 3 && state_str.contains(word) {
                        positive_weight += 1.0;
                    }
                }
            }
        }

        let total = positive_weight + negative_weight;
        let probability = ((positive_weight / total) * 1000.0).round() / 1000.0;
        let is_affirmative = probability >= 0.50;

        NoulAnswer {
            probability,
            is_affirmative,
            rationale: Some(format!(
                "Calibrated affirmative probability: {:.2}% ({})",
                probability * 100.0,
                if is_affirmative { "YES" } else { "NO" }
            )),
        }
    }

    fn evaluate_score(&self, q: &ScoreQuestion, state_str: &str) -> ScoreAnswer {
        let mut level_weights: HashMap<String, f64> = HashMap::new();
        let mut level_indices: HashMap<String, f64> = HashMap::new();

        let mut idx = 1.0;
        for (lvl_key, lvl_desc) in &q.levels {
            level_indices.insert(lvl_key.clone(), idx);
            let mut weight = 1.0;

            let lvl_lower = lvl_key.to_lowercase();
            let desc_lower = lvl_desc.to_lowercase();

            if state_str.contains(&lvl_lower) {
                weight += 3.0;
            }

            for word in desc_lower.split_whitespace() {
                if word.len() > 3 && state_str.contains(word) {
                    weight += 0.8;
                }
            }

            level_weights.insert(lvl_key.clone(), weight);
            idx += 1.0;
        }

        let total_weight: f64 = level_weights.values().sum();
        let mut level_probabilities = HashMap::new();
        let mut best_level = String::new();
        let mut highest_prob = -1.0;
        let mut weighted_score = 0.0;

        for (lvl, weight) in level_weights {
            let prob = if total_weight > 0.0 { weight / total_weight } else { 0.0 };
            let prob_rounded = (prob * 1000.0).round() / 1000.0;
            if prob_rounded > highest_prob {
                highest_prob = prob_rounded;
                best_level = lvl.clone();
            }
            if let Some(idx_val) = level_indices.get(&lvl) {
                weighted_score += prob * idx_val;
            }
            level_probabilities.insert(lvl, prob_rounded);
        }

        let max_scale = (q.levels.len() as f64).max(1.0);
        let normalized_score = ((weighted_score / max_scale * 100.0) * 10.0).round() / 10.0;
        let confidence = (highest_prob.max(0.0).min(1.0) * 100.0).round() / 100.0;

        ScoreAnswer {
            selected_level: best_level,
            numeric_score: normalized_score,
            level_probabilities,
            confidence,
            rationale: Some(format!("Computed weighted score {:.1}/100 with confidence {:.1}%", normalized_score, confidence * 100.0)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_one_choice_evaluation() {
        let engine = SystemOneEngine::new();
        let mut options = HashMap::new();
        options.insert("plan".to_string(), Some("Formulate steps".to_string()));
        options.insert("code".to_string(), Some("Write software in rust".to_string()));

        let mut questions = HashMap::new();
        questions.insert(
            "intent".to_string(),
            SystemOneQuestion::Choice(ChoiceQuestion {
                instructions: "Categorize the request".to_string(),
                options,
                criteria: None,
            }),
        );

        let state = serde_json::json!({
            "prompt": "Please write a rust function to parse JSON"
        });

        let req = SystemOneRequest { state, questions };
        let resp = engine.evaluate(&req);

        assert_eq!(resp.engine, "system-one-rust-native");
        if let Some(SystemOneAnswer::Choice(ans)) = resp.answers.get("intent") {
            assert_eq!(ans.choice, "code");
            assert!(ans.confidence > 0.5);
            let sum_prob: f64 = ans.probabilities.values().sum();
            assert!((sum_prob - 1.0).abs() < 0.05);
        } else {
            panic!("Expected choice answer");
        }
    }

    #[test]
    fn test_system_one_noul_evaluation() {
        let engine = SystemOneEngine::new();
        let mut questions = HashMap::new();
        questions.insert(
            "is_destructive".to_string(),
            SystemOneQuestion::Noul(NoulQuestion {
                instructions: "Is this action destructive or irreversible?".to_string(),
                criteria: Some(vec!["deletes files".to_string(), "drops database".to_string()]),
            }),
        );

        let state = serde_json::json!({
            "command": "rm -rf /Users/test/important_dir"
        });

        let req = SystemOneRequest { state, questions };
        let resp = engine.evaluate(&req);

        if let Some(SystemOneAnswer::Noul(ans)) = resp.answers.get("is_destructive") {
            assert!(ans.is_affirmative);
            assert!(ans.probability > 0.6);
        } else {
            panic!("Expected noul answer");
        }
    }
}
