use std::collections::HashMap;
use super::types::TaskIntentVerdict;

/// Classifies user prompt intent using System One calibrated categorical distributions.
pub fn classify_user_task(prompt: &str) -> TaskIntentVerdict {
    let raw = prompt.trim();
    let lower = raw.to_lowercase();

    let mut scores = HashMap::new();
    scores.insert("planning".to_string(), 1.0);
    scores.insert("code".to_string(), 1.0);
    scores.insert("search_retrieval".to_string(), 1.0);
    scores.insert("conversational".to_string(), 1.0);

    // Planning cues
    let plan_keywords = ["plan", "architect", "step-by-step", "roadmap", "design", "break down", "outline", "strategy", "workflow", "phases"];
    for kw in plan_keywords {
        if lower.contains(kw) {
            *scores.get_mut("planning").unwrap() += 2.5;
        }
    }

    // Code cues
    let code_keywords = ["function", "const ", "impl ", "fn ", "def ", "class ", "bug", "error", "refactor", "compile", "cargo", "typescript", "rust", "react", "component", "import "];
    for kw in code_keywords {
        if lower.contains(kw) {
            *scores.get_mut("code").unwrap() += 3.0;
        }
    }

    // Search / Retrieval cues
    let search_keywords = ["find", "search", "where is", "look up", "memory", "saved", "recall", "locate", "grep", "history"];
    for kw in search_keywords {
        if lower.contains(kw) {
            *scores.get_mut("search_retrieval").unwrap() += 2.8;
        }
    }

    // Conversational cues
    let chat_keywords = ["hello", "hi", "how are you", "who are you", "thanks", "thank you", "explain to me", "tell me about", "what do you think"];
    for kw in chat_keywords {
        if lower.contains(kw) {
            *scores.get_mut("conversational").unwrap() += 2.2;
        }
    }

    let total: f64 = scores.values().sum();
    let mut probabilities = HashMap::new();
    let mut best_intent = "conversational".to_string();
    let mut highest_prob = -1.0;

    for (k, v) in scores {
        let prob = (v / total * 1000.0).round() / 1000.0;
        if prob > highest_prob {
            highest_prob = prob;
            best_intent = k.clone();
        }
        probabilities.insert(k, prob);
    }

    let confidence = (highest_prob.max(0.0).min(1.0) * 100.0).round() / 100.0;

    let suggested_system_prompt = match best_intent.as_str() {
        "planning" => Some("Focus on high-level architecture, phased milestones, and dependency sequencing.".to_string()),
        "code" => Some("Provide precise, idiomatic, fully-typed production code with zero placeholders.".to_string()),
        "search_retrieval" => Some("Perform targeted vector and keyword memory searches with exact citation of sources.".to_string()),
        _ => Some("Maintain clear, concise, direct desktop assistance without fluff.".to_string()),
    };

    TaskIntentVerdict {
        prompt: raw.to_string(),
        primary_intent: best_intent,
        probabilities,
        confidence,
        suggested_system_prompt,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_code_intent_classification() {
        let res = classify_user_task("Write a rust function to parse JSON with serde");
        assert_eq!(res.primary_intent, "code");
        assert!(res.confidence > 0.4);
    }

    #[test]
    fn test_search_intent_classification() {
        let res = classify_user_task("Search my memory for where I saved the project repo link");
        assert_eq!(res.primary_intent, "search_retrieval");
    }

    #[test]
    fn test_planning_intent_classification() {
        let res = classify_user_task("Design a phased step-by-step roadmap for our desktop app");
        assert_eq!(res.primary_intent, "planning");
    }
}
